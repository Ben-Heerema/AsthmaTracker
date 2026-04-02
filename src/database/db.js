/**
 * db.js — Database Connection and Initialization (sql.js / WASM)
 *
 * This module opens the SQLite database using sql.js (pure JS/WASM) instead
 * of the native better-sqlite3 C++ addon. This eliminates the VC++ Runtime
 * requirement and simplifies cross-platform distribution.
 *
 * HOW IT WORKS:
 * - sql.js runs SQLite entirely in JavaScript/WASM — no native compilation
 * - The database is loaded into memory from disk, and saved back after mutations
 * - A DatabaseWrapper class provides the same API as better-sqlite3:
 *     db.prepare(sql).get/all/run(), db.exec(), db.pragma(), db.transaction()
 *
 * FIRST LAUNCH BEHAVIOR:
 * - If asthma_tracker.db doesn't exist, a new in-memory DB is created
 * - We then run schema.sql to create all 12 tables
 * - On subsequent launches, "CREATE TABLE IF NOT EXISTS" skips existing tables
 *
 * AUTO-SAVE STRATEGY:
 * - Instead of saving to disk after every single mutation (which blocks the
 *   main thread), we use debounced saves: after a mutation, we schedule a
 *   save 100ms later. If another mutation comes in before that, the timer
 *   resets. This batches rapid-fire writes (e.g. notification scheduler)
 *   while still persisting promptly after user actions.
 * - Transactions save once at the end (no debounce — immediate save).
 * - saveSync() can be called explicitly to force an immediate flush.
 */

const path = require('path');
const fs = require('fs');

// Path to the schema SQL file that defines all tables
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// ─── DatabaseWrapper ─────────────────────────────────────────────────────────
// Wraps a sql.js Database instance to provide the same API as better-sqlite3.

class DatabaseWrapper {
  constructor(sqlDb, dbPath) {
    this._db = sqlDb;
    this._dbPath = dbPath;       // null for in-memory (test) databases
    this._inTransaction = false; // skip auto-save during transactions
    this._saveTimer = null;      // debounce timer for auto-save
  }

  // ── prepare(sql) → StatementWrapper ──────────────────────────────────────
  prepare(sql) {
    return new StatementWrapper(this, sql);
  }

  // ── exec(sql) — run multi-statement SQL (e.g. schema.sql) ────────────────
  exec(sql) {
    this._db.exec(sql);
    this._autoSave();
  }

  // ── pragma(statement) — e.g. pragma('journal_mode = WAL') ────────────────
  pragma(statement) {
    const rows = this._db.exec(`PRAGMA ${statement}`);
    if (rows.length > 0 && rows[0].values.length > 0) {
      return rows[0].values[0][0];
    }
    return undefined;
  }

  // ── transaction(fn) — BEGIN/COMMIT/ROLLBACK wrapper ──────────────────────
  transaction(fn) {
    const self = this;
    return function (...args) {
      self._db.run('BEGIN TRANSACTION');
      self._inTransaction = true;
      try {
        const result = fn.apply(null, args);
        self._db.run('COMMIT');
        self._inTransaction = false;
        // Transaction commits save immediately (no debounce)
        self.saveSync();
        return result;
      } catch (err) {
        self._db.run('ROLLBACK');
        self._inTransaction = false;
        throw err;
      }
    };
  }

  // ── close() ──────────────────────────────────────────────────────────────
  close() {
    // Flush any pending debounced save before closing
    this._flushPendingSave();
    this._db.close();
  }

  // ── saveSync() — flush in-memory DB to disk immediately ──────────────────
  saveSync() {
    // Cancel any pending debounced save since we're saving now
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (this._dbPath) {
      const data = this._db.export();
      fs.writeFileSync(this._dbPath, Buffer.from(data));
    }
  }

  // ── _autoSave — debounced save after mutations ───────────────────────────
  // Schedules a save 100ms in the future. If another mutation occurs before
  // then, the timer resets. This batches rapid writes while staying responsive.
  _autoSave() {
    if (this._inTransaction) return;
    if (!this._dbPath) return; // in-memory test DBs — nothing to save

    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.saveSync();
    }, 100);
  }

  // ── _flushPendingSave — force any pending debounced save now ─────────────
  _flushPendingSave() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      if (this._dbPath) {
        const data = this._db.export();
        fs.writeFileSync(this._dbPath, Buffer.from(data));
      }
    }
  }
}

// ─── StatementWrapper ────────────────────────────────────────────────────────
// Wraps a single SQL statement to provide .get(), .all(), .run() matching
// the better-sqlite3 prepared-statement API.

class StatementWrapper {
  constructor(wrapper, sql) {
    this._wrapper = wrapper;
    this._sql = sql;
  }

  // Convert better-sqlite3 named params to sql.js format.
  // better-sqlite3 uses { key: value } with @key in SQL.
  // sql.js requires the object key prefix to match the SQL prefix (@).
  _bindParams(args) {
    if (args.length === 0) return {};
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
      // Named parameters: convert { foo: 1 } → { '@foo': 1 }
      const obj = args[0];
      const converted = {};
      for (const key of Object.keys(obj)) {
        converted[`@${key}`] = obj[key];
      }
      return converted;
    }
    // Positional parameters: sql.js accepts an array
    return args;
  }

  // ── get(...args) → single row object or undefined ────────────────────────
  get(...args) {
    const params = this._bindParams(args);
    let stmt;
    try {
      stmt = this._wrapper._db.prepare(this._sql);
      stmt.bind(params);
      if (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        const row = {};
        for (let i = 0; i < cols.length; i++) {
          row[cols[i]] = vals[i];
        }
        return row;
      }
      return undefined;
    } finally {
      if (stmt) stmt.free();
    }
  }

  // ── all(...args) → array of row objects ──────────────────────────────────
  all(...args) {
    const params = this._bindParams(args);
    let stmt;
    try {
      stmt = this._wrapper._db.prepare(this._sql);
      stmt.bind(params);
      const cols = stmt.getColumnNames();
      const rows = [];
      while (stmt.step()) {
        const vals = stmt.get();
        const row = {};
        for (let i = 0; i < cols.length; i++) {
          row[cols[i]] = vals[i];
        }
        rows.push(row);
      }
      return rows;
    } finally {
      if (stmt) stmt.free();
    }
  }

  // ── run(...args) → { lastInsertRowid, changes } ─────────────────────────
  // Executes a single mutation statement (INSERT/UPDATE/DELETE).
  // Fetches lastInsertRowid immediately after step() via a separate query.
  // This is safe because Electron's main process is single-threaded — no
  // concurrent access can interleave between step() and the rowid fetch.
  run(...args) {
    const params = this._bindParams(args);
    let stmt;
    try {
      stmt = this._wrapper._db.prepare(this._sql);
      stmt.bind(params);
      stmt.step();
    } finally {
      if (stmt) stmt.free();
    }
    const db = this._wrapper._db;
    // Fetch rowid and changes immediately — safe in single-threaded Electron.
    // sql.js doesn't expose last_insert_rowid() on the statement object, so
    // we use a follow-up query. getRowsModified() is a global too.
    const result = {
      changes: db.getRowsModified(),
      lastInsertRowid: Number(
        db.exec('SELECT last_insert_rowid()')[0].values[0][0]
      ),
    };
    this._wrapper._autoSave();
    return result;
  }
}

// ─── Module State ────────────────────────────────────────────────────────────
let _wrapper = null;

/**
 * initialize() — Async entry point. Loads sql.js WASM, opens (or creates) the
 * database file, runs the schema, and returns a DatabaseWrapper.
 */
async function initialize() {
  const { app } = require('electron');
  const initSqlJs = require('sql.js');

  // Locate the WASM binary.
  // In a packaged app the WASM file is inside the asar archive, but Electron's
  // patched fs module can read it. If that ever fails, the fallback tries the
  // app.asar.unpacked path.
  let wasmBinary;
  const wasmInModules = path.join(
    __dirname,
    '../../node_modules/sql.js/dist/sql-wasm.wasm'
  );
  try {
    wasmBinary = fs.readFileSync(wasmInModules);
  } catch (_) {
    // Fallback: electron-builder may unpack node_modules outside asar
    const wasmUnpacked = wasmInModules.replace('app.asar', 'app.asar.unpacked');
    wasmBinary = fs.readFileSync(wasmUnpacked);
  }

  const SQL = await initSqlJs({ wasmBinary });

  // Determine the database file location
  const DB_PATH = app.isPackaged
    ? path.join(app.getPath('userData'), 'asthma_tracker.db')
    : path.join(__dirname, '../../asthma_tracker.db');

  // Load existing DB from disk, or create a fresh one
  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  _wrapper = new DatabaseWrapper(sqlDb, DB_PATH);

  // sql.js is in-memory — WAL mode doesn't apply, but we call it for compat
  // (it will just be ignored)
  try { _wrapper.pragma('journal_mode = WAL'); } catch (_) { /* ignore */ }

  // Initialize schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  _wrapper.exec(schema);

  // Run migrations
  runMigrations(_wrapper);

  console.log('[db.js] Database initialized successfully (sql.js)');
  console.log(`[db.js] Database file: ${DB_PATH}`);

  return _wrapper;
}

/**
 * Run schema migrations for columns added after initial release.
 */
function runMigrations(db) {
  const ALLOWED_TABLES = new Set([
    'Medications', 'Badges', 'Children', 'Users',
    'Controller_Schedule', 'Daily_Checkins', 'PEF_Entries', 'Medication_Logs',
    'Incident_Reports', 'Inhaler_Technique_Sessions', 'Provider_Access', 'Notifications'
  ]);

  const migrations = [
    { table: 'Medications', column: 'is_active', sql: 'ALTER TABLE Medications ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1' },
    { table: 'Badges',      column: 'is_active', sql: 'ALTER TABLE Badges ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1' },
    { table: 'Children',   column: 'icon',      sql: "ALTER TABLE Children ADD COLUMN icon TEXT DEFAULT 'boy_older'" }
  ];

  // Lookup table maps allowed table names to themselves — prevents injection
  // even though values are hardcoded, this enforces defence-in-depth.
  const SAFE_TABLE_NAMES = Object.fromEntries([...ALLOWED_TABLES].map(t => [t, t]));

  for (const m of migrations) {
    const safeTable = SAFE_TABLE_NAMES[m.table];
    if (!safeTable) {
      console.error(`[db.js] Migration skipped: unknown table "${m.table}"`);
      continue;
    }
    const cols = db.prepare(`PRAGMA table_info(${safeTable})`).all();
    const exists = cols.some(c => c.name === m.column);
    if (!exists) {
      db.exec(m.sql);
      console.log(`[db.js] Migration: added ${safeTable}.${m.column}`);
    }
  }
}

/**
 * saveSync() — Flush the in-memory database to disk.
 * Called from main.js on 'before-quit'.
 */
function saveSync() {
  if (_wrapper) {
    _wrapper.saveSync();
  }
}

/**
 * createDatabaseWrapper() — Create a DatabaseWrapper for an arbitrary sql.js
 * Database instance (used by tests and the seed script).
 */
function createDatabaseWrapper(sqlDb, dbPath) {
  return new DatabaseWrapper(sqlDb, dbPath || null);
}

module.exports = { initialize, saveSync, createDatabaseWrapper, DatabaseWrapper };
