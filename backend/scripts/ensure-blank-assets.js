/**
 * Nest copies src/templates/blank-assets to dist/templates/blank-assets, but
 * runtime also probes dist/src/templates/blank-assets. Mirror assets to every
 * deployment layout so blank template creation works on Render/production.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'src', 'templates', 'blank-assets');
const targets = [
  path.join(root, 'dist', 'templates', 'blank-assets'),
  path.join(root, 'dist', 'src', 'templates', 'blank-assets'),
];

if (!fs.existsSync(source)) {
  console.error(`[ensure-blank-assets] Missing source directory: ${source}`);
  process.exit(1);
}

const files = fs.readdirSync(source).filter((name) => !name.startsWith('.'));
if (files.length === 0) {
  console.error('[ensure-blank-assets] No blank asset files found.');
  process.exit(1);
}

for (const target of targets) {
  fs.mkdirSync(target, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(source, file), path.join(target, file));
  }
  console.log(`[ensure-blank-assets] Copied ${files.length} file(s) -> ${target}`);
}
