import { apiRequest } from './client';

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

export const getAiInsights = (fileId: string) => apiRequest<AiInsight>(`/ai/files/${fileId}/insights`);
