import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SharesService } from '../shares/shares.service';
import type { AccessTokenPayload } from '../auth/jwt.types';

export type WorkflowFileEvent = {
  eventType?: string;
  fileId: string;
  name: string;
  mimeType?: string | null;
  fileType?: string | null;
  size?: string;
  userId: string;
  folderId?: string | null;
  extension?: string | null;
  sourceWorkflowId?: string;
  resourceType?: 'FILE' | 'FOLDER';
};

type WorkflowAction = { type: string; config?: Record<string, unknown> };
type WorkflowDefinition = { trigger?: string | string[]; condition?: unknown; actions?: WorkflowAction[]; states?: unknown[]; transitions?: unknown[] };

@Injectable()
export class WorkflowEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowEngineService.name);
  private timer?: NodeJS.Timeout;
  private processing = false;
  private readonly workerId = `workdrive-workflow-${randomUUID()}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly shares: SharesService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.drain(), 1500);
    void this.drain();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async executeTrigger(user: AccessTokenPayload, event: WorkflowFileEvent) {
    return this.onFileEvent(user, event);
  }

  async onFileUploaded(user: AccessTokenPayload, event: WorkflowFileEvent) {
    return this.onFileEvent(user, { ...event, eventType: 'upload' });
  }

  async onFileEvent(user: AccessTokenPayload, event: WorkflowFileEvent): Promise<void> {
    const eventType = event.eventType ?? 'upload';
    const workflows = await this.prisma.workflow.findMany({
      where: { orgId: user.org_id, status: 'ACTIVE' },
      include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true },
    });

    for (const workflow of workflows) {
      if (event.sourceWorkflowId && workflow.id === event.sourceWorkflowId) continue;
      const definition = this.definitionFromWorkflow(workflow);
      if (workflow.mode !== 'AUTOMATIC') continue;
      const triggers = Array.isArray(definition.trigger) ? definition.trigger.map(String) : [String(definition.trigger ?? '')];
      const aliases: Record<string, string[]> = {
        FILE_UPLOADED: ['upload', 'created', 'FILE_UPLOADED'], upload: ['FILE_UPLOADED', 'upload'],
        FILE_CREATED: ['create', 'created', 'FILE_CREATED'], create: ['FILE_CREATED', 'FOLDER_CREATED', 'create'],
        FILE_MOVED: ['move', 'FILE_MOVED'], move: ['FILE_MOVED', 'FOLDER_MOVED', 'move'],
        FILE_RENAMED: ['rename', 'FILE_RENAMED'], rename: ['FILE_RENAMED', 'rename'],
        FILE_DELETED: ['delete', 'FILE_DELETED'], delete: ['FILE_DELETED', 'delete'],
        FOLDER_CREATED: ['create', 'FOLDER_CREATED'],
        FOLDER_MOVED: ['move', 'FOLDER_MOVED'],
        FOLDER_COPIED: ['copy', 'FOLDER_COPIED'], copy: ['FILE_COPIED', 'FOLDER_COPIED', 'copy'],
      };
      const eventCandidates = [eventType, ...(aliases[eventType] ?? [])];
      if (!triggers.some((trigger) => eventCandidates.includes(trigger))) continue;
      if (workflow.resourceType !== (event.resourceType ?? 'FILE')) continue;
      if (!this.conditionMatches(definition.condition, event)) continue;
      await this.enqueue(user, workflow.id, event, definition);
    }
  }

  async startManual(user: AccessTokenPayload, workflowId: string, event: WorkflowFileEvent) {
    const workflow = await this.prisma.workflow.findFirst({ where: { id: workflowId, orgId: user.org_id }, include: { steps: true, states: { orderBy: { position: 'asc' } }, transitions: true } });
    if (!workflow) throw new Error('Workflow not found');
    if (workflow.mode !== 'MANUAL') throw new Error('Only manual workflows can be started explicitly');
    return this.enqueue(user, workflow.id, { ...event, eventType: 'manual' }, this.definitionFromWorkflow(workflow));
  }

  private definitionFromWorkflow(workflow: { steps: Array<{ kind: string; config: unknown }>; states?: unknown[]; transitions?: unknown[] }): WorkflowDefinition {
    const values = Object.fromEntries(workflow.steps.map((step) => [step.kind, (step.config as { value?: unknown })?.value]));
    let actions: WorkflowAction[] = [];
    if (Array.isArray(values.ACTIONS)) actions = values.ACTIONS as WorkflowAction[];
    else if (values.ACTION) actions = [{ type: String(values.ACTION) }];
    return { trigger: Array.isArray(values.TRIGGER) ? values.TRIGGER.map(String) : String(values.TRIGGER ?? ''), condition: values.CONDITION ?? 'any', actions, states: workflow.states, transitions: workflow.transitions };
  }

  private conditionMatches(condition: unknown, event: WorkflowFileEvent): boolean {
    if (!condition || condition === 'any') return true;
    if (Array.isArray(condition)) return condition.every((c) => this.conditionMatches(c, event));
    if (typeof condition === 'string') {
      const normalized = condition.toUpperCase();
      if (normalized === 'PDF') return String(event.fileType).toUpperCase() === 'PDF' || event.mimeType?.toLowerCase() === 'application/pdf';
      if (normalized === 'IMAGE') return String(event.fileType).toUpperCase() === 'IMAGE' || !!event.mimeType?.toLowerCase().startsWith('image/');
      if (normalized === 'DOCUMENT') return ['DOCUMENT','TEXT','CODE'].includes(String(event.fileType).toUpperCase()) || /word|text|rtf/.test(event.mimeType?.toLowerCase() ?? '');
      if (normalized === 'SPREADSHEET') return String(event.fileType).toUpperCase() === 'SPREADSHEET' || /spreadsheet|excel|csv/.test(event.mimeType?.toLowerCase() ?? '');
      if (normalized === 'PRESENTATION') return String(event.fileType).toUpperCase() === 'PRESENTATION' || /presentation|powerpoint/.test(event.mimeType?.toLowerCase() ?? '');
      if (normalized === 'VIDEO') return String(event.fileType).toUpperCase() === 'VIDEO' || !!event.mimeType?.toLowerCase().startsWith('video/');
      if (normalized === 'AUDIO') return String(event.fileType).toUpperCase() === 'AUDIO' || !!event.mimeType?.toLowerCase().startsWith('audio/');
      return true;
    }
    if (typeof condition !== 'object') return true;
    const c = condition as Record<string, unknown>;
    if (c.all && Array.isArray(c.all) && !c.all.every((x) => this.conditionMatches(x, event))) return false;
    if (c.any && Array.isArray(c.any) && !c.any.some((x) => this.conditionMatches(x, event))) return false;
    if (typeof c.fileType === 'string' && String(event.fileType).toUpperCase() !== c.fileType.toUpperCase()) return false;
    if (typeof c.extension === 'string' && String(event.extension ?? '').toLowerCase() !== c.extension.toLowerCase()) return false;
    if (typeof c.nameContains === 'string' && !event.name.toLowerCase().includes(c.nameContains.toLowerCase())) return false;
    if (typeof c.folderId === 'string' && event.folderId !== c.folderId) return false;
    return true;
  }

  private async enqueue(user: AccessTokenPayload, workflowId: string, event: WorkflowFileEvent, definition: WorkflowDefinition) {
    const eventKey = `${event.resourceType ?? 'FILE'}:${event.fileId}:${event.eventType ?? 'manual'}:${event.sourceWorkflowId ?? 'system'}`;
    try {
      const run = await this.prisma.workflowRun.create({ data: { orgId: user.org_id, workflowId, eventKey, status: 'QUEUED', trigger: event } });
      await this.prisma.workflowJob.create({ data: { id: randomUUID(), orgId: user.org_id, workflowId, runId: run.id, status: 'QUEUED', runAt: new Date() } });
      return run;
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') return undefined;
      throw error;
    }
  }

  private async drain() {
    if (this.processing) return;
    this.processing = true;
    try {
      for (let i = 0; i < 10; i++) {
        const job = await this.claimJob();
        if (!job) break;
        await this.executeJob(job.id);
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.processing = false;
    }
  }

  private async claimJob() {
    const now = new Date();
    const candidate = await this.prisma.workflowJob.findFirst({ where: { status: 'QUEUED', runAt: { lte: now } }, orderBy: { runAt: 'asc' } });
    if (!candidate) return null;
    const claimed = await this.prisma.workflowJob.updateMany({ where: { id: candidate.id, status: 'QUEUED' }, data: { status: 'RUNNING', lockedAt: now, lockedBy: this.workerId, attempts: { increment: 1 } } });
    return claimed.count === 1 ? candidate : null;
  }

  private async executeJob(jobId: string) {
    const job = await this.prisma.workflowJob.findUnique({ where: { id: jobId }, include: { run: true, workflow: { include: { steps: { orderBy: { position: 'asc' } }, states: { orderBy: { position: 'asc' } }, transitions: true } } } });
    if (!job) return;
    const event = job.run.trigger as unknown as WorkflowFileEvent;
    const definition = this.definitionFromWorkflow(job.workflow);
    const continuationId = typeof (job.run.result as { continueTransitionId?: unknown } | null)?.continueTransitionId === 'string' ? String((job.run.result as { continueTransitionId: string }).continueTransitionId) : null;
    const continuation = continuationId ? job.workflow.transitions.find((t) => t.id === continuationId) : null;
    const user = await this.prisma.user.findUnique({ where: { id: event.userId }, select: { id: true, currentOrganizationId: true } });
    if (!user) return this.failJob(job.id, job.run.id, 'Workflow actor no longer exists', job.attempts, job.maxAttempts);
    const token = { sub: user.id, org_id: job.orgId } as AccessTokenPayload;

    try {
      await this.prisma.workflowRun.update({ where: { id: job.run.id }, data: { status: 'RUNNING' } });
      const actions = continuation ? ((continuation.actions as unknown as WorkflowAction[]) ?? []) : (definition.actions?.length ? definition.actions : [{ type: 'notify' }]);
      const results: unknown[] = [];
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const step = await this.prisma.workflowStepRun.create({ data: { orgId: job.orgId, runId: job.run.id, stepKind: `ACTION:${action.type}`, stepPosition: i, status: 'RUNNING', input: action as unknown as Prisma.InputJsonValue } });
        try {
          results.push(await this.executeAction(token, event, action, job.workflow.id, job.run.id));
          await this.prisma.workflowStepRun.update({ where: { id: step.id }, data: { status: 'SUCCEEDED', output: results.at(-1) as unknown as Prisma.InputJsonValue, finishedAt: new Date() } });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.prisma.workflowStepRun.update({ where: { id: step.id }, data: { status: 'FAILED', error: message, finishedAt: new Date() } });
          throw error;
        }
      }
      const waiting = results.some((result) => Boolean((result as { waiting?: boolean } | null)?.waiting));
      await this.prisma.workflowRun.update({ where: { id: job.run.id }, data: waiting ? { status: 'WAITING', result: { actions: results } as unknown as Prisma.InputJsonValue } : { status: 'SUCCEEDED', result: { actions: results } as unknown as Prisma.InputJsonValue, finishedAt: new Date() } });
      await this.prisma.workflowJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', lockedAt: null, lockedBy: null } });
      await this.prisma.auditLog.create({ data: { orgId: job.orgId, actorId: user.id, action: 'WORKFLOW_EXECUTED', resourceType: 'WORKFLOW', resourceId: job.workflow.id, metadata: { runId: job.run.id, eventKey: job.run.eventKey, actions: actions.map((a) => a.type) } } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.failJob(job.id, job.run.id, message, job.attempts, job.maxAttempts);
    }
  }

  private async failJob(jobId: string, runId: string, message: string, attempts: number, maxAttempts: number) {
    const terminal = attempts >= maxAttempts;
    const delay = Math.min(60 * 60 * 1000, 1000 * 2 ** Math.max(0, attempts - 1));
    await this.prisma.workflowJob.update({ where: { id: jobId }, data: { status: terminal ? 'DEAD' : 'QUEUED', runAt: new Date(Date.now() + delay), lastError: message, lockedAt: null, lockedBy: null } });
    await this.prisma.workflowRun.update({ where: { id: runId }, data: { status: terminal ? 'FAILED' : 'QUEUED', error: message, ...(terminal ? { finishedAt: new Date() } : {}) } }).catch(() => undefined);
  }

  private async executeAction(user: AccessTokenPayload, event: WorkflowFileEvent, action: WorkflowAction, workflowId: string, runId: string) {
    const config = action.config ?? {};
    switch (action.type) {
      case 'notify': {
        const recipientIds = Array.isArray(config.userIds) ? config.userIds.filter((id): id is string => typeof id === 'string') : [user.sub];
        const recipients = await this.prisma.organizationMembership.findMany({ where: { organizationId: user.org_id, userId: { in: recipientIds }, status: 'ACTIVE' }, select: { userId: true } });
        const resourceType = (event.resourceType ?? 'FILE') as 'FILE' | 'FOLDER';
        for (const recipient of recipients) await this.prisma.notification.create({ data: { orgId: user.org_id, userId: recipient.userId, type: 'SYSTEM', title: String(config.title ?? 'Workflow notification'), body: String(config.message ?? `Workflow action completed for ${event.name}`), resourceType, resourceId: event.fileId } });
        return { action: 'notify', deliveredTo: recipients.map((r) => r.userId) };
      }
      case 'favorite': {
        const kind: string = event.resourceType ?? 'FILE';
        if (kind === 'FOLDER') throw new Error('Favorite action is only supported for files');
        await this.prisma.favorite.upsert({ where: { userId_resourceType_resourceId: { userId: user.sub, resourceType: 'FILE', resourceId: event.fileId } }, create: { orgId: user.org_id, userId: user.sub, resourceType: 'FILE', resourceId: event.fileId }, update: {} });
        return { action: 'favorite', resourceId: event.fileId };
      }
      case 'tag': {
        const tagKind: string = event.resourceType ?? 'FILE';
        if (tagKind === 'FOLDER') throw new Error('Tag action is only supported for files');
        const name = String(config.name ?? '').trim();
        if (!name) throw new Error('Tag action requires a tag name');
        const tag = await this.prisma.tag.upsert({ where: { orgId_name: { orgId: user.org_id, name } }, create: { orgId: user.org_id, name }, update: {} });
        await this.prisma.fileTag.upsert({ where: { fileId_tagId: { fileId: event.fileId, tagId: tag.id } }, create: { fileId: event.fileId, tagId: tag.id }, update: {} });
        return { action: 'tag', tag: name };
      }
      case 'mark_final':
      case 'archive': {
        const finalKind: string = event.resourceType ?? 'FILE';
        if (finalKind === 'FOLDER') throw new Error('Mark as final is only supported for files');
        await this.prisma.file.updateMany({ where: { id: event.fileId, orgId: user.org_id, deletedAt: null }, data: { status: 'ARCHIVED' } });
        return { action: 'mark_final', resourceId: event.fileId };
      }
      case 'create_folder': {
        const createKind: string = event.resourceType ?? 'FILE';
        const parentId = typeof config.parentFolderId === 'string' ? config.parentFolderId : (createKind === 'FOLDER' ? event.fileId : event.folderId ?? null);
        const name = String(config.name ?? `Workflow folder ${new Date().toISOString().slice(0,10)}`).trim();
        if (!name) throw new Error('Create folder action requires a name');
        const parent = parentId ? await this.prisma.folder.findFirst({ where: { id: parentId, orgId: user.org_id }, select: { id: true, teamFolderId: true } }) : null;
        if (parentId && !parent) throw new Error('Parent folder not found');
        const created = await this.prisma.folder.create({ data: { id: randomUUID(), orgId: user.org_id, ownerId: user.sub, parentId, teamFolderId: parent?.teamFolderId ?? null, name } });
        return { action: 'create_folder', folderId: created.id, parentId };
      }
      case 'move': {
        const destinationFolderId = typeof config.destinationFolderId === 'string' ? config.destinationFolderId : null;
        if (!destinationFolderId) throw new Error('Move action requires a destination folder');
        const destination = await this.prisma.folder.findFirst({ where: { id: destinationFolderId, orgId: user.org_id }, select: { id: true } });
        if (!destination) throw new Error('Destination folder not found');
        const moveKind: string = event.resourceType ?? 'FILE';
        if (moveKind === 'FOLDER') {
          if (destinationFolderId === event.fileId) throw new Error('A folder cannot be moved into itself');
          await this.prisma.folder.update({ where: { id: event.fileId }, data: { parentId: destinationFolderId } });
          return { action: 'move', resourceId: event.fileId, destinationFolderId };
        }
        await this.prisma.file.update({ where: { id: event.fileId }, data: { folderId: destinationFolderId } });
        return { action: 'move', resourceId: event.fileId, destinationFolderId };
      }
      case 'copy': {
        const destinationFolderId = typeof config.destinationFolderId === 'string' ? config.destinationFolderId : null;
        if (!destinationFolderId) throw new Error('Copy action requires a destination folder');
        const copyKind: string = event.resourceType ?? 'FILE';
        if (copyKind === 'FOLDER') {
          const sourceFolder = await this.prisma.folder.findFirst({ where: { id: event.fileId, orgId: user.org_id }, include: { children: true, files: { include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } } } });
          if (!sourceFolder) throw new Error('Source folder not found');
          const copyTree = async (sourceId: string, parentId: string | null): Promise<string> => {
            const source = await this.prisma.folder.findFirst({ where: { id: sourceId, orgId: user.org_id }, include: { children: true, files: { include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } } } });
            if (!source) throw new Error('Source folder not found');
            const newId = randomUUID();
            await this.prisma.folder.create({ data: { id: newId, orgId: user.org_id, ownerId: user.sub, parentId, teamFolderId: source.teamFolderId, name: source.name } });
            for (const file of source.files) { const version = file.versions[0]; if (!version) continue; const newFileId = randomUUID(); await this.prisma.file.create({ data: { id: newFileId, orgId: user.org_id, folderId: newId, name: file.name, originalName: file.originalName, extension: file.extension, mimeType: file.mimeType, fileType: file.fileType, size: file.size, sha256Hash: file.sha256Hash, ownerId: user.sub } }); await this.prisma.fileVersion.create({ data: { id: randomUUID(), orgId: user.org_id, fileId: newFileId, versionNumber: 1, storageObjectId: version.storageObjectId, size: version.size, mimeType: version.mimeType, extension: version.extension, sha256Hash: version.sha256Hash, uploadedById: user.sub } }); }
            for (const child of source.children) await copyTree(child.id, newId);
            return newId;
          };
          const newFolderId = await copyTree(sourceFolder.id, destinationFolderId);
          return { action: 'copy', sourceFolderId: event.fileId, newFolderId, destinationFolderId };
        }
        const source = await this.prisma.file.findFirst({ where: { id: event.fileId, orgId: user.org_id, deletedAt: null }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } });
        const destination = await this.prisma.folder.findFirst({ where: { id: destinationFolderId, orgId: user.org_id }, select: { id: true } });
        const version = source?.versions[0];
        if (!source || !version || !destination) throw new Error('Source file or destination folder not found');
        const newFileId = randomUUID();
        await this.prisma.$transaction(async (tx) => {
          await tx.file.create({ data: { id: newFileId, orgId: user.org_id, folderId: destinationFolderId, name: source.name, originalName: source.originalName, extension: source.extension, mimeType: source.mimeType, fileType: source.fileType, size: source.size, sha256Hash: source.sha256Hash, ownerId: user.sub } });
          await tx.fileVersion.create({ data: { id: randomUUID(), orgId: user.org_id, fileId: newFileId, versionNumber: 1, storageObjectId: version.storageObjectId, size: version.size, mimeType: version.mimeType, extension: version.extension, sha256Hash: version.sha256Hash, uploadedById: user.sub } });
        });
        return { action: 'copy', sourceFileId: event.fileId, newFileId, destinationFolderId };
      }
      case 'generate_link':
      case 'link': {
        const linkKind: string = event.resourceType ?? 'FILE';
        if (linkKind === 'FOLDER') throw new Error('Link generation currently supports files only');
        const created = await this.shares.createShare(user, { resourceType: 'FILE' as never, resourceId: event.fileId, permission: 'VIEW' as never, recipientUserIds: [], canDownload: config.canDownload !== false });
        return { action: 'generate_link', link_url: created.link_url, resourceId: event.fileId };
      }
      case 'share': {
        const shareKind: string = event.resourceType ?? 'FILE';
        if (shareKind === 'FOLDER') throw new Error('Share action is only supported for files');
        const recipientUserIds = Array.isArray(config.userIds) ? config.userIds.filter((id): id is string => typeof id === 'string') : [];
        const created = await this.shares.createShare(user, { resourceType: 'FILE' as never, resourceId: event.fileId, permission: (typeof config.permission === 'string' ? config.permission : 'VIEW') as never, recipientUserIds, canDownload: config.canDownload !== false });
        return { action: 'share', link_url: created.link_url, recipientUserIds };
      }
      case 'request_approval': {
        const state = await this.prisma.workflowState.findFirst({ where: { workflowId, position: { gt: 0 } }, orderBy: { position: 'asc' } });
        if (!state) throw new Error('Approval action requires a workflow state');
        const assigneeId = typeof config.userId === 'string' ? config.userId : user.sub;
        const run = await this.prisma.workflowRun.findUnique({ where: { id: runId } });
        if (!run) throw new Error('Workflow run not found');
        await this.prisma.workflowTask.create({ data: { orgId: user.org_id, workflowId, runId: run.id, stateId: state.id, assigneeId, title: String(config.title ?? `Approval required for ${event.name}`) } });
        await this.prisma.workflowRun.update({ where: { id: run.id }, data: { status: 'WAITING', currentStateId: state.id } });
        const approvalResourceType = (event.resourceType ?? 'FILE') as 'FILE' | 'FOLDER';
        await this.prisma.notification.create({ data: { orgId: user.org_id, userId: assigneeId, type: 'SYSTEM', title: 'Workflow approval required', body: String(config.title ?? `Approval required for ${event.name}`), resourceType: approvalResourceType, resourceId: event.fileId } });
        return { action: 'request_approval', assigneeId, stateId: state.id, waiting: true };
      }
      default: throw new Error(`Unsupported workflow action: ${action.type}`);
    }
  }
}
