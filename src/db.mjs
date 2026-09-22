// =============================================================================
// Magazine Core — MySQL connection layer
// -----------------------------------------------------------------------------
// This file only handles the database connection and the four access tables.
// No business logic lives here. Business logic belongs to the page that uses it.
//
// Required environment variables (read from .env):
//   DB_HOST      default 127.0.0.1
//   DB_PORT      default 3306
//   DB_USER      default root
//   DB_PASSWORD  default (empty)
//   DB_NAME      default magazine_core
//   DB_POOL      default 10
//
// Required tables (create them once in your MySQL instance):
//
//   CREATE TABLE whitelist (
//     document_id VARCHAR(128) PRIMARY KEY,
//     header      VARCHAR(512) NOT NULL,
//     created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
//   );
//
//   CREATE TABLE blacklist (
//     document_id VARCHAR(128) PRIMARY KEY,
//     header      VARCHAR(512) NOT NULL,
//     reason      VARCHAR(255),
//     created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
//   );
//
//   CREATE TABLE whitelist_hash (
//     document_id VARCHAR(128) PRIMARY KEY,
//     hash        CHAR(64) NOT NULL,
//     created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
//   );
//
//   CREATE TABLE pending (
//     document_id VARCHAR(128) PRIMARY KEY,
//     header      VARCHAR(512) NOT NULL,
//     hash        CHAR(64) NOT NULL,
//     status      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
//     created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
//     reviewed_at DATETIME NULL
//   );
// =============================================================================

import process from 'node:process';
import mysql from 'mysql2/promise';

// Shared connection pool. All queries go through this pool.
const pool = mysql.createPool({
  host:     process.env.DB_HOST || '127.0.0.1',
  port:     Number(process.env.DB_PORT || 3306),
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'magazine_core',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL || 10),
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z'
});

// Simple health check used at server startup.
export async function pingDb() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

// Fetch the current state of a document_id across all four tables.
// Returns null for any table where the id is not present.
export async function findAccess(documentId) {
  const [w, b, h, p] = await Promise.all([
    pool.query('SELECT * FROM whitelist      WHERE document_id = ? LIMIT 1', [documentId]),
    pool.query('SELECT * FROM blacklist      WHERE document_id = ? LIMIT 1', [documentId]),
    pool.query('SELECT * FROM whitelist_hash WHERE document_id = ? LIMIT 1', [documentId]),
    pool.query('SELECT * FROM pending        WHERE document_id = ? LIMIT 1', [documentId])
  ]);
  return {
    whitelist: w[0][0] || null,
    blacklist: b[0][0] || null,
    hash:      h[0][0] || null,
    pending:   p[0][0] || null
  };
}

// Insert or update the whitelist row for a document_id.
export async function insertWhitelist(documentId, header) {
  await pool.execute(
    `INSERT INTO whitelist (document_id, header) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE header = VALUES(header)`,
    [documentId, header]
  );
}

// Insert or update the blacklist row for a document_id.
export async function insertBlacklist(documentId, header, reason) {
  await pool.execute(
    `INSERT INTO blacklist (document_id, header, reason) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE header = VALUES(header), reason = VALUES(reason)`,
    [documentId, header, reason || 'suspicious']
  );
}

// Insert or update the whitelist_hash row for a document_id.
export async function upsertHash(documentId, hash) {
  await pool.execute(
    `INSERT INTO whitelist_hash (document_id, hash) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE hash = VALUES(hash)`,
    [documentId, hash]
  );
}

// Insert or update the pending row for a document_id.
export async function upsertPending(documentId, header, hash, status = 'pending') {
  await pool.execute(
    `INSERT INTO pending (document_id, header, hash, status) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE header = VALUES(header), hash = VALUES(hash), status = VALUES(status)`,
    [documentId, header, hash, status]
  );
}

// Called from the external admin program when a user is approved.
// Moves them into the whitelist and marks the pending row as approved.
export async function approve(documentId) {
  const [rows] = await pool.query('SELECT * FROM pending WHERE document_id = ? LIMIT 1', [documentId]);
  const row = rows[0];
  if (!row) return false;
  await insertWhitelist(row.document_id, row.header);
  await upsertHash(row.document_id, row.hash);
  await pool.execute(
    `UPDATE pending SET status='approved', reviewed_at=NOW() WHERE document_id=?`,
    [documentId]
  );
  return true;
}

// Called from the external admin program when a user is rejected.
// Moves them into the blacklist and marks the pending row as rejected.
export async function reject(documentId, reason = 'rejected by admin') {
  const [rows] = await pool.query('SELECT * FROM pending WHERE document_id = ? LIMIT 1', [documentId]);
  const row = rows[0];
  if (!row) return false;
  await insertBlacklist(row.document_id, row.header, reason);
  await pool.execute(
    `UPDATE pending SET status='rejected', reviewed_at=NOW() WHERE document_id = ?`,
    [documentId]
  );
  return true;
}
