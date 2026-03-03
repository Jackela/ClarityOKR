import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(currentDir, '../../');
export const MAIN_DIST = path.join(ROOT, 'app/main/dist/main.js');
export const RENDERER_DIST = path.join(ROOT, 'app/renderer/dist/index.html');
export const SESSION_PERSIST_PATH = path.join(ROOT, 'data', 'clarification-session.json');
export const OKR_PERSIST_PATH = path.join(ROOT, 'data', 'okr-document.json');

let buildChecked = false;

export function ensureBuildArtifacts(): void {
  if (buildChecked) {
    return;
  }

  const needsBuild = !existsSync(MAIN_DIST) || !existsSync(RENDERER_DIST);
  if (needsBuild) {
    // eslint-disable-next-line no-console
    console.log('[build-check] Building project...');
    execSync('pnpm run build', { cwd: ROOT, stdio: 'inherit' });
  } else {
    // eslint-disable-next-line no-console
    console.log('[build-check] Build artifacts already exist, skipping build');
  }
  buildChecked = true;
}

export function extraElectronArgs(): string[] {
  const raw = process.env.ELECTRON_EXTRA_LAUNCH_ARGS || '';
  return raw.trim() ? raw.trim().split(/\s+/) : [];
}

export function getElectronEnv(mockServerUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    LLM_API_KEY: 'test',
    LLM_BASE_URL: mockServerUrl,
    LLM_MODEL: 'test',
  };
}
