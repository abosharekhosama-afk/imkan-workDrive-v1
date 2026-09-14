import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SharesService } from '../shares/shares.service';
import type { AccessTokenPayload } from '../auth/jwt.types';

export type WorkflowFileEvent = {
  eventType?: string; fileId: string; name: string; mimeType?: string | null; fileType?: string | null; size?: string;
  userId: string; folderId?: string | null; extension?: string | null; sourceWorkflowId?: string; resourceType?: 'FILE' | 'FOLDER';
};
type WorkflowAction = { type: string; config?: Record<string, unknown> };
type PhaseActions = { before: WorkflowAction[]; during: WorkflowAction[]; after: WorkflowAction[] };
type WorkflowTransitionLike = { id: string; fromStateId: string; toStateId: string; name: string; trigger: string | null; condition: unknown; actions: unknown };
type WorkflowDefinition = { trigger?: string | string[]; condition?: unknown; actions?: WorkflowAction[]; fields: Array<Record<string, unknown>>; states: Array<{ id: string; terminal: boolean }>; transitions: WorkflowTransitionLike[] };

type RunResult = { actions?: unknown[]; fieldValues?: Record<string, unknown>; continueTransitionId?: string; pendingTransitionIds?: string[]; [key: string]: unknown };

@Injectable()
export class WorkflowEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowEngineService.name); private timer?: NodeJS.Timeout; private processing = false; private readonly workerId = `workdrive-workflow-${randomUUID()}`;
  constructor(private readonly prisma: PrismaService, private readonly shares: SharesService) {}
  onModuleInit() { this.timer = setInterval(() => void this.drain(), 1500); void this.drain(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async executeTrigger(user: AccessTokenPayload, event: WorkflowFileEvent) { return this.onFileEvent(user, event); }
  async onFileUploaded(user: AccessTokenPayload, event: WorkflowFileEvent) { return this.onFileEvent(user, { ...event, eventType: 'upload' }); }

  async onFileEvent(user: AccessTokenPayload, event: WorkflowFileEvent): Promise<void> {
    const eventType = event.eventType ?? 'upload';
    const workflows = await this.prisma.workflow.findMany({ where: { orgId: user.org_id, status: 'ACTIVE' }, include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true } });
    for (const workflow of workflows) {
      if (event.sourceWorkflowId && workflow.id === event.sourceWorkflowId) continue;
      if (workflow.mode !== 'AUTOMATIC' || workflow.resourceType !== (event.resourceType ?? 'FILE')) continue;
      const definition = this.definitionFromWorkflow(workflow);
      const triggers = Array.isArray(definition.trigger) ? definition.trigger.map(String) : [String(definition.trigger ?? '')];
      if (!this.triggerMatches(triggers, eventType)) continue;
      if (!this.conditionMatches(definition.condition, event, {})) continue;
      await this.enqueue(user, workflow.id, event, definition);
    }
  }

  async startManual(user: AccessTokenPayload, workflowId: string, event: WorkflowFileEvent) {
    const workflow = await this.prisma.workflow.findFirst({ where: { id: workflowId, orgId: user.org_id, status: 'ACTIVE' }, include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true } });
    if (!workflow) throw new Error('Active workflow not found'); if (workflow.mode !== 'MANUAL') throw new Error('Only manual workflows can be started explicitly');
    return this.enqueue(user, workflow.id, { ...event, eventType: 'manual', userId: user.sub }, this.definitionFromWorkflow(workflow));
  }

  private definitionFromWorkflow(workflow: { steps: Array<{ kind: string; config: unknown }>; states?: Array<{ id: string; terminal: boolean }>; transitions?: WorkflowTransitionLike[] }): WorkflowDefinition {
    const values = Object.fromEntries(workflow.steps.map((step) => [step.kind, (step.config as { value?: unknown })?.value]));
    const actions = Array.isArray(values.ACTIONS) ? values.ACTIONS as WorkflowAction[] : [];
    const fields = Array.isArray(values.WORKFLOW_FIELDS) ? values.WORKFLOW_FIELDS as Array<Record<string, unknown>> : [];
    return { trigger: Array.isArray(values.TRIGGER) ? values.TRIGGER.map(String) : String(values.TRIGGER ?? ''), condition: values.CONDITION ?? 'any', actions, fields, states: workflow.states ?? [], transitions: workflow.transitions ?? [] };
  }

  private triggerMatches(configured: string[], eventType: string) {
    if (configured.includes('manual')) return eventType === 'manual';
    const aliases: Record<string, string[]> = { upload: ['upload', 'FILE_UPLOADED'], create: ['create', 'created', 'FILE_CREATED', 'FOLDER_CREATED'], move: ['move', 'FILE_MOVED', 'FOLDER_MOVED'], copy: ['copy', 'FILE_COPIED', 'FOLDER_COPIED'], rename: ['rename', 'FILE_RENAMED'], delete: ['delete', 'FILE_DELETED'], properties_updated: ['properties_updated', 'FILE_PROPERTIES_UPDATED'], ready: ['ready', 'FILE_READY'] };
    return configured.some((x) => (aliases[x] ?? [x]).includes(eventType));
  }

  private conditionMatches(condition: unknown, event: WorkflowFileEvent, fields: Record<string, unknown>): boolean {
    if (!condition || condition === 'any') return true;
    if (Array.isArray(condition)) return condition.every((x) => this.conditionMatches(x, event, fields));
    if (typeof condition === 'string') { const normalized = condition.toUpperCase(); if (normalized === 'PDF') return String(event.fileType).toUpperCase() === 'PDF' || event.mimeType?.toLowerCase() === 'application/pdf'; if (normalized === 'IMAGE') return String(event.fileType).toUpperCase() === 'IMAGE' || !!event.mimeType?.toLowerCase().startsWith('image/'); if (normalized === 'DOCUMENT') return ['DOCUMENT', 'TEXT', 'CODE'].includes(String(event.fileType).toUpperCase()) || /word|text|rtf/.test(event.mimeType?.toLowerCase() ?? ''); if (normalized === 'SPREADSHEET') return String(event.fileType).toUpperCase() === 'SPREADSHEET' || /spreadsheet|excel|csv/.test(event.mimeType?.toLowerCase() ?? ''); if (normalized === 'PRESENTATION') return String(event.fileType).toUpperCase() === 'PRESENTATION' || /presentation|powerpoint/.test(event.mimeType?.toLowerCase() ?? ''); return true; }
    if (typeof condition !== 'object') return true;
    const c = condition as Record<string, unknown>;
    if (Array.isArray(c.all) && !c.all.every((x) => this.conditionMatches(x, event, fields))) return false;
    if (Array.isArray(c.any) && !c.any.some((x) => this.conditionMatches(x, event, fields))) return false;
    if (typeof c.fileType === 'string' && String(event.fileType).toUpperCase() !== c.fileType.toUpperCase()) return false;
    if (typeof c.extension === 'string' && String(event.extension ?? '').toLowerCase() !== c.extension.toLowerCase().replace(/^\./, '')) return false;
    if (typeof c.nameContains === 'string' && !event.name.toLowerCase().includes(c.nameContains.toLowerCase())) return false;
    if (typeof c.folderId === 'string' && event.folderId !== c.folderId) return false;
    if (typeof c.fieldId === 'string') { const op = String(c.operator ?? 'equals'); const actual = fields[c.fieldId]; const expected = c.value; if (op === 'equals' && actual !== expected) return false; if (op === 'not_equals' && actual === expected) return false; if (op === 'contains' && !String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase())) return false; }
    return true;
  }

  private phaseActions(raw: unknown): PhaseActions {
    if (Array.isArray(raw)) return { before: [], during: raw as WorkflowAction[], after: [] };
    const obj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const clean = (v: unknown) => Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').map((x) => ({ type: String((x as Record<string, unknown>).type ?? 'notify'), config: ((x as Record<string, unknown>).config && typeof (x as Record<string, unknown>).config === 'object' ? (x as Record<string, unknown>).config : {}) as Record<string, unknown> })) : [];
    return { before: clean(obj.before), during: clean(obj.during), after: clean(obj.after) };
  }

  private async enqueue(user: AccessTokenPayload, workflowId: string, event: WorkflowFileEvent, definition: WorkflowDefinition) {
    const eventKey = `${event.resourceType ?? 'FILE'}:${event.fileId}:${event.eventType ?? 'manual'}:${event.sourceWorkflowId ?? 'system'}`;
    try {
      const firstState = definition.states[0];
      const run = await this.prisma.workflowRun.create({ data: { orgId: user.org_id, workflowId, createdById: user.sub, eventKey, status: 'QUEUED', trigger: event, currentStateId: firstState?.id ?? null, result: { fieldValues: {} } as unknown as Prisma.InputJsonValue } });
      await this.prisma.workflowJob.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId, runId: run.id, status: 'QUEUED', runAt: new Date() } }); return run;
    } catch (error) { if ((error as { code?: string })?.code === 'P2002') return undefined; throw error; }
  }

  private async drain() { if (this.processing) return; this.processing = true; try { for (let i = 0; i < 10; i++) { const job = await this.claimJob(); if (!job) break; await this.executeJob(job.id); } } catch (error) { this.logger.error(error instanceof Error ? error.message : String(error)); } finally { this.processing = false; } }
  private async claimJob() { const now = new Date(); const candidate = await this.prisma.workflowJob.findFirst({ where: { status: 'QUEUED', runAt: { lte: now } }, orderBy: { runAt: 'asc' } }); if (!candidate) return null; const claimed = await this.prisma.workflowJob.updateMany({ where: { id: candidate.id, status: 'QUEUED' }, data: { status: 'RUNNING', lockedAt: now, lockedBy: this.workerId, attempts: { increment: 1 } } }); return claimed.count === 1 ? candidate : null; }

  private async executeJob(jobId: string) {
    const job = await this.prisma.workflowJob.findUnique({ where: { id: jobId }, include: { run: true, workflow: { include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true } } } }); if (!job) return;
    const event = job.run.trigger as unknown as WorkflowFileEvent; const definition = this.definitionFromWorkflow(job.workflow); const result = (job.run.result && typeof job.run.result === 'object' ? job.run.result : {}) as RunResult; const fieldValues = result.fieldValues ?? {};
    const continuationId = typeof result.continueTransitionId === 'string' ? result.continueTransitionId : null;
    const user = await this.prisma.user.findUnique({ where: { id: event.userId }, select: { id: true } }); if (!user) return this.failJob(job.id, job.run.id, 'Workflow actor no longer exists', job.attempts, job.maxAttempts); const token = { sub: user.id, org_id: job.orgId } as AccessTokenPayload;
    try {
      await this.prisma.workflowRun.update({ where: { id: job.run.id }, data: { status: 'RUNNING' } });
      let currentId = job.run.currentStateId ?? definition.states[0]?.id ?? null;
      let selectedTransition: WorkflowTransitionLike | undefined;
      if (continuationId) selectedTransition = definition.transitions.find((t) => t.id === continuationId);
      let hops = 0; const allResults: unknown[] = Array.isArray(result.actions) ? result.actions : [];
      while (currentId && hops++ < 50) {
        const state = definition.states.find((s) => s.id === currentId); if (!state) throw new Error('Workflow current state no longer exists');
        if (selectedTransition) {
          if (selectedTransition.fromStateId !== currentId) throw new Error('Workflow continuation is no longer valid');
          if (!this.transitionMatches(selectedTransition, event, fieldValues)) throw new Error('The selected transition conditions are no longer satisfied');
          const output = await this.executeTransition(token, event, selectedTransition, fieldValues, job.workflow.id, job.run.id, allResults, true);
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
        if (manual.length && !automatic) return this.createTask(job.id, job.run.id, job.orgId, job.workflow.id, currentId, event, manual, fieldValues, allResults);
        if (!automatic) return this.markWaiting(job.id, job.run.id, currentId, fieldValues, allResults, manual.map((t) => t.id));
        const output = await this.executeTransition(token, event, automatic, fieldValues, job.workflow.id, job.run.id, allResults, false);
        allResults.push(...output.results);
        if (output.waiting) return this.markWaiting(job.id, job.run.id, currentId, fieldValues, allResults, output.pendingTransitionIds);
        currentId = automatic.toStateId;
        await this.prisma.workflowRun.update({ where: { id: job.run.id }, data: { currentStateId: currentId, result: { fieldValues, actions: allResults } as unknown as Prisma.InputJsonValue } });
      }
      if (hops >= 50) throw new Error('Workflow exceeded the maximum of 50 automatic transitions');
    } catch (error) { const message = error instanceof Error ? error.message : String(error); await this.failJob(job.id, job.run.id, message, job.attempts, job.maxAttempts); }
  }

  private transitionMatches(t: WorkflowTransitionLike, event: WorkflowFileEvent, fields: Record<string, unknown>) { if (t.trigger && t.trigger !== 'manual' && !this.triggerMatches([t.trigger], event.eventType ?? 'upload')) return false; return this.conditionMatches(t.condition, event, fields); }

  private async executeTransition(user: AccessTokenPayload, event: WorkflowFileEvent, transition: WorkflowTransitionLike, fields: Record<string, unknown>, workflowId: string, runId: string, existingResults: unknown[], continuation: boolean) {
    const phases = this.phaseActions(transition.actions); const results: unknown[] = [];
    for (const [phaseName, actions] of ([['before', phases.before], ['during', phases.during], ['after', phases.after]] as const)) {
      for (let i = 0; i < actions.length; i++) {
        const action = this.resolveAction(actions[i], event, fields); const step = await this.prisma.workflowStepRun.create({ data: { orgId: user.org_id, runId, stepKind: `TRANSITION:${transition.name}:${phaseName}:${action.type}`, stepPosition: existingResults.length + results.length, status: 'RUNNING', input: action as unknown as Prisma.InputJsonValue } });
        try { const output = await this.executeAction(user, event, action, workflowId, runId); results.push({ phase: phaseName, output }); await this.prisma.workflowStepRun.update({ where: { id: step.id }, data: { status: 'SUCCEEDED', output: output as unknown as Prisma.InputJsonValue, finishedAt: new Date() } }); if ((output as { waiting?: boolean } | null)?.waiting) return { results, waiting: true, pendingTransitionIds: [] as string[], continuation }; }
        catch (error) { const message = error instanceof Error ? error.message : String(error); await this.prisma.workflowStepRun.update({ where: { id: step.id }, data: { status: 'FAILED', error: message, finishedAt: new Date() } }); throw error; }
      }
    }
    return { results, waiting: false, pendingTransitionIds: [] as string[], continuation };
  }

  private resolveAction(action: WorkflowAction, event: WorkflowFileEvent, fields: Record<string, unknown>): WorkflowAction {
    const replace = (v: unknown): unknown => typeof v !== 'string' ? v : v.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m, key: string) => { const k = key.trim(); if (k === 'file.name') return event.name; if (k === 'file.id') return event.fileId; if (k === 'file.extension') return event.extension ?? ''; if (k === 'file.folderId') return event.folderId ?? ''; return String(fields[k] ?? ''); });
    const walk = (v: unknown): unknown => Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : replace(v);
    return { ...action, config: walk(action.config ?? {}) as Record<string, unknown> };
  }

  private async createTask(jobId: string, runId: string, orgId: string, workflowId: string, stateId: string, event: WorkflowFileEvent, transitions: WorkflowTransitionLike[], fieldValues: Record<string, unknown>, actions: unknown[]) {
    const assignee = event.userId; const existing = await this.prisma.workflowTask.findFirst({ where: { runId, stateId, status: 'PENDING' } });
    if (!existing) await this.prisma.workflowTask.create({ data: { orgId, workflowId, runId, stateId, assigneeId: assignee, title: `Action required for ${event.name}` } });
    await this.prisma.workflowRun.update({ where: { id: runId }, data: { status: 'WAITING', currentStateId: stateId, result: { fieldValues, actions, pendingTransitionIds: transitions.map((t) => t.id) } as unknown as Prisma.InputJsonValue } });
    await this.prisma.workflowJob.update({ where: { id: jobId }, data: { status: 'SUCCEEDED', lockedAt: null, lockedBy: null } });
    return { waiting: true };
  }

  private async markWaiting(jobId: string, runId: string, stateId: string, fieldValues: Record<string, unknown>, actions: unknown[], pendingTransitionIds: string[]) { await this.prisma.workflowRun.update({ where: { id: runId }, data: { status: 'WAITING', currentStateId: stateId, result: { fieldValues, actions, pendingTransitionIds } as unknown as Prisma.InputJsonValue } }); await this.prisma.workflowJob.update({ where: { id: jobId }, data: { status: 'SUCCEEDED', lockedAt: null, lockedBy: null } }); }
  private async finishRun(jobId: string, runId: string, stateId: string, fieldValues: Record<string, unknown>, actions: unknown[]) { await this.prisma.workflowRun.update({ where: { id: runId }, data: { status: 'SUCCEEDED', currentStateId: stateId, result: { fieldValues, actions } as unknown as Prisma.InputJsonValue, finishedAt: new Date() } }); await this.prisma.workflowJob.update({ where: { id: jobId }, data: { status: 'SUCCEEDED', lockedAt: null, lockedBy: null } }); }
  private async failJob(jobId: string, runId: string, message: string, attempts: number, maxAttempts: number) { const terminal = attempts >= maxAttempts; const delay = Math.min(60 * 60 * 1000, 1000 * 2 ** Math.max(0, attempts - 1)); await this.prisma.workflowJob.update({ where: { id: jobId }, data: { status: terminal ? 'DEAD' : 'QUEUED', runAt: new Date(Date.now() + delay), lastError: message, lockedAt: null, lockedBy: null } }); await this.prisma.workflowRun.update({ where: { id: runId }, data: { status: terminal ? 'FAILED' : 'QUEUED', error: message, ...(terminal ? { finishedAt: new Date() } : {}) } }).catch(() => undefined); }

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
      case 'request_approval': { const run = await this.prisma.workflowRun.findUnique({ where: { id: runId }, select: { currentStateId: true } }); const stateId = run?.currentStateId; if (!stateId) throw new Error('Approval action requires a current workflow state'); const assigneeId = typeof config.userId === 'string' ? config.userId : user.sub; await this.prisma.workflowTask.create({ data: { orgId: user.org_id, workflowId, runId, stateId, assigneeId, title: String(config.title ?? `Approval required for ${event.name}`) } }); await this.prisma.workflowRun.update({ where: { id: runId }, data: { status: 'WAITING', currentStateId: stateId } }); await this.prisma.notification.create({ data: { orgId: user.org_id, userId: assigneeId, type: 'SYSTEM', title: 'Workflow approval required', body: String(config.title ?? `Approval required for ${event.name}`), resourceType: (event.resourceType ?? 'FILE') as 'FILE' | 'FOLDER', resourceId: event.fileId } }); return { action: 'request_approval', assigneeId, stateId, waiting: true }; }
      default: throw new Error(`Unsupported workflow action: ${action.type}`);
    }
  }
}
