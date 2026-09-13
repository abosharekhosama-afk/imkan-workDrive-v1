import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { WorkflowEngineService } from './workflow-engine.service';

type ActionInput = { type?: unknown; config?: unknown };
type WorkflowInput = { name?: unknown; description?: unknown; mode?: unknown; resourceType?: unknown; trigger?: unknown; condition?: unknown; action?: unknown; actions?: unknown; status?: unknown; states?: unknown; transitions?: unknown };

type WorkflowStatus = 'DRAFT' | 'ACTIVE';

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService, private readonly engine: WorkflowEngineService) {}

  private validate(body: unknown) {
    const value = (body ?? {}) as WorkflowInput;
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    if (!name || name.length > 160) throw new BadRequestException('Workflow name is required and must be at most 160 characters');
    const mode = value.mode === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC';
    const resourceType = value.resourceType === 'FOLDER' ? 'FOLDER' : 'FILE';
    const trigger = Array.isArray(value.trigger) ? value.trigger.map((x) => String(x).trim()).filter(Boolean).slice(0, 5) : (typeof value.trigger === 'string' ? value.trigger.trim() : (mode === 'MANUAL' ? 'manual' : 'upload'));
    const condition = value.condition ?? 'any';
    const actions = Array.isArray(value.actions) ? value.actions : (typeof value.action === 'string' ? [{ type: value.action }] : [{ type: 'notify' }]);
    const normalizedActions = actions.map((raw) => { const a = raw as ActionInput; if (typeof a.type !== 'string' || !a.type.trim()) throw new BadRequestException('Each workflow action requires a type'); return { type: a.type.trim(), config: (a.config && typeof a.config === 'object' ? a.config : {}) as Record<string, unknown> }; });
    const status: WorkflowStatus = value.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT';
    const states = Array.isArray(value.states) && value.states.length ? value.states : [{ name: 'Start', description: '', terminal: false }, { name: 'Completed', description: '', terminal: true }];
    const transitions = Array.isArray(value.transitions) && value.transitions.length ? value.transitions : [{ from: 0, to: 1, name: 'Complete', actions: normalizedActions }];
    if (states.length > 20) throw new BadRequestException('A workflow can contain at most 20 states');
    if (normalizedActions.length > 5) throw new BadRequestException('A workflow transition can contain at most 5 actions');
    for (const rawTransition of transitions) {
      const t = rawTransition as Record<string, unknown>;
      if (Array.isArray(t.actions) && t.actions.length > 5) throw new BadRequestException('A workflow transition can contain at most 5 actions');
    }
    return { name, description: typeof value.description === 'string' ? value.description.trim() : '', mode, resourceType, trigger, condition, actions: normalizedActions, status, states, transitions };
  }

  async list(user: AccessTokenPayload, scope?: string) {
    return this.prisma.workflow.findMany({ where: { orgId: user.org_id, ...(scope === 'mine' ? { ownerId: user.sub } : {}), ...(scope === 'drafts' ? { status: 'DRAFT' } : {}) }, include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true }, orderBy: { updatedAt: 'desc' } });
  }

  async runs(user: AccessTokenPayload, workflowId?: string, status?: string, date?: string) {
    const where: Record<string, unknown> = { orgId: user.org_id, ...(workflowId ? { workflowId } : {}), ...(status ? { status } : {}) };
    if (date) { where.startedAt = { gte: new Date(`${date}T00:00:00.000Z`), lte: new Date(`${date}T23:59:59.999Z`) }; }
    return this.prisma.workflowRun.findMany({ where: where as any, include: { workflow: { select: { id: true, name: true, ownerId: true } }, currentState: { select: { id: true, name: true } }, tasks: { orderBy: { createdAt: 'desc' }, take: 5 }, stepRuns: { orderBy: { stepPosition: 'asc' } } }, orderBy: { startedAt: 'desc' }, take: 100 });
  }

  async tasks(user: AccessTokenPayload, status = 'PENDING') {
    return this.prisma.workflowTask.findMany({ where: { orgId: user.org_id, status, OR: [{ assigneeId: user.sub }, { assigneeId: null }] }, include: { workflow: { select: { id: true, name: true, transitions: true } }, state: { select: { id: true, name: true } }, run: { select: { id: true, trigger: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async get(user: AccessTokenPayload, id: string) {
    const row = await this.prisma.workflow.findFirst({ where: { id, orgId: user.org_id }, include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true } });
    if (!row) throw new NotFoundException('Workflow not found');
    return row;
  }

  async create(user: AccessTokenPayload, body: unknown) {
    const input = this.validate(body);
    const id = randomUUID();
    const created = await this.prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.create({ data: { id, orgId: user.org_id, ownerId: user.sub, name: input.name, description: input.description || null, mode: input.mode, resourceType: input.resourceType, status: input.status, steps: { create: [ { position: 0, kind: 'TRIGGER', config: { value: input.trigger } }, { position: 1, kind: 'CONDITION', config: { value: input.condition } }, { position: 2, kind: 'ACTIONS', config: { value: input.actions } } ] } } });
      const states = await Promise.all(input.states.map((s, position) => { const v = s as Record<string, unknown>; return tx.workflowState.create({ data: { id: randomUUID(), workflowId: id, name: typeof v.name === 'string' ? v.name : `State ${position + 1}`, description: typeof v.description === 'string' ? v.description : null, position, terminal: v.terminal === true } }); }));
      for (const t of input.transitions as Array<Record<string, unknown>>) {
        const from = Number(t.from ?? 0), to = Number(t.to ?? Math.min(1, states.length - 1));
        if (!states[from] || !states[to]) throw new BadRequestException('Invalid workflow transition state');
        await tx.workflowTransition.create({ data: { id: randomUUID(), workflowId: id, fromStateId: states[from].id, toStateId: states[to].id, name: typeof t.name === 'string' ? t.name : 'Transition', description: typeof t.description === 'string' ? t.description : null, trigger: typeof t.trigger === 'string' ? t.trigger : null, condition: (t.condition ?? null) as object | null, actions: (Array.isArray(t.actions) ? t.actions : input.actions) as object } });
      }
      return tx.workflow.findUnique({ where: { id }, include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true } });
    });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_CREATED', resourceType: 'WORKFLOW', resourceId: id, metadata: { name: input.name, mode: input.mode, resourceType: input.resourceType } } });
    return created;
  }

  async update(user: AccessTokenPayload, id: string, body: unknown) {
    const existing = await this.prisma.workflow.findFirst({ where: { id, orgId: user.org_id } });
    if (!existing) throw new NotFoundException('Workflow not found');
    if (existing.ownerId !== user.sub) throw new ForbiddenException('Only the workflow owner can modify it');
    const input = this.validate(body);
    await this.prisma.$transaction(async (tx) => {
      await tx.workflowStep.deleteMany({ where: { workflowId: id } });
      await tx.workflowTransition.deleteMany({ where: { workflowId: id } });
      await tx.workflowState.deleteMany({ where: { workflowId: id } });
      await tx.workflow.update({ where: { id }, data: { name: input.name, description: input.description || null, mode: input.mode, resourceType: input.resourceType, status: input.status, steps: { create: [ { position: 0, kind: 'TRIGGER', config: { value: input.trigger } }, { position: 1, kind: 'CONDITION', config: { value: input.condition } }, { position: 2, kind: 'ACTIONS', config: { value: input.actions } } ] } } });
      const states: { id: string }[] = [];
      for (const [position, raw] of input.states.entries()) { const v = raw as Record<string, unknown>; states.push(await tx.workflowState.create({ data: { id: randomUUID(), workflowId: id, name: typeof v.name === 'string' ? v.name : `State ${position + 1}`, description: typeof v.description === 'string' ? v.description : null, position, terminal: v.terminal === true } })); }
      for (const raw of input.transitions as Array<Record<string, unknown>>) { const from = Number(raw.from ?? 0), to = Number(raw.to ?? Math.min(1, states.length - 1)); if (!states[from] || !states[to]) throw new BadRequestException('Invalid workflow transition state'); await tx.workflowTransition.create({ data: { id: randomUUID(), workflowId: id, fromStateId: states[from].id, toStateId: states[to].id, name: typeof raw.name === 'string' ? raw.name : 'Transition', description: typeof raw.description === 'string' ? raw.description : null, trigger: typeof raw.trigger === 'string' ? raw.trigger : null, condition: (raw.condition ?? null) as object | null, actions: (Array.isArray(raw.actions) ? raw.actions : input.actions) as object } }); }
    });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_UPDATED', resourceType: 'WORKFLOW', resourceId: id } });
    return this.get(user, id);
  }

  async setStatus(user: AccessTokenPayload, id: string, status: WorkflowStatus) {
    const existing = await this.prisma.workflow.findFirst({ where: { id, orgId: user.org_id } });
    if (!existing) throw new NotFoundException('Workflow not found');
    if (existing.ownerId !== user.sub) throw new ForbiddenException('Only the workflow owner can modify it');
    const updated = await this.prisma.workflow.update({ where: { id }, data: { status } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: status === 'ACTIVE' ? 'WORKFLOW_ACTIVATED' : 'WORKFLOW_DEACTIVATED', resourceType: 'WORKFLOW', resourceId: id } });
    return updated;
  }

  async remove(user: AccessTokenPayload, id: string) {
    const existing = await this.prisma.workflow.findFirst({ where: { id, orgId: user.org_id } });
    if (!existing) throw new NotFoundException('Workflow not found');
    if (existing.ownerId !== user.sub) throw new ForbiddenException('Only the workflow owner can delete it');
    await this.prisma.workflow.delete({ where: { id } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_DELETED', resourceType: 'WORKFLOW', resourceId: id } });
    return { id, deleted: true };
  }

  async duplicate(user: AccessTokenPayload, id: string) {
    const source = await this.get(user, id);
    return this.create(user, {
      name: `${source.name} (Copy)`, description: source.description ?? '', mode: source.mode, resourceType: source.resourceType,
      trigger: (source.steps.find((s) => s.kind === 'TRIGGER')?.config as { value?: unknown })?.value,
      condition: (source.steps.find((s) => s.kind === 'CONDITION')?.config as { value?: unknown })?.value,
      actions: (source.steps.find((s) => s.kind === 'ACTIONS')?.config as { value?: unknown })?.value, status: 'DRAFT',
      states: source.states.map((s) => ({ name: s.name, description: s.description ?? '', terminal: s.terminal })),
      transitions: source.transitions.map((t) => ({ from: source.states.findIndex((s) => s.id === t.fromStateId), to: source.states.findIndex((s) => s.id === t.toStateId), name: t.name, description: t.description ?? '', trigger: t.trigger, condition: t.condition, actions: t.actions })),
    });
  }

  async logs(user: AccessTokenPayload, runId: string) {
    const run = await this.prisma.workflowRun.findFirst({ where: { id: runId, orgId: user.org_id }, include: { workflow: { select: { id: true, name: true } }, stepRuns: { orderBy: { stepPosition: 'asc' } }, jobs: { orderBy: { createdAt: 'desc' }, take: 10 } } });
    if (!run) throw new NotFoundException('Workflow run not found');
    return run;
  }

  async retry(user: AccessTokenPayload, runId: string) {
    const run = await this.prisma.workflowRun.findFirst({ where: { id: runId, orgId: user.org_id }, include: { workflow: true } });
    if (!run) throw new NotFoundException('Workflow run not found');
    if (!['FAILED','DEAD'].includes(run.status)) throw new BadRequestException('Only failed workflow runs can be retried');
    await this.prisma.$transaction(async (tx) => {
      await tx.workflowRun.update({ where: { id: runId }, data: { status: 'QUEUED', error: null, finishedAt: null } });
      await tx.workflowJob.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId: run.workflowId, runId, status: 'QUEUED', runAt: new Date(), attempts: 0 } });
    });
    return { runId, queued: true };
  }

  async completeTask(user: AccessTokenPayload, id: string, transitionId: string) {
    const task = await this.prisma.workflowTask.findFirst({ where: { id, orgId: user.org_id, status: 'PENDING', OR: [{ assigneeId: user.sub }, { assigneeId: null }] }, include: { run: true, workflow: { include: { transitions: true, states: true } } } });
    if (!task) throw new NotFoundException('Workflow task not found');
    const transition = task.workflow.transitions.find((t) => t.id === transitionId && t.fromStateId === task.stateId);
    if (!transition) throw new BadRequestException('Transition is not available for this task');
    const next = task.workflow.states.find((s) => s.id === transition.toStateId);
    await this.prisma.$transaction(async (tx) => {
      await tx.workflowTask.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
      await tx.workflowRun.update({ where: { id: task.runId }, data: { status: 'QUEUED', currentStateId: next?.id ?? null, result: { continueTransitionId: transition.id } } });
      await tx.workflowJob.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId: task.workflowId, runId: task.runId, status: 'QUEUED', runAt: new Date() } });
    });
    return { id, completed: true, transitionId };
  }
}
