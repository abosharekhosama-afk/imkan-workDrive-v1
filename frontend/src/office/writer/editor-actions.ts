const ARABIC_TO_LATIN: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z',
  'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w',
  'ي': 'y', 'ى': 'a', 'ة': 'h', 'ء': '', 'َ': 'a', 'ُ': 'u', 'ِ': 'i', 'ّ': '', 'ْ': '',
};

const LATIN_TO_ARABIC: Array<[string, string]> = [
  ['sh', 'ش'], ['kh', 'خ'], ['th', 'ث'], ['dh', 'ذ'], ['gh', 'غ'], ['aa', 'ا'],
  ['a', 'ا'], ['b', 'ب'], ['t', 'ت'], ['j', 'ج'], ['h', 'ح'], ['d', 'د'], ['r', 'ر'], ['z', 'ز'],
  ['s', 'س'], ['f', 'ف'], ['q', 'ق'], ['k', 'ك'], ['l', 'ل'], ['m', 'م'], ['n', 'ن'], ['w', 'و'],
  ['y', 'ي'], ['i', 'ي'], ['u', 'و'], ['e', 'ي'], ['o', 'و'],
];

const BUILTIN_CORRECTIONS: Record<string, string> = {
  teh: 'the', recieve: 'receive', seperate: 'separate', occuring: 'occurring', definately: 'definitely',
  adress: 'address', wich: 'which', becuase: 'because',
};

export function transliterateText(text: string): string {
  if (/[\u0600-\u06FF]/.test(text)) return [...text].map((char) => ARABIC_TO_LATIN[char] ?? char).join('');
  let index = 0;
  let output = '';
  while (index < text.length) {
    const rest = text.slice(index).toLowerCase();
    const match = LATIN_TO_ARABIC.find(([key]) => rest.startsWith(key));
    if (match && /[a-z]/i.test(text[index])) {
      output += match[1];
      index += match[0].length;
    } else {
      output += text[index];
      index += 1;
    }
  }
  return output;
}

export function splitTextToTable(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((line) => line.trimEnd()).filter((line) => line.length > 0);
  if (!lines.length) return [['']];
  const delimiter = lines.some((line) => line.includes('\t')) ? '\t' : lines.some((line) => line.includes(',')) ? ',' : '';
  if (!delimiter) return lines.map((line) => [line]);
  const rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
  const width = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => {
    const next = row.slice();
    while (next.length < width) next.push('');
    return next;
  });
}

export function applyAutocorrect(text: string, extra: Record<string, string> = {}): string {
  const map = { ...BUILTIN_CORRECTIONS, ...extra };
  return text.replace(/[^\s]+/g, (word) => (Object.prototype.hasOwnProperty.call(map, word.toLowerCase()) ? map[word.toLowerCase()] : word));
}

export function replacePlainRange(text: string, start: number, end: number, replacement: string): string {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  return text.slice(0, from) + replacement + text.slice(to);
}
