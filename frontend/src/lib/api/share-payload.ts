export type CreateShareBody = {
  resource_type: "FILE" | "FOLDER";
  resource_id: string;
  expires_at?: string;
  password?: string;
  can_download: boolean;
  recipient_user_ids?: string[];
  permission?: "VIEW" | "COMMENT" | "EDIT" | "ORGANIZE" | "FULL_ACCESS";
  email_recipients?: string[];
  download_limit?: number;
  request_user_data?: string[];
};

export function buildCreateShareBody(input: {
  resourceType: "FILE" | "FOLDER";
  resourceId: string;
  expiresAt?: string;
  password?: string;
  canDownload: boolean;
  recipientUserIds?: string[];
  permission?: "VIEW" | "COMMENT" | "EDIT" | "ORGANIZE" | "FULL_ACCESS";
  emailRecipients?: string[];
  downloadLimit?: number;
  requestUserData?: string[];
}): CreateShareBody {
  const body: CreateShareBody = {
    resource_type: input.resourceType,
    resource_id: input.resourceId,
    can_download: input.canDownload,
    ...(input.recipientUserIds?.length ? { recipient_user_ids: input.recipientUserIds } : {}),
    ...(input.permission ? { permission: input.permission } : {}),
    ...(input.emailRecipients?.length ? { email_recipients: input.emailRecipients } : {}),
    ...(input.downloadLimit ? { download_limit: input.downloadLimit } : {}),
    ...(input.requestUserData?.length ? { request_user_data: input.requestUserData } : {}),
  };
  if (input.expiresAt) {
    body.expires_at = input.expiresAt;
  }
  if (input.password) {
    body.password = input.password;
  }
  return body;
}
