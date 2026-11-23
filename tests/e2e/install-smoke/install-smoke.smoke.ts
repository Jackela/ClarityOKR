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
 * in normal mode → create one OKR → quit via 「退出」 (exit code 0) → integrity_check = ok and the
 * OKR row is in the file → relaunch → the OKR is still listed → quit via an outside `app.quit()`
 * (what the Dock 「退出」 / log out do, #199; exit code 0) → integrity_check = ok again.
 * Also: two progress updates and a review survive the restart (history included), the sticky
 * note opens with its sandboxed preload and its always-on-top switch works, and a value encrypted
 * with safeStorage (DPAPI / Keychain / libsecret) on the first launch decrypts on the second.
 *
 * Env:
 * - SMOKE_APP_EXECUTABLE  installed executable (required)
 * - SMOKE_USER_DATA_DIR   where the app's userData is expected (required; must not exist yet)
 * - SMOKE_EXTRA_ARGS      extra command-line switches (e.g. `--no-sandbox` for an extracted AppImage)
 * - SMOKE_ARTIFACTS_DIR   screenshots and app logs (default: test output dir)
 * - SMOKE_LABEL           name used in artifact files (e.g. `win-nsis`)
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
/** Headroom for the x64 build on the (slower) Intel macOS runner. */
const SLOW = LABEL === 'mac-x64' ? 2 : 1;
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
    timeout: 120_000 * SLOW,
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

  await app.firstWindow({ timeout: 120_000 * SLOW });
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
      { timeout: 60_000 * SLOW },
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
 * How the app is told to quit:
 * - `menu`: the app's own 「退出」 (application menu, CmdOrCtrl+Q; the tray item calls the same
 *   action);
 * - `external`: a plain `app.quit()` from outside the app's own actions, which is what the
 *   macOS Dock 「退出」 and a log out / shut down do (#199).
 */
type QuitVia = 'menu' | 'external';

/**
 * Quits (see `QuitVia`) and waits for the process to end with exit code 0. Nothing is unsaved,
 * so no confirmation is asked. Node waits for the attached inspector before it exits, so the
 * Playwright connection is closed once the app is on its way out.
 */
async function quit(launched: Launched, via: QuitVia): Promise<void> {
  const child = launched.app.process();
  const exited = new Promise<number | null>((done) => {
    if (child.exitCode !== null) done(child.exitCode);
    else child.once('exit', (code) => done(code));
  });
  const what = via === 'menu' ? '「退出」' : 'app.quit()';
  const clicked =
    via === 'external'
      ? await launched.app.evaluate(({ app }) => {
          // after this evaluate has answered: the quit ends the process
          setTimeout(() => app.quit(), 0);
          return true;
        })
      : await clickMenuQuit(launched);
  expect(clicked, via === 'menu' ? 'application menu has 「退出」' : 'app.quit() scheduled').toBe(
    true,
  );
  await expect
    .poll(
      () =>
        child.exitCode !== null ||
        launched.log.join('').includes('Waiting for the debugger to disconnect'),
      { timeout: 60_000 * SLOW, message: `the app starts exiting after ${what}` },
    )
    .toBe(true);
  await launched.app.close().catch(() => undefined);
  const code = await Promise.race([
    exited,
    new Promise<'timeout'>((done) => setTimeout(() => done('timeout'), 30_000 * SLOW)),
  ]);
  if (code === 'timeout') child.kill();
  expect(code, `exit code after ${what}`).toBe(0);
}

/** Clicks 「退出」 in the application menu (on the next turn); false when there is none. */
function clickMenuQuit(launched: Launched): Promise<boolean> {
  return launched.app.evaluate(({ Menu }) => {
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
}

/**
 * Runs `body` against a launched app, then quits it `via` the menu or an outside `app.quit()`.
 * If `body` fails, the app may be mid-edit (and quitting would ask to confirm), so it is killed
 * instead and the original error is reported, with a screenshot of where it stopped.
 */
async function using(
  launched: Launched,
  shot: string,
  via: QuitVia,
  body: () => Promise<void>,
): Promise<void> {
  try {
    await body();
  } catch (error) {
    await launched.main.screenshot({ path: shot }).catch(() => undefined);
    const child = launched.app.process();
    await launched.app.close().catch(() => undefined);
    if (child.exitCode === null) child.kill();
    throw error;
  }
  await quit(launched, via);
}

const REVIEW = {
  wentWell: '安装冒烟：复盘做得好',
  fellShort: '安装冒烟：不足',
  nextSteps: '安装冒烟：下一步',
};

/** Reads the database file after the app has exited (read-only, nothing else has it open). */
function checkDatabase(): void {
  const file = join(USER_DATA, DB_FILE);
  expect(existsSync(file), `${file} exists`).toBe(true);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all() as Array<Record<string, string>>;
    expect(integrity.map((row) => Object.values(row)[0])).toEqual(['ok']);
    const rows = db.prepare('SELECT title FROM objectives').all() as Array<{ title: string }>;
    expect(rows.map((r) => r.title)).toEqual([TITLE]);
    const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
    expect(count('SELECT COUNT(*) AS n FROM key_results')).toBe(3);
    expect(count('SELECT COUNT(*) AS n FROM progress_entries')).toBe(2);
    expect(count('SELECT COUNT(*) AS n FROM reviews')).toBe(1);
  } finally {
    db.close();
  }
}

async function onlyOkrId(page: Page): Promise<string> {
  const reply = await invoke(page, 'clarityokr:okr:list');
  expect(reply.ok, JSON.stringify(reply)).toBe(true);
  expect(reply.data.items).toHaveLength(1);
  return reply.data.items[0].id as string;
}

async function firstKrId(page: Page, okrId: string): Promise<string> {
  const reply = await invoke(page, 'clarityokr:okr:open', { okrId });
  expect(reply.ok, JSON.stringify(reply)).toBe(true);
  return reply.data.objective.keyResults[0].id as string;
}

/** Two progress updates (history) and a saved review, through the channels the UI uses. */
async function writeProgressAndReview(page: Page, okrId: string): Promise<void> {
  const krId = await firstKrId(page, okrId);
  for (const value of [40, 60]) {
    const reply = await invoke(page, 'clarityokr:kr:set-progress', {
      krId,
      status: 'in_progress',
      value,
    });
    expect(reply.ok, JSON.stringify(reply)).toBe(true);
  }
  const saved = await invoke(page, 'clarityokr:review:save', { okrId, ...REVIEW });
  expect(saved.ok, JSON.stringify(saved)).toBe(true);
}

async function expectProgressAndReview(page: Page, okrId: string): Promise<void> {
  const detail = await invoke(page, 'clarityokr:okr:open', { okrId });
  expect(detail.ok, JSON.stringify(detail)).toBe(true);
  const kr = detail.data.objective.keyResults[0];
  expect({ progress: kr.progress, status: kr.status }).toEqual({
    progress: 60,
    status: 'in_progress',
  });
  const history = await invoke(page, 'clarityokr:kr:progress-history', { krId: kr.id });
  expect(history.ok, JSON.stringify(history)).toBe(true);
  expect(
    (history.data.entries as Array<{ kind: string; value: number | null }>).map((e) => [
      e.kind,
      e.value,
    ]),
  ).toEqual([
    ['set', 40],
    ['set', 60],
  ]);
  const review = await invoke(page, 'clarityokr:review:get', { okrId });
  expect(review.ok, JSON.stringify(review)).toBe(true);
  expect({
    wentWell: review.data.review?.wentWell,
    fellShort: review.data.review?.fellShort,
    nextSteps: review.data.review?.nextSteps,
  }).toEqual(REVIEW);
}

const stickyOnTop = (app: ElectronApplication): Promise<boolean | null> =>
  app.evaluate(({ BrowserWindow }) => {
    const sticky = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('view=sticky'),
    );
    return sticky && sticky.isVisible() ? sticky.isAlwaysOnTop() : null;
  });

/**
 * The sticky note (sandboxed preload) opens from 「重开便签」, shows the OKR, and its 「⋯」 →
 * 「窗口始终在最前」 switch really changes the window's always-on-top state (then back).
 */
async function checkSticky(launched: Launched, shots: string): Promise<void> {
  await launched.main.getByTestId('sticky-reopen').click();
  let sticky: Page | undefined;
  await expect
    .poll(
      () => {
        sticky = launched.app.windows().find((w) => w.url().includes('view=sticky'));
        return sticky !== undefined;
      },
      { timeout: 30_000 * SLOW, message: 'the sticky note opens' },
    )
    .toBe(true);
  const page = sticky!;
  await page.waitForLoadState('domcontentloaded');
  expect(
    await page.evaluate(
      () => typeof (window as unknown as { clarifyOkr?: { invoke?: unknown } }).clarifyOkr?.invoke,
    ),
    'sticky preload exposes the bridge',
  ).toBe('function');
  await expect(page.getByTestId('sticky-objective')).toContainText(TITLE);
  await expect.poll(() => stickyOnTop(launched.app)).not.toBeNull();
  const initial = (await stickyOnTop(launched.app)) as boolean;
  for (const expected of [!initial, initial]) {
    await page.getByTestId('more-button').click();
    await page.getByTestId('always-on-top').click();
    await expect.poll(() => stickyOnTop(launched.app)).toBe(expected);
    await page.keyboard.press('Escape');
  }
  await page.screenshot({ path: join(shots, `${LABEL}-sticky.png`) });
}

interface SafeStorageProbe {
  available: boolean;
  backend: string | null;
  cipher: string | null;
}

/** First launch: encrypt a marker with the OS store (Keychain / DPAPI / libsecret). */
/** An OS prompt (e.g. a Keychain access dialog) would block forever on a runner: fail clearly. */
function within<T>(what: string, promise: Promise<T>, ms = 60_000 * SLOW): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not finish within ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const encryptMarker = (app: ElectronApplication): Promise<SafeStorageProbe> =>
  app.evaluate(async ({ safeStorage }) => {
    const available = await safeStorage.isAsyncEncryptionAvailable();
    const backend =
      process.platform === 'linux'
        ? (
            safeStorage as unknown as { getSelectedStorageBackend: () => string }
          ).getSelectedStorageBackend()
        : null;
    if (!available) return { available, backend, cipher: null };
    const cipher = await safeStorage.encryptStringAsync('install-smoke-marker');
    return { available, backend, cipher: cipher.toString('base64') };
  });

/** Relaunch: the same installed app decrypts it again. */
const decryptMarker = (app: ElectronApplication, cipher: string): Promise<string> =>
  app.evaluate(async ({ safeStorage }, data) => {
    const outcome = await safeStorage.decryptStringAsync(Buffer.from(data, 'base64'));
    return outcome.result;
  }, cipher);

test('installed app: fresh profile → OKR, progress, review → quit → relaunch → all still there', async () => {
  test.setTimeout(300_000 * SLOW);
  expect(EXECUTABLE, 'SMOKE_APP_EXECUTABLE').not.toBe('');
  expect(existsSync(EXECUTABLE), `${EXECUTABLE} exists`).toBe(true);
  expect(USER_DATA, 'SMOKE_USER_DATA_DIR').not.toBe('');
  expect(existsSync(USER_DATA), `${USER_DATA} must not exist before the first launch`).toBe(false);

  const mock = new SimpleMockServer();
  await mock.start();
  mock.setResponses(mockResponses);
  const shots = artifactsDir();
  let okrId = '';
  let probe: SafeStorageProbe = { available: false, backend: null, cipher: null };
  try {
    // ---------- first launch on a fresh profile ----------
    const first = await launch(mock.getUrl(), 'first');
    await using(first, join(shots, `${LABEL}-first-failure.png`), 'menu', async () => {
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
      await clarification.waitForOkrSummary(60_000 * SLOW);
      await expect.poll(() => listedTitles(first.main)).toEqual([TITLE]);
      okrId = await onlyOkrId(first.main);
      await writeProgressAndReview(first.main, okrId);
      await expectProgressAndReview(first.main, okrId);
      await first.main.screenshot({ path: join(shots, `${LABEL}-2-okr-created.png`) });
      await checkSticky(first, shots);

      probe = await within('safeStorage encrypt', encryptMarker(first.app));
      writeFileSync(join(shots, `${LABEL}-safe-storage.json`), JSON.stringify(probe, null, 2));
      // DPAPI and Keychain are always there on Windows / macOS; Linux depends on a secret service
      if (process.platform !== 'linux') expect(probe.available, 'safeStorage available').toBe(true);
    });
    checkDatabase();

    // ---------- relaunch on the same profile ----------
    const second = await launch(mock.getUrl(), 'second');
    // #199: leave the second run the way the Dock 「退出」 / log out do
    await using(second, join(shots, `${LABEL}-second-failure.png`), 'external', async () => {
      await expectShippedApp(second);
      expect(await invoke(second.main, 'clarityokr:app:storage-state')).toEqual({
        storageMode: 'normal',
      });
      await expect.poll(() => listedTitles(second.main)).toEqual([TITLE]);
      expect(await onlyOkrId(second.main)).toBe(okrId);
      await expectProgressAndReview(second.main, okrId);
      if (probe.cipher !== null) {
        expect(await within('safeStorage decrypt', decryptMarker(second.app, probe.cipher))).toBe(
          'install-smoke-marker',
        );
      }
      await second.main.screenshot({ path: join(shots, `${LABEL}-3-relaunch.png`) });
    });
    checkDatabase();
  } finally {
    await mock.stop();
  }
});
