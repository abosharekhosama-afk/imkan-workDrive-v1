export type CodedErrorPayload = {
  statusCode: number;
  code: string;
  message: string;
}

/**
 * Error codes surfaced by the Team Folder membership workflow so clients can
 * render precise localized feedback instead of a generic failure banner
 * ("تعذر إكمال الطلب").
 */
export const TEAM_FOLDER_ERROR_CODES = {
  FOLDER_NOT_FOUND: 'FOLDER_NOT_FOUND',
  MEMBER_ALREADY_EXISTS: 'MEMBER_ALREADY_EXISTS',
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_NOT_IN_ORGANIZATION: 'USER_NOT_IN_ORGANIZATION',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  ROLE_ASSIGNMENT_FORBIDDEN: 'ROLE_ASSIGNMENT_FORBIDDEN',
  LAST_FOLDER_ADMIN: 'LAST_FOLDER_ADMIN',
} as const;

export const TEAM_FOLDER_ERRORS: Record<
  keyof typeof TEAM_FOLDER_ERROR_CODES,
  CodedErrorPayload
> = {
  FOLDER_NOT_FOUND: {
    statusCode: 404,
    code: 'FOLDER_NOT_FOUND',
    message: 'Team Folder not found',
  },
  MEMBER_ALREADY_EXISTS: {
    statusCode: 409,
    code: 'MEMBER_ALREADY_EXISTS',
    message: 'Member already exists',
  },
  MEMBER_NOT_FOUND: {
    statusCode: 404,
    code: 'MEMBER_NOT_FOUND',
    message: 'Member not found',
  },
  USER_NOT_FOUND: {
    statusCode: 404,
    code: 'USER_NOT_FOUND',
    message: 'User not found',
  },
  USER_NOT_IN_ORGANIZATION: {
    statusCode: 404,
    code: 'USER_NOT_IN_ORGANIZATION',
    message: 'User not found in this organization',
  },
  INSUFFICIENT_PERMISSIONS: {
    statusCode: 403,
    code: 'INSUFFICIENT_PERMISSIONS',
    message: 'Not allowed to manage members',
  },
  ROLE_ASSIGNMENT_FORBIDDEN: {
    statusCode: 400,
    code: 'ROLE_ASSIGNMENT_FORBIDDEN',
    message: 'Not allowed to assign this role',
  },
  LAST_FOLDER_ADMIN: {
    statusCode: 400,
    code: 'LAST_FOLDER_ADMIN',
    message: 'Cannot remove the last Team Folder ADMIN',
  },
};

/** True for Prisma unique-constraint violations (duplicate memberships). */
export function isPrismaUniqueConstraintError(
  error: unknown,
): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}