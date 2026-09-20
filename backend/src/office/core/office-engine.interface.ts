import type { AccessTokenPayload } from '../../auth/jwt.types';

export type OfficeType = 'WRITER' | 'SHEET' | 'SHOW';

export type OfficeDocumentState = {
  id: string;
  fileId: string;
  type: OfficeType;
  nativeFormat: string;
  content: unknown;
  revision: number;
  updatedAt: string;
  sourceTemplateId?: string | null;
  sourceTemplateVersionId?: string | null;
};

export interface OfficeEngine {
  open(user: AccessTokenPayload, fileId: string): Promise<OfficeDocumentState>;
  create(user: AccessTokenPayload, input: {
    name: string;
    type: OfficeType;
    folderId?: string | null;
  }): Promise<OfficeDocumentState>;
  save(user: AccessTokenPayload, fileId: string, content: unknown, expectedRevision?: number): Promise<OfficeDocumentState>;
}
