import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolve, sep } from 'node:path';
import coverage from 'istanbul-lib-coverage';

/**
 * #151 directory gates. Each directory's thresholds are its own measured coverage on main,
 * floored, and never below the global thresholds (coverage-thresholds.json `directories`).
 */
export const CONTRACTS_DIR = 'packages/contracts/src';
export const CONTRACTS_REPORT = 'contracts-coverage-final.json';
/** Jest layers that also instrument the contracts they import (coverage-config.cjs). */
export const CONTRACTS_LAYERS = ['tests/unit', 'app/renderer', 'tests/integration'];

const inside = (file, directory, root) =>
  resolve(root, file).startsWith(resolve(root, directory) + sep);

/** Splits a Jest coverage-final report into product entries and contracts entries. */
export function splitContracts(report, root = '.') {
  const product = {};
  const contracts = {};
  for (const [file, value] of Object.entries(report)) {
    (inside(file, CONTRACTS_DIR, root) ? contracts : product)[file] = value;
  }
  return { product, contracts };
}

/** Moves the contracts entries of a layer's coverage-final.json into contracts-coverage-final.json. */
export function separateLayerContracts(directory, root = '.') {
  const path = resolve(root, directory, 'coverage/coverage-final.json');
  const { product, contracts } = splitContracts(JSON.parse(readFileSync(path, 'utf8')), root);
  writeFileSync(path, JSON.stringify(product));
  writeFileSync(resolve(root, directory, 'coverage', CONTRACTS_REPORT), JSON.stringify(contracts));
  return Object.keys(contracts).length;
}

/** Merged contracts coverage of the unit, component and integration layers. */
export function contractsCoverageMap(root = '.') {
  const map = coverage.createCoverageMap({});
  for (const directory of CONTRACTS_LAYERS) {
    const path = resolve(root, directory, 'coverage', CONTRACTS_REPORT);
    if (!existsSync(path)) throw new Error(`Missing contracts coverage: ${path}`);
    const report = JSON.parse(readFileSync(path, 'utf8'));
    if (!Object.keys(report).length) throw new Error(`Empty contracts coverage: ${path}`);
    map.merge(report);
  }
  const reported = new Set(map.files().map((file) => resolve(root, file)));
  const missing = contractsSources(root).filter((file) => !reported.has(file));
  if (missing.length)
    throw new Error(`Contracts sources missing from coverage: ${missing.join(', ')}`);
  return map;
}

/** Every contracts TypeScript source (no declarations), absolute paths. */
export function contractsSources(root = '.') {
  const walk = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
    );
  return walk(resolve(root, CONTRACTS_DIR))
    .filter((file) => file.endsWith('.ts') && !/\.(?:spec|test|d)\.ts$/.test(file))
    .sort();
}

/** istanbul summary of the files of `map` inside `directory`. */
export function directorySummary(map, directory, root = '.') {
  const summary = coverage.createCoverageSummary();
  const files = map.files().filter((file) => inside(file, directory, root));
  for (const file of files) summary.merge(map.fileCoverageFor(file).toSummary());
  return { files: files.length, ...summary.toJSON() };
}
