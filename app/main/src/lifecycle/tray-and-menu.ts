import type { MenuItemConstructorOptions } from 'electron';
import path from 'node:path';

/** Menu and tray copy (spec §1.2a / §1.2b; the same on every platform). */
export const SHELL_COPY = {
  showSticky: '显示便签',
  quit: '退出',
  tooltip: 'ClarityOKR',
  appName: 'ClarityOKR',
  edit: '编辑',
  view: '视图',
  window: '窗口',
} as const;

/** `CmdOrCtrl+Shift+K` shows the sticky note (shown in menus as ⌘⇧K / Ctrl+Shift+K). */
export const SHOW_STICKY_ACCELERATOR = 'CmdOrCtrl+Shift+K';

export type PlatformName = 'darwin' | 'win32' | 'linux' | string;

/** The tray image for a platform (§1.2b): macOS template, Windows .ico, Linux 22px PNG. */
export function trayIconPath(resourcesDir: string, platform: PlatformName): string {
  const dir = path.join(resourcesDir, 'tray');
  if (platform === 'darwin') return path.join(dir, 'clarityokrTemplate.png');
  if (platform === 'win32') return path.join(dir, 'clarityokr.ico');
  return path.join(dir, 'clarityokr-22.png');
}

/** A menu item as `Menu.buildFromTemplate` takes it. */
export type MenuItemSpec = MenuItemConstructorOptions;

export interface ShellActions {
  /** Shows and focuses the sticky note (falls back to the main window). */
  showSticky: () => void;
  /** Goes through the quit confirmation (§1.2c). */
  quit: () => void;
}

/** The tray menu: 显示便签 (with the accelerator hint), separator, 退出. */
export function trayMenuTemplate(actions: ShellActions): MenuItemSpec[] {
  return [
    {
      label: SHELL_COPY.showSticky,
      accelerator: SHOW_STICKY_ACCELERATOR,
      click: actions.showSticky,
    },
    { type: 'separator' },
    { label: SHELL_COPY.quit, click: actions.quit },
  ];
}

/**
 * The application menu. 「退出」 (⌘Q / Ctrl+Q) goes through the quit confirmation instead of the
 * built-in `quit` role; 「显示便签」 is the convenience accelerator (not guaranteed while the
 * sticky note is hidden, hence the tray and the single-instance recall).
 */
export function appMenuTemplate(actions: ShellActions, platform: PlatformName): MenuItemSpec[] {
  const appItems: MenuItemSpec[] = [
    {
      label: SHELL_COPY.showSticky,
      accelerator: SHOW_STICKY_ACCELERATOR,
      click: actions.showSticky,
    },
    { type: 'separator' },
    { label: SHELL_COPY.quit, accelerator: 'CmdOrCtrl+Q', click: actions.quit },
  ];
  return [
    { label: SHELL_COPY.appName, submenu: appItems },
    {
      label: SHELL_COPY.edit,
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: SHELL_COPY.view,
      submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }],
    },
    {
      label: SHELL_COPY.window,
      submenu:
        platform === 'darwin' ? [{ role: 'minimize' }, { role: 'zoom' }] : [{ role: 'minimize' }],
    },
  ];
}

/** The part of an Electron `Tray` used here. */
export interface TrayLike {
  setToolTip(text: string): void;
  setContextMenu(menu: unknown): void;
  popUpContextMenu(menu?: unknown): void;
  on(event: 'click' | 'right-click', listener: () => void): unknown;
}

/**
 * Wires the tray (§1.2b). macOS: a click opens the menu. Windows / Linux: a left click shows and
 * focuses the sticky note (never hides it), a right click opens the same menu. On Linux the menu
 * is also set as the context menu, because AppIndicator panels only ever show a menu.
 */
export function wireTray(
  tray: TrayLike,
  menu: unknown,
  actions: ShellActions,
  platform: PlatformName,
): void {
  tray.setToolTip(SHELL_COPY.tooltip);
  if (platform === 'darwin') {
    tray.on('click', () => tray.popUpContextMenu(menu));
    tray.on('right-click', () => tray.popUpContextMenu(menu));
    return;
  }
  if (platform === 'linux') tray.setContextMenu(menu);
  tray.on('click', actions.showSticky);
  tray.on('right-click', () => tray.popUpContextMenu(menu));
}
