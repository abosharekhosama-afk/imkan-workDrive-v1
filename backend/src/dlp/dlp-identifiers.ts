const SENSITIVE_PREFIX = 'sensitive:';

export const DLP_POLICY_LIMIT = 100;
export const DLP_LABEL_LIMIT = 200;
export const DLP_RULE_LIMIT = 10;

export type SensitiveType = {
  id: string;
  en: string;
  ar: string;
  region: string[];
};

export const SENSITIVE_TYPES: SensitiveType[] = [
  { id: 'CREDIT_CARD', en: 'Credit card number', ar: 'رقم بطاقة ائتمان', region: ['US', 'EU', 'UK', 'IN', 'SA', 'AE', 'AU', 'CA', 'SG'] },
  { id: 'EMAIL', en: 'Email address', ar: 'بريد إلكتروني', region: ['US', 'EU', 'AU', 'CA', 'SG'] },
  { id: 'IBAN', en: 'IBAN', ar: 'آيبان', region: ['EU', 'UK', 'SA', 'AE', 'SG'] },
  { id: 'SSN', en: 'US Social Security number', ar: 'رقم الضمان الاجتماعي الأمريكي', region: ['US'] },
  { id: 'AADHAAR', en: 'India Aadhaar', ar: 'آدهار الهند', region: ['IN'] },
  { id: 'PAN', en: 'India PAN', ar: 'رقم PAN الهندي', region: ['IN'] },
  { id: 'UK_NINO', en: 'UK National Insurance number', ar: 'رقم التأمين الوطني البريطاني', region: ['UK'] },
  { id: 'AU_TFN', en: 'Australia TFN', ar: 'رقم الملف الضريبي الأسترالي', region: ['AU'] },
  { id: 'CA_SIN', en: 'Canada SIN', ar: 'رقم التأمين الاجتماعي الكندي', region: ['CA'] },
  { id: 'SA_NATIONAL_ID', en: 'Saudi national ID', ar: 'الهوية الوطنية السعودية', region: ['SA'] },
  { id: 'UAE_EMIRATES_ID', en: 'UAE Emirates ID', ar: 'الهوية الإماراتية', region: ['AE'] },
];

export const DLP_REGIONS = [
  { id: 'US', en: 'United States', ar: 'الولايات المتحدة' },
  { id: 'EU', en: 'European Union', ar: 'الاتحاد الأوروبي' },
  { id: 'UK', en: 'United Kingdom', ar: 'المملكة المتحدة' },
  { id: 'IN', en: 'India', ar: 'الهند' },
  { id: 'SA', en: 'Saudi Arabia', ar: 'السعودية' },
  { id: 'AE', en: 'United Arab Emirates', ar: 'الإمارات' },
  { id: 'AU', en: 'Australia', ar: 'أستراليا' },
  { id: 'CA', en: 'Canada', ar: 'كندا' },
  { id: 'SG', en: 'Singapore', ar: 'سنغافورة' },
];

export function regionSensitiveTypes(regionId: string): string[] {
  return SENSITIVE_TYPES.filter((item) => item.region.includes(regionId)).map((item) => item.id);
}

export function encodeSensitiveKeyword(id: string): string {
  return `${SENSITIVE_PREFIX}${id}`;
}

export function splitStoredKeywords(keywords: string[]): { keywords: string[]; sensitiveTypes: string[] } {
  const plain: string[] = [];
  const sensitiveTypes: string[] = [];
  for (const keyword of keywords) {
    if (keyword.startsWith(SENSITIVE_PREFIX)) sensitiveTypes.push(keyword.slice(SENSITIVE_PREFIX.length));
    else plain.push(keyword);
  }
  return { keywords: plain, sensitiveTypes };
}

export function mergePolicyKeywords(keywords: string[], sensitiveTypes: string[]): string[] {
  const plain = keywords.map((item) => item.trim()).filter((item) => item && !item.startsWith(SENSITIVE_PREFIX));
  const types = sensitiveTypes.filter((item) => SENSITIVE_TYPES.some((known) => known.id === item));
  return [...plain, ...types.map(encodeSensitiveKeyword)].slice(0, DLP_RULE_LIMIT);
}

export function ruleCount(input: { keywords?: string[]; extensions?: string[]; sensitiveTypes?: string[] }): number {
  return (input.keywords?.length ?? 0) + (input.extensions?.length ?? 0) + (input.sensitiveTypes?.length ?? 0);
}

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function contentHasSensitiveType(content: string, typeId: string): boolean {
  const text = content.slice(0, 200_000);
  if (typeId === 'CREDIT_CARD') {
    const matches = text.match(/\b(?:\d[ -]?){13,19}\b/g) ?? [];
    return matches.some((value) => {
      const digits = value.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 && luhn(digits);
    });
  }
  const patterns: Record<string, RegExp> = {
    EMAIL: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    IBAN: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/,
    SSN: /\b\d{3}-\d{2}-\d{4}\b/,
    AADHAAR: /\b\d{4}\s?\d{4}\s?\d{4}\b/,
    PAN: /\b[A-Z]{5}\d{4}[A-Z]\b/,
    UK_NINO: /\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b/i,
    AU_TFN: /\b\d{3}\s?\d{3}\s?\d{3}\b/,
    CA_SIN: /\b\d{3}[-\s]\d{3}[-\s]\d{3}\b/,
    SA_NATIONAL_ID: /\b[12]\d{9}\b/,
    UAE_EMIRATES_ID: /\b784-\d{4}-\d{7}-\d\b/,
  };
  return patterns[typeId]?.test(text) ?? false;
}

export function policyMatchesContent(input: {
  keywords: string[];
  extensions: string[];
  sensitiveTypes: string[];
  caseSensitive: boolean;
  fileName: string;
  extension: string | null;
  content: string;
}): boolean {
  const total = ruleCount(input);
  if (total === 0) return false;
  const ext = String(input.extension ?? '').replace(/^\./, '').toLowerCase();
  if (input.extensions.some((item) => item.replace(/^\./, '').toLowerCase() === ext)) return true;
  const haystack = input.caseSensitive ? `${input.fileName}\n${input.content}` : `${input.fileName}\n${input.content}`.toLowerCase();
  if (input.keywords.some((keyword) => haystack.includes(input.caseSensitive ? keyword : keyword.toLowerCase()))) return true;
  const source = `${input.fileName}\n${input.content}`;
  return input.sensitiveTypes.some((typeId) => contentHasSensitiveType(source, typeId));
}
