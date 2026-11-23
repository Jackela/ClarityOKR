/**
 * #45 automated install smoke, run against an app that a real installer just installed
 * (.github/workflows/install-smoke.yml): NSIS `/S` on Windows, dmg → copied .app on macOS,
 * `.deb` and extracted AppImage on Linux.
 *
 * The app runs as shipped: no E2E_TEST, no CI, no ELECTRON_START_URL, so the production code
 * paths decide everything (userData location, database path, renderer from app.asar). The only
 * thing the test supplies is the LLM endpoint the app already reads from the environment
 * (LLM_API_KEY / LLM_BASE_URL / LLM_MODEL), pointed at a local mock so one OKR can be created
 * through the real UI.
 *
 * Steps: fresh userData → launch → main window visible, renderer from app.asar, database opened
 * in normal mode → create one OKR → quit (exit code 0) → integrity_check = ok and the OKR row is
 * in the file → relaunch → the OKR is still listed → quit → integrity_check = ok again.
 *
 * Env:
 * - SMOKE_APP_EXECUTABLE  installed executable (required)
 * - SMOKE_USER_DATA_DIR   where the app's userData is expected (required; must not exist yet)
 * - SMOKE_EXTRA_ARGS      extra command-line switches (e.g. `--no-sandbox` for an extracted AppImage)
 * - SMOKE_ARTIFACTS_DIR   screenshots and app logs (default: test output dir)
 * - SMOKE_LABEL           name used in artifact files (e.g. `win-nsis`)
 */
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import type { MockResponseConfig } from '@clarityokr/contracts';

import { SimpleMockServer } from '../helpers/simple-mock-server';
import { ClarificationPage } from '../page-objects';

const EXECUTABLE = process.env.SMOKE_APP_EXECUTABLE ?? '';
const USER_DATA = process.env.SMOKE_USER_DATA_DIR ? resolve(process.env.SMOKE_USER_DATA_DIR) : '';
const LABEL = process.env.SMOKE_LABEL ?? process.platform;
const EXTRA_ARGS = (process.env.SMOKE_EXTRA_ARGS ?? '').split(/\s+/).filter(Boolean);
const TITLE = '安装冒烟：提高团队交付效率';
const DB_FILE = 'clarityokr.db';

/** Variables that switch the app into a test / dev mode; the smoke run must not carry them. */
const NON_PRODUCTION_ENV = /^(E2E_|CI$|NODE_ENV$|ELECTRON_START_URL$|ELECTRON_RUN_AS_NODE$|DEBUG$)/;

function artifactsDir(): string {
  const dir = process.env.SMOKE_ARTIFACTS_DIR ?? test.info().outputPath('smoke');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function productionEnv(mockUrl: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !NON_PRODUCTION_ENV.test(key)) env[key] = value;
  }
  return {
    ...env,
    LLM_API_KEY: 'install-smoke',
    LLM_BASE_URL: mockUrl,
    LLM_MODEL: 'install-smoke',
  };
}

const mockResponses: MockResponseConfig = {
  nextQuestion: (call) =>
    call <= 2
      ? {
          question: {
            id: `q${call + 1}`,
            text: '请选择下一步',
            options: [
              { id: 'a', label: 'A', value: 'a' },
              { id: 'b', label: 'B', value: 'b' },
            ],
          },
        }
      : null,
  draft: {
    draft: {
      objectives: [
        {
          id: 'o1',
          title: TITLE,
          description: '安装冒烟',
          keyResults: [
            { id: 'kr1', statement: '代码评审缩短到两天内', target: '2天', measurement: '耗时' },
            { id: 'kr2', statement: '测试覆盖率提升到 80%', target: '80%', measurement: '覆盖率' },
            { id: 'kr3', statement: '发布频率提升到每周两次', target: '2次', measurement: '次数' },
          ],
        },
      ],
    },
  },
};

interface Launched {
  app: ElectronApplication;
  main: Page;
  log: string[];
}

async function launch(mockUrl: string, run: string): Promise<Launched> {
  const app = await electron.launch({
    executablePath: EXECUTABLE,
    args: EXTRA_ARGS,
    env: productionEnv(mockUrl),
    timeout: 120_000,
  });
  const log: string[] = [];
  const logFile = join(artifactsDir(), `${LABEL}-${run}-app.log`);
  const child = app.process();
  const record = (d: Buffer): void => {
    log.push(d.toString());
    appendFileSync(logFile, d);
  };
  child.stdout?.on('data', record);
  child.stderr?.on('data', record);

  await app.firstWindow({ timeout: 120_000 });
  // the main window (the sticky note, when it opens, carries `view=sticky`)
  let main: Page | undefined;
  await expect
    .poll(
      () => {
        main = app
          .windows()
          .find((w) => w.url().startsWith('file:') && !w.url().includes('view=sticky'));
        return main !== undefined;
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await main!.waitForLoadState('domcontentloaded');
  return { app, main: main!, log };
}

/** Main-process facts a shipped build must show. */
async function expectShippedApp(launched: Launched): Promise<void> {
  const facts = await launched.app.evaluate(({ app, BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows().map((w) => ({
      url: w.webContents.getURL(),
      visible: w.isVisible(),
    }));
    return { packaged: app.isPackaged, userData: app.getPath('userData'), windows };
  });
  expect(facts.packaged, 'app.isPackaged').toBe(true);
  expect(resolve(facts.userData)).toBe(USER_DATA);
  const main = facts.windows.find((w) => !w.url.includes('view=sticky'));
  expect(main, JSON.stringify(facts.windows)).toBeDefined();
  // the renderer is the one packed into app.asar, loaded from disk
  expect(main!.url).toMatch(/^file:\/\//);
  expect(decodeURIComponent(main!.url)).toMatch(/app\.asar[\\/]/);
  await expect
    .poll(async () =>
      launched.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some(
          (w) => w.isVisible() && !w.webContents.getURL().includes('view=sticky'),
        ),
      ),
    )
    .toBe(true);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = (page: Page, channel: string, payload?: unknown): Promise<any> =>
  page.evaluate(
    ([c, p]) =>
      (
        window as unknown as { clarifyOkr: { invoke: (c: string, p: unknown) => Promise<unknown> } }
      ).clarifyOkr.invoke(c as string, p),
    [channel, payload] as const,
  );

async function listedTitles(page: Page): Promise<string[]> {
  const reply = await invoke(page, 'clarityokr:okr:list');
  expect(reply.ok, JSON.stringify(reply)).toBe(true);
  return (reply.data.items as Array<{ title: string }>).map((item) => item.title);
}

/**
 * Quits through the app's own 「退出」 (application menu, CmdOrCtrl+Q; the tray item calls the
 * same action) and waits for the process to end with exit code 0. Nothing is unsaved, so no
 * confirmation is asked. Node waits for the attached inspector before it exits, so the
 * Playwright connection is closed once the app is on its way out.
 */
async function quit(launched: Launched): Promise<void> {
  const child = launched.app.process();
  const exited = new Promise<number | null>((done) => {
    if (child.exitCode !== null) done(child.exitCode);
    else child.once('exit', (code) => done(code));
  });
  const clicked = await launched.app.evaluate(({ Menu }) => {
    interface Item {
      label: string;
      click: () => void;
      submenu?: { items: Item[] } | null;
    }
    const find = (items: Item[]): Item | null => {
      for (const item of items) {
        if (item.label === '退出') return item;
        const inner = item.submenu ? find(item.submenu.items) : null;
        if (inner) return inner;
      }
      return null;
    };
    const item = find((Menu.getApplicationMenu()?.items ?? []) as unknown as Item[]);
    // after this evaluate has answered: the click ends the process
    if (item) setTimeout(() => item.click(), 0);
    return item !== null;
  });
  expect(clicked, 'application menu has 「退出」').toBe(true);
  await expect
    .poll(
      () =>
        child.exitCode !== null ||
        launched.log.join('').includes('Waiting for the debugger to disconnect'),
      { timeout: 60_000, message: 'the app starts exiting after 「退出」' },
    )
    .toBe(true);
  await launched.app.close().catch(() => undefined);
  const code = await Promise.race([
    exited,
    new Promise<'timeout'>((done) => setTimeout(() => done('timeout'), 30_000)),
  ]);
  if (code === 'timeout') child.kill();
  expect(code, 'exit code after 「退出」').toBe(0);
}

function checkDatabase(expectTitle: boolean): void {
  const file = join(USER_DATA, DB_FILE);
  expect(existsSync(file), `${file} exists`).toBe(true);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all() as Array<Record<string, string>>;
    expect(integrity.map((row) => Object.values(row)[0])).toEqual(['ok']);
    const rows = db.prepare('SELECT title FROM objectives').all() as Array<{ title: string }>;
    expect(rows.map((r) => r.title)).toEqual(expectTitle ? [TITLE] : []);
    if (expectTitle) {
      const krs = db
        .prepare(
          'SELECT COUNT(*) AS n FROM key_results k JOIN objectives o ON o.id = k.objective_id',
        )
        .get() as { n: number };
      expect(krs.n).toBe(3);
    }
  } finally {
    db.close();
  }
}

test('installed app: fresh profile → create OKR → quit → relaunch → OKR persists', async () => {
  expect(EXECUTABLE, 'SMOKE_APP_EXECUTABLE').not.toBe('');
  expect(existsSync(EXECUTABLE), `${EXECUTABLE} exists`).toBe(true);
  expect(USER_DATA, 'SMOKE_USER_DATA_DIR').not.toBe('');
  expect(existsSync(USER_DATA), `${USER_DATA} must not exist before the first launch`).toBe(false);

  const mock = new SimpleMockServer();
  await mock.start();
  mock.setResponses(mockResponses);
  const shots = artifactsDir();
  try {
    // ---------- first launch on a fresh profile ----------
    const first = await launch(mock.getUrl(), 'first');
    try {
      await expectShippedApp(first);
      expect(await invoke(first.main, 'clarityokr:app:storage-state')).toEqual({
        storageMode: 'normal',
      });
      expect(existsSync(join(USER_DATA, DB_FILE)), 'database created in userData').toBe(true);
      const clarification = new ClarificationPage(first.main);
      await clarification.waitForReady();
      await first.main.screenshot({ path: join(shots, `${LABEL}-1-first-launch.png`) });

      await clarification.completeClarificationFlow('提高团队交付效率', {
        questionCount: 2,
        selectOptionIndex: 0,
        finalOptionIndex: 1,
      });
      await clarification.waitForOkrSummary(60_000).catch(async (error: unknown) => {
        await first.main.screenshot({ path: join(shots, `${LABEL}-okr-summary-missing.png`) });
        console.log(
          '[install-smoke] mock requests:',
          JSON.stringify(mock.getRequestLog().map((r) => r.url)),
        );
        throw error;
      });
      await expect.poll(() => listedTitles(first.main)).toEqual([TITLE]);
      await first.main.screenshot({ path: join(shots, `${LABEL}-2-okr-created.png`) });
    } finally {
      await quit(first);
    }
    checkDatabase(true);

    // ---------- relaunch on the same profile ----------
    const second = await launch(mock.getUrl(), 'second');
    try {
      await expectShippedApp(second);
      expect(await invoke(second.main, 'clarityokr:app:storage-state')).toEqual({
        storageMode: 'normal',
      });
      await expect.poll(() => listedTitles(second.main)).toEqual([TITLE]);
      await second.main.screenshot({ path: join(shots, `${LABEL}-3-relaunch.png`) });
    } finally {
      await quit(second);
    }
    checkDatabase(true);
  } finally {
    await mock.stop();
  }
});
