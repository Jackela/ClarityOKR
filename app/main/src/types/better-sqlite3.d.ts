// Type declaration for better-sqlite3
declare module 'better-sqlite3' {
  class Database {
    constructor(filename: string);

    pragma(pragma: string): unknown;
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
    transaction(fn: () => void): Transaction;
  }

  interface Statement {
    run(...params: unknown[]): { lastInsertRowid: number; changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  interface Transaction {
    (): void;
    deferred: () => void;
    immediate: () => void;
    exclusive: () => void;
  }

  export = Database;
}
