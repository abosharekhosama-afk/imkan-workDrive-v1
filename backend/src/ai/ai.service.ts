import { Injectable, NotFoundException } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { OfficeService } from '../office/office.service';

export type AiInsight = {
  engine: 'IMKAN_LOCAL_INSIGHTS_V1';
  file: { id: string; name: string; type: 'WRITER' | 'SHEET' | 'SHOW' };
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  suggestedTitle: string;
  suggestedTags: string[];
  stats: { characters: number; words: number; sentences: number };
  limitations: string[];
};

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function collectText(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8 || out.join(' ').length > 50000) return out;
  if (typeof value === 'string') {
    const t = cleanText(value);
    if (t.length >= 2) out.push(t.slice(0, 4000));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 5000)) collectText(item, out, depth + 1);
    return out;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(obj).slice(0, 5000)) {
      if (['id', 'style', 'format', 'color', 'background', 'position', 'width', 'height', 'formula', 'type', 'sourceFormat'].includes(key)) continue;
      collectText(item, out, depth + 1);
    }
  }
  return out;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟。])\s+/)
    .map(cleanText)
    .filter((x) => x.length >= 20)
    .slice(0, 80);
}

function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}_'-]+/gu) ?? [];
}

const STOP = new Set('the and or for with from this that are was were has have had into about over under then than when where which while will would should could can may not you your our their they them this these those من في على إلى عن مع هذا هذه ذلك التي الذي هو هي و أو ثم من أن إن كان كانت يكون تكون'.split(/\s+/));

function tags(text: string): string[] {
  const counts = new Map<string, number>();
  for (const w of words(text.toLowerCase())) {
    if (w.length < 4 || STOP.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
}

function actionItems(parts: string[]): string[] {
  const verbs = /^(please|todo|to |follow up|review|send|prepare|complete|approve|update|create|check|verify|schedule|contact|implement|راجع|إرسال|ارسال|تحديث|إنشاء|اعتماد|تحقق|مراجعة|متابعة|جدولة|تنفيذ|أكمل|اكمل)\b/i;
  return parts.filter((p) => verbs.test(p) || /\b(todo|action item|task|deadline|due|مهمة|إجراء|موعد|استحقاق)\b/i.test(p)).slice(0, 10);
}

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService, private readonly office: OfficeService) {}

  async fileInsights(user: AccessTokenPayload, fileId: string): Promise<AiInsight> {
    const state = await this.office.open(user, fileId);
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id, deletedAt: null }, select: { id: true, name: true } });
    if (!file) throw new NotFoundException('File not found');

    const parts = collectText(state.content);
    const text = parts.join(' ').slice(0, 30000);
    const sents = sentences(text);
    const pointCandidates = parts.filter((p) => p.length >= 25).slice(0, 12);
    const keyPoints = (pointCandidates.length ? pointCandidates : sents).slice(0, 6);
    const summary = sents.length ? sents.slice(0, 3).join(' ') : (text || 'The document does not contain enough textual content for a local summary.');
    const baseTitle = file.name.replace(/\.[^.]+$/, '').trim();
    const suggestedTitle = baseTitle || (keyPoints[0]?.slice(0, 80) ?? 'Untitled document');

    return {
      engine: 'IMKAN_LOCAL_INSIGHTS_V1',
      file: { id: file.id, name: file.name, type: state.type },
      summary: summary.slice(0, 1200),
      keyPoints,
      actionItems: actionItems(sents),
      suggestedTitle,
      suggestedTags: tags(text),
      stats: { characters: text.length, words: words(text).length, sentences: sents.length },
      limitations: [
        'This phase uses an on-server deterministic insight engine; document content is not sent to a paid external AI provider.',
        'It does not claim generative reasoning, factual verification, OCR, or semantic understanding beyond the extracted Office document text.',
      ],
    };
  }
}
