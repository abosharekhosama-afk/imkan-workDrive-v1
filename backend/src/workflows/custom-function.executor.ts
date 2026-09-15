import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'node:crypto';
import { interpolateDynamicValues } from './workflow-runtime';
import type { AccessTokenPayload } from '../auth/jwt.types';

export type SafeFunctionInput = { file: Record<string, unknown>; workflow: Record<string, unknown>; user: Record<string, unknown>; now: string; fields: Record<string, unknown> };
export type SafeOperation = { op: string; field?: string; value?: unknown; left?: unknown; right?: unknown; separator?: string; tag?: unknown; title?: unknown; body?: unknown; condition?: unknown; then?: unknown; else?: unknown };

const ALLOWED = new Set(['SET_FIELD','COPY_VALUE','CONCAT','LOWERCASE','UPPERCASE','NUMBER','ADD','SUBTRACT','MULTIPLY','DIVIDE','NOTIFY_OWNER','ADD_TAG','IF']);

@Injectable()
export class CustomFunctionExecutor {
  constructor(private readonly prisma: PrismaService) {}

  validateDefinition(definition: unknown) {
    if (!definition || typeof definition !== 'object') throw new BadRequestException('Function definition must be an object');
    const d = definition as Record<string, unknown>;
    if (!Array.isArray(d.operations) || d.operations.length === 0 || d.operations.length > 30) throw new BadRequestException('A function must contain 1-30 safe operations');
    for (const raw of d.operations) {
      if (!raw || typeof raw !== 'object') throw new BadRequestException('Invalid function operation');
      const op = String((raw as SafeOperation).op ?? '').toUpperCase();
      if (!ALLOWED.has(op)) throw new BadRequestException(`Unsupported or unsafe operation: ${op}`);
      if (op === 'SET_FIELD' && !String((raw as SafeOperation).field ?? '').trim()) throw new BadRequestException('SET_FIELD requires field');
      if (op === 'COPY_VALUE' && !String((raw as SafeOperation).field ?? '').trim()) throw new BadRequestException('COPY_VALUE requires field');
      if (op === 'DIVIDE' && Number((raw as SafeOperation).right) === 0) throw new BadRequestException('DIVIDE by zero is not allowed');
    }
    return d;
  }

  private value(raw: unknown, input: SafeFunctionInput): unknown {
    if (typeof raw !== 'string') return raw;
    return interpolateDynamicValues(raw, { fileId: String(input.file.id ?? ''), name: String(input.file.name ?? ''), userId: String(input.user.id ?? ''), extension: String(input.file.extension ?? ''), folderId: String(input.file.folderId ?? ''), fileType: String(input.file.fileType ?? ''), mimeType: String(input.file.mimeType ?? '') }, input.fields, { user: { id: String(input.user.id ?? ''), email: String(input.user.email ?? ''), name: String(input.user.name ?? '') }, workflowId: String(input.workflow.id ?? ''), workflowName: String(input.workflow.name ?? ''), runId: String(input.workflow.runId ?? '') });
  }

  async execute(user: AccessTokenPayload, functionId: string, versionId: string, definition: unknown, input: SafeFunctionInput, opts: { runId?: string; stepId?: string; idempotencyKey?: string } = {}) {
    const started = Date.now();
    const idem = opts.idempotencyKey ?? null;
    if (idem) {
      const existing = await this.prisma.workflowFunctionExecution.findUnique({ where: { idempotencyKey: idem } });
      if (existing?.status === 'SUCCESS') return existing.outputSummary ?? {};
      if (existing?.status === 'RUNNING') throw new Error('Function execution is already running');
    }
    const record = await this.prisma.workflowFunctionExecution.create({ data: { id: randomUUID(), orgId: user.org_id, functionId, versionId, runId: opts.runId, stepId: opts.stepId, status: 'RUNNING', idempotencyKey: idem, inputSummary: this.summary(input) as any } });
    try {
      const d = this.validateDefinition(definition);
      const fields: Record<string, unknown> = { ...input.fields };
      const notifications: Array<Record<string, unknown>> = [];
      const tags: string[] = [];
      for (const raw of d.operations as SafeOperation[]) {
        const op = String(raw.op).toUpperCase();
        const left = this.value(raw.left, { ...input, fields });
        const right = this.value(raw.right, { ...input, fields });
        switch (op) {
          case 'SET_FIELD': fields[String(raw.field)] = this.value(raw.value, { ...input, fields }); break;
          case 'COPY_VALUE': fields[String(raw.field)] = left; break;
          case 'CONCAT': fields[String(raw.field ?? '_result')] = [left, right].filter(v => v !== undefined && v !== null).map(String).join(String(raw.separator ?? '')); break;
          case 'LOWERCASE': fields[String(raw.field ?? '_result')] = String(left ?? '').toLowerCase(); break;
          case 'UPPERCASE': fields[String(raw.field ?? '_result')] = String(left ?? '').toUpperCase(); break;
          case 'NUMBER': fields[String(raw.field ?? '_result')] = Number(left); break;
          case 'ADD': fields[String(raw.field ?? '_result')] = Number(left) + Number(right); break;
          case 'SUBTRACT': fields[String(raw.field ?? '_result')] = Number(left) - Number(right); break;
          case 'MULTIPLY': fields[String(raw.field ?? '_result')] = Number(left) * Number(right); break;
          case 'DIVIDE': if (Number(right) === 0) throw new Error('DIVIDE by zero'); fields[String(raw.field ?? '_result')] = Number(left) / Number(right); break;
          case 'NOTIFY_OWNER': notifications.push({ title: this.value(raw.title ?? 'Workflow update', { ...input, fields }), body: this.value(raw.body ?? 'A workflow function completed.', { ...input, fields }) }); break;
          case 'ADD_TAG': { const tag = String(this.value(raw.tag ?? '', { ...input, fields }) ?? '').trim(); if (tag) tags.push(tag); break; }
          case 'IF': { const condition = Boolean(this.value(raw.condition, { ...input, fields })); const branch = condition ? raw.then : raw.else; if (branch && typeof branch === 'object') { const nested = this.validateDefinition({ operations: [branch] }); for (const nestedOp of nested.operations as SafeOperation[]) { if (String(nestedOp.op).toUpperCase() !== 'SET_FIELD') throw new Error('IF branches currently support SET_FIELD only'); fields[String(nestedOp.field)] = this.value(nestedOp.value, { ...input, fields }); } } break; }
        }
      }
      const output = { fields, notifications, tags };
      const durationMs = Date.now() - started;
      await this.prisma.workflowFunctionExecution.update({ where: { id: record.id }, data: { status: 'SUCCESS', durationMs, outputSummary: this.summary(output) as any, completedAt: new Date() } });
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Function execution failed';
      await this.prisma.workflowFunctionExecution.update({ where: { id: record.id }, data: { status: 'FAILED', durationMs: Date.now() - started, error: message, completedAt: new Date() } });
      throw error;
    }
  }

  private summary(value: unknown) {
    const text = JSON.stringify(value ?? {});
    return JSON.parse(text.length > 12000 ? text.slice(0, 12000) : text);
  }
}
