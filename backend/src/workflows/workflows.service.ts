import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { WorkflowEngineService } from './workflow-engine.service';

type ActionInput = { type?: unknown; config?: unknown };
type FieldInput = { id?: unknown; name?: unknown; description?: unknown; type?: unknown; required?: unknown; defaultValue?: unknown; max?: unknown; options?: unknown };
type WorkflowInput = { name?: unknown; description?: unknown; mode?: unknown; resourceType?: unknown; trigger?: unknown; condition?: unknown; action?: unknown; actions?: unknown; status?: unknown; states?: unknown; transitions?: unknown; fields?: unknown };
type WorkflowStatus = 'DRAFT' | 'ACTIVE';

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService, private readonly engine: WorkflowEngineService) {}

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
    return { name, description: typeof value.description === 'string' ? value.description.trim() : '', mode, resourceType, trigger, condition, actions, status, fields, states, transitions };
  }

  private stepData(input: ReturnType<WorkflowsService['validate']>) {
    return [
      { position: 0, kind: 'TRIGGER', config: { value: input.trigger } as unknown as Prisma.InputJsonValue },
      { position: 1, kind: 'CONDITION', config: { value: input.condition } as unknown as Prisma.InputJsonValue },
      { position: 2, kind: 'ACTIONS', config: { value: input.actions } as unknown as Prisma.InputJsonValue },
      { position: 3, kind: 'WORKFLOW_FIELDS', config: { value: input.fields } as unknown as Prisma.InputJsonValue },
    ];
  }

  async list(user: AccessTokenPayload, scope?: string) {
    return this.prisma.workflow.findMany({ where: { orgId: user.org_id, ...(scope === 'mine' ? { ownerId: user.sub } : {}), ...(scope === 'drafts' ? { status: 'DRAFT' } : {}) }, include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true }, orderBy: { updatedAt: 'desc' } });
  }

  async runs(user: AccessTokenPayload, workflowId?: string, status?: string, date?: string) {
    const where: Record<string, unknown> = { orgId: user.org_id, ...(workflowId ? { workflowId } : {}), ...(status ? { status } : {}) };
    if (date) where.startedAt = { gte: new Date(`${date}T00:00:00.000Z`), lte: new Date(`${date}T23:59:59.999Z`) };
    return this.prisma.workflowRun.findMany({ where: where as any, include: { workflow: { select: { id: true, name: true, ownerId: true } }, currentState: { select: { id: true, name: true } }, tasks: { orderBy: { createdAt: 'desc' }, take: 5 }, stepRuns: { orderBy: { stepPosition: 'asc' } } }, orderBy: { startedAt: 'desc' }, take: 100 });
  }

  async tasks(user: AccessTokenPayload, status = 'PENDING') {
    return this.prisma.workflowTask.findMany({ where: { orgId: user.org_id, status, OR: [{ assigneeId: user.sub }, { assigneeId: null }] }, include: { workflow: { select: { id: true, name: true, transitions: true, steps: true } }, state: { select: { id: true, name: true } }, run: { select: { id: true, trigger: true, result: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async get(user: AccessTokenPayload, id: string) {
    const row = await this.prisma.workflow.findFirst({ where: { id, orgId: user.org_id }, include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true } });
    if (!row) throw new NotFoundException('Workflow not found');
    return row;
  }

  async create(user: AccessTokenPayload, body: unknown) {
    const input = this.validate(body); const id = randomUUID();
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.workflow.create({ data: { id, orgId: user.org_id, ownerId: user.sub, name: input.name, description: input.description || null, mode: input.mode, resourceType: input.resourceType, status: input.status, steps: { create: this.stepData(input) } } });
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
    return created;
  }

  async update(user: AccessTokenPayload, id: string, body: unknown) {
    const existing = await this.prisma.workflow.findFirst({ where: { id, orgId: user.org_id } });
    if (!existing) throw new NotFoundException('Workflow not found'); if (existing.ownerId !== user.sub) throw new ForbiddenException('Only the workflow owner can modify it');
    const input = this.validate(body);
    await this.prisma.$transaction(async (tx) => {
      await tx.workflowStep.deleteMany({ where: { workflowId: id } }); await tx.workflowTransition.deleteMany({ where: { workflowId: id } }); await tx.workflowState.deleteMany({ where: { workflowId: id } });
      await tx.workflow.update({ where: { id }, data: { name: input.name, description: input.description || null, mode: input.mode, resourceType: input.resourceType, status: input.status, steps: { create: this.stepData(input) } } });
      const states: { id: string }[] = [];
      for (const [position, raw] of input.states.entries()) { const v = raw as Record<string, unknown>; states.push(await tx.workflowState.create({ data: { id: randomUUID(), workflowId: id, name: typeof v.name === 'string' ? v.name.trim() : `State ${position + 1}`, description: typeof v.description === 'string' ? v.description.trim() : null, position, terminal: v.terminal === true } })); }
      for (const raw of input.transitions as Array<Record<string, unknown>>) { const from = Number(raw.from ?? 0), to = Number(raw.to ?? 1); if (!states[from] || !states[to] || from === to) throw new BadRequestException('Invalid workflow transition state'); const phases = raw.actions && typeof raw.actions === 'object' && !Array.isArray(raw.actions) ? raw.actions as Record<string, unknown> : { during: raw.actions }; const phaseActions = { before: this.normalizeActions(phases.before), during: this.normalizeActions(phases.during), after: this.normalizeActions(phases.after) }; await tx.workflowTransition.create({ data: { id: randomUUID(), workflowId: id, fromStateId: states[from].id, toStateId: states[to].id, name: typeof raw.name === 'string' ? raw.name.trim() : 'Transition', description: typeof raw.description === 'string' ? raw.description.trim() : null, trigger: typeof raw.trigger === 'string' ? raw.trigger.trim() : null, condition: (raw.condition ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue, actions: phaseActions as unknown as Prisma.InputJsonValue } }); }
    });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_UPDATED', resourceType: 'WORKFLOW', resourceId: id } });
    return this.get(user, id);
  }

  async setStatus(user: AccessTokenPayload, id: string, status: WorkflowStatus) { const existing = await this.prisma.workflow.findFirst({ where: { id, orgId: user.org_id } }); if (!existing) throw new NotFoundException('Workflow not found'); if (existing.ownerId !== user.sub) throw new ForbiddenException('Only the workflow owner can modify it'); if (status === 'ACTIVE' && existing.mode === 'AUTOMATIC') { const trigger = await this.prisma.workflowStep.findFirst({ where: { workflowId: id, kind: 'TRIGGER' } }); if (!trigger) throw new BadRequestException('Workflow has no starting trigger'); } const updated = await this.prisma.workflow.update({ where: { id }, data: { status } }); await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: status === 'ACTIVE' ? 'WORKFLOW_ACTIVATED' : 'WORKFLOW_DEACTIVATED', resourceType: 'WORKFLOW', resourceId: id } }); return updated; }
  async remove(user: AccessTokenPayload, id: string) { const existing = await this.prisma.workflow.findFirst({ where: { id, orgId: user.org_id } }); if (!existing) throw new NotFoundException('Workflow not found'); if (existing.ownerId !== user.sub) throw new ForbiddenException('Only the workflow owner can delete it'); await this.prisma.workflow.delete({ where: { id } }); await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_DELETED', resourceType: 'WORKFLOW', resourceId: id } }); return { id, deleted: true }; }

  async duplicate(user: AccessTokenPayload, id: string) {
    const source = await this.get(user, id); const fields = (source.steps.find((s) => s.kind === 'WORKFLOW_FIELDS')?.config as { value?: unknown })?.value;
    return this.create(user, { name: `${source.name} (Copy)`, description: source.description ?? '', mode: source.mode, resourceType: source.resourceType, trigger: (source.steps.find((s) => s.kind === 'TRIGGER')?.config as { value?: unknown })?.value, condition: (source.steps.find((s) => s.kind === 'CONDITION')?.config as { value?: unknown })?.value, actions: [], fields, status: 'DRAFT', states: source.states.map((s) => ({ name: s.name, description: s.description ?? '', terminal: s.terminal })), transitions: source.transitions.map((t) => ({ from: source.states.findIndex((s) => s.id === t.fromStateId), to: source.states.findIndex((s) => s.id === t.toStateId), name: t.name, description: t.description ?? '', trigger: t.trigger, condition: t.condition, actions: t.actions })) });
  }

  async logs(user: AccessTokenPayload, runId: string) { const run = await this.prisma.workflowRun.findFirst({ where: { id: runId, orgId: user.org_id }, include: { workflow: { select: { id: true, name: true } }, stepRuns: { orderBy: { stepPosition: 'asc' } }, jobs: { orderBy: { createdAt: 'desc' }, take: 10 } } }); if (!run) throw new NotFoundException('Workflow run not found'); return run; }
  async retry(user: AccessTokenPayload, runId: string) { const run = await this.prisma.workflowRun.findFirst({ where: { id: runId, orgId: user.org_id }, include: { workflow: true } }); if (!run) throw new NotFoundException('Workflow run not found'); if (!['FAILED','DEAD'].includes(run.status)) throw new BadRequestException('Only failed workflow runs can be retried'); await this.prisma.$transaction(async (tx) => { await tx.workflowRun.update({ where: { id: runId }, data: { status: 'QUEUED', error: null, finishedAt: null } }); await tx.workflowJob.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId: run.workflowId, runId, status: 'QUEUED', runAt: new Date(), attempts: 0 } }); }); return { runId, queued: true }; }

  async completeTask(user: AccessTokenPayload, id: string, transitionId: string, fieldValues: Record<string, unknown> = {}) {
    const task = await this.prisma.workflowTask.findFirst({ where: { id, orgId: user.org_id, status: 'PENDING', OR: [{ assigneeId: user.sub }, { assigneeId: null }] }, include: { run: true, workflow: { include: { transitions: true, states: true, steps: true } } } });
    if (!task) throw new NotFoundException('Workflow task not found');
    const transition = task.workflow.transitions.find((t) => t.id === transitionId && t.fromStateId === task.stateId); if (!transition) throw new BadRequestException('Transition is not available for this task');
    const fields = (task.workflow.steps.find((s) => s.kind === 'WORKFLOW_FIELDS')?.config as { value?: unknown })?.value; const fieldDefs = Array.isArray(fields) ? fields as Array<{ id: string; required?: boolean }> : [];
    for (const field of fieldDefs) if (field.required && (fieldValues[field.id] === undefined || fieldValues[field.id] === null || String(fieldValues[field.id]).trim() === '')) throw new BadRequestException(`Field ${field.id} is required`);
    const previous = task.run.result && typeof task.run.result === 'object' ? task.run.result as Record<string, unknown> : {};
    const next = task.workflow.states.find((s) => s.id === transition.toStateId);
    await this.prisma.$transaction(async (tx) => {
      await tx.workflowTask.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
      await tx.workflowRun.update({ where: { id: task.runId }, data: { status: 'QUEUED', currentStateId: task.stateId, result: { ...previous, continueTransitionId: transition.id, fieldValues: { ...(previous.fieldValues && typeof previous.fieldValues === 'object' ? previous.fieldValues : {}), ...fieldValues } } as unknown as Prisma.InputJsonValue } });
      await tx.workflowJob.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId: task.workflowId, runId: task.runId, status: 'QUEUED', runAt: new Date() } });
    });
    return { id, completed: true, transitionId, nextStateId: next?.id ?? null };
  }
}
