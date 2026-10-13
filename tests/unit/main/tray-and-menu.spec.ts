import { jest } from '@jest/globals';
import path from 'node:path';
import { existsSync } from 'node:fs';

import {
  SHOW_STICKY_ACCELERATOR,
  appMenuTemplate,
  trayIconPath,
  trayMenuTemplate,
  wireTray,
  type TrayLike,
} from '@clarityokr/main/lifecycle/tray-and-menu';

function findResources(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'app', 'main', 'resources');
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error('app/main/resources not found');
}
const RESOURCES = findResources();

function fakeTray() {
  const handlers = new Map<string, () => void>();
  const tray = {
    setToolTip: jest.fn(),
    setContextMenu: jest.fn(),
    popUpContextMenu: jest.fn(),
    on: jest.fn((event: string, listener: () => void) => {
      handlers.set(event, listener);
      return tray;
    }),
  };
  return { tray: tray as unknown as TrayLike & typeof tray, handlers };
}

describe('tray and menu (spec §1.2a / §1.2b)', () => {
  const actions = { showSticky: jest.fn(), quit: jest.fn() };
  beforeEach(() => {
    actions.showSticky.mockClear();
    actions.quit.mockClear();
  });

  it.each([
    ['darwin', 'clarityokrTemplate.png'],
    ['win32', 'clarityokr.ico'],
    ['linux', 'clarityokr-22.png'],
  ])('%s uses %s, and the file ships with the app', (platform, file) => {
    const icon = trayIconPath(RESOURCES, platform);
    expect(path.basename(icon)).toBe(file);
    expect(existsSync(icon)).toBe(true);
  });

  it('the macOS @2x template sits next to the @1x one', () => {
    expect(existsSync(path.join(RESOURCES, 'tray', 'clarityokrTemplate@2x.png'))).toBe(true);
  });

  it('tray menu: 显示便签 (CmdOrCtrl+Shift+K), separator, 退出', () => {
    const menu = trayMenuTemplate(actions);
    expect(menu.map((i) => i.label ?? i.type)).toEqual(['显示便签', 'separator', '退出']);
    expect(menu[0]!.accelerator).toBe(SHOW_STICKY_ACCELERATOR);
    (menu[0]!.click as () => void)();
    (menu[2]!.click as () => void)();
    expect(actions.showSticky).toHaveBeenCalledTimes(1);
    expect(actions.quit).toHaveBeenCalledTimes(1);
  });

  it('app menu: 显示便签 and 退出 (⌘Q goes through the confirmation, not the quit role)', () => {
    const menu = appMenuTemplate(actions, 'linux');
    const app = menu[0]!.submenu as Array<{ label?: string; role?: string; accelerator?: string }>;
    expect(app.map((i) => i.label).filter(Boolean)).toEqual(['显示便签', '退出']);
    expect(app.find((i) => i.label === '退出')!.accelerator).toBe('CmdOrCtrl+Q');
    const roles = JSON.stringify(menu);
    expect(roles).not.toContain('"role":"quit"');
    expect(roles).toContain('"role":"copy"');
  });

  it('macOS: a click pops up the menu; it never toggles the window', () => {
    const { tray, handlers } = fakeTray();
    wireTray(tray, 'MENU', actions, 'darwin');
    expect(tray.setToolTip).toHaveBeenCalledWith('ClarityOKR');
    handlers.get('click')!();
    expect(tray.popUpContextMenu).toHaveBeenCalledWith('MENU');
    expect(actions.showSticky).not.toHaveBeenCalled();
  });

  it('Windows: left click shows the sticky note, right click pops up the menu', () => {
    const { tray, handlers } = fakeTray();
    wireTray(tray, 'MENU', actions, 'win32');
    handlers.get('click')!();
    expect(actions.showSticky).toHaveBeenCalledTimes(1);
    handlers.get('right-click')!();
    expect(tray.popUpContextMenu).toHaveBeenCalledWith('MENU');
    expect(tray.setContextMenu).not.toHaveBeenCalled();
  });

  it('Linux: same as Windows, plus the context menu for AppIndicator panels', () => {
    const { tray, handlers } = fakeTray();
    wireTray(tray, 'MENU', actions, 'linux');
    expect(tray.setContextMenu).toHaveBeenCalledWith('MENU');
    handlers.get('click')!();
    expect(actions.showSticky).toHaveBeenCalledTimes(1);
  });
});
