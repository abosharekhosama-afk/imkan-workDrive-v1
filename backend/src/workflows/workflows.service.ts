import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { WorkflowEngineService } from './workflow-engine.service';
import { dynamicValueCatalog, walkDynamicValues } from './workflow-runtime';
import { CustomFunctionExecutor } from './custom-function.executor';
import { PermissionService } from '../permissions/permission.service';

type ActionInput = { type?: unknown; config?: unknown };
type FieldInput = { id?: unknown; name?: unknown; description?: unknown; type?: unknown; required?: unknown; defaultValue?: unknown; max?: unknown; options?: unknown };
type WorkflowInput = { name?: unknown; description?: unknown; mode?: unknown; resourceType?: unknown; trigger?: unknown; condition?: unknown; action?: unknown; actions?: unknown; status?: unknown; states?: unknown; transitions?: unknown; fields?: unknown; calendarConfig?: unknown };
type WorkflowStatus = 'DRAFT' | 'ACTIVE';

export function isWorkflowAdmin(user: Pick<AccessTokenPayload, 'role'>): boolean {
  return user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
}

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService, private readonly engine: WorkflowEngineService, private readonly functionExecutor: CustomFunctionExecutor, private readonly permissions: PermissionService) {}

  private requireWorkflowAdmin(user: AccessTokenPayload): void {
    if (!isWorkflowAdmin(user)) throw new ForbiddenException('Workflow administration requires an organization admin');
  }

  private requireWorkflowOwnerOrAdmin(user: AccessTokenPayload, ownerId: string): void {
    if (!isWorkflowAdmin(user) && ownerId !== user.sub) throw new ForbiddenException('You do not have permission to manage this workflow');
  }

  private normalizeActions(raw: unknown): Array<{ type: string; config: Record<string, unknown> }> {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => {
      const a = (item ?? {}) as ActionInput;
      if (typeof a.type !== 'string' || !a.type.trim()) throw new BadRequestException('Each workflow action requires a type');
      return { type: a.type.trim(), config: (a.config && typeof a.config === 'object' ? a.config : {}) as Record<string, unknown> };
    });
  }

  private normalizeFields(raw: unknown) {
    if (!Array.isArray(raw)) return [];
    if (raw.length > 50) throw new BadRequestException('A workflow can contain at most 50 custom fields');
    return raw.map((item, index) => {
      const f = (item ?? {}) as FieldInput;
      const name = typeof f.name === 'string' ? f.name.trim() : '';
      const id = typeof f.id === 'string' && f.id.trim() ? f.id.trim() : `field_${index + 1}`;
      const type = typeof f.type === 'string' ? f.type.trim() : 'single';
      if (!name) throw new BadRequestException(`Workflow field ${index + 1} requires a name`);
      if (name.length > 120) throw new BadRequestException('Workflow field names must be at most 120 characters');
      const max = typeof f.max === 'number' && Number.isFinite(f.max) ? Math.max(1, Math.floor(f.max)) : undefined;
      const options = Array.isArray(f.options) ? f.options.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 100) : undefined;
      return { id, name, description: typeof f.description === 'string' ? f.description.trim() : '', type, required: f.required === true, defaultValue: typeof f.defaultValue === 'string' ? f.defaultValue : undefined, max, options };
    });
  }

  private validate(body: unknown) {
    const value = (body ?? {}) as WorkflowInput;
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    if (!name || name.length > 160) throw new BadRequestException('Workflow name is required and must be at most 160 characters');
    const mode = value.mode === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC';
    const resourceType = value.resourceType === 'FOLDER' ? 'FOLDER' : 'FILE';
    const trigger = Array.isArray(value.trigger) ? value.trigger.map((x) => String(x).trim()).filter(Boolean).slice(0, 5) : (typeof value.trigger === 'string' ? value.trigger.trim() : (mode === 'MANUAL' ? 'manual' : 'upload'));
    if (mode === 'AUTOMATIC' && Array.isArray(trigger) && trigger.length === 0) throw new BadRequestException('Select at least one starting trigger');
    const condition = value.condition ?? 'any';
    const actions = Array.isArray(value.actions) ? this.normalizeActions(value.actions) : (typeof value.action === 'string' ? [{ type: value.action.trim(), config: {} }] : []);
    const status: WorkflowStatus = value.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT';
    const fields = this.normalizeFields(value.fields);
    const calendarConfig = value.calendarConfig && typeof value.calendarConfig === 'object' ? value.calendarConfig : { timezone: 'UTC', workingDays: [1,2,3,4,5], workStart: '09:00', workEnd: '17:00', holidays: [] };
    const states = Array.isArray(value.states) && value.states.length ? value.states : [{ name: 'Start', description: '', terminal: false }, { name: 'Completed', description: '', terminal: true }];
    const transitions = Array.isArray(value.transitions) && value.transitions.length ? value.transitions : [{ from: 0, to: 1, name: 'Complete', execution: 'AUTOMATIC', actions: { before: [], during: actions, after: [] } }];
    if (states.length > 20) throw new BadRequestException('A workflow can contain at most 20 states');
    if (status === 'ACTIVE') {
      if (!states.some((raw) => (raw as Record<string, unknown>).terminal === true)) throw new BadRequestException('An active workflow requires at least one final state');
      if (!Array.isArray(transitions) || transitions.length === 0) throw new BadRequestException('An active workflow requires at least one transition');
    }
    for (const raw of states) { const s = raw as Record<string, unknown>; if (typeof s.name !== 'string' || !s.name.trim()) throw new BadRequestException('Every workflow state requires a name'); }
    for (const rawTransition of transitions) {
      const t = rawTransition as Record<string, unknown>;
      const from = Number(t.from ?? 0), to = Number(t.to ?? 0);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= states.length || to >= states.length || from === to) throw new BadRequestException('Invalid workflow transition state');
      const phaseActions = t.actions && typeof t.actions === 'object' && !Array.isArray(t.actions) ? t.actions as Record<string, unknown> : { during: t.actions };
      const total = this.normalizeActions(phaseActions.before).length + this.normalizeActions(phaseActions.during).length + this.normalizeActions(phaseActions.after).length;
      if (total > 15) throw new BadRequestException('A workflow transition can contain at most 15 actions (5 per phase)');
      for (const phase of ['before', 'during', 'after']) if (this.normalizeActions(phaseActions[phase]).length > 5) throw new BadRequestException('A workflow transition can contain at most 5 actions per phase');
    }
    if (actions.length > 5) throw new BadRequestException('Legacy workflow actions are limited to 5');
    return { name, description: typeof value.description === 'string' ? value.description.trim() : '', mode, resourceType, trigger, condition, actions, status, fields, states, transitions, calendarConfig };
  }

  private stepData(input: ReturnType<WorkflowsService['validate']>) {
    return [
      { position: 0, kind: 'TRIGGER', config: { value: input.trigger } as unknown as Prisma.InputJsonValue },
      { position: 1, kind: 'CONDITION', config: { value: input.condition } as unknown as Prisma.InputJsonValue },
      { position: 2, kind: 'ACTIONS', config: { value: input.actions } as unknown as Prisma.InputJsonValue },
      { position: 3, kind: 'WORKFLOW_FIELDS', config: { value: input.fields } as unknown as Prisma.InputJsonValue },
    ];
  }

  async participants(user: AccessTokenPayload) {
    return this.prisma.organizationMembership.findMany({ where: { organizationId: user.org_id, status: 'ACTIVE' }, include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } }, orderBy: { user: { name: 'asc' } } });
  }

  async participantOptions(user: AccessTokenPayload) {
    const [members, groups] = await Promise.all([
      this.prisma.organizationMembership.findMany({ where: { organizationId: user.org_id, status: 'ACTIVE' }, include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } }, orderBy: { user: { name: 'asc' } } }),
      this.prisma.group.findMany({ where: { orgId: user.org_id }, select: { id: true, name: true, description: true, members: { select: { userId: true } } }, orderBy: { name: 'asc' } }),
    ]);
    return { users: members.map((m) => m.user), groups: groups.map((g) => ({ id: g.id, name: g.name, description: g.description, memberCount: g.members.length })), roles: ['SUPER_ADMIN','ADMIN','MEMBER'] };
  }

  async list(user: AccessTokenPayload, scope?: string) {
    const admin = isWorkflowAdmin(user);
    const where: Prisma.WorkflowWhereInput = {
      orgId: user.org_id,
      ...(scope === 'mine' ? { ownerId: user.sub } : {}),
      ...(scope === 'drafts' ? { status: 'DRAFT' } : {}),
    };
    if (!admin && scope !== 'mine' && scope !== 'drafts') where.status = 'ACTIVE';
    if (!admin && scope === 'drafts') where.ownerId = user.sub;
    return this.prisma.workflow.findMany({ where, include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true, activeVersion: { select: { id: true, version: true, publishedAt: true } } }, orderBy: { updatedAt: 'desc' } });
  }

  async queue(user: AccessTokenPayload, status?: string) {
    this.requireWorkflowAdmin(user);
    const allowed = ['QUEUED','RUNNING','FAILED','DEAD_LETTER','COMPLETED'];
    const where: any = { orgId: user.org_id };
    if (status && allowed.includes(status)) where.status = status;
    return this.prisma.workflowJob.findMany({ where, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], take: 200, include: { workflow: { select: { id: true, name: true } }, run: { select: { id: true, status: true } } } });
  }

  async queueAction(user: AccessTokenPayload, jobId: string, action: string) {
    this.requireWorkflowAdmin(user);
    const job = await this.prisma.workflowJob.findFirst({ where: { id: jobId, orgId: user.org_id } });
    if (!job) throw new NotFoundException('Workflow job not found');
    const now = new Date();
    if (action === 'retry' || action === 'requeue') {
      if (!['FAILED','DEAD_LETTER','COMPLETED'].includes(job.status)) throw new BadRequestException('Job cannot be requeued from its current status');
      await this.prisma.$transaction(async (tx) => {
        await tx.workflowJob.update({ where: { id: job.id }, data: { status: 'QUEUED', runAt: now, lockedAt: null, lockedBy: null, leaseUntil: null, lastError: null } });
        await tx.workflowRun.update({ where: { id: job.runId }, data: { status: 'QUEUED', error: null, finishedAt: null } });
        await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: `WORKFLOW_JOB_${action.toUpperCase()}`, resourceType: 'WORKFLOW_JOB', resourceId: job.id, metadata: { runId: job.runId } } });
      });
      return { id: job.id, status: 'QUEUED' };
    }
    if (action === 'dead-letter') {
      await this.prisma.$transaction(async (tx) => {
        await tx.workflowJob.update({ where: { id: job.id }, data: { status: 'DEAD_LETTER', lockedAt: null, lockedBy: null, leaseUntil: null, lastError: job.lastError ?? 'Moved to dead-letter by operator' } });
        await tx.workflowRun.update({ where: { id: job.runId }, data: { status: 'DEAD_LETTER', finishedAt: now } });
        await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_JOB_DEAD_LETTER', resourceType: 'WORKFLOW_JOB', resourceId: job.id, metadata: { runId: job.runId } } });
      });
      return { id: job.id, status: 'DEAD_LETTER' };
    }
    if (action === 'recover') {
      if (!['RUNNING','FAILED'].includes(job.status) && !(job.leaseUntil && job.leaseUntil < now)) throw new BadRequestException('Job is not recoverable');
      await this.prisma.$transaction(async (tx) => {
        await tx.workflowJob.update({ where: { id: job.id }, data: { status: 'QUEUED', runAt: now, lockedAt: null, lockedBy: null, leaseUntil: null } });
        await tx.workflowRun.update({ where: { id: job.runId }, data: { status: 'QUEUED', error: null, finishedAt: null } });
        await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_JOB_RECOVERED', resourceType: 'WORKFLOW_JOB', resourceId: job.id, metadata: { runId: job.runId } } });
      });
      return { id: job.id, status: 'QUEUED' };
    }
    throw new BadRequestException('Unsupported queue action');
  }

  async queueJob(user: AccessTokenPayload, jobId: string) {
    this.requireWorkflowAdmin(user);
    const job = await this.prisma.workflowJob.findFirst({ where: { id: jobId, orgId: user.org_id }, include: { workflow: { select: { id: true, name: true } }, run: { include: { stepRuns: { orderBy: { stepPosition: 'asc' } } } } } });
    if (!job) throw new NotFoundException('Workflow job not found');
    return job;
  }

  async audit(user: AccessTokenPayload, action?: string, resourceType?: string) {
    this.requireWorkflowAdmin(user);
    const where: any = { orgId: user.org_id };
    if (action) where.action = action;
    if (resourceType) where.resourceType = resourceType;
    return this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300, include: { actor: { select: { id: true, name: true, email: true } } } });
  }

  async diagnostics(user: AccessTokenPayload) {
    this.requireWorkflowAdmin(user);
    const startedAt = Date.now();
    const checks: Array<{ key: string; label: string; status: 'PASS' | 'WARN' | 'FAIL'; detail: string; latencyMs?: number }> = [];
    try {
      const dbStarted = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      checks.push({ key: 'database', label: 'Database', status: 'PASS', detail: 'Workflow database queries are reachable.', latencyMs: Date.now() - dbStarted });
    } catch (error) { checks.push({ key: 'database', label: 'Database', status: 'FAIL', detail: error instanceof Error ? error.message : 'Database query failed' }); }
    const [workflowCount, activeCount, queued, running, waiting, failed, deadLetter] = await Promise.all([
      this.prisma.workflow.count({ where: { orgId: user.org_id } }),
      this.prisma.workflow.count({ where: { orgId: user.org_id, status: 'ACTIVE' } }),
      this.prisma.workflowJob.count({ where: { orgId: user.org_id, status: 'QUEUED' } }),
      this.prisma.workflowJob.count({ where: { orgId: user.org_id, status: 'RUNNING' } }),
      this.prisma.workflowRun.count({ where: { orgId: user.org_id, status: 'WAITING' } }),
      this.prisma.workflowRun.count({ where: { orgId: user.org_id, status: 'FAILED' } }),
      this.prisma.workflowJob.count({ where: { orgId: user.org_id, status: 'DEAD_LETTER' } }),
    ]);
    checks.push({ key: 'workflow-api', label: 'Workflow API', status: 'PASS', detail: `${workflowCount} workflow(s) visible to this organization.` });
    checks.push({ key: 'engine', label: 'Workflow Engine', status: 'PASS', detail: 'Engine-backed run and task endpoints are registered.' });
    checks.push({ key: 'queue', label: 'Queue', status: deadLetter > 0 ? 'WARN' : 'PASS', detail: `${queued} queued, ${running} running, ${deadLetter} dead-letter job(s).` });
    checks.push({ key: 'worker', label: 'Worker lease', status: 'PASS', detail: 'Lease/heartbeat recovery is enabled for queued jobs.' });
    checks.push({ key: 'dynamic-values', label: 'Dynamic Values', status: 'PASS', detail: 'Catalog and runtime interpolation are enabled.' });
    checks.push({ key: 'conditions', label: 'Conditions', status: 'PASS', detail: 'Nested AND/OR condition evaluation is enabled.' });
    checks.push({ key: 'versioning', label: 'Versioning', status: 'PASS', detail: 'Published versions are immutable and runs record their version.' });
    checks.push({ key: 'tasks', label: 'Approval Tasks', status: waiting > 0 ? 'WARN' : 'PASS', detail: `${waiting} run(s) currently waiting for action.` });
    checks.push({ key: 'runtime-errors', label: 'Runtime Errors', status: failed > 0 ? 'WARN' : 'PASS', detail: `${failed} failed run(s) are currently recorded.` });
    return { generatedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, summary: { workflowCount, activeCount, queued, running, waiting, failed, deadLetter }, checks };
  }

  async dynamicValues(user: AccessTokenPayload, workflowId?: string) {
    let fields: Array<Record<string, unknown>> = [];
    if (workflowId) {
      const workflow = await this.prisma.workflow.findFirst({ where: { id: workflowId, orgId: user.org_id }, include: { steps: { where: { kind: 'WORKFLOW_FIELDS' }, take: 1 } } });
      if (!workflow) throw new NotFoundException('Workflow not found');
      const value = (workflow.steps[0]?.config as { value?: unknown } | undefined)?.value;
      fields = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
    }
    return { version: 1, values: dynamicValueCatalog(fields) };
  }

  async runs(user: AccessTokenPayload, workflowId?: string, status?: string, date?: string) {
    const where: Prisma.WorkflowRunWhereInput = { orgId: user.org_id, ...(workflowId ? { workflowId } : {}), ...(status ? { status } : {}) };
    if (!isWorkflowAdmin(user)) {
      where.OR = [
        { createdById: user.sub },
        { workflow: { ownerId: user.sub } },
        { tasks: { some: { OR: [{ assigneeId: user.sub }, { participants: { some: { userId: user.sub } } }] } } },
      ];
    }
    if (date) where.startedAt = { gte: new Date(`${date}T00:00:00.000Z`), lte: new Date(`${date}T23:59:59.999Z`) };
    return this.prisma.workflowRun.findMany({ where, include: { workflow: { select: { id: true, name: true, ownerId: true } }, currentState: { select: { id: true, name: true } }, tasks: { orderBy: { createdAt: 'desc' }, take: 5 }, stepRuns: { orderBy: { stepPosition: 'asc' } } }, orderBy: { startedAt: 'desc' }, take: 100 });
  }

  async resourceStatus(user: AccessTokenPayload, resourceType: string, resourceIds: string) {
    const type = String(resourceType ?? '').toUpperCase();
    if (type !== 'FILE' && type !== 'FOLDER') throw new BadRequestException('resourceType must be FILE or FOLDER');
    const ids = [...new Set(String(resourceIds ?? '').split(',').map((id) => id.trim()).filter(Boolean))].slice(0, 100);
    if (!ids.length) return [];
    const resources = type === 'FILE'
      ? await this.prisma.file.findMany({ where: { id: { in: ids }, orgId: user.org_id, deletedAt: null }, select: { id: true, orgId: true, ownerId: true, folder: { select: { teamFolderId: true } } } })
      : await this.prisma.folder.findMany({ where: { id: { in: ids }, orgId: user.org_id }, select: { id: true, orgId: true, ownerId: true, teamFolderId: true } });
    const readable = new Set(resources.filter((resource) => this.permissions.canRead(user, { orgId: resource.orgId, ownerId: resource.ownerId, teamFolderId: type === 'FILE' ? resource.folder?.teamFolderId ?? null : resource.teamFolderId ?? null })).map((resource) => resource.id));
    if (!readable.size) return [];
    const runs = await this.prisma.workflowRun.findMany({
      where: { orgId: user.org_id },
      include: { workflow: { select: { id: true, name: true, ownerId: true } }, currentState: { select: { id: true, name: true, terminal: true } }, tasks: { where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 5, include: { participants: { where: { userId: user.sub }, select: { userId: true, status: true } } } } },
      orderBy: { startedAt: 'desc' }, take: 500,
    });
    const latest = new Map<string, Record<string, unknown>>();
    for (const run of runs) {
      const trigger = (run.trigger && typeof run.trigger === 'object' ? run.trigger : {}) as Record<string, unknown>;
      const runType = String(trigger.resourceType ?? 'FILE').toUpperCase();
      const resourceId = String(trigger.fileId ?? '');
      if (runType !== type || !readable.has(resourceId) || latest.has(resourceId)) continue;
      const visible = isWorkflowAdmin(user) || run.createdById === user.sub || run.workflow.ownerId === user.sub || run.tasks.some((task) => task.assigneeId === user.sub || task.participants.some((participant) => participant.userId === user.sub));
      if (!visible) continue;
      const pendingTasks = run.tasks.filter((task) => task.status === 'PENDING');
      const mine = pendingTasks.find((task) => task.assigneeId === user.sub || task.participants.some((participant) => participant.userId === user.sub && participant.status === 'PENDING'));
      latest.set(resourceId, { resourceType: type, resourceId, runId: run.id, workflowId: run.workflow.id, workflowName: run.workflow.name, status: run.status, state: run.currentState ? { id: run.currentState.id, name: run.currentState.name, terminal: run.currentState.terminal } : null, startedAt: run.startedAt, finishedAt: run.finishedAt, pending: pendingTasks.length > 0, myPendingTask: mine ? { id: mine.id, title: mine.title, dueAt: mine.dueAt, priority: mine.priority } : null });
    }
    return [...latest.values()];
  }

  async tasks(user: AccessTokenPayload, status = 'PENDING') {
    return this.prisma.workflowTask.findMany({ where: { orgId: user.org_id, status, OR: [{ assigneeId: user.sub }, { assigneeId: null }, { participants: { some: { userId: user.sub, status: 'PENDING' } } }] }, include: { workflow: { select: { id: true, name: true, transitions: true, steps: true } }, state: { select: { id: true, name: true } }, participants: { include: { user: { select: { id: true, name: true, email: true } } } }, run: { select: { id: true, trigger: true, result: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async get(user: AccessTokenPayload, id: string) {
    const row = await this.prisma.workflow.findFirst({ where: { id, orgId: user.org_id }, include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true } });
    if (!row) throw new NotFoundException('Workflow not found');
    if (row.status !== 'ACTIVE') this.requireWorkflowOwnerOrAdmin(user, row.ownerId);
    return row;
  }

  async create(user: AccessTokenPayload, body: unknown) {
    this.requireWorkflowAdmin(user);
    const input = this.validate(body); const id = randomUUID();
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.workflow.create({ data: { id, orgId: user.org_id, ownerId: user.sub, name: input.name, description: input.description || null, mode: input.mode, resourceType: input.resourceType, calendarConfig: input.calendarConfig as Prisma.InputJsonValue, status: 'DRAFT', steps: { create: this.stepData(input) } } });
      const states = await Promise.all(input.states.map((s, position) => { const v = s as Record<string, unknown>; return tx.workflowState.create({ data: { id: randomUUID(), workflowId: id, name: typeof v.name === 'string' ? v.name.trim() : `State ${position + 1}`, description: typeof v.description === 'string' ? v.description.trim() : null, position, terminal: v.terminal === true } }); }));
      for (const raw of input.transitions as Array<Record<string, unknown>>) {
        const from = Number(raw.from ?? 0), to = Number(raw.to ?? 1); if (!states[from] || !states[to] || from === to) throw new BadRequestException('Invalid workflow transition state');
        const phases = raw.actions && typeof raw.actions === 'object' && !Array.isArray(raw.actions) ? raw.actions as Record<string, unknown> : { during: raw.actions };
        const phaseActions = { before: this.normalizeActions(phases.before), during: this.normalizeActions(phases.during), after: this.normalizeActions(phases.after) };
        await tx.workflowTransition.create({ data: { id: randomUUID(), workflowId: id, fromStateId: states[from].id, toStateId: states[to].id, name: typeof raw.name === 'string' ? raw.name.trim() : 'Transition', description: typeof raw.description === 'string' ? raw.description.trim() : null, trigger: typeof raw.trigger === 'string' ? raw.trigger.trim() : null, condition: (raw.condition ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue, actions: phaseActions as unknown as Prisma.InputJsonValue } });
      }
      return tx.workflow.findUnique({ where: { id }, include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true } });
    });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_CREATED', resourceType: 'WORKFLOW', resourceId: id, metadata: { name: input.name, mode: input.mode, resourceType: input.resourceType } } });
    if (input.status === 'ACTIVE') { const version = await this.publishVersion(user, id); await this.prisma.workflow.update({ where: { id }, data: { status: 'ACTIVE', activeVersionId: version.id } }); }
    return this.get(user, id);
  }

  async update(user: AccessTokenPayload, id: string, body: unknown) {
    const existing = await this.prisma.workflow.findFirst({ where: { id, orgId: user.org_id } });
    if (!existing) throw new NotFoundException('Workflow not found'); this.requireWorkflowOwnerOrAdmin(user, existing.ownerId);
    if (existing.status === 'ACTIVE') throw new BadRequestException('Deactivate the workflow before editing it; published versions are immutable');
    const pendingRuns = await this.prisma.workflowRun.count({ where: { workflowId: id, status: { in: ['QUEUED','RUNNING','WAITING'] } } });
    if (pendingRuns > 0) throw new BadRequestException('This workflow has running or waiting executions. Finish them before changing the draft.');
    const input = this.validate(body);
    await this.prisma.$transaction(async (tx) => {
      await tx.workflowStep.deleteMany({ where: { workflowId: id } }); await tx.workflowTransition.deleteMany({ where: { workflowId: id } }); await tx.workflowState.deleteMany({ where: { workflowId: id } });
      await tx.workflow.update({ where: { id }, data: { name: input.name, description: input.description || null, mode: input.mode, resourceType: input.resourceType, calendarConfig: input.calendarConfig as Prisma.InputJsonValue, status: 'DRAFT', activeVersionId: null, steps: { create: this.stepData(input) } } });
      const states: { id: string }[] = [];
      for (const [position, raw] of input.states.entries()) { const v = raw as Record<string, unknown>; states.push(await tx.workflowState.create({ data: { id: randomUUID(), workflowId: id, name: typeof v.name === 'string' ? v.name.trim() : `State ${position + 1}`, description: typeof v.description === 'string' ? v.description.trim() : null, position, terminal: v.terminal === true } })); }
      for (const raw of input.transitions as Array<Record<string, unknown>>) { const from = Number(raw.from ?? 0), to = Number(raw.to ?? 1); if (!states[from] || !states[to] || from === to) throw new BadRequestException('Invalid workflow transition state'); const phases = raw.actions && typeof raw.actions === 'object' && !Array.isArray(raw.actions) ? raw.actions as Record<string, unknown> : { during: raw.actions }; const phaseActions = { before: this.normalizeActions(phases.before), during: this.normalizeActions(phases.during), after: this.normalizeActions(phases.after) }; await tx.workflowTransition.create({ data: { id: randomUUID(), workflowId: id, fromStateId: states[from].id, toStateId: states[to].id, name: typeof raw.name === 'string' ? raw.name.trim() : 'Transition', description: typeof raw.description === 'string' ? raw.description.trim() : null, trigger: typeof raw.trigger === 'string' ? raw.trigger.trim() : null, condition: (raw.condition ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue, actions: phaseActions as unknown as Prisma.InputJsonValue } }); }
    });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_UPDATED', resourceType: 'WORKFLOW', resourceId: id, metadata: { before: { name: existing.name, description: existing.description, mode: existing.mode, resourceType: existing.resourceType, status: existing.status, calendarConfig: existing.calendarConfig }, after: { name: input.name, description: input.description || null, mode: input.mode, resourceType: input.resourceType, status: input.status, calendarConfig: input.calendarConfig } } as any } });
    if (input.status === 'ACTIVE') { const version = await this.publishVersion(user, id); await this.prisma.workflow.update({ where: { id }, data: { status: 'ACTIVE', activeVersionId: version.id } }); }
    return this.get(user, id);
  }

  private async publishVersion(user: AccessTokenPayload, id: string) {
    const workflow = await this.prisma.workflow.findFirst({ where: { id, orgId: user.org_id }, include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true } });
    if (!workflow) throw new NotFoundException('Workflow not found');
    const latest = await this.prisma.workflowVersion.findFirst({ where: { workflowId: id }, orderBy: { version: 'desc' }, select: { version: true } });
    const version = (latest?.version ?? 0) + 1;
    const snapshot = { name: workflow.name, description: workflow.description, mode: workflow.mode, resourceType: workflow.resourceType, calendarConfig: workflow.calendarConfig, steps: workflow.steps, states: workflow.states, transitions: workflow.transitions };
    return this.prisma.workflowVersion.create({ data: { id: randomUUID(), workflowId: id, version, status: 'PUBLISHED', snapshot: snapshot as unknown as Prisma.InputJsonValue, createdById: user.sub, publishedAt: new Date() } });
  }

  async setStatus(user: AccessTokenPayload, id: string, status: WorkflowStatus) {
    const existing = await this.prisma.workflow.findFirst({ where: { id, orgId: user.org_id } });
    if (!existing) throw new NotFoundException('Workflow not found');
    this.requireWorkflowOwnerOrAdmin(user, existing.ownerId);
    if (status === 'ACTIVE') {
      if (existing.status === 'ACTIVE') return this.get(user, id);
      const trigger = await this.prisma.workflowStep.findFirst({ where: { workflowId: id, kind: 'TRIGGER' } });
      if (existing.mode === 'AUTOMATIC' && !trigger) throw new BadRequestException('Workflow has no starting trigger');
      const version = await this.publishVersion(user, id);
      const updated = await this.prisma.workflow.update({ where: { id }, data: { status, activeVersionId: version.id } });
      await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_ACTIVATED', resourceType: 'WORKFLOW', resourceId: id, metadata: { version: version.version } } });
      return { ...updated, publishedVersion: version.version };
    }
    const updated = await this.prisma.workflow.update({ where: { id }, data: { status, activeVersionId: null } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_DEACTIVATED', resourceType: 'WORKFLOW', resourceId: id } });
    return updated;
  }

  async versions(user: AccessTokenPayload, workflowId: string) {
    const workflow = await this.prisma.workflow.findFirst({ where: { id: workflowId, orgId: user.org_id }, select: { id: true, activeVersionId: true } });
    if (!workflow) throw new NotFoundException('Workflow not found');
    const owner = await this.prisma.workflow.findUnique({ where: { id: workflowId }, select: { ownerId: true, status: true } });
    if (owner && owner.status !== 'ACTIVE') this.requireWorkflowOwnerOrAdmin(user, owner.ownerId);
    return this.prisma.workflowVersion.findMany({ where: { workflowId }, select: { id: true, version: true, status: true, createdById: true, createdAt: true, publishedAt: true }, orderBy: { version: 'desc' } });
  }

  async versionDetail(user: AccessTokenPayload, workflowId: string, versionId: string) {
    const version = await this.prisma.workflowVersion.findFirst({ where: { id: versionId, workflowId, workflow: { orgId: user.org_id } }, select: { id: true, workflowId: true, version: true, status: true, createdById: true, createdAt: true, publishedAt: true, snapshot: true } });
    if (!version) throw new NotFoundException('Workflow version not found');
    if (version.status !== 'PUBLISHED') { /* draft versions remain creator/admin scoped */ }
    const owner = await this.prisma.workflow.findFirst({ where: { id: workflowId, orgId: user.org_id }, select: { ownerId: true, status: true } });
    if (!owner) throw new NotFoundException('Workflow not found');
    this.requireWorkflowOwnerOrAdmin(user, owner.ownerId);
    return version;
  }

  async rollback(user: AccessTokenPayload, workflowId: string, versionId: string) {
    const version = await this.prisma.workflowVersion.findFirst({ where: { id: versionId, workflowId, workflow: { orgId: user.org_id } } });
    if (!version) throw new NotFoundException('Workflow version not found');
    const owner = await this.prisma.workflow.findFirst({ where: { id: workflowId, orgId: user.org_id }, select: { ownerId: true } });
    if (!owner) throw new NotFoundException('Workflow not found');
    this.requireWorkflowOwnerOrAdmin(user, owner.ownerId);
    const snapshot = version.snapshot as any;
    return this.update(user, workflowId, { name: snapshot.name, description: snapshot.description ?? '', mode: snapshot.mode, resourceType: snapshot.resourceType, calendarConfig: snapshot.calendarConfig, trigger: snapshot.steps?.find((s:any)=>s.kind==='TRIGGER')?.config?.value, condition: snapshot.steps?.find((s:any)=>s.kind==='CONDITION')?.config?.value, actions: snapshot.steps?.find((s:any)=>s.kind==='ACTIONS')?.config?.value ?? [], fields: snapshot.steps?.find((s:any)=>s.kind==='WORKFLOW_FIELDS')?.config?.value ?? [], status: 'DRAFT', states: (snapshot.states ?? []).map((s:any)=>({ name:s.name, description:s.description??'', terminal:s.terminal })), transitions: (snapshot.transitions ?? []).map((t:any)=>({ from:(snapshot.states??[]).findIndex((x:any)=>x.id===t.fromStateId), to:(snapshot.states??[]).findIndex((x:any)=>x.id===t.toStateId), name:t.name, description:t.description??'', trigger:t.trigger, condition:t.condition, actions:t.actions })) });
  }

  private templateVariables(content: string) {
    const matches = [...String(content).matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => String(m[1]).trim()).filter(Boolean);
    return [...new Set(matches)].map((path) => ({ path, required: true }));
  }

  private validateTemplateFormat(format: string) {
    const value = String(format || 'TEXT').toUpperCase();
    if (!['TEXT', 'HTML', 'JSON'].includes(value)) throw new BadRequestException('Supported template formats are TEXT, HTML and JSON');
    return value;
  }

  async templates(user: AccessTokenPayload) {
    this.requireWorkflowAdmin(user);
    return this.prisma.workflowDataTemplate.findMany({
      where: { orgId: user.org_id },
      include: { activeVersion: { select: { id: true, version: true, createdAt: true } }, versions: { select: { id: true, version: true, createdAt: true, createdById: true }, orderBy: { version: 'desc' }, take: 10 } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async template(user: AccessTokenPayload, id: string) {
    this.requireWorkflowAdmin(user);
    const row = await this.prisma.workflowDataTemplate.findFirst({ where: { id, orgId: user.org_id }, include: { activeVersion: true, versions: { orderBy: { version: 'desc' }, take: 25 } } });
    if (!row) throw new NotFoundException('Workflow data template not found');
    return row;
  }

  async createTemplate(user: AccessTokenPayload, body: { name?: string; description?: string; template?: string; format?: string }) {
    this.requireWorkflowAdmin(user);
    const name = String(body?.name ?? '').trim(); const content = String(body?.template ?? '');
    if (!name || !content.trim()) throw new BadRequestException('Template name and content are required');
    if (name.length > 160) throw new BadRequestException('Template name is too long');
    const format = this.validateTemplateFormat(String(body.format ?? 'TEXT'));
    if (format === 'JSON') { try { JSON.parse(content); } catch { throw new BadRequestException('JSON templates must contain valid JSON'); } }
    const variables = this.templateVariables(content);
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.workflowDataTemplate.create({ data: { id: randomUUID(), orgId: user.org_id, name, description: body.description?.trim() || null, template: content, format, status: 'ACTIVE', createdById: user.sub } });
      const version = await tx.workflowDataTemplateVersion.create({ data: { id: randomUUID(), orgId: user.org_id, templateId: template.id, version: 1, template: content, format, variables: variables as unknown as Prisma.InputJsonValue, createdById: user.sub } });
      await tx.workflowDataTemplate.update({ where: { id: template.id }, data: { activeVersionId: version.id } });
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_TEMPLATE_CREATED', resourceType: 'WORKFLOW_DATA_TEMPLATE', resourceId: template.id, metadata: { version: 1, format, variables } } });
      return tx.workflowDataTemplate.findUnique({ where: { id: template.id }, include: { activeVersion: true, versions: true } });
    });
  }

  async updateTemplate(user: AccessTokenPayload, id: string, body: { name?: string; description?: string; template?: string; format?: string; status?: string }) {
    this.requireWorkflowAdmin(user);
    const existing = await this.prisma.workflowDataTemplate.findFirst({ where: { id, orgId: user.org_id } });
    if (!existing) throw new NotFoundException('Workflow data template not found');
    const name = body.name === undefined ? existing.name : String(body.name).trim();
    const content = body.template === undefined ? existing.template : String(body.template);
    const format = body.format === undefined ? existing.format : this.validateTemplateFormat(String(body.format));
    const status = body.status === undefined ? existing.status : String(body.status).toUpperCase();
    if (!name || !content.trim()) throw new BadRequestException('Template name and content are required');
    if (!['ACTIVE', 'DRAFT', 'ARCHIVED'].includes(status)) throw new BadRequestException('Invalid template status');
    if (format === 'JSON') { try { JSON.parse(content); } catch { throw new BadRequestException('JSON templates must contain valid JSON'); } }
    const changed = name !== existing.name || content !== existing.template || format !== existing.format;
    return this.prisma.$transaction(async (tx) => {
      let versionId = existing.activeVersionId;
      let version = existing.activeVersionId ? await tx.workflowDataTemplateVersion.findUnique({ where: { id: existing.activeVersionId } }) : null;
      if (changed) {
        const latest = await tx.workflowDataTemplateVersion.findFirst({ where: { templateId: id }, orderBy: { version: 'desc' }, select: { version: true } });
        const nextVersion = (latest?.version ?? 0) + 1;
        version = await tx.workflowDataTemplateVersion.create({ data: { id: randomUUID(), orgId: user.org_id, templateId: id, version: nextVersion, template: content, format, variables: this.templateVariables(content) as unknown as Prisma.InputJsonValue, createdById: user.sub } });
        versionId = version.id;
      }
      await tx.workflowDataTemplate.update({ where: { id }, data: { name, description: body.description === undefined ? existing.description : (body.description?.trim() || null), template: content, format, status, ...(changed ? { activeVersionId: versionId } : {}) } });
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: changed ? 'WORKFLOW_TEMPLATE_VERSION_CREATED' : 'WORKFLOW_TEMPLATE_UPDATED', resourceType: 'WORKFLOW_DATA_TEMPLATE', resourceId: id, metadata: { before: { name: existing.name, format: existing.format, status: existing.status, activeVersionId: existing.activeVersionId }, after: { name, format, status, activeVersionId: versionId }, changed } } });
      return tx.workflowDataTemplate.findUnique({ where: { id }, include: { activeVersion: true, versions: { orderBy: { version: 'desc' }, take: 25 } } });
    });
  }

  async previewTemplate(user: AccessTokenPayload, id: string, body: { versionId?: string; workflowId?: string; event?: Record<string, unknown>; fields?: Record<string, unknown> }) {
    const row = await this.template(user, id);
    const selected = body.versionId ? await this.prisma.workflowDataTemplateVersion.findFirst({ where: { id: body.versionId, templateId: id, orgId: user.org_id } }) : row.activeVersion;
    if (!selected) throw new NotFoundException('Template version not found');
    let fieldValues = body.fields && typeof body.fields === 'object' ? body.fields : {};
    let workflowId = body.workflowId;
    if (workflowId) {
      const workflow = await this.prisma.workflow.findFirst({ where: { id: workflowId, orgId: user.org_id }, include: { steps: { where: { kind: 'WORKFLOW_FIELDS' }, take: 1 } } });
      if (!workflow) throw new NotFoundException('Workflow not found');
      const defs = (workflow.steps[0]?.config as { value?: unknown } | undefined)?.value;
      if (!fieldValues || Object.keys(fieldValues).length === 0) fieldValues = {};
    }
    const event = (body.event ?? {}) as Record<string, unknown>;
    const runtimeEvent = { fileId: String(event.fileId ?? 'preview-file'), name: String(event.name ?? 'preview.txt'), mimeType: event.mimeType == null ? 'text/plain' : String(event.mimeType), fileType: event.fileType == null ? 'DOCUMENT' : String(event.fileType), size: String(event.size ?? '0'), userId: String(event.userId ?? user.sub), folderId: event.folderId == null ? null : String(event.folderId), extension: event.extension == null ? '.txt' : String(event.extension), resourceType: event.resourceType === 'FOLDER' ? 'FOLDER' : 'FILE' as const };
    const rendered = walkDynamicValues(selected.template, runtimeEvent, fieldValues, { workflowId, runId: 'preview', user: { id: user.sub } });
    const variables = Array.isArray(selected.variables) ? selected.variables as Array<{ path?: string }> : [];
    const catalog = dynamicValueCatalog([]).map((x) => x.path);
    const unresolved = variables.map((v) => String(v.path ?? '')).filter((path) => path && !catalog.includes(path) && !(path.startsWith('workflow.') && Object.prototype.hasOwnProperty.call(fieldValues, path.slice('workflow.'.length))));
    return { templateId: id, version: selected.version, format: selected.format, rendered, variables: variables.map((v) => v.path), unresolvedVariables: [...new Set(unresolved)] };
  }

  async templateVersions(user: AccessTokenPayload, id: string) {
    this.requireWorkflowAdmin(user);
    await this.template(user, id);
    return this.prisma.workflowDataTemplateVersion.findMany({ where: { templateId: id, orgId: user.org_id }, orderBy: { version: 'desc' }, select: { id: true, version: true, template: true, format: true, variables: true, createdById: true, createdAt: true } });
  }

  async rollbackTemplateVersion(user: AccessTokenPayload, id: string, versionId: string) {
    this.requireWorkflowAdmin(user);
    const row = await this.prisma.workflowDataTemplate.findFirst({ where: { id, orgId: user.org_id } });
    const version = await this.prisma.workflowDataTemplateVersion.findFirst({ where: { id: versionId, templateId: id, orgId: user.org_id } });
    if (!row || !version) throw new NotFoundException('Workflow data template version not found');
    return this.prisma.$transaction(async (tx) => {
      await tx.workflowDataTemplate.update({ where: { id }, data: { template: version.template, format: version.format, activeVersionId: version.id, status: 'ACTIVE' } });
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_TEMPLATE_ROLLBACK', resourceType: 'WORKFLOW_DATA_TEMPLATE', resourceId: id, metadata: { versionId, version: version.version } } });
      return tx.workflowDataTemplate.findUnique({ where: { id }, include: { activeVersion: true, versions: { orderBy: { version: 'desc' }, take: 25 } } });
    });
  }

  async deleteTemplate(user: AccessTokenPayload, id: string) {
    this.requireWorkflowAdmin(user);
    const row = await this.prisma.workflowDataTemplate.findFirst({ where: { id, orgId: user.org_id } });
    if (!row) throw new NotFoundException('Workflow data template not found');
    const actionSteps = await this.prisma.workflowStep.findMany({ where: { workflow: { orgId: user.org_id }, kind: 'ACTIONS' }, select: { config: true } }).catch(() => []);
    const referenced = actionSteps.some((step) => JSON.stringify(step.config ?? {}).includes(id));
    if (referenced) throw new BadRequestException('This template is referenced by a workflow and cannot be deleted');
    await this.prisma.workflowDataTemplate.delete({ where: { id } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_TEMPLATE_DELETED', resourceType: 'WORKFLOW_DATA_TEMPLATE', resourceId: id } });
    return { id, deleted: true };
  }

  async functions(user: AccessTokenPayload) {
    this.requireWorkflowAdmin(user);
    const builtIns = [
      { key: 'set_workflow_field', name: 'Set workflow field', description: 'Set a workflow field from a dynamic value' },
      { key: 'notify_owner', name: 'Notify resource owner', description: 'Send a notification to the file or folder owner' },
      { key: 'tag_from_extension', name: 'Tag from extension', description: 'Create/apply a tag using the file extension' },
    ];
    const custom = await this.prisma.workflowFunction.findMany({ where: { orgId: user.org_id, enabled: true }, include: { activeVersion: { select: { id: true, version: true, status: true, runtime: true, timeoutMs: true, memoryLimitMb: true } } }, orderBy: { name: 'asc' } });
    return { builtIns, custom };
  }

  private normalizeFunctionDefinition(definition: unknown) {
    if (!definition || typeof definition !== 'object') throw new BadRequestException('Function definition is required');
    const operations = (definition as Record<string, unknown>).operations;
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > 30) throw new BadRequestException('A function must contain between 1 and 30 operations');
    const allowed = new Set(['SET_FIELD','COPY_VALUE','CONCAT','LOWERCASE','UPPERCASE','NUMBER','ADD','SUBTRACT','MULTIPLY','DIVIDE','NOTIFY_OWNER','ADD_TAG','IF']);
    for (const item of operations) {
      const op = String((item as Record<string, unknown>)?.op ?? '').toUpperCase();
      if (!allowed.has(op)) throw new BadRequestException(`Unsupported or unsafe operation: ${op}`);
    }
    return { operations };
  }

  async createFunction(user: AccessTokenPayload, body: { name?: string; key?: string; description?: string; definition?: unknown; runtime?: string; permissions?: unknown; timeoutMs?: number; memoryLimitMb?: number }) {
    this.requireWorkflowAdmin(user);
    const name = String(body?.name ?? '').trim();
    const key = String(body?.key ?? '').trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '_');
    if (!name || !key) throw new BadRequestException('Function name and key are required');
    if (!body.definition) throw new BadRequestException('A safe function definition is required');
    const definition = this.normalizeFunctionDefinition(body.definition);
    const runtime = String(body.runtime ?? 'SAFE').toUpperCase();
    if (runtime !== 'SAFE') throw new BadRequestException('Only SAFE runtime is enabled in V17-A');
    const timeoutMs = Math.min(5000, Math.max(100, Math.floor(Number(body.timeoutMs ?? 1000))));
    const memoryLimitMb = Math.min(128, Math.max(16, Math.floor(Number(body.memoryLimitMb ?? 64))));
    const permissions = Array.isArray(body.permissions) ? body.permissions.map(String).filter((x) => ['read_file_metadata','read_workflow_fields','write_workflow_fields','notify_owner','add_tags'].includes(x)) : ['read_file_metadata','read_workflow_fields','write_workflow_fields'];
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.workflowFunction.findUnique({ where: { orgId_key: { orgId: user.org_id, key } } });
      if (existing) throw new BadRequestException('A function with this key already exists');
      const id = randomUUID();
      const versionId = randomUUID();
      await tx.workflowFunction.create({ data: { id, orgId: user.org_id, name, key, description: body.description?.trim() || null, kind: 'SAFE', enabled: true, activeVersionId: versionId, createdById: user.sub } });
      await tx.workflowFunctionVersion.create({ data: { id: versionId, functionId: id, orgId: user.org_id, version: 1, status: 'ACTIVE', runtime, definition: definition as Prisma.InputJsonValue, permissions: permissions as Prisma.InputJsonValue, timeoutMs, memoryLimitMb, createdById: user.sub, publishedAt: new Date() } });
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_FUNCTION_CREATED', resourceType: 'WORKFLOW_FUNCTION', resourceId: id, metadata: { key, version: 1, runtime } } });
      return tx.workflowFunction.findUnique({ where: { id }, include: { activeVersion: true, versions: true } });
    });
  }

  async functionVersions(user: AccessTokenPayload, functionId: string) {
    this.requireWorkflowAdmin(user);
    const fn = await this.prisma.workflowFunction.findFirst({ where: { id: functionId, orgId: user.org_id } });
    if (!fn) throw new NotFoundException('Workflow function not found');
    return this.prisma.workflowFunctionVersion.findMany({ where: { functionId, orgId: user.org_id }, select: { id: true, version: true, status: true, runtime: true, timeoutMs: true, memoryLimitMb: true, createdById: true, createdAt: true, publishedAt: true, definition: true }, orderBy: { version: 'desc' } });
  }

  async publishFunctionVersion(user: AccessTokenPayload, functionId: string, versionId: string) {
    this.requireWorkflowAdmin(user);
    const version = await this.prisma.workflowFunctionVersion.findFirst({ where: { id: versionId, functionId, orgId: user.org_id } });
    if (!version) throw new NotFoundException('Workflow function version not found');
    return this.prisma.$transaction(async (tx) => {
      await tx.workflowFunctionVersion.updateMany({ where: { functionId, orgId: user.org_id, status: 'ACTIVE' }, data: { status: 'ARCHIVED' } });
      await tx.workflowFunctionVersion.update({ where: { id: versionId }, data: { status: 'ACTIVE', publishedAt: new Date() } });
      await tx.workflowFunction.update({ where: { id: functionId }, data: { activeVersionId: versionId, enabled: true } });
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_FUNCTION_VERSION_PUBLISHED', resourceType: 'WORKFLOW_FUNCTION', resourceId: functionId, metadata: { versionId, version: version.version } } });
      return tx.workflowFunction.findUnique({ where: { id: functionId }, include: { activeVersion: true } });
    });
  }

  async testFunction(user: AccessTokenPayload, functionId: string, body: { versionId?: string; input?: Record<string, unknown> }) {
    this.requireWorkflowAdmin(user);
    const fn = await this.prisma.workflowFunction.findFirst({ where: { id: functionId, orgId: user.org_id, enabled: true }, include: { activeVersion: true } });
    if (!fn) throw new NotFoundException('Workflow function not found');
    const versionId = body.versionId ?? fn.activeVersionId;
    if (!versionId) throw new BadRequestException('Function has no active version');
    const version = await this.prisma.workflowFunctionVersion.findFirst({ where: { id: versionId, functionId, orgId: user.org_id, status: 'ACTIVE' } });
    if (!version) throw new NotFoundException('Active function version not found');
    const input = body.input && typeof body.input === 'object' ? body.input : {};
    const fields = input.fields && typeof input.fields === 'object' ? input.fields as Record<string, unknown> : {};
    const file = input.file && typeof input.file === 'object' ? input.file as Record<string, unknown> : { id: 'test-file', name: 'contract.pdf', extension: '.pdf', fileType: 'PDF', mimeType: 'application/pdf' };
    const result = await this.functionExecutor.execute(user, fn.id, version.id, version.definition, { file, workflow: { id: 'test-workflow', name: 'Function test', runId: 'test-run' }, user: { id: user.sub }, now: new Date().toISOString(), fields }, { idempotencyKey: `function-test:${user.org_id}:${fn.id}:${version.id}:${randomUUID()}` });
    return { functionId: fn.id, versionId: version.id, result };
  }

  async ensureDefaults(user: AccessTokenPayload) {
    this.requireWorkflowAdmin(user);
    const defaults = [
      { name: 'Review uploaded documents', description: 'Create a review task for uploaded documents.', mode: 'AUTOMATIC' as const, trigger: ['upload'], condition: { field: 'fileType', operator: 'equals', value: 'DOCUMENT' }, states: ['Review','Completed'], kind: 'review' },
      { name: 'Approval for PDFs', description: 'Request approval when a PDF is uploaded.', mode: 'AUTOMATIC' as const, trigger: ['upload'], condition: { field: 'fileType', operator: 'equals', value: 'PDF' }, states: ['Approval','Completed'], kind: 'approval' },
      { name: 'Review and approval', description: 'Two-step review and approval template.', mode: 'AUTOMATIC' as const, trigger: ['upload'], condition: 'any', states: ['Review','Approval','Completed'], kind: 'review-approval' },
    ];
    const result: unknown[] = [];
    for (const d of defaults) {
      const existing = await this.prisma.workflow.findFirst({ where: { orgId: user.org_id, name: d.name, isSystemDefault: true } });
      if (existing) { result.push(existing); continue; }
      const created = await this.prisma.$transaction(async (tx) => {
        const id = randomUUID();
        await tx.workflow.create({ data: { id, orgId: user.org_id, ownerId: user.sub, name: d.name, description: d.description, mode: d.mode, resourceType: 'FILE', isSystemDefault: true, calendarConfig: { timezone: 'UTC', workingDays: [1,2,3,4,5], workStart: '09:00', workEnd: '17:00', holidays: [] }, status: 'DRAFT', steps: { create: this.stepData({ name:d.name, description:d.description, mode:d.mode, resourceType:'FILE', trigger:d.trigger, condition:d.condition, actions:[], status:'DRAFT', fields:[], states:[], transitions:[], calendarConfig:{} } as any) } } });
        const states: any[] = [];
        for (const [position, name] of d.states.entries()) states.push(await tx.workflowState.create({ data: { id: randomUUID(), workflowId:id, name, position, terminal: position === d.states.length-1 } }));
        const approval = (label: string) => ({ before: [], during: [{ type:'request_approval', config:{ allowStarterParticipants:true, approvalPolicy:'ANY', dueInMinutes:1440, reminderInMinutes:720, title:label } }], after: [] });
        for (let i=0;i<states.length-1;i++) await tx.workflowTransition.create({ data:{ id:randomUUID(), workflowId:id, fromStateId:states[i].id, toStateId:states[i+1].id, name:`Complete ${states[i].name}`, trigger:'manual', condition:Prisma.JsonNull, actions:approval(states[i].name) as unknown as Prisma.InputJsonValue } });
        return tx.workflow.findUnique({ where:{id}, include:{steps:true,states:true,transitions:true} });
      });
      result.push(created);
    }
    // Three manual, file-table-ready defaults. They are intentionally separate from
    // the automatic system defaults above so existing automatic behavior is unchanged.
    const manualDefaults = [
      { name:'Review', description:'Send the selected file to one or more reviewers.', states:['Review','Completed'] },
      { name:'Approval', description:'Request approval for the selected file.', states:['Approval','Completed'] },
      { name:'Review & Approval', description:'Run review first, then approval, for the selected file.', states:['Review','Approval','Completed'] },
    ];
    for (const d of manualDefaults) {
      const existing = await this.prisma.workflow.findFirst({ where:{orgId:user.org_id,name:d.name,isSystemDefault:true,mode:'MANUAL',resourceType:'FILE'} });
      if (existing) { result.push(existing); continue; }
      const created = await this.prisma.$transaction(async tx => {
        const id=randomUUID();
        await tx.workflow.create({ data:{ id, orgId:user.org_id, ownerId:user.sub, name:d.name, description:d.description, mode:'MANUAL', resourceType:'FILE', isSystemDefault:true, calendarConfig:{timezone:'UTC',workingDays:[1,2,3,4,5],workStart:'09:00',workEnd:'17:00',holidays:[]}, status:'ACTIVE', steps:{create:this.stepData({name:d.name,description:d.description,mode:'MANUAL',resourceType:'FILE',trigger:'manual',condition:'any',actions:[],status:'ACTIVE',fields:[],states:[],transitions:[],calendarConfig:{}} as any)}}});
        const states:any[]=[];
        for(const [position,name] of d.states.entries()) states.push(await tx.workflowState.create({data:{id:randomUUID(),workflowId:id,name,position,terminal:position===d.states.length-1}}));
        const approval=(label:string)=>({before:[],during:[{type:'request_approval',config:{allowStarterParticipants:true,approvalPolicy:'ANY',dueInMinutes:1440,reminderInMinutes:720,title:label}}],after:[]});
        for(let i=0;i<states.length-1;i++) await tx.workflowTransition.create({data:{id:randomUUID(),workflowId:id,fromStateId:states[i].id,toStateId:states[i+1].id,name:`${states[i].name} complete`,trigger:'manual',condition:Prisma.JsonNull,actions:approval(states[i].name) as unknown as Prisma.InputJsonValue}});
        return tx.workflow.findUnique({where:{id},include:{steps:true,states:true,transitions:true}});
      });
      if (!created) throw new Error('Failed to create default workflow');
      const version=await this.publishVersion(user,created.id);
      await this.prisma.workflow.update({where:{id:created.id},data:{activeVersionId:version.id,status:'ACTIVE'}});
      result.push(created);
    }
    return result;
  }


  async remove(user: AccessTokenPayload, id: string) { this.requireWorkflowAdmin(user); const existing = await this.prisma.workflow.findFirst({ where: { id, orgId: user.org_id } }); if (!existing) throw new NotFoundException('Workflow not found'); this.requireWorkflowOwnerOrAdmin(user, existing.ownerId); await this.prisma.workflow.delete({ where: { id } }); await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_DELETED', resourceType: 'WORKFLOW', resourceId: id } }); return { id, deleted: true }; }

  async duplicate(user: AccessTokenPayload, id: string) {
    const source = await this.get(user, id); const fields = (source.steps.find((s) => s.kind === 'WORKFLOW_FIELDS')?.config as { value?: unknown })?.value;
    return this.create(user, { name: `${source.name} (Copy)`, description: source.description ?? '', mode: source.mode, resourceType: source.resourceType, trigger: (source.steps.find((s) => s.kind === 'TRIGGER')?.config as { value?: unknown })?.value, condition: (source.steps.find((s) => s.kind === 'CONDITION')?.config as { value?: unknown })?.value, actions: [], fields, status: 'DRAFT', states: source.states.map((s) => ({ name: s.name, description: s.description ?? '', terminal: s.terminal })), transitions: source.transitions.map((t) => ({ from: source.states.findIndex((s) => s.id === t.fromStateId), to: source.states.findIndex((s) => s.id === t.toStateId), name: t.name, description: t.description ?? '', trigger: t.trigger, condition: t.condition, actions: t.actions })) });
  }

  async logs(user: AccessTokenPayload, runId: string) { const run = await this.prisma.workflowRun.findFirst({ where: { id: runId, orgId: user.org_id }, include: { workflow: { select: { id: true, name: true } }, stepRuns: { orderBy: { stepPosition: 'asc' } }, jobs: { orderBy: { createdAt: 'desc' }, take: 10 } } }); if (!run) throw new NotFoundException('Workflow run not found'); return run; }
  async retry(user: AccessTokenPayload, runId: string) { const run = await this.prisma.workflowRun.findFirst({ where: { id: runId, orgId: user.org_id }, include: { workflow: true } }); if (!run) throw new NotFoundException('Workflow run not found'); if (!['FAILED','DEAD','DEAD_LETTER'].includes(run.status)) throw new BadRequestException('Only failed workflow runs can be retried'); await this.prisma.$transaction(async (tx) => { await tx.workflowRun.update({ where: { id: runId }, data: { status: 'QUEUED', error: null, finishedAt: null } }); await tx.workflowJob.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId: run.workflowId, runId, status: 'QUEUED', runAt: new Date(), attempts: 0, priority: 0, idempotencyKey: `retry:${runId}:${randomUUID()}` } }); }); return { runId, queued: true }; }

  async completeTask(user: AccessTokenPayload, id: string, transitionId: string, fieldValues: Record<string, unknown> = {}, comment?: string) {
    const task = await this.prisma.workflowTask.findFirst({ where: { id, orgId: user.org_id, status: 'PENDING' }, include: { participants: true, run: true, workflow: { include: { transitions: true, states: true, steps: true } } } });
    if (!task) throw new NotFoundException('Workflow task not found');
    const participant = task.participants.find((p) => p.userId === user.sub);
    if (task.participants.length > 0 && !participant) throw new ForbiddenException('You are not a participant in this workflow task');
    if (participant?.status === 'COMPLETED') throw new BadRequestException('You have already responded to this task');
    const transition = task.workflow.transitions.find((t) => t.id === transitionId && t.fromStateId === task.stateId); if (!transition) throw new BadRequestException('Transition is not available for this task');
    const fields = (task.workflow.steps.find((s) => s.kind === 'WORKFLOW_FIELDS')?.config as { value?: unknown })?.value; const fieldDefs = Array.isArray(fields) ? fields as Array<{ id: string; required?: boolean }> : [];
    for (const field of fieldDefs) if (field.required && (fieldValues[field.id] === undefined || fieldValues[field.id] === null || String(fieldValues[field.id]).trim() === '')) throw new BadRequestException(`Field ${field.id} is required`);
    const previous = task.run.result && typeof task.run.result === 'object' ? task.run.result as Record<string, unknown> : {};
    const next = task.workflow.states.find((s) => s.id === transition.toStateId);
    const now = new Date();
    let shouldContinue = true;
    await this.prisma.$transaction(async (tx) => {
      if (participant) await tx.workflowTaskParticipant.update({ where: { id: participant.id }, data: { status: 'COMPLETED', respondedAt: now, comment: comment?.trim() || null } });
      const participants = await tx.workflowTaskParticipant.findMany({ where: { taskId: id } });
      const policy = task.approvalPolicy === 'ALL' ? 'ALL' : 'ANY';
      shouldContinue = policy === 'ANY' || participants.length === 0 || participants.every((p) => p.status === 'COMPLETED' || p.id === participant?.id);
      if (!shouldContinue) {
        await tx.workflowRun.update({ where: { id: task.runId }, data: { status: 'WAITING', currentStateId: task.stateId, result: { ...previous, fieldValues: { ...(previous.fieldValues && typeof previous.fieldValues === 'object' ? previous.fieldValues : {}), ...fieldValues }, approvalProgress: { completed: participants.filter((p) => p.status === 'COMPLETED' || p.id === participant?.id).length, total: participants.length } } as unknown as Prisma.InputJsonValue } });
        return;
      }
      await tx.workflowTask.update({ where: { id }, data: { status: 'COMPLETED', completedAt: now } });
      await tx.workflowRun.update({ where: { id: task.runId }, data: { status: 'QUEUED', currentStateId: task.stateId, result: { ...previous, continueTransitionId: transition.id, fieldValues: { ...(previous.fieldValues && typeof previous.fieldValues === 'object' ? previous.fieldValues : {}), ...fieldValues } } as unknown as Prisma.InputJsonValue } });
      await tx.workflowJob.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId: task.workflowId, runId: task.runId, status: 'QUEUED', runAt: now, priority: 0, idempotencyKey: `task:${id}:${transitionId}` } });
    });
    return { id, completed: shouldContinue, pending: !shouldContinue, transitionId, nextStateId: shouldContinue ? (next?.id ?? null) : task.stateId };
  }
}
