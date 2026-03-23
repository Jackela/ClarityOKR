// Type declaration for better-sqlite3

declare module 'better-sqlite3' {
  export interface Statement {
    run(...params: unknown[]): { lastInsertRowid: number; changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export interface Transaction {
    (): void;
    deferred: () => void;
    immediate: () => void;
    exclusive: () => void;
  }

  export class Database {
    constructor(filename: string);

    pragma(pragma: string): unknown;
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
    transaction(fn: () => void): Transaction;
  }

  const _default: typeof Database;
  export default _default;
}
