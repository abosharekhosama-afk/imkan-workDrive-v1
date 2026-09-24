import { SHEET_FUNCTION_REGISTRY, type SheetFunctionDefinition } from './function-registry.ts';

export type FormulaAutocompleteMatch = {
  name: string;
  insertText: string;
  replaceStart: number;
  replaceEnd: number;
};

/** Detect partial function name after '=' and return matching supported functions. */
export function formulaAutocompleteSuggestions(
  input: string,
  cursor = input.length,
): { matches: SheetFunctionDefinition[]; token: string | null; tokenStart: number } {
  const head = input.slice(0, cursor);
  const match = /=([A-Za-z_][A-Za-z0-9_.]*)$/.exec(head);
  if (!match) return { matches: [], token: null, tokenStart: cursor };
  const token = match[1].toUpperCase();
  const tokenStart = head.length - token.length;
  const matches = SHEET_FUNCTION_REGISTRY.filter((f) => f.name.startsWith(token));
  return { matches, token, tokenStart };
}

export function buildAutocompleteInsert(
  input: string,
  cursor: number,
  fnName: string,
): FormulaAutocompleteMatch {
  const { tokenStart } = formulaAutocompleteSuggestions(input, cursor);
  const start = tokenStart >= 0 ? tokenStart : cursor;
  return {
    name: fnName,
    insertText: `${fnName}(`,
    replaceStart: start,
    replaceEnd: cursor,
  };
}

export function applyAutocompleteInsert(input: string, match: FormulaAutocompleteMatch): string {
  return `${input.slice(0, match.replaceStart)}${match.insertText}${input.slice(match.replaceEnd)}`;
}

export function shouldShowFormulaAutocomplete(input: string, cursor = input.length): boolean {
  return formulaAutocompleteSuggestions(input, cursor).matches.length > 0;
}
