/**
 * Custom Jest resolver to handle TypeScript .js extension imports
 */
const path = require('path');
const { defaultResolver } = require('jest-resolve');

module.exports = (request, options) => {
  // Handle .js imports from TypeScript files in app/main
  if (request.endsWith('.js') && !request.includes('node_modules')) {
    // Try to resolve as .ts file
    const tsRequest = request.slice(0, -3) + '.ts';
    try {
      return defaultResolver(tsRequest, options);
    } catch (e) {
      // Fall through to default resolution
    }
  }

  return defaultResolver(request, options);
};
