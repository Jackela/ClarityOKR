// Type declaration for better-sqlite3

declare module 'better-sqlite3' {
  export interface Statement {
    run(...params: unknown[]): { lastInsertRowid: number; changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export interface DatabaseOptions {
    readonly?: boolean;
    fileMustExist?: boolean;
  }

  export interface Transaction<T = void> {
    (): T;
    deferred: () => void;
    immediate: () => void;
    exclusive: () => void;
  }

  export class Database {
    constructor(filename: string, options?: DatabaseOptions);

    pragma(source: string, options?: { simple?: boolean }): unknown;
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
    transaction<T>(fn: () => T): Transaction<T>;
  }

  const _default: typeof Database;
  export default _default;
}
