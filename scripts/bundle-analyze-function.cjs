#!/usr/bin/env node
// Rebuilds supabase/functions/analyze-realtor-build/deploy.bundle.ts from its sources.
//
// The bundle is the single-file form of the analyze-realtor-build Edge Function (used for
// single-file deploys and by the regression suite, which executes it). Each local module is
// embedded verbatim, with `export ` removed, inside its own scope; index.ts follows with its
// local imports replaced by those scopes. Never edit the bundle by hand:
//   node scripts/bundle-analyze-function.cjs          # write
//   node scripts/bundle-analyze-function.cjs --check  # exit 1 when the bundle is stale
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../supabase/functions/analyze-realtor-build');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

/** Import statements of a module, in order: { names, types, from, text }. */
function imports(source) {
  const rows = [];
  for (const match of source.matchAll(/^import\s+(type\s+)?(?:\{([^}]*)\}|([\w$]+))\s+from\s+["']([^"']+)["'];\r?\n/gm)) {
    const allTypes = Boolean(match[1]);
    const names = [], types = [];
    for (const raw of (match[2] ?? match[3] ?? '').split(',').map(item => item.trim()).filter(Boolean)) {
      const type = allTypes || /^type\s/.test(raw);
      (type ? types : names).push(raw.replace(/^type\s+/, ''));
    }
    rows.push({ names, types, from: match[4], text: match[0] });
  }
  return rows;
}

/** Top-level exported type/interface declarations of a module, keyed by name. */
function typeDeclarations(source) {
  const found = new Map();
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^export (type|interface) ([A-Za-z_$][\w$]*)/);
    if (!head) continue;
    let depth = 0, end = i;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j].replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""')) {
        if ('{(['.includes(ch)) depth++;
        else if ('})]'.includes(ch)) depth--;
      }
      end = j;
      if (depth <= 0 && (head[1] === 'interface' ? /}\s*$/.test(lines[j]) : /;\s*$/.test(lines[j]))) break;
    }
    found.set(head[2], lines.slice(i, end + 1).join('\n').replace(/^export /, ''));
    i = end;
  }
  return found;
}

function build() {
  const index = read('index.ts');
  const external = [];
  const modules = new Map(); // local file -> { names:Set, types:Set }
  const want = (file, row) => {
    const entry = modules.get(file) ?? { names: new Set(), types: new Set() };
    row.names.forEach(name => entry.names.add(name));
    row.types.forEach(name => entry.types.add(name));
    modules.set(file, entry);
  };
  for (const row of imports(index)) {
    if (row.from.startsWith('./')) want(row.from.slice(2), row);
    else external.push(row.text.trimEnd());
  }
  // Types the embedded modules import from each other are also hoisted to the top level.
  for (const file of modules.keys()) {
    for (const row of imports(read(file))) {
      if (!row.from.startsWith('./')) throw new Error(`${file} imports ${row.from}; only local modules can be embedded`);
      if (row.names.length) throw new Error(`${file} imports values from ${row.from}; embed order would be ambiguous`);
      want(row.from.slice(2), { names: [], types: row.types });
    }
  }
  // Hoist requested types with the declarations they reference, in source order.
  const hoisted = [];
  for (const [file, entry] of modules) {
    const declarations = typeDeclarations(read(file));
    const pending = [...entry.types];
    const chosen = new Set();
    while (pending.length) {
      const name = pending.pop();
      if (chosen.has(name)) continue;
      const text = declarations.get(name);
      if (!text) throw new Error(`${file} does not export type ${name}`);
      chosen.add(name);
      for (const [other] of declarations) if (!chosen.has(other) && new RegExp(`\\b${other}\\b`).test(text)) pending.push(other);
    }
    for (const [name, text] of declarations) if (chosen.has(name)) hoisted.push(text);
  }
  const scopes = [...modules].filter(([, entry]) => entry.names.size).map(([file, entry]) => {
    const names = [...entry.names].join(', ');
    let body = read(file);
    for (const row of imports(body)) body = body.replace(row.text, '');
    body = body.replace(/^export /gm, '').replace(/\s+$/, '\n');
    return `const { ${names} } = (() => {\n${body}return { ${names} };\n})();\n`;
  });
  let body = index;
  for (const row of imports(index)) body = body.replace(row.text, '');
  body = body.replace(/^\s+/, '');
  return `${external.join('\n')}\n\n${hoisted.join('\n')}\n${scopes.join('\n')}\n${body}`;
}

if (require.main === module) {
  const target = path.join(root, 'deploy.bundle.ts');
  const next = build();
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(target, 'utf8') !== next) {
      console.error('deploy.bundle.ts is stale. Run: node scripts/bundle-analyze-function.cjs');
      process.exit(1);
    }
  } else fs.writeFileSync(target, next);
}

module.exports = { build };
