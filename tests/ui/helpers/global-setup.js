/**
 * tests/ui/helpers/global-setup.js
 *
 * Playwright global setup — runs once before the entire test suite.
 *
 * With sql.js (pure JS/WASM) there's no need for native rebuilds.
 * We just seed the test database.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT        = path.join(__dirname, '../../..');
const SEED_SCRIPT = path.join(__dirname, 'seed-db.js');

module.exports = async function globalSetup() {
  // Seed test accounts
  console.log('[setup] Seeding test accounts...');
  const seedResult = spawnSync(process.execPath, [SEED_SCRIPT], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (seedResult.status !== 0) {
    throw new Error('[setup] seed-db.js exited with code ' + seedResult.status);
  }
  console.log('[setup] Ready to run tests.');
};
