/**
 * tests/ui/helpers/seed-db.js
 *
 * Standalone seeder script — run as a child process from global-setup.js
 * using sql.js (pure JS/WASM, no native compilation needed).
 *
 * Creates/updates the three test accounts:
 *   - uitestparent  (parent)
 *   - uitestprovider (provider)
 *   - uitestchild   (child under uitestparent)
 */

const path     = require('path');
const bcrypt   = require('bcryptjs');
const fs       = require('fs');
const initSqlJs = require('sql.js');

const ROOT        = path.join(__dirname, '../../..');
const DB_PATH     = path.join(ROOT, 'asthma_tracker.db');
const SCHEMA_PATH = path.join(ROOT, 'src/database/schema.sql');
const { createDatabaseWrapper } = require(path.join(ROOT, 'src/database/db'));

const PARENT   = { username: 'uitestparent',   email: 'uitestparent@test.com',   role: 'parent'   };
const PROVIDER = { username: 'uitestprovider', email: 'uitestprovider@test.com', role: 'provider' };
const CHILD    = { username: 'uitestchild',    name: 'UI Test Child', birthday: '2015-06-01' };
const PASSWORD  = 'UITest123';

(async () => {
  const wasmPath = path.join(ROOT, 'node_modules/sql.js/dist/sql-wasm.wasm');
  const wasmBinary = fs.readFileSync(wasmPath);
  const SQL = await initSqlJs({ wasmBinary });

  // Load existing DB or create new
  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  const db = createDatabaseWrapper(sqlDb, DB_PATH);

  // Apply schema if tables don't exist yet
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);

  const hash = bcrypt.hashSync(PASSWORD, 10);

  // ── Upsert parent ──────────────────────────────────────────────────────────
  const existingParent = db.prepare('SELECT user_id FROM Users WHERE username = ? COLLATE NOCASE').get(PARENT.username);
  if (!existingParent) {
    db.prepare('INSERT INTO Users (username, email, password_hash, role) VALUES (?,?,?,?)')
      .run(PARENT.username, PARENT.email, hash, PARENT.role);
    console.log('[seed] Created uitestparent');
  } else {
    db.prepare('UPDATE Users SET email=?, password_hash=?, role=? WHERE username=? COLLATE NOCASE')
      .run(PARENT.email, hash, PARENT.role, PARENT.username);
    console.log('[seed] Verified uitestparent');
  }

  // ── Upsert provider ────────────────────────────────────────────────────────
  const existingProvider = db.prepare('SELECT user_id FROM Users WHERE username = ? COLLATE NOCASE').get(PROVIDER.username);
  if (!existingProvider) {
    db.prepare('INSERT INTO Users (username, email, password_hash, role) VALUES (?,?,?,?)')
      .run(PROVIDER.username, PROVIDER.email, hash, PROVIDER.role);
    console.log('[seed] Created uitestprovider');
  } else {
    db.prepare('UPDATE Users SET email=?, password_hash=?, role=? WHERE username=? COLLATE NOCASE')
      .run(PROVIDER.email, hash, PROVIDER.role, PROVIDER.username);
    console.log('[seed] Verified uitestprovider');
  }

  // ── Upsert child ───────────────────────────────────────────────────────────
  const parent = db.prepare('SELECT user_id FROM Users WHERE username = ? COLLATE NOCASE').get(PARENT.username);
  const existingChild = db.prepare('SELECT child_id FROM Children WHERE username = ? COLLATE NOCASE').get(CHILD.username);
  if (!existingChild) {
    db.prepare('INSERT INTO Children (username, password_hash, name, birthday, parent_id) VALUES (?,?,?,?,?)')
      .run(CHILD.username, hash, CHILD.name, CHILD.birthday, parent.user_id);
    console.log('[seed] Created uitestchild under parent_id', parent.user_id);
  } else {
    db.prepare('UPDATE Children SET password_hash=?, name=?, birthday=?, parent_id=? WHERE username=? COLLATE NOCASE')
      .run(hash, CHILD.name, CHILD.birthday, parent.user_id, CHILD.username);
    console.log('[seed] Verified uitestchild');
  }

  // ── Remove stale accounts that stole test emails ───────────────────────────
  db.prepare(`
    DELETE FROM Users
    WHERE email IN (?,?)
      AND username NOT IN (?,?)
  `).run(PARENT.email, PROVIDER.email, PARENT.username, PROVIDER.username);

  db.saveSync();
  db.close();
  console.log('[seed] Done.');
})();
