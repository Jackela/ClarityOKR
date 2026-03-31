/**
 * Custom Jest resolver to handle TypeScript .js extension imports
 * Only handles relative imports (./* or ../*) with .js extension
 */
module.exports = (request, options) => {
  const { defaultResolver } = options;

  // Only handle relative imports that end with .js
  if (request.startsWith('.') && request.endsWith('.js')) {
    const tsRequest = request.slice(0, -3) + '.ts';
    try {
      return defaultResolver(tsRequest, options);
    } catch {
      // Fall through to default resolution with original request
    }
  }

  // Default resolution for everything else (including ts-jest)
  return defaultResolver(request, options);
};
