import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { WorkflowMode, WorkflowResourceType, WorkflowRunStatus, WorkflowStatus, WorkflowTaskStatus, OrgRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}
  private isAdmin(user: AccessTokenPayload) { return user.role === OrgRole.ADMIN; }
  private assertManager(user: AccessTokenPayload) { if (!this.isAdmin(user)) throw new ForbiddenException('Workflow administration requires ADMIN'); }
  private async getWorkflow(user: AccessTokenPayload, id: string) {
    const row = await this.prisma.workflow.findFirst({ where: { id, orgId: user.org_id }, include: { owner: { select: { id: true, name: true, email: true } }, states: { orderBy: { position: 'asc' } }, transitions: true } });
    if (!row) throw new NotFoundException('Workflow not found');
    return row;
  }
  private assertOwnerOrAdmin(user: AccessTokenPayload, ownerId: string) { if (!this.isAdmin(user) && ownerId !== user.sub) throw new ForbiddenException('You do not manage this workflow'); }
  async list(user: AccessTokenPayload) {
    this.assertManager(user);
    return this.prisma.workflow.findMany({ where: { orgId: user.org_id, ...(this.isAdmin(user) ? {} : { ownerId: user.sub }) }, include: { owner: { select: { id: true, name: true, email: true } }, states: { orderBy: { position: 'asc' } }, _count: { select: { runs: true, tasks: true } } }, orderBy: { updatedAt: 'desc' } });
  }
  async listMine(user: AccessTokenPayload) { this.assertManager(user); return this.list(user); }
  async myTasks(user: AccessTokenPayload) {
    return this.prisma.workflowTask.findMany({ where: { orgId: user.org_id, assigneeId: user.sub, status: WorkflowTaskStatus.PENDING }, include: { workflow: { select: { id: true, name: true } }, state: { select: { id: true, name: true, terminal: true } }, run: { select: { id: true, resourceType: true, resourceId: true, status: true } } }, orderBy: { createdAt: 'desc' } });
  }
  async adminOverview(user: AccessTokenPayload) {
    this.assertManager(user);
    const [workflows, pending, runs] = await Promise.all([
      this.prisma.workflow.count({ where: { orgId: user.org_id } }),
      this.prisma.workflowTask.count({ where: { orgId: user.org_id, status: WorkflowTaskStatus.PENDING } }),
      this.prisma.workflowRun.count({ where: { orgId: user.org_id, status: { in: [WorkflowRunStatus.RUNNING, WorkflowRunStatus.WAITING] } } }),
    ]);
    return { workflows, pendingTasks: pending, activeRuns: runs };
  }
  async create(user: AccessTokenPayload, input: { name: string; description?: string; resourceType?: 'FILE'|'FOLDER'; mode?: 'MANUAL'|'AUTOMATIC'; assigneeId?: string }) {
    if (!this.isAdmin(user)) throw new ForbiddenException('Only organization admins can create workflows');
    const name = String(input.name ?? '').trim();
    if (!name || name.length > 120) throw new BadRequestException('Workflow name is required');
    const assigneeId = input.assigneeId ?? user.sub;
    const assignee = await this.prisma.user.findFirst({ where: { id: assigneeId, orgId: user.org_id } });
    if (!assignee) throw new BadRequestException('Invalid workflow assignee');
    return this.prisma.$transaction(async tx => {
      const workflow = await tx.workflow.create({ data: { id: randomUUID(), orgId: user.org_id, ownerId: user.sub, name, description: input.description?.trim() || null, resourceType: (input.resourceType ?? 'FILE') as WorkflowResourceType, mode: (input.mode ?? 'MANUAL') as WorkflowMode, trigger: input.mode === 'AUTOMATIC' ? 'FILE_UPLOADED' : 'MANUAL' } });
      const review = await tx.workflowState.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId: workflow.id, name: 'Review', position: 0, terminal: false } });
      await tx.workflowState.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId: workflow.id, name: 'Approved', position: 1, terminal: true } });
      const approved = await tx.workflowState.findFirstOrThrow({ where: { workflowId: workflow.id, position: 1 } });
      await tx.workflowTransition.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId: workflow.id, fromStateId: review.id, toStateId: approved.id, name: 'Approve', action: 'APPROVE' } });
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_CREATED', resourceType: 'WORKFLOW', resourceId: workflow.id, metadata: { mode: workflow.mode, resourceType: workflow.resourceType, assigneeId } } });
      return workflow;
    });
  }
  async update(user: AccessTokenPayload, id: string, input: { name?: string; description?: string; assigneeId?: string }) {
    const wf = await this.getWorkflow(user, id); this.assertOwnerOrAdmin(user, wf.ownerId);
    if (wf.status === WorkflowStatus.ACTIVE) throw new BadRequestException('Deactivate the workflow before editing');
    if (input.assigneeId) { const member = await this.prisma.user.findFirst({ where: { id: input.assigneeId, orgId: user.org_id } }); if (!member) throw new BadRequestException('Invalid assignee'); }
    return this.prisma.workflow.update({ where: { id }, data: { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.description !== undefined ? { description: input.description.trim() || null } : {}) } });
  }
  async activate(user: AccessTokenPayload, id: string) { const wf = await this.getWorkflow(user, id); this.assertOwnerOrAdmin(user, wf.ownerId); if (!wf.states.length) throw new BadRequestException('Workflow must contain a state'); return this.prisma.workflow.update({ where: { id }, data: { status: WorkflowStatus.ACTIVE } }); }
  async deactivate(user: AccessTokenPayload, id: string) { const wf = await this.getWorkflow(user, id); this.assertOwnerOrAdmin(user, wf.ownerId); return this.prisma.workflow.update({ where: { id }, data: { status: WorkflowStatus.INACTIVE } }); }
  async onFileUploaded(user: AccessTokenPayload, fileId: string) {
    const workflows = await this.prisma.workflow.findMany({ where: { orgId: user.org_id, status: WorkflowStatus.ACTIVE, mode: WorkflowMode.AUTOMATIC, resourceType: WorkflowResourceType.FILE, trigger: 'FILE_UPLOADED' }, include: { states: { orderBy: { position: 'asc' } }, transitions: true } });
    const created: string[] = [];
    for (const wf of workflows) {
      const first = wf.states[0];
      if (!first) continue;
      const run = await this.prisma.$transaction(async tx => {
        const r = await tx.workflowRun.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId: wf.id, resourceType: WorkflowResourceType.FILE, resourceId: fileId, currentStateId: first.id, status: WorkflowRunStatus.WAITING, startedById: user.sub } });
        await tx.workflowTask.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId: wf.id, runId: r.id, stateId: first.id, assigneeId: wf.ownerId } });
        await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_AUTO_TRIGGERED', resourceType: 'WORKFLOW_RUN', resourceId: r.id, metadata: { workflowId: wf.id, fileId } } });
        return r;
      });
      created.push(run.id);
    }
    return created;
  }
  async run(user: AccessTokenPayload, id: string, input: { resourceType: 'FILE'|'FOLDER'; resourceId: string }) {
    const wf = await this.getWorkflow(user, id); this.assertOwnerOrAdmin(user, wf.ownerId); if (wf.status !== WorkflowStatus.ACTIVE) throw new BadRequestException('Workflow is not active');
    if (wf.resourceType !== input.resourceType) throw new BadRequestException('Resource type does not match workflow');
    const first = wf.states[0]; if (!first) throw new BadRequestException('Workflow has no starting state');
    const taskAssignee = user.sub;
    const member = await this.prisma.user.findFirst({ where: { id: taskAssignee, orgId: user.org_id } }); if (!member) throw new ForbiddenException('Invalid participant');
    return this.prisma.$transaction(async tx => {
      const run = await tx.workflowRun.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId: id, resourceType: input.resourceType as WorkflowResourceType, resourceId: input.resourceId, currentStateId: first.id, status: WorkflowRunStatus.WAITING, startedById: user.sub } });
      const task = await tx.workflowTask.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId: id, runId: run.id, stateId: first.id, assigneeId: taskAssignee } });
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'WORKFLOW_RUN_STARTED', resourceType: 'WORKFLOW_RUN', resourceId: run.id, metadata: { workflowId: id, resourceType: input.resourceType, resourceId: input.resourceId } } });
      return { run, task };
    });
  }
  async completeTask(user: AccessTokenPayload, taskId: string, decision: 'approve'|'reject') {
    if (!['approve','reject'].includes(decision)) throw new BadRequestException('Invalid decision');
    const task = await this.prisma.workflowTask.findFirst({ where: { id: taskId, orgId: user.org_id, assigneeId: user.sub, status: WorkflowTaskStatus.PENDING }, include: { run: true, state: true, workflow: { include: { transitions: true, states: { orderBy: { position: 'asc' } } } } } });
    if (!task) throw new NotFoundException('Workflow task not found');
    const transition = decision === 'approve' ? task.workflow.transitions.find(t => t.fromStateId === task.stateId && t.action === 'APPROVE') : null;
    if (decision === 'approve' && !transition) throw new BadRequestException('No approval transition is configured');
    return this.prisma.$transaction(async tx => {
      const status = decision === 'approve' ? WorkflowTaskStatus.APPROVED : WorkflowTaskStatus.REJECTED;
      await tx.workflowTask.update({ where: { id: task.id }, data: { status, completedAt: new Date() } });
      if (decision === 'reject') {
        await tx.workflowRun.update({ where: { id: task.runId }, data: { status: WorkflowRunStatus.REJECTED, completedAt: new Date() } });
      } else if (transition) {
        const next = task.workflow.states.find(s => s.id === transition.toStateId);
        if (next?.terminal) await tx.workflowRun.update({ where: { id: task.runId }, data: { currentStateId: next.id, status: WorkflowRunStatus.COMPLETED, completedAt: new Date() } });
        else await tx.workflowRun.update({ where: { id: task.runId }, data: { currentStateId: next?.id, status: WorkflowRunStatus.WAITING } });
      }
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: `WORKFLOW_TASK_${status}`, resourceType: 'WORKFLOW_TASK', resourceId: task.id, metadata: { runId: task.runId } } });
      return { taskId: task.id, decision, completed: true };
    });
  }
}
