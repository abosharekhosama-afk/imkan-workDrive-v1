export type MentionMember = { userId: string; name: string | null; email: string };

export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const upto = text.slice(0, Math.max(0, caret));
  const match = upto.match(/(^|\s)@([^\s@]*)$/);
  if (!match) return null;
  const query = match[2] ?? "";
  return { start: upto.length - query.length - 1, query };
}

export function filterMentionMembers(members: MentionMember[], query: string): MentionMember[] {
  const needle = query.trim().toLowerCase();
  return members.filter((member) => {
    const name = (member.name || "").toLowerCase();
    const email = member.email.toLowerCase();
    return !needle || name.includes(needle) || email.includes(needle);
  }).slice(0, 8);
}

export function insertMention(text: string, start: number, caret: number, label: string): { text: string; caret: number } {
  const name = label.trim();
  const next = `${text.slice(0, start)}@${name} ${text.slice(caret)}`;
  return { text: next, caret: start + name.length + 2 };
}

export function visibleThreads<T extends { resolvedAt?: string | null }>(rows: T[], showResolved: boolean): T[] {
  return rows.filter((row) => showResolved ? Boolean(row.resolvedAt) : !row.resolvedAt);
}

export function commentPermalink(origin: string, fileId: string, commentId: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/files?file=${encodeURIComponent(fileId)}&comment=${encodeURIComponent(commentId)}`;
}

export function commentBodyParts(body: string, labels: string[]): Array<{ kind: "text" | "mention"; text: string }> {
  const needles = [...labels].map((label) => label.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  const parts: Array<{ kind: "text" | "mention"; text: string }> = [];
  let index = 0;
  while (index < body.length) {
    if (body[index] === "@") {
      const rest = body.slice(index + 1);
      const hit = needles.find((name) => rest.toLowerCase().startsWith(name.toLowerCase()) && (rest.length === name.length || /[\s.,!?]/.test(rest[name.length] || " ")));
      if (hit) {
        parts.push({ kind: "mention", text: body.slice(index, index + hit.length + 1) });
        index += hit.length + 1;
        continue;
      }
      const email = rest.match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      if (email) {
        parts.push({ kind: "mention", text: `@${email[0]}` });
        index += email[0].length + 1;
        continue;
      }
    }
    const next = body.indexOf("@", index + 1);
    const end = next === -1 ? body.length : next;
    parts.push({ kind: "text", text: body.slice(index, end) });
    index = end === index ? index + 1 : end;
  }
  return parts.filter((part) => part.text);
}
