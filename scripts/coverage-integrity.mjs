import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
const { instrumentSource } = createRequire(import.meta.url)('./original-source-instrument.cjs');
const originalMetadataCache = new Map();
import { productSourcePaths } from './product-sources.mjs';

export const layerOwners = { unit: 'main', component: 'renderer', integration: 'main' };

export const reportFingerprint = (report) =>
  createHash('sha256').update(JSON.stringify(report)).digest('hex');

export function productInventory(root = '.') {
  return Object.fromEntries(
    productSourcePaths(root).map((file) => {
      const content = readFileSync(file);
      const tree = ts.createSourceFile(file, content.toString(), ts.ScriptTarget.Latest, true);
      let functions = 0;
      let initialized = tree.statements.some(
        (node) =>
          !node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword) &&
          (ts.isExpressionStatement(node) ||
            ts.isEnumDeclaration(node) ||
            ts.isClassDeclaration(node) ||
            ts.isVariableStatement(node)),
      );
      function visit(node) {
        if (ts.isFunctionLike(node) && node.body) functions++;
        if ((ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) && node.initializer)
          initialized = true;
        if (ts.isClassStaticBlockDeclaration(node)) initialized = true;
        ts.forEachChild(node, visit);
      }
      visit(tree);
      return [
        file,
        {
          sha256: createHash('sha256').update(content).digest('hex'),
          functions,
          requiresCounters: functions > 0 || initialized,
        },
      ];
    }),
  );
}

export function validateLayerCoverage(layer, report, evidence, inventory, root = '.') {
  const owner = layerOwners[layer];
  if (!owner || evidence?.schema !== 1 || evidence.layer !== layer || evidence.owner !== owner)
    throw new Error(`Invalid coverage scope or evidence: ${layer}`);
  if (evidence.reportSha256 !== reportFingerprint(report))
    throw new Error(`Coverage report changed after collection: ${layer}`);
  if (JSON.stringify(evidence.sources) !== JSON.stringify(inventory))
    throw new Error(`Stale or incomplete product source inventory: ${layer}`);
  const owned = Object.keys(inventory).filter((file) =>
    file.startsWith(resolve(root, `app/${owner}/src`) + sep),
  );
  if (!Object.keys(report).length) throw new Error(`Empty coverage: ${layer}`);
  const reported = new Map(Object.entries(report).map(([file, value]) => [resolve(file), value]));
  for (const [file, counters] of reported) {
    if (!counters?.path || resolve(counters.path) !== file)
      throw new Error(`Inconsistent coverage source path: ${file}`);
    if (!owned.includes(file)) throw new Error(`Wrong source scope in ${layer}: ${file}`);
  }
  for (const file of owned) {
    const source = inventory[file];
    const counters = reported.get(file);
    if (source.requiresCounters && !counters)
      throw new Error(`Executable product source missing from ${layer}: ${file}`);
    if (source.functions > Object.keys(counters?.fnMap ?? {}).length)
      throw new Error(`Real source functions not instrumented in ${layer}: ${file}`);
  }
  validateOriginalCoverage(
    report,
    originalSourceMetadata(Object.fromEntries(owned.map((file) => [file, inventory[file]]))),
  );
}

/** Preserve every original AST obligation; runtime counters may only add actual nonnegative hits. */
export function validateOriginalCoverage(report, metadata) {
  for (const [file, counters] of Object.entries(report)) {
    const original = metadata[file];
    if (!original || counters.path !== file)
      throw new Error(`Unknown original coverage path: ${file}`);
    for (const key of ['statementMap', 'fnMap', 'branchMap']) {
      if (JSON.stringify(counters[key]) !== JSON.stringify(original[key]))
        throw new Error(`Original coverage metadata changed (${key}): ${file}`);
    }
    for (const key of ['s', 'f', 'b']) {
      if (
        JSON.stringify(Object.keys(counters[key] ?? {})) !==
        JSON.stringify(Object.keys(original[key]))
      )
        throw new Error(`Original counter inventory changed (${key}): ${file}`);
      for (const [id, hits] of Object.entries(counters[key])) {
        const values = key === 'b' ? hits : [hits];
        if (
          !Array.isArray(values) ||
          (key === 'b' && values.length !== original.b[id].length) ||
          values.some((hit) => !Number.isSafeInteger(hit) || hit < 0)
        )
          throw new Error(`Invalid original execution counter (${key}.${id}): ${file}`);
      }
    }
  }
}

/** Derive metadata from current original source bytes; cached entries are keyed by source fingerprint. */
export function originalSourceMetadata(inventory) {
  const metadata = {};
  for (const [file, source] of Object.entries(inventory)) {
    const key = `${file}:${source.sha256}`;
    if (!originalMetadataCache.has(key))
      originalMetadataCache.set(key, instrumentSource(readFileSync(file, 'utf8'), file).metadata);
    metadata[file] = originalMetadataCache.get(key);
  }
  return metadata;
}
