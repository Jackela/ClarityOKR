/**
 * Closed-loop IPC contract (PR-C2): request validation, reply shapes and error codes.
 *
 * Everything here is pure so the main process (authoritative validation) and the renderer
 * (instant form validation) share one implementation, including the grapheme text counter.
 */

// Split into closed-loop-ipc/* (#164); this module keeps the original public surface.
export * from './closed-loop-ipc/result.js';
export * from './closed-loop-ipc/types.js';
export * from './closed-loop-ipc/exit-confirmation.js';
export * from './closed-loop-ipc/regenerate.js';
export * from './closed-loop-ipc/validators.js';
