/**
 * db-setup.js — In-memory SQLite database for unit tests
 *
 * Uses sql.js (pure JS/WASM) with an in-memory database so every test suite
 * gets a fresh, isolated database that is destroyed when the process ends.
 * No test will ever touch the real asthma_tracker.db file.
 */

const fs   = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '../../src/database/schema.sql');
const buildQueries = require('../../src/database/queries');
const { createDatabaseWrapper } = require('../../src/database/db');

// Cache the sql.js SQL factory so we only load WASM once
let _SQL = null;

async function _getSqlJs() {
  if (_SQL) return _SQL;
  const initSqlJs = require('sql.js');
  const wasmPath = path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm');
  const wasmBinary = fs.readFileSync(wasmPath);
  _SQL = await initSqlJs({ wasmBinary });
  return _SQL;
}

/**
 * Create a fresh in-memory SQLite database with the full schema applied.
 * Returns a db wrapper AND a queries object wired to that in-memory db.
 */
async function createTestDb() {
  const SQL = await _getSqlJs();
  const sqlDb = new SQL.Database();
  const db = createDatabaseWrapper(sqlDb, null);

  // Apply the real schema so every table, index, and constraint is present
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);

  // Build queries using the real queries.js factory
  const queries = buildQueries(db);

  return { db, queries };
}

module.exports = { createTestDb };
