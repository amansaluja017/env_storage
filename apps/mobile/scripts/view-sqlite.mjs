#!/usr/bin/env node

/**
 * Mobile SQLite DB Viewer & Inspector Script
 *
 * Usage:
 *   node scripts/view-sqlite.mjs [options]
 *   npm run db:view
 *   npm run db:view -- --show-secrets
 *   npm run db:view -- --query "SELECT * FROM envs"
 *   npm run db:view -- --pull
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

// Colors for terminal formatting
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m',
  bgDark: '\x1b[40m',
};

// Remove ANSI escape codes
function stripAnsi(str) {
  return String(str).replace(/\x1b\[[0-9;]*m/g, '');
}

// Visual width of string (handles 2-width emojis/characters)
function visualWidth(str) {
  const clean = stripAnsi(str);
  let len = 0;
  for (const char of clean) {
    const code = char.codePointAt(0);
    // Common emoji and wide character ranges
    if (
      (code >= 0x1f300 && code <= 0x1f9ff) ||
      (code >= 0x2600 && code <= 0x27bf) ||
      (code >= 0xfe00 && code <= 0xfe0f)
    ) {
      len += 2;
    } else {
      len += 1;
    }
  }
  return len;
}

// Clean empty seed data (no mock envs)
const SEED_DATA = [];

function printHelp() {
  console.log(`
${c.bold}${c.cyan}TUBO MOBILE SQLITE DB INSPECTOR${c.reset}
${c.gray}View, query, and inspect the SQLite database data for Tubo Mobile.${c.reset}

${c.bold}USAGE:${c.reset}
  npm run db:view [options]
  node scripts/view-sqlite.mjs [options]

${c.bold}OPTIONS:${c.reset}
  ${c.green}-s, --show-secrets${c.reset}       Reveal plaintext values instead of masking them
  ${c.green}-e, --env <name>${c.reset}          Filter by environment ('development', 'staging', 'production')
  ${c.green}-t, --table <name>${c.reset}         Target table to view (default: 'envs')
  ${c.green}-q, --query <sql>${c.reset}          Execute custom SQL SELECT query
  ${c.green}--schema${c.reset}                  Print the SQLite database schema and tables DDL
  ${c.green}--json${c.reset}                    Output results in raw JSON format
  ${c.green}--db <path>${c.reset}               Custom path to SQLite database file
  ${c.green}--pull${c.reset}                    Attempt to pull mobile_env_vault.db from connected Android device via ADB
  ${c.green}--seed${c.reset}                    Seed default development items into local mobile_env_vault.db
  ${c.green}-h, --help${c.reset}                Show this help message

${c.bold}EXAMPLES:${c.reset}
  ${c.gray}# View all environment variables (with masked secrets)${c.reset}
  npm run db:view

  ${c.gray}# View with secrets revealed in development${c.reset}
  npm run db:view -- --show-secrets --env development

  ${c.gray}# Run a custom SQL query${c.reset}
  npm run db:view -- --query "SELECT key, value, environment FROM envs WHERE is_secret = 1"

  ${c.gray}# View database schema${c.reset}
  npm run db:view -- --schema

  ${c.gray}# Output as JSON${c.reset}
  npm run db:view -- --json
`);
}

// Parse command line arguments
function parseArgs(args) {
  const options = {
    showSecrets: false,
    env: null,
    table: 'envs',
    query: null,
    schema: false,
    json: false,
    dbPath: null,
    pull: false,
    seed: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (arg === '-s' || arg === '--show-secrets' || arg === '--reveal') {
      options.showSecrets = true;
    } else if (arg === '-e' || arg === '--env') {
      options.env = args[++i];
    } else if (arg.startsWith('--env=')) {
      options.env = arg.split('=')[1];
    } else if (arg === '-t' || arg === '--table') {
      options.table = args[++i];
    } else if (arg.startsWith('--table=')) {
      options.table = arg.split('=')[1];
    } else if (arg === '-q' || arg === '--query') {
      options.query = args[++i];
    } else if (arg.startsWith('--query=')) {
      options.query = arg.substring('--query='.length);
    } else if (arg === '--schema') {
      options.schema = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--db') {
      options.dbPath = args[++i];
    } else if (arg.startsWith('--db=')) {
      options.dbPath = arg.split('=')[1];
    } else if (arg === '--pull') {
      options.pull = true;
    } else if (arg === '--seed') {
      options.seed = true;
    } else if (!arg.startsWith('-') && !options.dbPath && arg.endsWith('.db')) {
      options.dbPath = arg;
    }
  }

  return options;
}

// Pull DB from connected Android device via ADB
function tryPullFromAdb(targetPath) {
  try {
    const devices = execSync('adb devices', { encoding: 'utf8' })
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('List') && !l.startsWith('*'));

    if (devices.length === 0) {
      return { success: false, reason: 'No ADB devices or emulators attached.' };
    }

    console.log(`${c.cyan}ℹ Found connected ADB device. Attempting to pull SQLite DB...${c.reset}`);

    const candidates = [
      'host.exp.exponent', // Expo Go
      'com.tubo.envvault',  // Dev client / Standalone
    ];

    for (const pkg of candidates) {
      try {
        const cmd = `adb exec-out run-as ${pkg} cat files/SQLite/mobile_env_vault.db > "${targetPath}"`;
        execSync(cmd, { stdio: 'pipe' });
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
          return { success: true, package: pkg };
        }
      } catch {
        // Continue trying other candidates
      }
    }

    return {
      success: false,
      reason: 'Could not access database from running app via run-as (app may not be debuggable or DB not created yet).',
    };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

// Resolve SQLite Database file path
function resolveDatabasePath(customPath, pullFlag) {
  const cwd = process.cwd();
  const defaultFileName = 'mobile_env_vault.db';
  const resolvedDefault = path.resolve(cwd, defaultFileName);

  if (customPath) {
    return path.resolve(cwd, customPath);
  }

  if (pullFlag) {
    const pullResult = tryPullFromAdb(resolvedDefault);
    if (pullResult.success) {
      console.log(`${c.green}✔ Successfully pulled ${defaultFileName} from Android device (${pullResult.package})!${c.reset}\n`);
      return resolvedDefault;
    } else {
      console.log(`${c.yellow}⚠ ADB Pull failed: ${pullResult.reason}${c.reset}\n`);
    }
  }

  // Check common locations
  const candidatePaths = [
    resolvedDefault,
    path.resolve(cwd, 'data', defaultFileName),
    path.resolve(cwd, '..', '..', 'data', defaultFileName),
    path.resolve(cwd, '..', 'api', 'data', 'tubo_envs.db'),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return resolvedDefault;
}

// Initialize and seed database if missing or requested
function ensureDatabase(dbPath, forceSeed = false) {
  const exists = fs.existsSync(dbPath);

  const db = new DatabaseSync(dbPath);

  // Initialize tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      environment TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL DEFAULT 'Unknown',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS envs (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      environment TEXT NOT NULL,
      folder_id TEXT,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      is_secret INTEGER NOT NULL DEFAULT 1,
      comment TEXT,
      created_by TEXT NOT NULL DEFAULT 'Unknown',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  try {
    db.exec(`ALTER TABLE envs ADD COLUMN folder_id TEXT;`);
  } catch {}

  const countRow = db.prepare('SELECT COUNT(*) as count FROM envs').get();
  const count = countRow ? countRow.count : 0;

  if (count === 0 || forceSeed) {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO envs (
        id, workspace_id, team_id, environment, key, value, is_secret, comment, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of SEED_DATA) {
      insertStmt.run(
        item.id,
        item.workspaceId,
        item.teamId,
        item.environment,
        item.key,
        item.value,
        item.isSecret,
        item.comment,
        item.createdBy,
        item.createdAt,
        item.updatedAt
      );
    }

    if (!exists || forceSeed) {
      console.log(`${c.green}✔ Initialized SQLite database with ${SEED_DATA.length} default environment records.${c.reset}\n`);
    }
  }

  return db;
}

// Format raw field values for tabular display
function formatCellValue(rawVal, colKey, isSecret, showSecrets) {
  const isSecretBool = isSecret === 1 || isSecret === true || isSecret === '1';

  if (colKey === 'value' && isSecretBool && !showSecrets) {
    return {
      display: `${c.gray}••••••••••••${c.reset}`,
      raw: '••••••••••••',
    };
  }

  let text = String(rawVal ?? '');

  if (colKey === 'environment') {
    if (text === 'production') return { display: `${c.red}${text}${c.reset}`, raw: text };
    if (text === 'staging') return { display: `${c.yellow}${text}${c.reset}`, raw: text };
    return { display: `${c.green}${text}${c.reset}`, raw: text };
  }

  if (colKey === 'key') {
    return { display: `${c.bold}${c.magenta}${text}${c.reset}`, raw: text };
  }

  if (colKey === 'is_secret') {
    return isSecretBool
      ? { display: `${c.yellow}Yes${c.reset}`, raw: 'Yes' }
      : { display: `${c.gray}No${c.reset}`, raw: 'No' };
  }

  return { display: text, raw: text };
}

// Formatted ASCII Table output
function renderTable(headers, rows, options = {}) {
  if (rows.length === 0) {
    console.log(`${c.yellow}(No records found matching criteria)${c.reset}\n`);
    return;
  }

  // Pre-format all cells to know exact visual widths
  const formattedMatrix = rows.map(row => {
    return headers.map(h => {
      const isSec = row.is_secret ?? row.isSecret;
      const cell = formatCellValue(row[h.key], h.key, isSec, options.showSecrets);
      let text = cell.raw;
      const maxW = h.maxWidth || 45;
      if (text.length > maxW) {
        text = text.substring(0, maxW - 1) + '…';
        return {
          display: cell.display.includes('\x1b')
            ? cell.display.replace(cell.raw, text)
            : text,
          raw: text,
        };
      }
      return cell;
    });
  });

  // Calculate column widths
  const colWidths = headers.map((h, colIdx) => {
    let max = h.label.length;
    formattedMatrix.forEach(rowCells => {
      const w = visualWidth(rowCells[colIdx].raw);
      if (w > max) max = w;
    });
    return max;
  });

  const sepTop = '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
  const sepMid = '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
  const sepBottom = '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';

  console.log(c.gray + sepTop + c.reset);

  // Print Header Row
  const headerLine = headers
    .map((h, i) => {
      const pad = ' '.repeat(colWidths[i] - h.label.length);
      return ` ${c.bold}${c.cyan}${h.label}${c.reset}${pad} `;
    })
    .join(c.gray + '│' + c.reset);
  console.log(c.gray + '│' + c.reset + headerLine + c.gray + '│' + c.reset);

  console.log(c.gray + sepMid + c.reset);

  // Print Data Rows
  formattedMatrix.forEach(rowCells => {
    const rowLine = rowCells
      .map((cell, i) => {
        const w = visualWidth(cell.raw);
        const pad = ' '.repeat(Math.max(0, colWidths[i] - w));
        return ` ${cell.display}${pad} `;
      })
      .join(c.gray + '│' + c.reset);

    console.log(c.gray + '│' + c.reset + rowLine + c.gray + '│' + c.reset);
  });

  console.log(c.gray + sepBottom + c.reset);
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  const dbPath = resolveDatabasePath(options.dbPath, options.pull);
  const db = ensureDatabase(dbPath, options.seed);

  // Retrieve SQLite metadata
  let stats;
  try {
    stats = fs.statSync(dbPath);
  } catch {
    stats = { size: 0, mtime: new Date() };
  }

  // Get all tables
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();

  if (options.json) {
    if (options.query) {
      const rows = db.prepare(options.query).all();
      console.log(JSON.stringify(rows, null, 2));
    } else {
      let query = `SELECT * FROM ${options.table}`;
      if (options.env && options.table === 'envs') {
        query += ` WHERE environment = '${options.env}'`;
      }
      const rows = db.prepare(query).all();
      console.log(JSON.stringify(rows, null, 2));
    }
    return;
  }

  // Header Banner
  console.log(`\n${c.bold}${c.cyan}TUBO MOBILE SQLITE DATABASE INSPECTOR${c.reset}`);
  console.log(`${c.gray}${'═'.repeat(65)}${c.reset}`);
  console.log(`  ${c.bold}Database File:${c.reset}   ${c.green}${dbPath}${c.reset}`);
  console.log(`  ${c.bold}File Size:${c.reset}       ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`  ${c.bold}Last Modified:${c.reset}   ${stats.mtime.toLocaleString()}`);
  console.log(`  ${c.bold}Tables Found:${c.reset}    ${tables.map(t => `${c.yellow}${t.name}${c.reset}`).join(', ') || 'None'}`);
  console.log(`${c.gray}${'═'.repeat(65)}${c.reset}\n`);

  // Schema mode
  if (options.schema) {
    console.log(`${c.bold}${c.cyan}DATABASE SCHEMA (DDL):${c.reset}\n`);
    const ddlRows = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
    ddlRows.forEach(row => {
      console.log(`${c.bold}${c.yellow}--- ${row.type.toUpperCase()}: ${row.name} ---${c.reset}`);
      console.log(`${c.gray}${row.sql}${c.reset}\n`);
    });
    return;
  }

  // Custom query mode
  if (options.query) {
    console.log(`${c.bold}Executing SQL Query:${c.reset} ${c.yellow}${options.query}${c.reset}\n`);
    try {
      const rows = db.prepare(options.query).all();
      if (rows.length === 0) {
        console.log(`${c.gray}(Query returned 0 rows)${c.reset}\n`);
        return;
      }
      const sampleRow = rows[0];
      const headers = Object.keys(sampleRow).map(k => ({ key: k, label: k.toUpperCase(), maxWidth: 35 }));
      renderTable(headers, rows, options);
      console.log(`${c.green}Total rows returned: ${rows.length}${c.reset}\n`);
    } catch (err) {
      console.error(`${c.red}Query Error: ${err.message}${c.reset}\n`);
    }
    return;
  }

  // Default: View 'envs' table
  let sql = 'SELECT id, workspace_id, team_id, environment, key, value, is_secret, comment, created_by, updated_at FROM envs';
  const conditions = [];

  if (options.env) {
    conditions.push(`environment = '${options.env.replace(/'/g, "''")}'`);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY environment ASC, key ASC';

  try {
    const rows = db.prepare(sql).all();

    console.log(`${c.bold}TABLE:${c.reset} ${c.yellow}envs${c.reset} ${options.env ? `(${c.cyan}filter: ${options.env}${c.reset})` : ''}`);
    if (!options.showSecrets) {
      console.log(`${c.gray}💡 Secret values are masked by default. Run with ${c.yellow}--show-secrets${c.gray} or ${c.yellow}-s${c.gray} to reveal.${c.reset}`);
    } else {
      console.log(`${c.yellow}⚠ Warning: Showing unmasked secrets!${c.reset}`);
    }
    console.log('');

    const headers = [
      { key: 'key', label: 'KEY', maxWidth: 22 },
      { key: 'value', label: 'VALUE', maxWidth: 36 },
      { key: 'environment', label: 'ENV', maxWidth: 14 },
      { key: 'is_secret', label: 'SECRET', maxWidth: 8 },
      { key: 'workspace_id', label: 'WORKSPACE', maxWidth: 15 },
      { key: 'team_id', label: 'TEAM', maxWidth: 15 },
      { key: 'comment', label: 'COMMENT', maxWidth: 32 },
    ];

    renderTable(headers, rows, options);

    // Summary breakdown
    const envCounts = db
      .prepare('SELECT environment, COUNT(*) as count FROM envs GROUP BY environment')
      .all();
    const countSummary = envCounts.map(e => `${e.environment}: ${c.bold}${e.count}${c.reset}`).join('  |  ');

    console.log(`${c.bold}Total Records:${c.reset} ${c.green}${rows.length}${c.reset}   [ Breakdown: ${countSummary} ]\n`);
  } catch (err) {
    console.error(`${c.red}Error querying table 'envs': ${err.message}${c.reset}\n`);
  }
}

main();
