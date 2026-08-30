import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface ColumnRow {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_DEFAULT: string | null;
  COLUMN_KEY: string;
  EXTRA: string;
}

interface IndexRow {
  TABLE_NAME: string;
  INDEX_NAME: string;
  NON_UNIQUE: number | bigint;
  SEQ: number | bigint;
  COLUMN_NAME: string;
}

async function main(): Promise<void> {
  const columns = await prisma.$queryRaw<ColumnRow[]>`
    SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME, ORDINAL_POSITION`;

  const foreignKeys = await prisma.$queryRaw<
    Array<{
      TABLE_NAME: string;
      COLUMN_NAME: string;
      REFERENCED_TABLE: string;
      REFERENCED_COLUMN: string;
      DELETE_RULE: string;
      UPDATE_RULE: string;
    }>
  >`
    SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME,
           kcu.REFERENCED_TABLE_NAME AS REFERENCED_TABLE,
           kcu.REFERENCED_COLUMN_NAME AS REFERENCED_COLUMN,
           rc.DELETE_RULE, rc.UPDATE_RULE
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
      ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
    WHERE kcu.TABLE_SCHEMA = DATABASE()
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME`;

  const indexes = await prisma.$queryRaw<IndexRow[]>`
    SELECT s.TABLE_NAME, s.INDEX_NAME, s.NON_UNIQUE, s.SEQ_IN_INDEX AS SEQ, s.COLUMN_NAME
    FROM INFORMATION_SCHEMA.STATISTICS s
    WHERE s.TABLE_SCHEMA = DATABASE()
    ORDER BY s.TABLE_NAME, s.INDEX_NAME, s.SEQ_IN_INDEX`;

  const tables = [...new Set(columns.map((c) => c.TABLE_NAME))].sort();
  const lines: string[] = [];
  lines.push(`# workdrive_dev inspection (${new Date().toISOString()})`);
  lines.push('');
  lines.push(`TABLE COUNT: ${tables.length}`);
  lines.push('');

  for (const table of tables) {
    const cols = columns.filter((c) => c.TABLE_NAME === table);
    lines.push(`## ${table}`);
    lines.push('');
    lines.push('| column | type | nullable | default | key | extra |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const col of cols) {
      lines.push(
        `| ${col.COLUMN_NAME} | ${col.COLUMN_TYPE} | ${col.IS_NULLABLE} | ${col.COLUMN_DEFAULT ?? '-'} | ${col.COLUMN_KEY} | ${col.EXTRA} |`,
      );
    }

    const pkCols = cols.filter((c) => c.COLUMN_KEY === 'PRI').map((c) => c.COLUMN_NAME);
    if (pkCols.length > 0) lines.push(`- PRIMARY KEY: (${pkCols.join(', ')})`);

    const tableFks = foreignKeys.filter((f) => f.TABLE_NAME === table);
    for (const fk of tableFks) {
      lines.push(
        `- FK ${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE}.${fk.REFERENCED_COLUMN} (ON DELETE ${fk.DELETE_RULE}, ON UPDATE ${fk.UPDATE_RULE})`,
      );
    }

    const tableIndexes = indexes.filter((i) => i.TABLE_NAME === table);
    const grouped = new Map<string, string[]>();
    for (const idx of tableIndexes) {
      const list = grouped.get(idx.INDEX_NAME) ?? [];
      list[Number(idx.SEQ) - 1] = idx.COLUMN_NAME;
      grouped.set(idx.INDEX_NAME, list);
    }
    for (const [name, idxCols] of grouped) {
      if (name === 'PRIMARY') continue;
      const kind = Number(tableIndexes.find((i) => i.INDEX_NAME === name)?.NON_UNIQUE ?? 1) === 0 ? 'UNIQUE' : 'INDEX';
      lines.push(`- ${kind} ${name}: (${idxCols.join(', ')})`);
    }
    lines.push('');
  }

  const enumByValues = new Map<string, string[]>();
  for (const col of columns) {
    if (col.COLUMN_TYPE.startsWith('enum(')) {
      const values = col.COLUMN_TYPE.slice(5, -1).split(',').map((v) => v.replace(/'/g, ''));
      const key = JSON.stringify(values);
      enumByValues.set(key, [...(enumByValues.get(key) ?? []), `${col.TABLE_NAME}.${col.COLUMN_NAME}`]);
    }
  }
  lines.push('## Enum columns');
  lines.push('');
  let enumIndex = 1;
  for (const [values, usages] of enumByValues) {
    lines.push(`${enumIndex++}. ${usages.join(', ')}: ${values}`);
  }

  const outDir = path.resolve(__dirname, '..', '..', 'docs', 'database');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'DATABASE-V2-INSPECTION.md');
  fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
  console.log(`Wrote ${outFile}`);
  console.log(`Table count: ${tables.length}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
