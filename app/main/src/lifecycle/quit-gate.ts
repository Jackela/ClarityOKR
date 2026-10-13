/**
 * The two process-wide quit flags, in one place so their rules are testable without Electron:
 * - `allowed`: the quit confirmation was passed (or not needed); `before-quit` lets it through;
 * - `quitting`: windows may really close (the sticky / main windows stop hiding on close).
 * Both are set right before a real quit / relaunch and BOTH are restored when relaunching
 * fails, so a later ⌘Q still goes through the confirmation (B1).
 */
export class QuitGate {
  private allowed = false;
  private quitting = false;

  isQuitting(): boolean {
    return this.quitting;
  }

  isAllowed(): boolean {
    return this.allowed;
  }

  /** `before-quit`: true = let the quit through. */
  passesBeforeQuit(): boolean {
    if (!this.allowed) return false;
    this.quitting = true;
    return true;
  }

  quit(appQuit: () => void): void {
    this.open();
    appQuit();
  }

  /** `app.relaunch()` + quit; on a throw both flags go back and the error is rethrown. */
  relaunch(appRelaunch: () => void, appQuit: () => void): void {
    this.open();
    try {
      appRelaunch();
      appQuit();
    } catch (error) {
      this.allowed = false;
      this.quitting = false;
      throw error;
    }
  }

  private open(): void {
    this.allowed = true;
    this.quitting = true;
  }
}

/**
 * The `before-quit` handler: a quit the gate has not allowed (⌘Q, the system, anything) is
 * stopped and goes through the confirmation instead.
 */
export function guardBeforeQuit(
  gate: QuitGate,
  requestQuit: () => unknown,
  event: { preventDefault(): void },
): void {
  if (gate.passesBeforeQuit()) return;
  event.preventDefault();
  void requestQuit();
}

/** A window that hides instead of closing until the app really quits (B2). */
export interface HideableWindow {
  on(event: 'close', listener: (event: { preventDefault(): void }) => void): unknown;
  hide(): void;
  isDestroyed(): boolean;
}

export function hideOnClose(window: HideableWindow, isQuitting: () => boolean): void {
  window.on('close', (event) => {
    if (isQuitting() || window.isDestroyed()) return;
    event.preventDefault();
    window.hide();
  });
}
