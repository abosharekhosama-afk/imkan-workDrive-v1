export type SheetFunctionCategory =
  | 'Math & Trigonometry'
  | 'Statistical'
  | 'Logical'
  | 'Text'
  | 'Date & Time'
  | 'Lookup & Reference'
  | 'Information';

export type SheetFunctionDefinition = {
  name: string;
  category: SheetFunctionCategory;
  description: string;
  syntax: string;
  supported: true;
};

/** Functions backed by evalFormula in model.ts — only list what the engine can evaluate. */
export const SHEET_FUNCTION_REGISTRY: SheetFunctionDefinition[] = [
  { name: 'SUM', category: 'Statistical', description: 'Adds all numbers in a range.', syntax: 'SUM(number1, [number2], ...)', supported: true },
  { name: 'AVERAGE', category: 'Statistical', description: 'Returns the average of its arguments.', syntax: 'AVERAGE(number1, [number2], ...)', supported: true },
  { name: 'MIN', category: 'Statistical', description: 'Returns the smallest number in a range.', syntax: 'MIN(number1, [number2], ...)', supported: true },
  { name: 'MAX', category: 'Statistical', description: 'Returns the largest number in a range.', syntax: 'MAX(number1, [number2], ...)', supported: true },
  { name: 'COUNT', category: 'Statistical', description: 'Counts numeric values in a range.', syntax: 'COUNT(value1, [value2], ...)', supported: true },
  { name: 'COUNTA', category: 'Statistical', description: 'Counts non-empty values in a range.', syntax: 'COUNTA(value1, [value2], ...)', supported: true },
  { name: 'COUNTIF', category: 'Statistical', description: 'Counts cells that meet a criterion.', syntax: 'COUNTIF(range, criteria)', supported: true },
  { name: 'SUMIF', category: 'Statistical', description: 'Adds cells that meet a criterion.', syntax: 'SUMIF(range, criteria, [sum_range])', supported: true },
  { name: 'COUNTIFS', category: 'Statistical', description: 'Counts cells that meet multiple criteria.', syntax: 'COUNTIFS(criteria_range1, criteria1, ...)', supported: true },
  { name: 'SUMIFS', category: 'Statistical', description: 'Adds cells that meet multiple criteria.', syntax: 'SUMIFS(sum_range, criteria_range1, criteria1, ...)', supported: true },
  { name: 'AVERAGEIF', category: 'Statistical', description: 'Averages cells that meet a criterion.', syntax: 'AVERAGEIF(range, criteria, [average_range])', supported: true },
  { name: 'MAXIFS', category: 'Statistical', description: 'Returns the maximum among cells that meet criteria.', syntax: 'MAXIFS(max_range, criteria_range1, criteria1, ...)', supported: true },
  { name: 'MINIFS', category: 'Statistical', description: 'Returns the minimum among cells that meet criteria.', syntax: 'MINIFS(min_range, criteria_range1, criteria1, ...)', supported: true },
  { name: 'SUMPRODUCT', category: 'Statistical', description: 'Returns the sum of products of corresponding ranges.', syntax: 'SUMPRODUCT(array1, [array2], ...)', supported: true },
  { name: 'LARGE', category: 'Statistical', description: 'Returns the k-th largest value in a range.', syntax: 'LARGE(array, k)', supported: true },
  { name: 'SMALL', category: 'Statistical', description: 'Returns the k-th smallest value in a range.', syntax: 'SMALL(array, k)', supported: true },
  { name: 'RANK', category: 'Statistical', description: 'Returns the rank of a number in a list.', syntax: 'RANK(number, ref, [order])', supported: true },
  { name: 'IF', category: 'Logical', description: 'Returns one value if a condition is true and another if false.', syntax: 'IF(logical_test, value_if_true, [value_if_false])', supported: true },
  { name: 'AND', category: 'Logical', description: 'Returns TRUE if all arguments are TRUE.', syntax: 'AND(logical1, [logical2], ...)', supported: true },
  { name: 'OR', category: 'Logical', description: 'Returns TRUE if any argument is TRUE.', syntax: 'OR(logical1, [logical2], ...)', supported: true },
  { name: 'NOT', category: 'Logical', description: 'Reverses the logical value of its argument.', syntax: 'NOT(logical)', supported: true },
  { name: 'IFERROR', category: 'Logical', description: 'Returns a value if an expression is an error.', syntax: 'IFERROR(value, value_if_error)', supported: true },
  { name: 'IFNA', category: 'Logical', description: 'Returns a value if an expression is #N/A.', syntax: 'IFNA(value, value_if_na)', supported: true },
  { name: 'CONCAT', category: 'Text', description: 'Joins text from multiple ranges and/or strings.', syntax: 'CONCAT(text1, [text2], ...)', supported: true },
  { name: 'CONCATENATE', category: 'Text', description: 'Joins several text strings into one.', syntax: 'CONCATENATE(text1, [text2], ...)', supported: true },
  { name: 'LEFT', category: 'Text', description: 'Returns the leftmost characters from a text string.', syntax: 'LEFT(text, [num_chars])', supported: true },
  { name: 'RIGHT', category: 'Text', description: 'Returns the rightmost characters from a text string.', syntax: 'RIGHT(text, [num_chars])', supported: true },
  { name: 'MID', category: 'Text', description: 'Returns characters from the middle of a text string.', syntax: 'MID(text, start_num, num_chars)', supported: true },
  { name: 'LEN', category: 'Text', description: 'Returns the number of characters in a text string.', syntax: 'LEN(text)', supported: true },
  { name: 'LOWER', category: 'Text', description: 'Converts text to lowercase.', syntax: 'LOWER(text)', supported: true },
  { name: 'UPPER', category: 'Text', description: 'Converts text to uppercase.', syntax: 'UPPER(text)', supported: true },
  { name: 'TRIM', category: 'Text', description: 'Removes extra spaces from text.', syntax: 'TRIM(text)', supported: true },
  { name: 'TEXT', category: 'Text', description: 'Formats a number and converts it to text.', syntax: 'TEXT(value, format_text)', supported: true },
  { name: 'VALUE', category: 'Text', description: 'Converts text that appears in a number format to a number.', syntax: 'VALUE(text)', supported: true },
  { name: 'ABS', category: 'Math & Trigonometry', description: 'Returns the absolute value of a number.', syntax: 'ABS(number)', supported: true },
  { name: 'MOD', category: 'Math & Trigonometry', description: 'Returns the remainder after division.', syntax: 'MOD(number, divisor)', supported: true },
  { name: 'ROUND', category: 'Math & Trigonometry', description: 'Rounds a number to a specified number of digits.', syntax: 'ROUND(number, num_digits)', supported: true },
  { name: 'ROUNDUP', category: 'Math & Trigonometry', description: 'Rounds a number up, away from zero.', syntax: 'ROUNDUP(number, num_digits)', supported: true },
  { name: 'ROUNDDOWN', category: 'Math & Trigonometry', description: 'Rounds a number down, toward zero.', syntax: 'ROUNDDOWN(number, num_digits)', supported: true },
  { name: 'POWER', category: 'Math & Trigonometry', description: 'Returns the result of a number raised to a power.', syntax: 'POWER(number, power)', supported: true },
  { name: 'DATE', category: 'Date & Time', description: 'Returns the serial number of a particular date.', syntax: 'DATE(year, month, day)', supported: true },
  { name: 'TODAY', category: 'Date & Time', description: 'Returns the current date.', syntax: 'TODAY()', supported: true },
  { name: 'NOW', category: 'Date & Time', description: 'Returns the current date and time.', syntax: 'NOW()', supported: true },
  { name: 'YEAR', category: 'Date & Time', description: 'Returns the year of a date.', syntax: 'YEAR(date)', supported: true },
  { name: 'MONTH', category: 'Date & Time', description: 'Returns the month of a date.', syntax: 'MONTH(date)', supported: true },
  { name: 'DAY', category: 'Date & Time', description: 'Returns the day of a date.', syntax: 'DAY(date)', supported: true },
  { name: 'VLOOKUP', category: 'Lookup & Reference', description: 'Looks in the first column and returns a value in the same row.', syntax: 'VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])', supported: true },
  { name: 'HLOOKUP', category: 'Lookup & Reference', description: 'Looks in the top row and returns a value in the same column.', syntax: 'HLOOKUP(lookup_value, table_array, row_index_num, [range_lookup])', supported: true },
  { name: 'XLOOKUP', category: 'Lookup & Reference', description: 'Searches a range and returns an item corresponding to the match.', syntax: 'XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found])', supported: true },
  { name: 'INDEX', category: 'Lookup & Reference', description: 'Returns a value from a table given row and column numbers.', syntax: 'INDEX(array, row_num, [column_num])', supported: true },
  { name: 'MATCH', category: 'Lookup & Reference', description: 'Returns the relative position of an item in a range.', syntax: 'MATCH(lookup_value, lookup_array, [match_type])', supported: true },
];

export const SHEET_FUNCTION_CATEGORIES: SheetFunctionCategory[] = [
  'Math & Trigonometry',
  'Statistical',
  'Logical',
  'Text',
  'Date & Time',
  'Lookup & Reference',
  'Information',
];

export function getSheetFunction(name: string): SheetFunctionDefinition | undefined {
  return SHEET_FUNCTION_REGISTRY.find((f) => f.name === name.toUpperCase());
}

export function searchSheetFunctions(query: string, category?: SheetFunctionCategory): SheetFunctionDefinition[] {
  const q = query.trim().toLowerCase();
  return SHEET_FUNCTION_REGISTRY.filter((f) => {
    if (category && f.category !== category) return false;
    if (!q) return true;
    return f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q);
  });
}

export function isSupportedFunctionName(name: string): boolean {
  return !!getSheetFunction(name);
}
