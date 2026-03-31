/**
 * Custom Jest resolver to handle TypeScript .js extension imports
 * Resolves relative .js imports to .ts files for ESM compatibility
 */
module.exports = (request, options) => {
  const { defaultResolver } = options;

  // Handle relative imports that end with .js
  if (request.startsWith('.') && request.endsWith('.js')) {
    // Try resolving as .ts first
    const tsRequest = request.slice(0, -3) + '.ts';
    try {
      return defaultResolver(tsRequest, options);
    } catch (error) {
      // Fall through to try original .js resolution
    }

    // Try resolving as .tsx
    const tsxRequest = request.slice(0, -3) + '.tsx';
    try {
      return defaultResolver(tsxRequest, options);
    } catch (error) {
      // Fall through to default resolution
    }
  }

  // Default resolution for everything else
  return defaultResolver(request, options);
};
