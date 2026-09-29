export const OTP_LENGTH = 6;

export function emptyOtpDigits(length = OTP_LENGTH): string[] {
  return Array.from({ length }, () => "");
}

export function otpValue(digits: string[]): string {
  return digits.join("");
}

export function applyOtpInput(digits: string[], index: number, raw: string): { digits: string[]; focus: number } {
  const cleaned = raw.replace(/\D/g, "");
  const next = [...digits];
  if (!cleaned) {
    next[index] = "";
    return { digits: next, focus: index };
  }
  let cursor = index;
  for (const char of cleaned) {
    if (cursor >= next.length) break;
    next[cursor] = char;
    cursor += 1;
  }
  return { digits: next, focus: Math.min(cursor, next.length - 1) };
}

export function clearOtpDigit(digits: string[], index: number): { digits: string[]; focus: number } {
  const next = [...digits];
  if (next[index]) {
    next[index] = "";
    return { digits: next, focus: index };
  }
  const focus = Math.max(0, index - 1);
  next[focus] = "";
  return { digits: next, focus };
}
