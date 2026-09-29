import { contentHasSensitiveType, mergePolicyKeywords, policyMatchesContent, regionSensitiveTypes, ruleCount, splitStoredKeywords } from './dlp-identifiers';

describe('dlp identifiers', () => {
  it('preselects region identifiers and keeps rules within the Zoho limit', () => {
    const types = regionSensitiveTypes('SA');
    expect(types).toEqual(expect.arrayContaining(['CREDIT_CARD', 'IBAN', 'SA_NATIONAL_ID']));
    expect(ruleCount({ sensitiveTypes: types })).toBeLessThanOrEqual(10);
  });

  it('stores sensitive identifiers separately from keywords', () => {
    const stored = mergePolicyKeywords(['Confidential'], ['SSN']);
    expect(splitStoredKeywords(stored)).toEqual({ keywords: ['Confidential'], sensitiveTypes: ['SSN'] });
  });

  it('matches a credit card or keyword in file content and ignores empty rules', () => {
    expect(contentHasSensitiveType('card 4111 1111 1111 1111', 'CREDIT_CARD')).toBe(true);
    expect(policyMatchesContent({ keywords: [], extensions: [], sensitiveTypes: [], caseSensitive: false, fileName: 'a.txt', extension: 'txt', content: '4111111111111111' })).toBe(false);
    expect(policyMatchesContent({ keywords: ['payroll'], extensions: [], sensitiveTypes: [], caseSensitive: false, fileName: 'notes.txt', extension: 'txt', content: 'Quarterly Payroll export' })).toBe(true);
  });
});