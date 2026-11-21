# better-sqlite3 12.x fixture

`clarityokr-from-12.11.1.db` is a small ClarityOKR database produced by **better-sqlite3 12.11.1** (the version locked on main when this file was generated) through the application's real schema and write path:

1. `ConnectionManager.initialize()` — WAL, foreign keys, `applySchema()` (schema `user_version` = 2)
2. `OkrStore.createObjective()` / `setProgress()` with fixed ids (see `manifest.json`)
3. `wal_checkpoint(TRUNCATE)` and `journal_mode=DELETE`, so only this one file is committed

It exists so the better-sqlite3 13 upgrade can prove a file written by 12.x still opens, reads, and accepts new writes. The integration test is `tests/integration/specs/persistence/better-sqlite3-v13-compat.spec.ts`.

## Regenerating

Check out a revision whose lockfile still resolves better-sqlite3 12.x (do not run this on the 13 upgrade branch):

```bash
pnpm install --frozen-lockfile
pnpm run build:contracts && pnpm run build:main
node scripts/generate-better-sqlite3-v12-fixture.mjs
```

The script refuses to run unless the resolved `better-sqlite3` major version is 12.
