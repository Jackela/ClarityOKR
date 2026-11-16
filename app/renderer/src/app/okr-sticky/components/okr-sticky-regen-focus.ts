/** Focus the sticky-note regenerate menu button (same query the parent used). */
export function focusRegenButton(): void {
  const doc = typeof document === 'undefined' ? undefined : document;
  setTimeout(() =>
    doc?.querySelector<HTMLElement>('[data-testid="regenerate-button"] button')?.focus(),
  );
}
