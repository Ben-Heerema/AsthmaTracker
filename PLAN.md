# Migration Plan: better-sqlite3 → sql.js

## Goal
Replace the native C++ `better-sqlite3` dependency with `sql.js` (pure JS/WASM) to eliminate the VC++ Runtime requirement and simplify cross-platform distribution.

## Files to Change (7 files)

### 1. `src/database/db.js` — Full rewrite (~100 lines)
- Remove `require('better-sqlite3')`
- Add `require('sql.js')` with explicit WASM binary loading via `fs.readFileSync` (asar-compatible)
- Write a `DatabaseWrapper` class that exposes the exact same API surface:
  - `db.prepare(sql).get(...args)` → single row or `undefined`
  - `db.prepare(sql).all(...args)` → array of rows
  - `db.prepare(sql).run(...args)` → `{ lastInsertRowid, changes }`
  - `db.exec(sql)` → run multi-statement SQL
  - `db.pragma(statement)` → run via `db.exec("PRAGMA ...")`
  - `db.transaction(fn)` → BEGIN/COMMIT/ROLLBACK wrapper
- Parameter conversion: better-sqlite3 uses `@param` in SQL with `{param: value}` objects (no prefix). sql.js needs the object keys prefixed. The wrapper auto-converts.
- Auto-persistence: after every mutation (`.run()`, `.exec()`), serialize the in-memory DB to disk via `fs.writeFileSync`. Skip saves during transactions (save after commit only).
- Export an async `initialize()` function instead of synchronous `module.exports = db`
- Keep the `app.isPackaged` path logic for dev vs production DB location

### 2. `src/database/queries.js` — Minimal change (2 lines)
- Change `const db = require('./db');` → remove
- Wrap the entire `const queries = { ... }` export in a factory function:
  ```js
  module.exports = function buildQueries(db) {
    // ... all 46 query methods stay IDENTICAL ...
  };
  ```
- All SQL queries, parameter handling, and return values remain exactly the same
- The `getLocalDateString()` helper stays as-is

### 3. `main.js` — Small change (~10 lines)
- Change top-level imports from:
  ```js
  const db = require('./src/database/db');
  const queries = require('./src/database/queries');
  ```
  To lazy initialization:
  ```js
  const dbModule = require('./src/database/db');
  const buildQueries = require('./src/database/queries');
  let queries;
  ```
- Inside `app.whenReady()`, add `await dbModule.initialize()` before `createWindow()`:
  ```js
  app.whenReady().then(async () => {
    const db = await dbModule.initialize();
    queries = buildQueries(db);
    // ... rest of existing code (CSP, createWindow, scheduler) ...
  });
  ```
- Add a `before-quit` handler to flush any pending DB writes:
  ```js
  app.on('before-quit', () => { dbModule.saveSync(); });
  ```

### 4. `package.json` — Dependency swap + build config cleanup
- Replace `"better-sqlite3": "^9.4.3"` with `"sql.js": "^1.11.0"`
- Remove `"asarUnpack": ["node_modules/better-sqlite3/**/*"]`
- Keep everything else

### 5. `tests/__helpers__/db-setup.js` — Simplification (major code reduction)
- Replace 400-line file with ~30 lines
- Use `sql.js` for in-memory test databases (no native module needed)
- Import the real `buildQueries` from `src/database/queries.js` instead of duplicating all 46 query methods
- `createTestDb()` becomes async (returns a Promise)
- Use the same `DatabaseWrapper` from db.js for API compatibility

### 6. `tests/ui/helpers/seed-db.js` — Replace better-sqlite3 with sql.js
- Replace `const Database = require('better-sqlite3')` with sql.js init
- Use `DatabaseWrapper` for consistent API
- Same seeding logic, just different DB driver
- Script becomes async (wrap in async IIFE)

### 7. `tests/ui/helpers/global-setup.js` — Simplify (remove native rebuilds)
- Remove Step 1: `npm rebuild better-sqlite3` (no longer needed)
- Remove Step 3: `npx electron-rebuild` (no longer needed)
- Keep Step 2: Run seed-db.js (still needed for test data)

## Test File Changes (5 files — all minor)
These files call `createTestDb()` which becomes async:
- `queries.test.js` line 30: `beforeAll(() => {` → `beforeAll(async () => {`, add `await`
- `authorization.test.js` line 65: same pattern
- `auth-validation.test.js` lines 331, 404, 471, 523: same pattern (some already async)
- `provider-access.test.js` line 94: same pattern
- `notification-scheduler.test.js` lines 112, 320: same pattern

Change is always: add `async` keyword and `await` before `createTestDb()`.

## What Does NOT Change
- All 46 SQL queries in queries.js (identical SQL syntax)
- All IPC handlers in main.js (identical logic)
- All renderer/frontend code
- preload.js
- schema.sql
- All HTML/CSS files

## Execution Order
1. Install `sql.js`, uninstall `better-sqlite3`
2. Rewrite `db.js` with DatabaseWrapper
3. Update `queries.js` (2-line change)
4. Update `main.js` initialization
5. Update `package.json` build config
6. Update test helper and test files
7. Run all 536 tests to verify
8. Test the app manually with `npm start`
