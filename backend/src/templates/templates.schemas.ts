import { BadRequestException } from '@nestjs/common';
import { TemplateLibraryType, TemplateType, TemplateVariableType } from '@prisma/client';

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


const VARIABLE_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

export function parseTemplateVariable(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = stringValue(b.name, 'name', 64);
  if (!VARIABLE_NAME.test(name)) throw new BadRequestException('Variable name must start with a letter and contain only letters, numbers, dots, underscores or hyphens');
  const type = String(b.type ?? 'TEXT').toUpperCase() as TemplateVariableType;
  if (!Object.values(TemplateVariableType).includes(type)) throw new BadRequestException('Invalid variable type');
  const options = Array.isArray(b.options) ? b.options.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, 100) : undefined;
  if (type === TemplateVariableType.CHOICE && (!options || options.length === 0)) throw new BadRequestException('Choice variables require options');
  return {
    name,
    label: stringValue(b.label ?? name, 'label', 120),
    type,
    defaultValue: b.defaultValue === null || b.defaultValue === undefined ? null : String(b.defaultValue).slice(0, 4000),
    required: Boolean(b.required),
    description: typeof b.description === 'string' ? b.description.trim().slice(0, 2000) : null,
    options: options ?? undefined,
    format: typeof b.format === 'string' ? b.format.trim().slice(0, 120) : null,
    position: Number.isFinite(Number(b.position)) ? Math.max(0, Math.min(10000, Number(b.position))) : 0,
  };
}

export type TemplateBuilderConfig = {
  version: 1;
  fields: Array<Record<string, unknown>>;
  sections: Array<Record<string, unknown>>;
  tables: Array<Record<string, unknown>>;
  images: Array<Record<string, unknown>>;
  branding: Record<string, unknown>;
  header: Record<string, unknown>;
  footer: Record<string, unknown>;
  rules: Array<Record<string, unknown>>;
  preview: Record<string, unknown>;
};

const BUILDER_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

function cleanBuilderId(value: unknown, fallback: string) {
  const id = typeof value === 'string' && BUILDER_ID.test(value) ? value : fallback;
  return id;
}

function cleanRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanList(value: unknown, max: number) {
  return Array.isArray(value) ? value.slice(0, max).map(cleanRecord) : [];
}

export function defaultTemplateBuilderConfig(): TemplateBuilderConfig {
  return {
    version: 1,
    fields: [],
    sections: [],
    tables: [],
    images: [],
    branding: { companyName: '', logoFileId: '', primaryColor: '', secondaryColor: '', fontFamily: '' },
    header: { enabled: false, content: '', align: 'left' },
    footer: { enabled: false, content: '', align: 'left' },
    rules: [],
    preview: { mode: 'DESKTOP' },
  };
}

export function parseTemplateBuilder(body: unknown): TemplateBuilderConfig {
  const b = cleanRecord(body);
  const base = defaultTemplateBuilderConfig();
  const fields = cleanList(b.fields, 500).map((item, index) => ({
    ...item,
    id: cleanBuilderId(item.id, `field-${index + 1}`),
    kind: typeof item.kind === 'string' ? item.kind.slice(0, 40) : 'text',
    label: typeof item.label === 'string' ? item.label.trim().slice(0, 160) : '',
    variableId: typeof item.variableId === 'string' ? item.variableId : null,
    sectionId: typeof item.sectionId === 'string' ? item.sectionId : null,
    required: Boolean(item.required),
    position: Number.isFinite(Number(item.position)) ? Math.max(0, Math.min(10000, Number(item.position))) : index,
  }));
  const sections = cleanList(b.sections, 100).map((item, index) => ({
    ...item,
    id: cleanBuilderId(item.id, `section-${index + 1}`),
    name: typeof item.name === 'string' ? item.name.trim().slice(0, 160) : `Section ${index + 1}`,
    description: typeof item.description === 'string' ? item.description.slice(0, 1000) : '',
    layout: ['single', 'two-column', 'three-column'].includes(String(item.layout)) ? item.layout : 'single',
    position: Number.isFinite(Number(item.position)) ? Math.max(0, Math.min(10000, Number(item.position))) : index,
  }));
  const tables = cleanList(b.tables, 100).map((item, index) => ({
    ...item,
    id: cleanBuilderId(item.id, `table-${index + 1}`),
    name: typeof item.name === 'string' ? item.name.trim().slice(0, 160) : `Table ${index + 1}`,
    columns: Array.isArray(item.columns) ? item.columns.slice(0, 50).map((column, cIndex) => {
      const c = cleanRecord(column);
      return { ...c, id: cleanBuilderId(c.id, `column-${index + 1}-${cIndex + 1}`), label: typeof c.label === 'string' ? c.label.slice(0, 120) : `Column ${cIndex + 1}`, variableId: typeof c.variableId === 'string' ? c.variableId : null, type: typeof c.type === 'string' ? c.type.slice(0, 40) : 'TEXT' };
    }) : [],
    position: Number.isFinite(Number(item.position)) ? Math.max(0, Math.min(10000, Number(item.position))) : index,
  }));
  const images = cleanList(b.images, 100).map((item, index) => ({
    ...item,
    id: cleanBuilderId(item.id, `image-${index + 1}`),
    name: typeof item.name === 'string' ? item.name.trim().slice(0, 160) : `Image ${index + 1}`,
    sourceType: ['URL', 'FILE', 'VARIABLE'].includes(String(item.sourceType)) ? item.sourceType : 'URL',
    source: typeof item.source === 'string' ? item.source.slice(0, 2000) : '',
    alt: typeof item.alt === 'string' ? item.alt.slice(0, 500) : '',
    position: Number.isFinite(Number(item.position)) ? Math.max(0, Math.min(10000, Number(item.position))) : index,
  }));
  const branding = cleanRecord(b.branding);
  const header = cleanRecord(b.header);
  const footer = cleanRecord(b.footer);
  const preview = cleanRecord(b.preview);
  return {
    version: 1,
    fields,
    sections,
    tables,
    images,
    branding: { ...base.branding, ...branding, companyName: typeof branding.companyName === 'string' ? branding.companyName.slice(0, 160) : '', logoFileId: typeof branding.logoFileId === 'string' ? branding.logoFileId.slice(0, 128) : '', primaryColor: typeof branding.primaryColor === 'string' ? branding.primaryColor.slice(0, 32) : '', secondaryColor: typeof branding.secondaryColor === 'string' ? branding.secondaryColor.slice(0, 32) : '', fontFamily: typeof branding.fontFamily === 'string' ? branding.fontFamily.slice(0, 120) : '' },
    header: { ...base.header, ...header, enabled: Boolean(header.enabled), content: typeof header.content === 'string' ? header.content.slice(0, 4000) : '', align: ['left', 'center', 'right'].includes(String(header.align)) ? header.align : 'left' },
    footer: { ...base.footer, ...footer, enabled: Boolean(footer.enabled), content: typeof footer.content === 'string' ? footer.content.slice(0, 4000) : '', align: ['left', 'center', 'right'].includes(String(footer.align)) ? footer.align : 'left' },
    rules: cleanList(b.rules, 200).map((item, index) => ({ ...item, id: cleanBuilderId(item.id, `rule-${index + 1}`), name: typeof item.name === 'string' ? item.name.slice(0, 160) : `Rule ${index + 1}`, when: cleanRecord(item.when), action: cleanRecord(item.action) })),
    preview: { ...base.preview, ...preview, mode: ['DESKTOP', 'TABLET', 'MOBILE'].includes(String(preview.mode)) ? preview.mode : 'DESKTOP' },
  };
}
