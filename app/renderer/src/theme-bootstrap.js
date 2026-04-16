// Pre-hydration theme sync to prevent flash of un-themed content
(function () {
  try {
    var stored = localStorage.getItem('clarityokr-theme');
    var theme = 'system';
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      theme = stored;
    }
    var resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  } catch (e) {
    // localStorage may be unavailable in some Electron contexts
  }
})();
