// Re-export the interface
export type { IActionLogWriter } from './action-log-writer.interface.js';

// Re-export SQLite implementation
export { SQLiteActionLogWriter } from './sqlite-action-log-writer.js';

// Re-export File implementation (deprecated)
export { FileActionLogWriter } from './file-action-log-writer.js';
export { FileActionLogWriter as ActionLogWriter } from './file-action-log-writer.js';
