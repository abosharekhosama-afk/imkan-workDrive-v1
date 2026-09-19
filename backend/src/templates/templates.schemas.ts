import { BadRequestException } from '@nestjs/common';
import { TemplateLibraryType, TemplateType } from '@prisma/client';

function stringValue(value: unknown, field: string, max = 255): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(`${field} is invalid`);
  }
  return value.trim();
}

export function parseTemplateCreate(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const type = b.type;
  if (!Object.values(TemplateType).includes(type as TemplateType)) throw new BadRequestException('Invalid template type');
  const library = b.library as TemplateLibraryType | undefined;
  if (library && !Object.values(TemplateLibraryType).includes(library)) throw new BadRequestException('Invalid template library');
  return {
    name: stringValue(b.name, 'name'),
    description: typeof b.description === 'string' ? b.description.trim().slice(0, 4000) : undefined,
    type: type as TemplateType,
    library: library ?? TemplateLibraryType.PERSONAL,
    categoryId: typeof b.categoryId === 'string' && b.categoryId ? b.categoryId : null,
  };
}

export function parseTemplateFromFile(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    fileId: stringValue(b.fileId, 'fileId', 64),
    name: stringValue(b.name, 'name'),
    description: typeof b.description === 'string' ? b.description.trim().slice(0, 4000) : undefined,
    library: (() => {
      const value = b.library ?? TemplateLibraryType.PERSONAL;
      if (!Object.values(TemplateLibraryType).includes(value as TemplateLibraryType)) {
        throw new BadRequestException('Invalid template library');
      }
      return value as TemplateLibraryType;
    })(),
    categoryId: typeof b.categoryId === 'string' && b.categoryId ? b.categoryId : null,
  };
}

export function parseTemplateUse(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    name: stringValue(b.name, 'name'),
    folderId: typeof b.folderId === 'string' && b.folderId ? b.folderId : null,
  };
}

export function parseCategory(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  return { name: stringValue(b.name, 'name', 120) };
}


export function parseTemplateUpdate(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    name: typeof b.name === 'string' ? stringValue(b.name, 'name') : undefined,
    description: typeof b.description === 'string' ? b.description.trim().slice(0, 4000) : undefined,
    categoryId: b.categoryId === null ? null : (typeof b.categoryId === 'string' && b.categoryId ? b.categoryId : undefined),
  };
}
