export type MentionMember = { id: string; name: string | null; email: string };

export function mentionedMemberIds(body: string, members: MentionMember[]): string[] {
  const lower = body.toLowerCase();
  const ids = new Set<string>();
  for (const member of members) {
    const name = member.name?.trim();
    if (name && lower.includes(`@${name.toLowerCase()}`)) ids.add(member.id);
    if (member.email && lower.includes(`@${member.email.toLowerCase()}`)) ids.add(member.id);
  }
  return [...ids];
}

export function threadRootId(comment: { id: string; parentId: string | null }): string {
  return comment.parentId ?? comment.id;
}
