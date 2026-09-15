import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SharesService } from '../shares/shares.service';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { dynamicValueCatalog, evaluateCondition, walkDynamicValues, resolveDynamicValue } from './workflow-runtime';

export type WorkflowFileEvent = {
  eventType?: string; fileId: string; name: string; mimeType?: string | null; fileType?: string | null; size?: string;
  userId: string; folderId?: string | null; extension?: string | null; sourceWorkflowId?: string; resourceType?: 'FILE' | 'FOLDER';
};
type WorkflowAction = { type: string; config?: Record<string, unknown> };
type PhaseActions = { before: WorkflowAction[]; during: WorkflowAction[]; after: WorkflowAction[] };
type WorkflowTransitionLike = { id: string; fromStateId: string; toStateId: string; name: string; trigger: string | null; condition: unknown; actions: unknown };
type WorkflowDefinition = { trigger?: string | string[]; condition?: unknown; actions?: WorkflowAction[]; fields: Array<Record<string, unknown>>; calendarConfig?: Record<string, unknown>; states: Array<{ id: string; terminal: boolean }>; transitions: WorkflowTransitionLike[] };
type ParticipantRule = { type: 'USER' | 'GROUP' | 'ROLE'; ids?: string[]; roles?: string[] };
type EscalationRule = { afterMinutes?: number; userIds?: string[]; groupIds?: string[]; roles?: string[]; notifyOnly?: boolean };

type RunResult = { actions?: unknown[]; fieldValues?: Record<string, unknown>; continueTransitionId?: string; pendingTransitionIds?: string[]; [key: string]: unknown };

@Injectable()
export class WorkflowEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowEngineService.name); private timer?: NodeJS.Timeout; private processing = false; private readonly workerId = `workdrive-workflow-${randomUUID()}`;
  constructor(private readonly prisma: PrismaService, private readonly shares: SharesService, private readonly functionExecutor: CustomFunctionExecutor) {}
  onModuleInit() { this.timer = setInterval(() => void this.drain(), 1500); void this.drain(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async executeTrigger(user: AccessTokenPayload, event: WorkflowFileEvent) { return this.onFileEvent(user, event); }
  async onFileUploaded(user: AccessTokenPayload, event: WorkflowFileEvent) { return this.onFileEvent(user, { ...event, eventType: 'upload' }); }

  async onFileEvent(user: AccessTokenPayload, event: WorkflowFileEvent): Promise<void> {
    const eventType = event.eventType ?? 'upload';
    const workflows = await this.prisma.workflow.findMany({ where: { orgId: user.org_id, status: 'ACTIVE' }, include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true, activeVersion: true } });
    for (const workflow of workflows) {
      if (event.sourceWorkflowId && workflow.id === event.sourceWorkflowId) continue;
      if (workflow.mode !== 'AUTOMATIC' || workflow.resourceType !== (event.resourceType ?? 'FILE')) continue;
      const definition = workflow.activeVersion ? this.definitionFromSnapshot(workflow.activeVersion.snapshot) : this.definitionFromWorkflow(workflow);
      const triggers = Array.isArray(definition.trigger) ? definition.trigger.map(String) : [String(definition.trigger ?? '')];
      if (!this.triggerMatches(triggers, eventType)) continue;
      if (!this.conditionMatches(definition.condition, event, {})) continue;
      await this.enqueue(user, workflow.id, event, definition, workflow.activeVersionId ?? undefined);
    }
  }

  async startManual(user: AccessTokenPayload, workflowId: string, event: WorkflowFileEvent) {
    const workflow = await this.prisma.workflow.findFirst({ where: { id: workflowId, orgId: user.org_id, status: 'ACTIVE' }, include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true, activeVersion: true } });
    if (!workflow) throw new Error('Active workflow not found'); if (workflow.mode !== 'MANUAL') throw new Error('Only manual workflows can be started explicitly');
    return this.enqueue(user, workflow.id, { ...event, eventType: 'manual', userId: user.sub }, workflow.activeVersion ? this.definitionFromSnapshot(workflow.activeVersion.snapshot) : this.definitionFromWorkflow(workflow), workflow.activeVersionId ?? undefined);
  }

  private definitionFromWorkflow(workflow: { steps: Array<{ kind: string; config: unknown }>; states?: Array<{ id: string; terminal: boolean }>; transitions?: WorkflowTransitionLike[] }): WorkflowDefinition {
    const values = Object.fromEntries(workflow.steps.map((step) => [step.kind, (step.config as { value?: unknown })?.value]));
    const actions = Array.isArray(values.ACTIONS) ? values.ACTIONS as WorkflowAction[] : [];
    const fields = Array.isArray(values.WORKFLOW_FIELDS) ? values.WORKFLOW_FIELDS as Array<Record<string, unknown>> : [];
    return { trigger: Array.isArray(values.TRIGGER) ? values.TRIGGER.map(String) : String(values.TRIGGER ?? ''), condition: values.CONDITION ?? 'any', actions, fields, calendarConfig: (workflow as any).calendarConfig ?? undefined, states: workflow.states ?? [], transitions: workflow.transitions ?? [] };
  }

  private definitionFromSnapshot(snapshot: unknown): WorkflowDefinition {
    const s = (snapshot && typeof snapshot === 'object' ? snapshot : {}) as Record<string, unknown>;
    const steps = Array.isArray(s.steps) ? s.steps as Array<{ kind: string; config: unknown }> : [];
    const values = Object.fromEntries(steps.map((step) => [step.kind, (step.config as { value?: unknown })?.value]));
    const states = Array.isArray(s.states) ? s.states as Array<{ id: string; terminal: boolean }> : [];
    const transitions = Array.isArray(s.transitions) ? s.transitions as WorkflowTransitionLike[] : [];
    return { trigger: Array.isArray(values.TRIGGER) ? values.TRIGGER.map(String) : String(values.TRIGGER ?? ''), condition: values.CONDITION ?? 'any', actions: Array.isArray(values.ACTIONS) ? values.ACTIONS as WorkflowAction[] : [], fields: Array.isArray(values.WORKFLOW_FIELDS) ? values.WORKFLOW_FIELDS as Array<Record<string, unknown>> : [], calendarConfig: (s.calendarConfig && typeof s.calendarConfig === 'object' ? s.calendarConfig : undefined) as Record<string, unknown> | undefined, states, transitions };
  }

  private triggerMatches(configured: string[], eventType: string) {
    if (configured.includes('manual')) return eventType === 'manual';
    const aliases: Record<string, string[]> = { upload: ['upload', 'FILE_UPLOADED'], create: ['create', 'created', 'FILE_CREATED', 'FOLDER_CREATED'], move: ['move', 'FILE_MOVED', 'FOLDER_MOVED'], copy: ['copy', 'FILE_COPIED', 'FOLDER_COPIED'], rename: ['rename', 'FILE_RENAMED'], delete: ['delete', 'FILE_DELETED'], properties_updated: ['properties_updated', 'FILE_PROPERTIES_UPDATED'], ready: ['ready', 'FILE_READY'] };
    return configured.some((x) => (aliases[x] ?? [x]).includes(eventType));
  }

  private conditionMatches(condition: unknown, event: WorkflowFileEvent, fields: Record<string, unknown>): boolean { return evaluateCondition(condition, event, fields); }

  private phaseActions(raw: unknown): PhaseActions {
    if (Array.isArray(raw)) return { before: [], during: raw as WorkflowAction[], after: [] };
    const obj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const clean = (v: unknown) => Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').map((x) => ({ type: String((x as Record<string, unknown>).type ?? 'notify'), config: ((x as Record<string, unknown>).config && typeof (x as Record<string, unknown>).config === 'object' ? (x as Record<string, unknown>).config : {}) as Record<string, unknown> })) : [];
    return { before: clean(obj.before), during: clean(obj.during), after: clean(obj.after) };
  }

  private async enqueue(user: AccessTokenPayload, workflowId: string, event: WorkflowFileEvent, definition: WorkflowDefinition, versionId?: string) {
    const eventKey = `${event.resourceType ?? 'FILE'}:${event.fileId}:${event.eventType ?? 'manual'}:${event.sourceWorkflowId ?? 'system'}`;
    try {
      const firstState = definition.states[0];
      const run = await this.prisma.workflowRun.create({ data: { orgId: user.org_id, workflowId, versionId: versionId ?? null, createdById: user.sub, eventKey, status: 'QUEUED', trigger: event, currentStateId: firstState?.id ?? null, result: { fieldValues: {} } as unknown as Prisma.InputJsonValue } });
      await this.prisma.workflowJob.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId, runId: run.id, status: 'QUEUED', runAt: new Date(), priority: 0, idempotencyKey: `trigger:${workflowId}:${eventKey}` } }); return run;
    } catch (error) { if ((error as { code?: string })?.code === 'P2002') return undefined; throw error; }
  }

  async runWorkerCycle() { return this.drain(); }

  private async drain() {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.recoverStaleJobs();
      await this.processTaskReminders();
      for (let i = 0; i < 10; i++) { const job = await this.claimJob(); if (!job) break; await this.executeJob(job.id); }
    } catch (error) { this.logger.error(error instanceof Error ? error.message : String(error)); } finally { this.processing = false; }
  }

  private async recoverStaleJobs() {
    const now = new Date();
    const stale = new Date(now.getTime() - 2 * 60_000);
    await this.prisma.workflowJob.updateMany({ where: { status: 'RUNNING', OR: [{ leaseUntil: { lt: now } }, { leaseUntil: null, lockedAt: { lt: stale } }] }, data: { status: 'QUEUED', lockedAt: null, lockedBy: null, leaseUntil: null, runAt: now } });
  }

  private async processTaskReminders() {
    const now = new Date();
    const reminders = await this.prisma.workflowTask.findMany({
      where: { status: 'PENDING', reminderAt: { lte: now }, reminderSentAt: null },
      include: { participants: { where: { status: 'PENDING' }, select: { userId: true } }, run: { select: { trigger: true } } },
      take: 50,
    });
    for (const task of reminders) {
      const recipientIds = task.participants.map((p) => p.userId);
      if (!recipientIds.length && task.assigneeId) recipientIds.push(task.assigneeId);
      for (const userId of recipientIds) {
        await this.prisma.notification.create({ data: { orgId: task.orgId, userId, type: 'SYSTEM', title: 'Workflow reminder', body: task.title, resourceType: ((task.run.trigger as Record<string, unknown>)?.resourceType === 'FOLDER' ? 'FOLDER' : 'FILE'), resourceId: String((task.run.trigger as Record<string, unknown>)?.fileId ?? '') } }).catch(() => undefined);
      }
      await this.prisma.workflowTask.update({ where: { id: task.id }, data: { reminderSentAt: now } });
    }
    await this.processEscalations(now);
    const overdue = await this.prisma.workflowTask.findMany({
      where: { status: 'PENDING', dueAt: { lt: now }, overdueNotifiedAt: null },
      include: { participants: { where: { status: 'PENDING' }, select: { userId: true } }, run: { select: { trigger: true } } },
      take: 50,
    });
    for (const task of overdue) {
      const recipientIds = task.participants.map((p) => p.userId);
      if (!recipientIds.length && task.assigneeId) recipientIds.push(task.assigneeId);
      for (const userId of recipientIds) {
        await this.prisma.notification.create({ data: { orgId: task.orgId, userId, type: 'SYSTEM', title: 'Workflow task overdue', body: task.title, resourceType: ((task.run.trigger as Record<string, unknown>)?.resourceType === 'FOLDER' ? 'FOLDER' : 'FILE'), resourceId: String((task.run.trigger as Record<string, unknown>)?.fileId ?? '') } }).catch(() => undefined);
      }
      await this.prisma.workflowTask.update({ where: { id: task.id }, data: { overdueNotifiedAt: now, priority: 'HIGH' } });
    }
  }
  private async processEscalations(now: Date) {
    const tasks = await this.prisma.workflowTask.findMany({ where: { status: 'PENDING', dueAt: { not: null } }, include: { participants: { where: { status: 'PENDING' }, select: { userId: true } }, run: { select: { trigger: true } } }, take: 50 });
    for (const task of tasks) {
      const rules = Array.isArray(task.escalationConfig) ? task.escalationConfig as EscalationRule[] : [];
      const elapsed = task.dueAt ? Math.max(0, (now.getTime() - task.dueAt.getTime()) / 60000) : 0;
      const rule = rules[task.escalationLevel];
      if (!rule || elapsed < Number(rule.afterMinutes ?? 0)) continue;
      const ids = await this.resolveParticipantRules(task.orgId, [{ type: 'USER', ids: rule.userIds }, { type: 'GROUP', ids: rule.groupIds }, { type: 'ROLE', roles: rule.roles }]);
      for (const userId of ids) await this.prisma.notification.create({ data: { orgId: task.orgId, userId, type: 'SYSTEM', title: 'Workflow task escalated', body: task.title, resourceType: ((task.run.trigger as Record<string, unknown>)?.resourceType === 'FOLDER' ? 'FOLDER' : 'FILE'), resourceId: String((task.run.trigger as Record<string, unknown>)?.fileId ?? '') } }).catch(() => undefined);
      await this.prisma.workflowTask.update({ where: { id: task.id }, data: { escalationLevel: task.escalationLevel + 1, escalatedAt: now, priority: 'HIGH' } });
    }
  }

  private async resolveParticipantRules(orgId: string, rules: ParticipantRule[]) {
    const userIds = new Set<string>();
    for (const rule of rules) {
      if (rule.type === 'USER') for (const id of rule.ids ?? []) userIds.add(id);
      if (rule.type === 'GROUP' && (rule.ids ?? []).length) { const members = await this.prisma.groupMember.findMany({ where: { orgId, groupId: { in: rule.ids }, user: { memberships: { some: { organizationId: orgId, status: 'ACTIVE' } } } }, select: { userId: true } }); for (const m of members) userIds.add(m.userId); }
      if (rule.type === 'ROLE' && (rule.roles ?? []).length) { const members = await this.prisma.organizationMembership.findMany({ where: { organizationId: orgId, status: 'ACTIVE', role: { in: rule.roles as any } }, select: { userId: true } }); for (const m of members) userIds.add(m.userId); }
    }
    if (!userIds.size) return [];
    const valid = await this.prisma.organizationMembership.findMany({ where: { organizationId: orgId, status: 'ACTIVE', userId: { in: [...userIds] } }, select: { userId: true } });
    return valid.map((x) => x.userId);
  }

  private async claimJob() {
    const now = new Date();
    const candidate = await this.prisma.workflowJob.findFirst({ where: { status: 'QUEUED', runAt: { lte: now } }, orderBy: [{ priority: 'desc' }, { runAt: 'asc' }, { createdAt: 'asc' }] });
    if (!candidate) return null;
    const leaseUntil = new Date(now.getTime() + 2 * 60_000);
    const claimed = await this.prisma.workflowJob.updateMany({ where: { id: candidate.id, status: 'QUEUED', runAt: { lte: now } }, data: { status: 'RUNNING', lockedAt: now, lockedBy: this.workerId, leaseUntil, attempts: { increment: 1 } } });
    return claimed.count === 1 ? { ...candidate, attempts: candidate.attempts + 1, leaseUntil } : null;
  }

  private async executeJob(jobId: string) {
    const job = await this.prisma.workflowJob.findUnique({ where: { id: jobId }, include: { run: true, workflow: { include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true, activeVersion: true } } } }); if (!job) return;
    const event = job.run.trigger as unknown as WorkflowFileEvent; const definition = job.run.versionId && job.workflow.activeVersion && job.workflow.activeVersionId === job.run.versionId ? this.definitionFromSnapshot(job.workflow.activeVersion.snapshot) : this.definitionFromWorkflow(job.workflow); const result = (job.run.result && typeof job.run.result === 'object' ? job.run.result : {}) as RunResult; const fieldValues = result.fieldValues ?? {};
    const continuationId = typeof result.continueTransitionId === 'string' ? result.continueTransitionId : null;
    const user = await this.prisma.user.findUnique({ where: { id: event.userId }, select: { id: true, email: true, name: true } }); if (!user) return this.failJob(job.id, job.run.id, 'Workflow actor no longer exists', job.attempts, job.maxAttempts); const token = { sub: user.id, org_id: job.orgId, email: user.email, name: user.name } as AccessTokenPayload & { email?: string; name?: string };
    const heartbeat = setInterval(() => void this.prisma.workflowJob.updateMany({ where: { id: job.id, status: 'RUNNING', lockedBy: this.workerId }, data: { leaseUntil: new Date(Date.now() + 2 * 60_000) } }).catch(() => undefined), 30_000);
    try {
      await this.prisma.workflowRun.update({ where: { id: job.run.id }, data: { status: 'RUNNING' } });
      await this.recordAudit(job.orgId, user.id, 'WORKFLOW_RUN_STARTED', 'WORKFLOW_RUN', job.run.id, { workflowId: job.workflow.id, versionId: job.run.versionId });
      let currentId = job.run.currentStateId ?? definition.states[0]?.id ?? null;
      let selectedTransition: WorkflowTransitionLike | undefined;
      if (continuationId) selectedTransition = definition.transitions.find((t) => t.id === continuationId);
      let hops = 0; const allResults: unknown[] = Array.isArray(result.actions) ? result.actions : [];
      while (currentId && hops++ < 50) {
        const state = definition.states.find((s) => s.id === currentId); if (!state) throw new Error('Workflow current state no longer exists');
        if (selectedTransition) {
          if (selectedTransition.fromStateId !== currentId) throw new Error('Workflow continuation is no longer valid');
          if (!this.transitionMatches(selectedTransition, event, fieldValues)) throw new Error('The selected transition conditions are no longer satisfied');
          const output = await this.executeTransition(token, event, selectedTransition, fieldValues, job.workflow.id, job.run.id, allResults, true, definition.calendarConfig);
          allResults.push(...output.results);
          if (output.waiting) return this.markWaiting(job.id, job.run.id, currentId, fieldValues, allResults, output.pendingTransitionIds);
          currentId = selectedTransition.toStateId; selectedTransition = undefined;
          await this.prisma.workflowRun.update({ where: { id: job.run.id }, data: { currentStateId: currentId, result: { fieldValues, actions: allResults } as unknown as Prisma.InputJsonValue } });
          continue;
        }
        if (state.terminal) return this.finishRun(job.id, job.run.id, currentId, fieldValues, allResults);
        const outgoing = definition.transitions.filter((t) => t.fromStateId === currentId && this.transitionMatches(t, event, fieldValues));
        if (!outgoing.length) return this.markWaiting(job.id, job.run.id, currentId, fieldValues, allResults, []);
        const manual = outgoing.filter((t) => t.trigger === 'manual');
        const automatic = outgoing.find((t) => t.trigger !== 'manual');
        if (manual.length && !automatic) return this.createTask(job.id, job.run.id, job.orgId, job.workflow.id, currentId, event, manual, fieldValues, allResults, definition.calendarConfig);
        if (!automatic) return this.markWaiting(job.id, job.run.id, currentId, fieldValues, allResults, manual.map((t) => t.id));
        const output = await this.executeTransition(token, event, automatic, fieldValues, job.workflow.id, job.run.id, allResults, false, definition.calendarConfig);
        allResults.push(...output.results);
        if (output.waiting) return this.markWaiting(job.id, job.run.id, currentId, fieldValues, allResults, output.pendingTransitionIds);
        currentId = automatic.toStateId;
        await this.prisma.workflowRun.update({ where: { id: job.run.id }, data: { currentStateId: currentId, result: { fieldValues, actions: allResults } as unknown as Prisma.InputJsonValue } });
      }
      if (hops >= 50) throw new Error('Workflow exceeded the maximum of 50 automatic transitions');
    } catch (error) { const message = error instanceof Error ? error.message : String(error); await this.failJob(job.id, job.run.id, message, job.attempts, job.maxAttempts); } finally { clearInterval(heartbeat); }
  }

  private transitionMatches(t: WorkflowTransitionLike, event: WorkflowFileEvent, fields: Record<string, unknown>) { if (t.trigger && t.trigger !== 'manual' && !this.triggerMatches([t.trigger], event.eventType ?? 'upload')) return false; return this.conditionMatches(t.condition, event, fields); }

  private async executeTransition(user: AccessTokenPayload, event: WorkflowFileEvent, transition: WorkflowTransitionLike, fields: Record<string, unknown>, workflowId: string, runId: string, existingResults: unknown[], continuation: boolean, calendarConfig?: Record<string, unknown>) {
    const phases = this.phaseActions(transition.actions); const results: unknown[] = [];
    for (const [phaseName, actions] of ([['before', phases.before], ['during', phases.during], ['after', phases.after]] as const)) {
      for (let i = 0; i < actions.length; i++) {
        const action = this.resolveAction(actions[i], event, fields, { workflowId, runId, user: { id: user.sub, email: (user as AccessTokenPayload & { email?: string }).email, name: (user as AccessTokenPayload & { name?: string }).name } }); if (calendarConfig && action.config) action.config.calendarConfig = calendarConfig; const step = await this.prisma.workflowStepRun.create({ data: { orgId: user.org_id, runId, stepKind: `TRANSITION:${transition.name}:${phaseName}:${action.type}`, stepPosition: existingResults.length + results.length, status: 'RUNNING', input: action as unknown as Prisma.InputJsonValue } });
        try { const output = await this.executeAction(user, event, action, workflowId, runId); results.push({ phase: phaseName, output }); await this.prisma.workflowStepRun.update({ where: { id: step.id }, data: { status: 'SUCCEEDED', output: output as unknown as Prisma.InputJsonValue, finishedAt: new Date() } }); await this.recordAudit(user.org_id, user.sub, 'WORKFLOW_ACTION_EXECUTED', 'WORKFLOW_RUN', runId, { workflowId, transitionId: transition.id, phase: phaseName, action: action.type }); if ((output as { waiting?: boolean } | null)?.waiting) return { results, waiting: true, pendingTransitionIds: [] as string[], continuation }; }
        catch (error) { const message = error instanceof Error ? error.message : String(error); await this.prisma.workflowStepRun.update({ where: { id: step.id }, data: { status: 'FAILED', error: message, finishedAt: new Date() } }); throw error; }
      }
    }
    return { results, waiting: false, pendingTransitionIds: [] as string[], continuation };
  }

  private renderTemplate(template: string, event: WorkflowFileEvent, result: unknown, context?: { workflowId?: string; workflowName?: string; runId?: string; user?: { id?: string; email?: string; name?: string } }) {
    const values = result && typeof result === 'object' ? (result as Record<string, unknown>).fieldValues : {};
    return String(walkDynamicValues(template, event, (values && typeof values === 'object' ? values as Record<string, unknown> : {}), context));
  }

  private addBusinessMinutes(start: Date, minutes: number, config?: Record<string, unknown>) {
    const days = Array.isArray(config?.workingDays) ? config!.workingDays.map(Number) : [1,2,3,4,5];
    const startHour = Number(String(config?.workStart ?? '09:00').split(':')[0]); const endHour = Number(String(config?.workEnd ?? '17:00').split(':')[0]);
    const holidays = new Set(Array.isArray(config?.holidays) ? config!.holidays.map(String) : []);
    let d = new Date(start); let remaining = Math.max(0, minutes);
    while (remaining > 0) { const day=d.getDay(); const iso=d.toISOString().slice(0,10); const usable=days.includes(day === 0 ? 7 : day) && !holidays.has(iso); if (usable) { const dayEnd=new Date(d); dayEnd.setHours(endHour,0,0,0); const dayStart=new Date(d); dayStart.setHours(startHour,0,0,0); if(d<dayStart)d=dayStart; if(d<dayEnd){ const available=Math.min(remaining, Math.floor((dayEnd.getTime()-d.getTime())/60000)); d=new Date(d.getTime()+available*60000); remaining-=available; if(remaining<=0)break; } } d.setDate(d.getDate()+1); d.setHours(startHour,0,0,0); } return d;
  }

  private resolveAction(action: WorkflowAction, event: WorkflowFileEvent, fields: Record<string, unknown>, context?: { workflowId?: string; workflowName?: string; runId?: string; user?: { id?: string; email?: string; name?: string } }): WorkflowAction {
    return { ...action, config: walkDynamicValues(action.config ?? {}, event, fields, context) as Record<string, unknown> };
  }

  private async createTask(jobId: string, runId: string, orgId: string, workflowId: string, stateId: string, event: WorkflowFileEvent, transitions: WorkflowTransitionLike[], fieldValues: Record<string, unknown>, actions: unknown[], calendarConfig?: Record<string, unknown>) {
    const transition = transitions[0];
    const approval = transition ? this.findApprovalConfig(transition) : {};
    const requestedIds = Array.isArray(approval.userIds) ? approval.userIds.filter((id): id is string => typeof id === 'string') : [];
    const assigneeMode = typeof approval.assigneeMode === 'string' ? approval.assigneeMode : 'initiator';
    let participantIds = [...new Set(requestedIds)];
    if (!participantIds.length && assigneeMode === 'initiator') participantIds = [event.userId];
    if (!participantIds.length && assigneeMode === 'owner') {
      const owner = event.resourceType === 'FOLDER'
        ? await this.prisma.folder.findFirst({ where: { id: event.fileId, orgId }, select: { ownerId: true } })
        : await this.prisma.file.findFirst({ where: { id: event.fileId, orgId }, select: { ownerId: true } });
      if (owner?.ownerId) participantIds = [owner.ownerId];
    }
    if (!participantIds.length) participantIds = [event.userId];
    const validParticipants = await this.prisma.organizationMembership.findMany({ where: { organizationId: orgId, userId: { in: participantIds }, status: 'ACTIVE' }, select: { userId: true } });
    participantIds = [...new Set(validParticipants.map((x) => x.userId))];
    if (!participantIds.length) participantIds = [event.userId];
    const policy = String(approval.approvalPolicy ?? 'ANY').toUpperCase() === 'ALL' ? 'ALL' : 'ANY';
    const dueMinutes = this.safeMinutes(approval.dueInMinutes);
    const reminderMinutes = this.safeMinutes(approval.reminderInMinutes);
    const dueAt = dueMinutes ? this.addBusinessMinutes(new Date(), dueMinutes, calendarConfig) : null;
    const reminderAt = reminderMinutes ? this.addBusinessMinutes(new Date(), reminderMinutes, calendarConfig) : null;
    const existing = await this.prisma.workflowTask.findFirst({ where: { runId, stateId, status: 'PENDING' } });
    if (!existing) {
      const task = await this.prisma.workflowTask.create({ data: { orgId, workflowId, runId, stateId, transitionId: transition?.id ?? null, assigneeId: participantIds[0] ?? null, approvalPolicy: policy, dueAt, reminderAt, priority: String(approval.priority ?? 'NORMAL').toUpperCase() === 'HIGH' ? 'HIGH' : 'NORMAL', escalationConfig: (Array.isArray(approval.escalationRules) ? approval.escalationRules : null) as unknown as Prisma.InputJsonValue, title: String(approval.title ?? `Action required for ${event.name}`) } });
      await this.prisma.workflowTaskParticipant.createMany({ data: participantIds.map((userId) => ({ id: randomUUID(), taskId: task.id, userId, status: 'PENDING' })) });
      for (const userId of participantIds) await this.prisma.notification.create({ data: { orgId, userId, type: 'SYSTEM', title: policy === 'ALL' ? 'Workflow approval requested' : 'Workflow action required', body: task.title, resourceType: (event.resourceType ?? 'FILE') as 'FILE' | 'FOLDER', resourceId: event.fileId } }).catch(() => undefined);
    }
    await this.prisma.workflowRun.update({ where: { id: runId }, data: { status: 'WAITING', currentStateId: stateId, result: { fieldValues, actions, pendingTransitionIds: transitions.map((t) => t.id) } as unknown as Prisma.InputJsonValue } });
    await this.prisma.workflowJob.update({ where: { id: jobId }, data: { status: 'SUCCEEDED', lockedAt: null, lockedBy: null, leaseUntil: null } });
    return { waiting: true };
  }

  private safeMinutes(value: unknown) { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 60 * 24 * 365) : null; }
  private findApprovalConfig(transition: WorkflowTransitionLike): Record<string, unknown> {
    const phases = this.phaseActions(transition.actions);
    const approval = [...phases.before, ...phases.during, ...phases.after].find((a) => a.type === 'request_approval');
    return approval?.config ?? {};
  }

  private async markWaiting(jobId: string, runId: string, stateId: string, fieldValues: Record<string, unknown>, actions: unknown[], pendingTransitionIds: string[]) {
    const run = await this.prisma.workflowRun.update({ where: { id: runId }, data: { status: 'WAITING', currentStateId: stateId, result: { fieldValues, actions, pendingTransitionIds } as unknown as Prisma.InputJsonValue }, select: { orgId: true, createdById: true } });
    await this.prisma.workflowJob.update({ where: { id: jobId }, data: { status: 'SUCCEEDED', lockedAt: null, lockedBy: null, leaseUntil: null } });
    await this.recordAudit(run.orgId, run.createdById, 'WORKFLOW_RUN_WAITING', 'WORKFLOW_RUN', runId, { stateId, pendingTransitionIds });
  }

  private async finishRun(jobId: string, runId: string, stateId: string, fieldValues: Record<string, unknown>, actions: unknown[]) {
    const run = await this.prisma.workflowRun.update({ where: { id: runId }, data: { status: 'SUCCEEDED', currentStateId: stateId, result: { fieldValues, actions } as unknown as Prisma.InputJsonValue, finishedAt: new Date() }, select: { orgId: true, createdById: true } });
    await this.prisma.workflowJob.update({ where: { id: jobId }, data: { status: 'SUCCEEDED', lockedAt: null, lockedBy: null, leaseUntil: null } });
    await this.recordAudit(run.orgId, run.createdById, 'WORKFLOW_RUN_COMPLETED', 'WORKFLOW_RUN', runId, { stateId });
  }

  private async failJob(jobId: string, runId: string, message: string, attempts: number, maxAttempts: number) {
    const terminal = attempts >= maxAttempts;
    const delay = Math.min(60 * 60 * 1000, 1000 * 2 ** Math.max(0, attempts - 1));
    const run = await this.prisma.workflowRun.update({ where: { id: runId }, data: { status: terminal ? 'FAILED' : 'QUEUED', error: message, ...(terminal ? { finishedAt: new Date() } : {}) }, select: { orgId: true, createdById: true } });
    await this.prisma.workflowJob.update({ where: { id: jobId }, data: { status: terminal ? 'DEAD_LETTER' : 'QUEUED', runAt: new Date(Date.now() + delay), lastError: message, lockedAt: null, lockedBy: null, leaseUntil: null } });
    await this.recordAudit(run.orgId, run.createdById, terminal ? 'WORKFLOW_RUN_DEAD_LETTER' : 'WORKFLOW_RUN_RETRY_SCHEDULED', 'WORKFLOW_RUN', runId, { jobId, attempts, maxAttempts, error: message, nextRunAt: new Date(Date.now() + delay).toISOString() });
  }

  private async executeAction(user: AccessTokenPayload, event: WorkflowFileEvent, action: WorkflowAction, workflowId: string, runId: string) {
    const config = action.config ?? {};
    switch (action.type) {
      case 'notify': { const ids = Array.isArray(config.userIds) ? config.userIds.filter((id): id is string => typeof id === 'string') : [user.sub]; const recipients = await this.prisma.organizationMembership.findMany({ where: { organizationId: user.org_id, userId: { in: ids }, status: 'ACTIVE' }, select: { userId: true } }); const resourceType = (event.resourceType ?? 'FILE') as 'FILE' | 'FOLDER'; for (const r of recipients) await this.prisma.notification.create({ data: { orgId: user.org_id, userId: r.userId, type: 'SYSTEM', title: String(config.title ?? 'Workflow notification'), body: String(config.message ?? `Workflow action completed for ${event.name}`), resourceType, resourceId: event.fileId } }); return { action: 'notify', deliveredTo: recipients.map((r) => r.userId) }; }
      case 'favorite': { if ((event.resourceType ?? 'FILE') === 'FOLDER') throw new Error('Favorite action is only supported for files'); await this.prisma.favorite.upsert({ where: { userId_resourceType_resourceId: { userId: user.sub, resourceType: 'FILE', resourceId: event.fileId } }, create: { orgId: user.org_id, userId: user.sub, resourceType: 'FILE', resourceId: event.fileId }, update: {} }); return { action: 'favorite', resourceId: event.fileId }; }
      case 'tag': { if ((event.resourceType ?? 'FILE') === 'FOLDER') throw new Error('Tag action is only supported for files'); const name = String(config.name ?? '').trim(); if (!name) throw new Error('Tag action requires a tag name'); const tag = await this.prisma.tag.upsert({ where: { orgId_name: { orgId: user.org_id, name } }, create: { orgId: user.org_id, name }, update: {} }); await this.prisma.fileTag.upsert({ where: { fileId_tagId: { fileId: event.fileId, tagId: tag.id } }, create: { fileId: event.fileId, tagId: tag.id }, update: {} }); return { action: 'tag', tag: name }; }
      case 'mark_final': case 'archive': { if ((event.resourceType ?? 'FILE') === 'FOLDER') throw new Error('Mark as final is only supported for files'); await this.prisma.file.updateMany({ where: { id: event.fileId, orgId: user.org_id, deletedAt: null }, data: { status: 'ARCHIVED' } }); return { action: 'mark_final', resourceId: event.fileId }; }
      case 'create_folder': { const parentId = typeof config.parentFolderId === 'string' ? config.parentFolderId : ((event.resourceType ?? 'FILE') === 'FOLDER' ? event.fileId : event.folderId ?? null); const name = String(config.name ?? `Workflow folder ${new Date().toISOString().slice(0, 10)}`).trim(); if (!name) throw new Error('Create folder action requires a name'); const parent = parentId ? await this.prisma.folder.findFirst({ where: { id: parentId, orgId: user.org_id }, select: { id: true, teamFolderId: true } }) : null; if (parentId && !parent) throw new Error('Parent folder not found'); const created = await this.prisma.folder.create({ data: { id: randomUUID(), orgId: user.org_id, ownerId: user.sub, parentId, teamFolderId: parent?.teamFolderId ?? null, name } }); return { action: 'create_folder', folderId: created.id, parentId }; }
      case 'move': { const destinationFolderId = typeof config.destinationFolderId === 'string' ? config.destinationFolderId : null; if (!destinationFolderId) throw new Error('Move action requires a destination folder'); if (!(await this.prisma.folder.findFirst({ where: { id: destinationFolderId, orgId: user.org_id }, select: { id: true } }))) throw new Error('Destination folder not found'); if ((event.resourceType ?? 'FILE') === 'FOLDER') { if (destinationFolderId === event.fileId) throw new Error('A folder cannot be moved into itself'); await this.prisma.folder.update({ where: { id: event.fileId }, data: { parentId: destinationFolderId } }); } else await this.prisma.file.update({ where: { id: event.fileId }, data: { folderId: destinationFolderId } }); return { action: 'move', resourceId: event.fileId, destinationFolderId }; }
      case 'copy': { const destinationFolderId = typeof config.destinationFolderId === 'string' ? config.destinationFolderId : null; if (!destinationFolderId) throw new Error('Copy action requires a destination folder'); if (!(await this.prisma.folder.findFirst({ where: { id: destinationFolderId, orgId: user.org_id }, select: { id: true } }))) throw new Error('Destination folder not found'); if ((event.resourceType ?? 'FILE') === 'FOLDER') { const sourceFolder = await this.prisma.folder.findFirst({ where: { id: event.fileId, orgId: user.org_id }, include: { children: true, files: { include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } } } }); if (!sourceFolder) throw new Error('Source folder not found'); const copyTree = async (sourceId: string, parentId: string | null): Promise<string> => { const source = await this.prisma.folder.findFirst({ where: { id: sourceId, orgId: user.org_id }, include: { children: true, files: { include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } } } }); if (!source) throw new Error('Source folder not found'); const newId = randomUUID(); await this.prisma.folder.create({ data: { id: newId, orgId: user.org_id, ownerId: user.sub, parentId, teamFolderId: source.teamFolderId, name: source.name } }); for (const file of source.files) { const version = file.versions[0]; if (!version) continue; const newFileId = randomUUID(); await this.prisma.file.create({ data: { id: newFileId, orgId: user.org_id, folderId: newId, name: file.name, originalName: file.originalName, extension: file.extension, mimeType: file.mimeType, fileType: file.fileType, size: file.size, sha256Hash: file.sha256Hash, ownerId: user.sub } }); await this.prisma.fileVersion.create({ data: { id: randomUUID(), orgId: user.org_id, fileId: newFileId, versionNumber: 1, storageObjectId: version.storageObjectId, size: version.size, mimeType: version.mimeType, extension: version.extension, sha256Hash: version.sha256Hash, uploadedById: user.sub } }); } for (const child of source.children) await copyTree(child.id, newId); return newId; }; const newFolderId = await copyTree(sourceFolder.id, destinationFolderId); return { action: 'copy', sourceFolderId: event.fileId, newFolderId, destinationFolderId }; } const source = await this.prisma.file.findFirst({ where: { id: event.fileId, orgId: user.org_id, deletedAt: null }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } }); const version = source?.versions[0]; if (!source || !version) throw new Error('Source file not found'); const newFileId = randomUUID(); await this.prisma.$transaction(async (tx) => { await tx.file.create({ data: { id: newFileId, orgId: user.org_id, folderId: destinationFolderId, name: source.name, originalName: source.originalName, extension: source.extension, mimeType: source.mimeType, fileType: source.fileType, size: source.size, sha256Hash: source.sha256Hash, ownerId: user.sub } }); await tx.fileVersion.create({ data: { id: randomUUID(), orgId: user.org_id, fileId: newFileId, versionNumber: 1, storageObjectId: version.storageObjectId, size: version.size, mimeType: version.mimeType, extension: version.extension, sha256Hash: version.sha256Hash, uploadedById: user.sub } }); }); return { action: 'copy', sourceFileId: event.fileId, newFileId, destinationFolderId }; }
      case 'generate_link': case 'link': { if ((event.resourceType ?? 'FILE') === 'FOLDER') throw new Error('Link generation currently supports files only'); const created = await this.shares.createShare(user, { resourceType: 'FILE' as never, resourceId: event.fileId, permission: 'VIEW' as never, recipientUserIds: [], canDownload: config.canDownload !== false }); return { action: 'generate_link', link_url: created.link_url, resourceId: event.fileId }; }
      case 'share': { if ((event.resourceType ?? 'FILE') === 'FOLDER') throw new Error('Share action is only supported for files'); const recipientUserIds = Array.isArray(config.userIds) ? config.userIds.filter((id): id is string => typeof id === 'string') : []; const created = await this.shares.createShare(user, { resourceType: 'FILE' as never, resourceId: event.fileId, permission: (typeof config.permission === 'string' ? config.permission : 'VIEW') as never, recipientUserIds, canDownload: config.canDownload !== false }); return { action: 'share', link_url: created.link_url, recipientUserIds }; }
      case 'data_template': {
        const templateId = typeof config.templateId === 'string' ? config.templateId : null;
        const templateVersionId = typeof config.templateVersionId === 'string' ? config.templateVersionId : null;
        let template = typeof config.template === 'string' ? config.template : '';
        let templateFormat = String(config.format ?? 'TEXT').toUpperCase();
        if (templateId) {
          const row = await this.prisma.workflowDataTemplate.findFirst({ where: { id: templateId, orgId: user.org_id }, include: { activeVersion: true } });
          if (!row || row.status === 'ARCHIVED') throw new Error('Workflow data template is unavailable');
          const version = templateVersionId ? await this.prisma.workflowDataTemplateVersion.findFirst({ where: { id: templateVersionId, templateId, orgId: user.org_id } }) : row.activeVersion;
          if (!version) throw new Error('Workflow data template version not found');
          template = version.template; templateFormat = version.format;
        }
        if (!template) throw new Error('Data template requires template content');
        const runSnapshot = (await this.prisma.workflowRun.findUnique({ where: { id: runId }, select: { result: true } }))?.result;
        const rendered = this.renderTemplate(template, event, runSnapshot, { workflowId, runId, user: { id: user.sub } });
        if (templateFormat === 'JSON') { try { JSON.parse(String(rendered)); } catch { throw new Error('Rendered JSON data template is invalid'); } }
        const outputFieldId = typeof config.outputFieldId === 'string' ? config.outputFieldId : null;
        if (outputFieldId) { const run = await this.prisma.workflowRun.findUnique({ where: { id: runId }, select: { result: true } }); const previous = run?.result && typeof run.result === 'object' ? run.result as Record<string, unknown> : {}; const fv = previous.fieldValues && typeof previous.fieldValues === 'object' ? previous.fieldValues as Record<string, unknown> : {}; await this.prisma.workflowRun.update({ where: { id: runId }, data: { result: { ...previous, fieldValues: { ...fv, [outputFieldId]: rendered } } as unknown as Prisma.InputJsonValue } }); }
        return { action: 'data_template', rendered, format: templateFormat, templateId, templateVersionId, outputFieldId };
      }
      case 'custom_function': {
        const functionId = typeof config.functionId === 'string' ? config.functionId : '';
        if (functionId) {
          const fn = await this.prisma.workflowFunction.findFirst({ where: { id: functionId, orgId: user.org_id, enabled: true }, include: { activeVersion: true } });
          if (!fn || !fn.activeVersion) throw new Error('Active custom function version not found');
          const versionId = typeof config.functionVersionId === 'string' ? config.functionVersionId : fn.activeVersion.id;
          const version = await this.prisma.workflowFunctionVersion.findFirst({ where: { id: versionId, functionId: fn.id, orgId: user.org_id, status: 'ACTIVE' } });
          if (!version) throw new Error('Selected custom function version is not active');
          const run = await this.prisma.workflowRun.findUnique({ where: { id: runId }, select: { result: true } });
          const result = run?.result && typeof run.result === 'object' ? run.result as Record<string, unknown> : {};
          const fields = result.fieldValues && typeof result.fieldValues === 'object' ? result.fieldValues as Record<string, unknown> : {};
          const output = await this.functionExecutor.execute(user, fn.id, version.id, version.definition, { file: { id: event.fileId, name: event.name, extension: event.extension ?? '', folderId: event.folderId ?? '', mimeType: event.mimeType ?? '', fileType: event.fileType ?? '', size: event.size ?? '' }, workflow: { id: workflowId, runId }, user: { id: user.sub }, now: new Date().toISOString(), fields }, { runId, idempotencyKey: `workflow-function:${runId}:${workflowId}:${fn.id}:${version.id}` });
          const mergedFields = { ...fields, ...(output as any).fields };
          await this.prisma.workflowRun.update({ where: { id: runId }, data: { result: { ...result, fieldValues: mergedFields, customFunction: { functionId: fn.id, versionId: version.id, output: output as any } } as unknown as Prisma.InputJsonValue } });
          return { action: 'custom_function', functionId: fn.id, functionVersionId: version.id, output };
        }
        const key = String(config.functionKey ?? '').trim();
        if (!['set_workflow_field','notify_owner','tag_from_extension'].includes(key)) throw new Error('Unsupported or unsafe custom function');
        if (key === 'set_workflow_field') { const fieldId = String(config.fieldId ?? '').trim(); if (!fieldId) throw new Error('set_workflow_field requires fieldId'); const value = config.value ?? ''; const run = await this.prisma.workflowRun.findUnique({ where: { id: runId }, select: { result: true } }); const previous = run?.result && typeof run.result === 'object' ? run.result as Record<string, unknown> : {}; const fv = previous.fieldValues && typeof previous.fieldValues === 'object' ? previous.fieldValues as Record<string, unknown> : {}; await this.prisma.workflowRun.update({ where: { id: runId }, data: { result: { ...previous, fieldValues: { ...fv, [fieldId]: value } } as unknown as Prisma.InputJsonValue } }); return { action: 'custom_function', key, fieldId, value }; }
        if (key === 'tag_from_extension') { if ((event.resourceType ?? 'FILE') === 'FOLDER') throw new Error('tag_from_extension supports files only'); const tagName = String(event.extension ?? 'file').replace(/^\./, '').toLowerCase(); const tag = await this.prisma.tag.upsert({ where: { orgId_name: { orgId: user.org_id, name: tagName } }, create: { orgId: user.org_id, name: tagName }, update: {} }); await this.prisma.fileTag.upsert({ where: { fileId_tagId: { fileId: event.fileId, tagId: tag.id } }, create: { fileId: event.fileId, tagId: tag.id }, update: {} }); return { action: 'custom_function', key, tag: tagName }; }
        const ownerId = event.resourceType === 'FOLDER' ? (await this.prisma.folder.findFirst({ where: { id: event.fileId, orgId: user.org_id }, select: { ownerId: true } }))?.ownerId : (await this.prisma.file.findFirst({ where: { id: event.fileId, orgId: user.org_id }, select: { ownerId: true } }))?.ownerId;
        if (!ownerId) throw new Error('Resource owner not found'); await this.prisma.notification.create({ data: { orgId: user.org_id, userId: ownerId, type: 'SYSTEM', title: String(config.title ?? 'Workflow update'), body: String(config.body ?? `Workflow updated ${event.name}`), resourceType: (event.resourceType ?? 'FILE') as 'FILE'|'FOLDER', resourceId: event.fileId } }); return { action: 'custom_function', key, ownerId };
      }
      case 'request_approval': { const run = await this.prisma.workflowRun.findUnique({ where: { id: runId }, select: { currentStateId: true } }); const stateId = run?.currentStateId; if (!stateId) throw new Error('Approval action requires a current workflow state'); const rules: ParticipantRule[] = Array.isArray(config.participantRules) ? config.participantRules as ParticipantRule[] : [{ type: 'USER', ids: Array.isArray(config.userIds) ? config.userIds.filter((id): id is string => typeof id === 'string') : (typeof config.userId === 'string' ? [config.userId] : []) }, { type: 'GROUP', ids: Array.isArray(config.groupIds) ? config.groupIds.filter((id): id is string => typeof id === 'string') : [] }, { type: 'ROLE', roles: Array.isArray(config.roles) ? config.roles.filter((role): role is string => typeof role === 'string') : [] }]; const participantIds = await this.resolveParticipantRules(user.org_id, rules); if (!participantIds.length) throw new Error('No active workflow approver was found'); const policy = String(config.approvalPolicy ?? 'ANY').toUpperCase() === 'ALL' ? 'ALL' : 'ANY'; const dueMinutes = this.safeMinutes(config.dueInMinutes); const reminderMinutes = this.safeMinutes(config.reminderInMinutes); const dueAt = dueMinutes ? this.addBusinessMinutes(new Date(), dueMinutes, (config.calendarConfig && typeof config.calendarConfig === 'object' ? config.calendarConfig as Record<string, unknown> : undefined)) : null; const reminderAt = reminderMinutes ? this.addBusinessMinutes(new Date(), reminderMinutes, (config.calendarConfig && typeof config.calendarConfig === 'object' ? config.calendarConfig as Record<string, unknown> : undefined)) : null; const existing = await this.prisma.workflowTask.findFirst({ where: { runId, stateId, status: 'PENDING' } }); const task = existing ?? await this.prisma.workflowTask.create({ data: { orgId: user.org_id, workflowId, runId, stateId, assigneeId: participantIds[0], approvalPolicy: policy, dueAt, reminderAt, priority: String(config.priority ?? 'NORMAL').toUpperCase() === 'HIGH' ? 'HIGH' : 'NORMAL', escalationConfig: (Array.isArray(config.escalationRules) ? config.escalationRules : null) as unknown as Prisma.InputJsonValue, title: String(config.title ?? `Approval required for ${event.name}`) } }); if (!existing) { await this.prisma.workflowTaskParticipant.createMany({ data: participantIds.map((userId) => ({ id: randomUUID(), taskId: task.id, userId, status: 'PENDING' })) }); for (const userId of participantIds) await this.prisma.notification.create({ data: { orgId: user.org_id, userId, type: 'SYSTEM', title: 'Workflow approval required', body: task.title, resourceType: (event.resourceType ?? 'FILE') as 'FILE' | 'FOLDER', resourceId: event.fileId } }); } await this.prisma.workflowRun.update({ where: { id: runId }, data: { status: 'WAITING', currentStateId: stateId } }); return { action: 'request_approval', assigneeIds: participantIds, stateId, policy, waiting: true }; }
      default: throw new Error(`Unsupported workflow action: ${action.type}`);
    }
  }
}
