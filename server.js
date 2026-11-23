require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { createClerkClient, verifyToken } = require('@clerk/backend');
const multer = require('multer');
const fs = require('fs');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const pino = require('pino');

// Custom middleware
const errorHandler = require('./middleware/errorHandler');
const validate = require('./middleware/validate');

// Structured Logger
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Fail fast rather than silently signing/authenticating with a well-known default secret
for (const name of ['VENDOR_JWT_SECRET', 'AUDIT_SECRET']) {
  if (!process.env[name]) {
    logger.error(`${name} is not set in the environment. Refusing to start with a guessable default secret — set ${name} in .env.`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Clerk backend client for JWT verification
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

// ══════════ SECURITY MIDDLEWARE ══════════

// Helmet for security headers (with CSP configured for Clerk & Tesseract CDNs)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://*.clerk.accounts.dev", "https://challenges.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://img.clerk.com", "https://*.clerk.accounts.dev"],
      connectSrc: ["'self'", "https://*.clerk.accounts.dev", "https://api.clerk.com", "https://cdn.jsdelivr.net"],
      // blob: lets the UI preview PDFs fetched through the authenticated /api/files endpoint
      frameSrc: ["'self'", "blob:", "https://*.clerk.accounts.dev", "https://challenges.cloudflare.com"],
      workerSrc: ["'self'", "blob:"],
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Gzip compression
app.use(compression());

// CORS - scoped origins (include React dev server port 3001)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:3002', 'http://127.0.0.1:3002'];
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});
app.use('/api/', apiLimiter);

const actionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Action rate limit exceeded.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' }
});

app.use(express.json({ limit: '10mb' }));

// Serve the built frontend if present. Deliberately no fallback to serving __dirname —
// doing so would expose server.js, finance.db, .env.example, node_modules, etc. to the
// public internet whenever the frontend hasn't been built yet.
const frontendBuildPath = path.join(__dirname, 'frontend', 'build');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
} else {
  logger.warn('frontend/build not found — run "npm run build" to serve the UI. Static file serving is disabled until then.');
}

// Set trust proxy for correct IP (needed because React proxy adds X-Forwarded-For)
app.set('trust proxy', 1);

// ══════════ ZOD VALIDATION SCHEMAS ══════════
const syncUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  role: z.enum(['DEV', 'FIN', 'OWN', 'ADM', 'VND', 'EMP', 'VRF'])
});

const createRequestSchema = z.object({
  amount: z.number().positive().max(10000000),
  purpose: z.string().min(1).max(500).trim(),
  file_hash: z.string().optional(),
  metadata: z.string().optional(),
  verifier: z.string().optional() // First-line verifier chosen by vendor
});

const actionSchema = z.object({
  id: z.string().min(1),
  nextState: z.enum(['PND', 'VRF', 'FIN', 'OWN', 'DSB', 'REJ']),
  comment: z.string().min(1).max(500)
});

const updateRoleSchema = z.object({
  role: z.enum(['DEV', 'FIN', 'OWN', 'ADM', 'VND', 'EMP', 'VRF'])
});

// ══════════ DATABASE ══════════
let isPostgres = false;
let pool = null;
let sqliteDb = null;

// Helper to convert SQLite "?" placeholders to PG "$1, $2, ..."
function pgSql(sql) {
  if (!sql) return sql;
  let cleanSql = sql;
  if (/INSERT\s+OR\s+IGNORE\s+INTO\s+users/i.test(cleanSql)) {
    cleanSql = cleanSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO\s+users/i, 'INSERT INTO users');
    cleanSql = cleanSql + ' ON CONFLICT (id) DO NOTHING';
  }
  let index = 1;
  return cleanSql.replace(/\?/g, () => `$${index++}`);
}

const db = {
  get: (sql, params, cb) => {
    if (typeof params === 'function') {
      cb = params;
      params = [];
    }
    if (isPostgres) {
      pool.query(pgSql(sql), params, (err, res) => {
        if (err) return cb(err);
        cb(null, res.rows[0]);
      });
    } else {
      sqliteDb.get(sql, params, cb);
    }
  },
  all: (sql, params, cb) => {
    if (typeof params === 'function') {
      cb = params;
      params = [];
    }
    if (isPostgres) {
      pool.query(pgSql(sql), params, (err, res) => {
        if (err) return cb(err);
        cb(null, res.rows);
      });
    } else {
      sqliteDb.all(sql, params, cb);
    }
  },
  run: function(sql, params, cb) {
    if (typeof params === 'function') {
      cb = params;
      params = [];
    }
    if (isPostgres) {
      pool.query(pgSql(sql), params, (err, res) => {
        if (err) {
          if (cb) cb(err);
          return;
        }
        if (cb) {
          cb.call({ changes: res.rowCount }, null);
        }
      });
    } else {
      sqliteDb.run(sql, params, function(err) {
        if (err) {
          if (cb) cb(err);
          return;
        }
        if (cb) {
          cb.call({ changes: this.changes }, null);
        }
      });
    }
  },
  close: (cb) => {
    if (isPostgres) {
      pool.end(cb);
    } else {
      sqliteDb.close(cb);
    }
  },
  serialize: (cb) => {
    if (isPostgres) {
      cb();
    } else {
      sqliteDb.serialize(cb);
    }
  }
};

// Automate creation of database if it doesn't exist
async function ensureDatabaseExists(pgConfig) {
  const adminPool = new Pool({
    host: pgConfig.host,
    port: pgConfig.port,
    user: pgConfig.user,
    password: pgConfig.password,
    database: 'postgres'
  });
  try {
    const dbName = pgConfig.database;
    const res = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount === 0) {
      logger.info(`Database "${dbName}" does not exist. Creating it...`);
      await adminPool.query(`CREATE DATABASE "${dbName}"`);
      logger.info(`Database "${dbName}" created successfully.`);
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to verify/create database; assuming it already exists.');
  } finally {
    await adminPool.end();
  }
}

async function initPostgres(pgConfig) {
  pool = new Pool(pgConfig);
  // Verify Postgres connection
  await pool.query('SELECT 1');
  logger.info('Successfully connected to PostgreSQL');

  await ensureDatabaseExists(pgConfig);

  // Initialize Postgres schemas
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'DEV',
    hash TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    amount DOUBLE PRECISION NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PND',
    requester TEXT NOT NULL,
    verifier TEXT DEFAULT NULL,
    ts TEXT NOT NULL,
    deleted_at TEXT DEFAULT NULL,
    file_hash TEXT DEFAULT NULL,
    metadata TEXT DEFAULT NULL,
    FOREIGN KEY (requester) REFERENCES users(id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    reqId TEXT NOT NULL,
    actor TEXT NOT NULL,
    prev TEXT,
    next TEXT,
    comment TEXT,
    ts TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    signature TEXT
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS state_transitions (
    id SERIAL PRIMARY KEY,
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    required_role TEXT NOT NULL,
    UNIQUE(from_state, to_state, required_role)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    rating TEXT DEFAULT 'B',
    performance_score DOUBLE PRECISION DEFAULT 0,
    payment_terms TEXT DEFAULT 'Net 30',
    total_paid DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'info',
    read INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    details TEXT,
    partner_name TEXT,
    partner_phone TEXT,
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
  )`);
  // Add columns if table already exists (migration)
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS partner_name TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS partner_phone TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date TEXT`).catch(() => {});

  await pool.query(`CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    request_id TEXT,
    filename TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    file_hash TEXT,
    uploaded_by TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES requests(id)
  )`);
  await pool.query(`ALTER TABLE attachments ADD COLUMN IF NOT EXISTS uploaded_by TEXT`).catch(() => {});

  await pool.query(`CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    vendor_id TEXT,
    cost DOUBLE PRECISION DEFAULT 0,
    billing_cycle TEXT DEFAULT 'Monthly',
    next_renewal_date TEXT,
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS employee_queries (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    recipient_role TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'Open',
    response TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES users(id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS worksheets (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    date TEXT NOT NULL,
    tasks_completed TEXT NOT NULL,
    tasks_in_progress TEXT,
    blockers TEXT,
    tomorrow_plan TEXT,
    productivity INTEGER DEFAULT 3,
    hours_worked DOUBLE PRECISION DEFAULT 8,
    mood INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES users(id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS billing_docs (
    id TEXT PRIMARY KEY,
    doc_type TEXT NOT NULL,
    doc_number TEXT UNIQUE NOT NULL,
    project_id TEXT,
    project_code TEXT,
    project_name TEXT,
    client_name TEXT NOT NULL,
    client_address TEXT,
    client_gstin TEXT,
    client_state TEXT,
    client_email TEXT,
    client_phone TEXT,
    issue_date TEXT NOT NULL,
    due_date TEXT,
    items TEXT NOT NULL,
    tax_mode TEXT NOT NULL DEFAULT 'IGST',
    tax_rate DOUBLE PRECISION NOT NULL DEFAULT 18,
    subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
    tax_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    total DOUBLE PRECISION NOT NULL DEFAULT 0,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'Issued',
    source_id TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_billing_type ON billing_docs(doc_type)');
  // Advance / final invoices: see BILLING_STAGES
  for (const col of ['billing_stage TEXT', 'advance_amount DOUBLE PRECISION', 'balance_due DOUBLE PRECISION', 'adjusted_advances TEXT', 'adjusted_in TEXT']) {
    await pool.query(`ALTER TABLE billing_docs ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS invoice_codes (
    code TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    issued_to TEXT NOT NULL,
    file_hash TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS partner_project_locks (
    session_key TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    expires_at TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS invoice_code TEXT`).catch(() => {});

  await pool.query('CREATE INDEX IF NOT EXISTS idx_requests_requester ON requests(requester)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_requests_deleted ON requests(deleted_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_reqId ON audit_logs(reqId)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');

  // Remove the 1st-line verify stage (PND -> VRF) from the pipeline going forward.
  // VRF -> OWN / VRF -> REJ are kept so any request already sitting at VRF from
  // before this change can still be moved forward instead of getting stuck.
  await pool.query(`DELETE FROM state_transitions WHERE (from_state, to_state, required_role) IN (
    ('PND','VRF','VRF'), ('PND','VRF','FIN'), ('PND','VRF','OWN'), ('PND','VRF','ADM'),
    ('PND','REJ','VRF'), ('REJ','VRF','OWN')
  )`);

  // Seed transitions
  const transitions = [
    ['PND', 'OWN', 'OWN'], // Owner validates directly on submission (1st-line verify removed)
    ['PND', 'REJ', 'FIN'],
    ['PND', 'REJ', 'OWN'],

    ['VRF', 'OWN', 'OWN'], // Legacy bridge for any pre-existing VRF-status request
    ['VRF', 'REJ', 'OWN'],

    ['OWN', 'FIN', 'FIN'], // Finance verifies after Owner
    ['OWN', 'REJ', 'FIN'],

    ['FIN', 'DSB', 'FIN'], // Finance disburses
    ['FIN', 'DSB', 'SYSTEM'],

    ['REJ', 'PND', 'FIN'],

    // Admin overrides
    ['PND', 'OWN', 'ADM'],
    ['VRF', 'OWN', 'ADM'],
    ['OWN', 'FIN', 'ADM'],
    ['FIN', 'DSB', 'ADM'],
    ['PND', 'REJ', 'ADM'],
    ['VRF', 'REJ', 'ADM'],
    ['OWN', 'REJ', 'ADM'],
    ['FIN', 'REJ', 'ADM'],
  ];

  for (const t of transitions) {
    await pool.query(
      'INSERT INTO state_transitions (from_state, to_state, required_role) VALUES ($1, $2, $3) ON CONFLICT (from_state, to_state, required_role) DO NOTHING',
      t
    );
  }

  isPostgres = true;
  logger.info('PostgreSQL database fully initialized.');
  initVendorAccounts();
}

function initSQLite() {
  logger.info('PostgreSQL connection skipped/failed. Initializing SQLite Database fallback...');
  const sqlite3 = require('sqlite3').verbose();
  sqliteDb = new sqlite3.Database('./finance.db', (err) => {
    if (err) {
      logger.error({ err }, 'Error opening SQLite fallback database');
      return;
    }
    logger.info('SQLite fallback database connected');
    
    // Run schemas
    sqliteDb.serialize(() => {
      sqliteDb.run('PRAGMA foreign_keys = ON');
      sqliteDb.run('PRAGMA journal_mode = WAL');

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'DEV',
        hash TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        purpose TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PND',
        requester TEXT NOT NULL,
        verifier TEXT DEFAULT NULL,
        ts TEXT NOT NULL,
        deleted_at TEXT DEFAULT NULL,
        file_hash TEXT DEFAULT NULL,
        metadata TEXT DEFAULT NULL,
        FOREIGN KEY (requester) REFERENCES users(id)
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reqId TEXT NOT NULL,
        actor TEXT NOT NULL,
        prev TEXT,
        next TEXT,
        comment TEXT,
        ts TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        signature TEXT
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS state_transitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_state TEXT NOT NULL,
        to_state TEXT NOT NULL,
        required_role TEXT NOT NULL,
        UNIQUE(from_state, to_state, required_role)
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS vendors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        rating TEXT DEFAULT 'B',
        performance_score REAL DEFAULT 0,
        payment_terms TEXT DEFAULT 'Net 30',
        total_paid REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        type TEXT DEFAULT 'info',
        read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        details TEXT,
        partner_name TEXT,
        partner_phone TEXT,
        status TEXT DEFAULT 'Active',
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      )`);
      // Migration: add columns if table already exists
      sqliteDb.run(`ALTER TABLE projects ADD COLUMN partner_name TEXT`, () => {});
      sqliteDb.run(`ALTER TABLE projects ADD COLUMN partner_phone TEXT`, () => {});
      sqliteDb.run(`ALTER TABLE projects ADD COLUMN project_type TEXT`, () => {});
      sqliteDb.run(`ALTER TABLE projects ADD COLUMN start_date TEXT`, () => {});

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        request_id TEXT,
        filename TEXT NOT NULL,
        mime_type TEXT,
        file_size INTEGER,
        file_hash TEXT,
        uploaded_by TEXT,
        uploaded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (request_id) REFERENCES requests(id)
      )`);
      sqliteDb.run(`ALTER TABLE attachments ADD COLUMN uploaded_by TEXT`, () => {});

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        vendor_id TEXT,
        cost REAL DEFAULT 0,
        billing_cycle TEXT DEFAULT 'Monthly',
        next_renewal_date TEXT,
        status TEXT DEFAULT 'Active',
        created_at TEXT DEFAULT (datetime('now'))
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS employee_queries (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        recipient_role TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT DEFAULT 'Open',
        response TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (employee_id) REFERENCES users(id)
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS worksheets (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        date TEXT NOT NULL,
        tasks_completed TEXT NOT NULL,
        tasks_in_progress TEXT,
        blockers TEXT,
        tomorrow_plan TEXT,
        productivity INTEGER DEFAULT 3,
        hours_worked REAL DEFAULT 8,
        mood INTEGER DEFAULT 3,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (employee_id) REFERENCES users(id)
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS billing_docs (
        id TEXT PRIMARY KEY,
        doc_type TEXT NOT NULL,
        doc_number TEXT UNIQUE NOT NULL,
        project_id TEXT,
        project_code TEXT,
        project_name TEXT,
        client_name TEXT NOT NULL,
        client_address TEXT,
        client_gstin TEXT,
        client_state TEXT,
        client_email TEXT,
        client_phone TEXT,
        issue_date TEXT NOT NULL,
        due_date TEXT,
        items TEXT NOT NULL,
        tax_mode TEXT NOT NULL DEFAULT 'IGST',
        tax_rate REAL NOT NULL DEFAULT 18,
        subtotal REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'Issued',
        source_id TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_billing_type ON billing_docs(doc_type)');
      for (const col of ['billing_stage TEXT', 'advance_amount REAL', 'balance_due REAL', 'adjusted_advances TEXT', 'adjusted_in TEXT']) {
        sqliteDb.run(`ALTER TABLE billing_docs ADD COLUMN ${col}`, () => {});
      }

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS invoice_codes (
        code TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        issued_to TEXT NOT NULL,
        file_hash TEXT UNIQUE,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      sqliteDb.run(`CREATE TABLE IF NOT EXISTS partner_project_locks (
        session_key TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        expires_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      sqliteDb.run(`ALTER TABLE requests ADD COLUMN invoice_code TEXT`, () => {});

      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_requests_requester ON requests(requester)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_requests_deleted ON requests(deleted_at)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_audit_reqId ON audit_logs(reqId)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');

      // Remove the 1st-line verify stage (PND -> VRF) from the pipeline going forward.
      // VRF -> OWN / VRF -> REJ are kept so any request already sitting at VRF from
      // before this change can still be moved forward instead of getting stuck.
      sqliteDb.run(`DELETE FROM state_transitions WHERE (from_state || '|' || to_state || '|' || required_role) IN (
        'PND|VRF|VRF', 'PND|VRF|FIN', 'PND|VRF|OWN', 'PND|VRF|ADM',
        'PND|REJ|VRF', 'REJ|VRF|OWN'
      )`);

      const transitions = [
        ['PND', 'OWN', 'OWN'], // Owner validates directly on submission (1st-line verify removed)
        ['PND', 'REJ', 'FIN'],
        ['PND', 'REJ', 'OWN'],

        ['VRF', 'OWN', 'OWN'], // Legacy bridge for any pre-existing VRF-status request
        ['VRF', 'REJ', 'OWN'],

        ['OWN', 'FIN', 'FIN'], // Finance verifies after Owner
        ['OWN', 'REJ', 'FIN'],

        ['FIN', 'DSB', 'FIN'], // Finance disburses
        ['FIN', 'DSB', 'SYSTEM'],

        ['REJ', 'PND', 'FIN'],

        // Admin overrides
        ['PND', 'OWN', 'ADM'],
        ['VRF', 'OWN', 'ADM'],
        ['OWN', 'FIN', 'ADM'],
        ['FIN', 'DSB', 'ADM'],
        ['PND', 'REJ', 'ADM'],
        ['VRF', 'REJ', 'ADM'],
        ['OWN', 'REJ', 'ADM'],
        ['FIN', 'REJ', 'ADM'],
      ];

      const stmt = sqliteDb.prepare('INSERT OR IGNORE INTO state_transitions (from_state, to_state, required_role) VALUES (?, ?, ?)');
      transitions.forEach(t => stmt.run(t));
      stmt.finalize();

      logger.info('SQLite fallback database and schema initialized successfully.');
      initVendorAccounts();
    });
  });
  isPostgres = false;
}

async function initDb() {
  const pgConfig = process.env.DATABASE_URL 
    ? { 
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('.render.com') ? { rejectUnauthorized: false } : false
      }
    : {
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432'),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'finance',
        ssl: process.env.PGHOST && process.env.PGHOST !== 'localhost' && process.env.PGHOST.includes('.') ? { rejectUnauthorized: false } : false
      };

  try {
    await initPostgres(pgConfig);
  } catch (err) {
    logger.warn({ err: err.message }, 'PostgreSQL connection failed. Falling back to SQLite...');
    initSQLite();
  }
}

initDb();

// ══════════ HELPER: HMAC Audit Signature ══════════
const AUDIT_SECRET = process.env.AUDIT_SECRET;
function signAuditEntry(reqId, actor, prev, next, comment, ts) {
  const payload = `${reqId}|${actor}|${prev}|${next}|${comment}|${ts}`;
  return crypto.createHmac('sha256', AUDIT_SECRET).update(payload).digest('hex');
}

// ══════════ EMAIL → ROLE MAPPING (Fixed Roles) ══════════
// Team emails are NOT kept in source (this repository is public). The map is read from
// the EMAIL_ROLE_MAP env var (JSON) or, if that is unset, from a git-ignored roles.json
// next to this file. See roles.example.json for the format.
const VALID_ROLES = ['DEV', 'FIN', 'OWN', 'ADM', 'VND', 'EMP', 'VRF'];

function loadEmailRoleMap() {
  let raw = process.env.EMAIL_ROLE_MAP;
  let source = 'EMAIL_ROLE_MAP env var';
  if (!raw) {
    const rolesFile = path.join(__dirname, 'roles.json');
    if (fs.existsSync(rolesFile)) {
      raw = fs.readFileSync(rolesFile, 'utf8');
      source = 'roles.json';
    }
  }
  if (!raw) {
    logger.warn('No EMAIL_ROLE_MAP env var or roles.json found — every Clerk user will get role NONE (no access).');
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.error(`Could not parse ${source} as JSON (${err.message}). Refusing to start with a broken role map.`);
    process.exit(1);
  }
  const map = {};
  for (const [email, entry] of Object.entries(parsed || {})) {
    if (!entry || !VALID_ROLES.includes(entry.role)) {
      logger.warn(`Skipping role mapping for "${email}" in ${source}: role must be one of ${VALID_ROLES.join(', ')}.`);
      continue;
    }
    map[email.toLowerCase()] = { role: entry.role, name: entry.name || email };
  }
  logger.info(`Loaded ${Object.keys(map).length} email role mapping(s) from ${source}.`);
  return map;
}

const EMAIL_ROLE_MAP = loadEmailRoleMap();

function getRoleByEmail(email) {
  if (!email) return null;
  return EMAIL_ROLE_MAP[email.toLowerCase()] || null;
}

// ══════════ VENDOR AUTH (Simple ID/Password, No Clerk) ══════════
const VENDOR_JWT_SECRET = process.env.VENDOR_JWT_SECRET;
const jwt = require('jsonwebtoken');

// Salted password hashing (scrypt) — stored as "scrypt:<saltHex>:<hashHex>".
// verifyPassword() also accepts legacy unsalted-SHA256 hashes (64 hex chars) so
// existing DB rows keep working, and transparently upgrades them on next login.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.startsWith('scrypt:')) {
    const [, salt, hash] = stored.split(':');
    const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(candidate, 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  // Legacy unsalted SHA-256 hash
  const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
  const a = Buffer.from(legacyHash, 'utf8');
  const b = Buffer.from(stored, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Default local (non-Clerk) accounts seeded into DB on startup. Their passwords come ONLY
// from DEFAULT_VENDOR_PASSWORD / DEFAULT_EMPLOYEE_PASSWORD — there is no built-in fallback,
// because the old fallbacks ('partner123' / 'employee123') are public in this repository.
const DEFAULT_VENDORS = [
  { id: 'partner001', password: process.env.DEFAULT_VENDOR_PASSWORD, name: 'Default Partner' },
];
const DEFAULT_EMPLOYEES = [
  { id: 'employee001', password: process.env.DEFAULT_EMPLOYEE_PASSWORD, name: 'Default Employee' },
];
// Passwords that earlier versions seeded automatically. An account still using one of these
// is replaced with the configured password on startup (or loudly flagged if none is set).
const LEGACY_DEFAULT_PASSWORDS = { VND: 'partner123', EMP: 'employee123' };

function seedLocalAccounts(accounts, role, envVarName) {
  const legacyPassword = LEGACY_DEFAULT_PASSWORDS[role];
  accounts.forEach(v => {
    db.get('SELECT hash FROM users WHERE id = ?', [v.id], (err, row) => {
      if (err) return logger.error({ err }, `Could not check local account ${v.id}`);
      const usesLegacyDefault = !!(row && row.hash && verifyPassword(legacyPassword, row.hash));

      if (!v.password) {
        if (usesLegacyDefault) {
          logger.error(`Account ${v.id} still accepts the publicly known default password. Set ${envVarName} and restart to replace it.`);
        } else if (!row) {
          logger.warn(`${envVarName} not set — not creating the ${v.id} account.`);
        }
        return;
      }

      const hashedPw = hashPassword(v.password);
      if (!row) {
        db.run('INSERT OR IGNORE INTO users (id, name, role, hash, updated_at) VALUES (?, ?, ?, ?, ?)',
          [v.id, v.name, role, hashedPw, new Date().toISOString()]);
      } else if (!row.hash || usesLegacyDefault) {
        // Fill in a missing hash, or rotate away from the public default. A password that was
        // already changed to something else is left alone.
        db.run('UPDATE users SET hash = ?, updated_at = ? WHERE id = ?', [hashedPw, new Date().toISOString(), v.id]);
        if (usesLegacyDefault) logger.warn(`Replaced the public default password on ${v.id} with ${envVarName}.`);
      }
    });
  });
}

function initVendorAccounts() {
  seedLocalAccounts(DEFAULT_VENDORS, 'VND', 'DEFAULT_VENDOR_PASSWORD');
  seedLocalAccounts(DEFAULT_EMPLOYEES, 'EMP', 'DEFAULT_EMPLOYEE_PASSWORD');
  logger.info('Vendor and employee local accounts initialized');
}

// Initialize vendor accounts (called automatically when DB initialization completes)

// ══════════ AUTH MIDDLEWARE ══════════
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }
    const token = authHeader.split(' ')[1];
    
    // ── Try local (non-Clerk) Vendor/Employee JWT first ──
    try {
      const localPayload = jwt.verify(token, VENDOR_JWT_SECRET);
      const localId = localPayload && (localPayload.vendorId || localPayload.employeeId);
      if (localId) {
        db.get('SELECT * FROM users WHERE id = ?', [localId], (err, user) => {
          if (err) return next(err);
          if (!user) return res.status(401).json({ error: 'Account not found' });
          req.user = user;
          req.clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
          req.clientAgent = req.headers['user-agent'] || 'unknown';
          next();
        });
        return;
      }
    } catch (localErr) {
      // Not a local vendor/employee token, continue to Clerk verification
    }

    // ── Verify the Clerk JWT token ──
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    const userId = payload.sub;
    
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) return next(err);
      if (!user) {
        // Auto-create user — use email-based role if available
        const emailMapping = getRoleByEmail(payload.email);
        const assignedRole = emailMapping ? emailMapping.role : 'NONE';
        const assignedName = emailMapping ? emailMapping.name : (payload.name || 'User');
        logger.info({ userId, email: payload.email, assignedRole, assignedName }, 'New user auto-created with email-based role');
        
        const newUser = { id: userId, name: assignedName, role: assignedRole };
        db.run('INSERT OR IGNORE INTO users (id, name, role, hash, updated_at) VALUES (?, ?, ?, ?, ?)',
          [userId, assignedName, assignedRole, 'CLERK_OAUTH', new Date().toISOString()], (insertErr) => {
            if (insertErr) return next(insertErr);
            req.user = newUser;
            req.clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
            req.clientAgent = req.headers['user-agent'] || 'unknown';
            next();
          });
        return;
      }
      // User exists — always enforce the email-mapped role (override DB)
      // We need the email from the Clerk payload to enforce this
      if (payload.email) {
        const emailMapping = getRoleByEmail(payload.email);
        if (emailMapping) {
          // Override DB role with email-mapped role
          if (user.role !== emailMapping.role || user.name !== emailMapping.name) {
            db.run('UPDATE users SET role = ?, name = ?, updated_at = ? WHERE id = ?',
              [emailMapping.role, emailMapping.name, new Date().toISOString(), userId]);
            user.role = emailMapping.role;
            user.name = emailMapping.name;
          }
        } else {
          // Email is not mapped — reset role to NONE to revoke prior permissions
          if (user.role !== 'NONE') {
            db.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?',
              ['NONE', new Date().toISOString(), userId]);
            user.role = 'NONE';
          }
        }
      }
      req.user = user;
      if (user.role === 'NONE') {
        return res.status(403).json({ error: 'Your account has been deactivated or lacks permissions.' });
      }
      req.user = user;
      req.clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      req.clientAgent = req.headers['user-agent'] || 'unknown';
      next();
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Token verification failed');
    return res.status(401).json({ error: 'Token verification failed' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// ══════════ ROUTES ══════════

// Health Endpoint
app.get('/api/health', (req, res) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  db.get('SELECT COUNT(*) as count FROM requests', (err, row) => {
    res.json({
      status: 'healthy',
      uptime: Math.floor(uptime),
      timestamp: new Date().toISOString(),
      database: err ? 'error' : 'connected',
      records: row ? row.count : 0,
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
        heap: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB'
      },
      version: '2.0.0'
    });
  });
});

// Sync User - no auth needed, just verify the Clerk token manually
app.post('/api/sync-user', async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token' });
    }
    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    if (!payload || !payload.sub) return res.status(401).json({ error: 'Invalid token' });
    
    const { id, name, email } = req.body;
    const userId = payload.sub; // use verified userId from token, not body
    const userEmail = email || payload.email || '';
    
    // Look up role by email from the fixed mapping
    const emailMapping = getRoleByEmail(userEmail);
    const assignedRole = emailMapping ? emailMapping.role : 'NONE';
    const assignedName = emailMapping ? emailMapping.name : (name || payload.name || 'User');
    
    db.get('SELECT role, name FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) return next(err);
      if (!user) {
        // New user — insert with email-mapped role
        db.run('INSERT INTO users (id, name, role, hash, updated_at) VALUES (?, ?, ?, ?, ?)',
          [userId, assignedName, assignedRole, 'CLERK_OAUTH', new Date().toISOString()], (err) => {
            if (err) return next(err);
            logger.info({ userId, email: userEmail, role: assignedRole, name: assignedName }, 'New user synced with email-based role');
            res.json({ success: true, role: assignedRole, name: assignedName });
          });
      } else {
        // Existing user — always enforce the email-mapped role
        if (emailMapping) {
          if (user.role !== assignedRole || user.name !== assignedName) {
            db.run('UPDATE users SET role = ?, name = ?, updated_at = ? WHERE id = ?',
              [assignedRole, assignedName, new Date().toISOString(), userId]);
            logger.info({ userId, email: userEmail, oldRole: user.role, newRole: assignedRole }, 'User role corrected by email mapping');
          }
        } else {
          // If no mapping exists, force downgrade to NONE role to revoke permissions
          if (user.role !== 'NONE') {
            db.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?',
              ['NONE', new Date().toISOString(), userId]);
            logger.info({ userId, email: userEmail, oldRole: user.role, newRole: 'NONE' }, 'User role revoked due to removed mapping');
          }
        }
        res.json({ success: true, role: assignedRole, name: assignedName });
      }
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'sync-user token verification failed');
    return res.status(401).json({ error: 'Token verification failed' });
  }
});

// Get Current User Profile
app.get('/api/me', authenticateToken, (req, res) => {
  res.json(req.user);
});

// ══════════ DISABLED: Role switching is no longer allowed — roles are fixed by email ══════════
// app.post('/api/me/role', authenticateToken, (req, res) => {
//   return res.status(403).json({ error: 'Role switching is disabled. Roles are assigned by email.' });
// });

// ══════════ VENDOR LOGIN (Simple ID/Password) ══════════
app.post('/api/vendor/login', loginLimiter, (req, res) => {
  const { vendorId, password } = req.body;
  if (!vendorId || !password) {
    return res.status(400).json({ error: 'Vendor ID and Password are required' });
  }

  db.get('SELECT * FROM users WHERE id = ? AND role = ?', [vendorId, 'VND'], (err, user) => {
    if (err) {
      logger.error({ err }, 'Vendor login DB error');
      return res.status(500).json({ error: 'Internal server error' });
    }
    if (!user || !verifyPassword(password, user.hash)) {
      return res.status(401).json({ error: 'Invalid Vendor ID or Password' });
    }

    // Transparently migrate legacy unsalted-SHA256 hashes to salted scrypt on successful login
    if (!user.hash.startsWith('scrypt:')) {
      db.run('UPDATE users SET hash = ? WHERE id = ?', [hashPassword(password), user.id]);
    }

    // Generate a vendor JWT
    const vendorToken = jwt.sign(
      { vendorId: user.id, name: user.name, role: 'VND' },
      VENDOR_JWT_SECRET,
      { expiresIn: '24h' }
    );

    logger.info({ vendorId: user.id }, 'Vendor logged in successfully');
    res.json({
      success: true,
      token: vendorToken,
      user: { id: user.id, name: user.name, role: 'VND' }
    });
  });
});

// ══════════ EMPLOYEE LOGIN (Simple ID/Password) ══════════
app.post('/api/employee/login', loginLimiter, (req, res) => {
  const { employeeId, password } = req.body;
  if (!employeeId || !password) {
    return res.status(400).json({ error: 'Employee ID and Password are required' });
  }

  db.get('SELECT * FROM users WHERE id = ? AND role = ?', [employeeId, 'EMP'], (err, user) => {
    if (err) {
      logger.error({ err }, 'Employee login DB error');
      return res.status(500).json({ error: 'Internal server error' });
    }
    if (!user || !verifyPassword(password, user.hash)) {
      return res.status(401).json({ error: 'Invalid Employee ID or Password' });
    }

    // Transparently migrate legacy unsalted-SHA256 hashes to salted scrypt on successful login
    if (!user.hash.startsWith('scrypt:')) {
      db.run('UPDATE users SET hash = ? WHERE id = ?', [hashPassword(password), user.id]);
    }

    // Generate an employee JWT
    const employeeToken = jwt.sign(
      { employeeId: user.id, name: user.name, role: 'EMP' },
      VENDOR_JWT_SECRET,
      { expiresIn: '24h' }
    );

    logger.info({ employeeId: user.id }, 'Employee logged in successfully');
    res.json({
      success: true,
      token: employeeToken,
      user: { id: user.id, name: user.name, role: 'EMP' }
    });
  });
});

// ══════════ PROJECTS API ══════════
app.get('/api/projects', authenticateToken, (req, res, next) => {
  const sql = "SELECT * FROM projects WHERE status = 'Active' ORDER BY created_at DESC";
  if (isPostgres) {
    pool.query(sql, [], (err, result) => {
      if (err) return next(err);
      res.json(result.rows);
    });
  } else {
    sqliteDb.all(sql, [], (err, rows) => {
      if (err) return next(err);
      res.json(rows);
    });
  }
});

// In-memory OTP store { phone: { otp, expiresAt, projectCode } }
const otpStore = new Map();

// ── Auto-generated project codes ──
// Format: <CLIENT>_<TAG>_<TYPE>_<DDMMMYY>_AiC_<NNN>   e.g. DAB_AMLA_AD_12NOV26_AiC_010
//   CLIENT   2-5 letter client/brand code
//   TAG      2-6 letter/digit project tag (product, campaign or region), so two projects
//            for the same client on the same day are told apart by more than the number
//   TYPE     project type (PROJECT_TYPES)
//   DDMMMYY  project start date
//   NNN      running number across every project ever created, so no two codes repeat
const PROJECT_TYPES = {
  AD: 'Ad Film',
  AN: 'Animatics',
  SMR: 'Social Media Retainer',
  CGI: 'CGI / VFX',
  MV: 'Music Video',
  CRP: 'Corporate Film',
  PHO: 'Photo Shoot',
  OTH: 'Other',
};
const CODE_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function projectCodePrefix({ clientCode, projectTag, type, startDate }) {
  const client = String(clientCode || '').trim().toUpperCase();
  const tag = String(projectTag || '').trim().toUpperCase();
  const t = String(type || '').trim().toUpperCase();
  if (!/^[A-Z]{2,5}$/.test(client)) return { error: 'Client code must be 2 to 5 letters (A-Z).' };
  if (!/^[A-Z][A-Z0-9]{1,5}$/.test(tag)) return { error: 'Project tag must be 2 to 6 letters or digits, starting with a letter (e.g. AMLA).' };
  if (!PROJECT_TYPES[t]) return { error: `Project type must be one of: ${Object.keys(PROJECT_TYPES).join(', ')}.` };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startDate || ''));
  if (!m) return { error: 'Start date must be in YYYY-MM-DD format.' };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return { error: 'Start date is not a valid date.' };
  }
  const datePart = String(d).padStart(2, '0') + CODE_MONTHS[mo - 1] + String(y % 100).padStart(2, '0');
  return { prefix: `${client}_${tag}_${t}_${datePart}_AiC_`, type: t, startDate: m[0] };
}

const dbAllAsync = (sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
const dbRunAsync = (sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, (err) => (err ? reject(err) : resolve())));
const dbGetAsync = (sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));

// Projects are never deleted (only marked Completed), so max + 1 never reuses a number.
async function nextProjectSeq() {
  const rows = await dbAllAsync('SELECT code FROM projects');
  let max = 0;
  for (const { code } of rows) {
    const m = /_AiC_(\d+)$/i.exec(code || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}
const formatSeq = (n) => String(n).padStart(3, '0');

app.get('/api/projects/types', authenticateToken, (req, res) => {
  res.json(Object.entries(PROJECT_TYPES).map(([code, label]) => ({ code, label })));
});

// Preview of the code the next project would get (the number is only reserved on create).
app.get('/api/projects/next-code', authenticateToken, requireRole('FIN', 'ADM', 'OWN'), async (req, res, next) => {
  try {
    const p = projectCodePrefix(req.query);
    if (p.error) return res.status(400).json({ error: p.error });
    res.json({ code: p.prefix + formatSeq(await nextProjectSeq()) });
  } catch (err) { next(err); }
});

// Creates a project with an auto-generated AiC code. Returns { project } or { status, error }.
// Shared by the Projects screen and the Invoice/Estimate generator.
async function createProjectWithCode({ name, details, partnerName, partnerPhone, clientCode, projectTag, type, startDate }) {
  if (!name || !String(name).trim()) return { status: 400, error: 'Project name is required' };
  const p = projectCodePrefix({ clientCode, projectTag, type, startDate });
  if (p.error) return { status: 400, error: p.error };

  // Retry if two people create a project at the same moment and pick the same number
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = p.prefix + formatSeq(await nextProjectSeq());
    const id = 'PRJ-' + crypto.randomUUID().split('-')[0].toUpperCase();
    try {
      await dbRunAsync(
        'INSERT INTO projects (id, name, code, details, partner_name, partner_phone, project_type, start_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, String(name).trim(), code, details || null, partnerName || null, partnerPhone || null, p.type, p.startDate, 'Active', new Date().toISOString()]
      );
      return { project: { id, name: String(name).trim(), code, details, partner_name: partnerName, partner_phone: partnerPhone, project_type: p.type, start_date: p.startDate, status: 'Active' } };
    } catch (err) {
      if (!/unique|duplicate/i.test(err.message || '')) throw err;
    }
  }
  return { status: 409, error: 'Could not reserve a unique project code. Please try again.' };
}

app.post('/api/projects', authenticateToken, requireRole('FIN', 'ADM', 'OWN'), async (req, res, next) => {
  try {
    const result = await createProjectWithCode(req.body || {});
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result.project);
  } catch (err) { next(err); }
});

// The code is fixed once created (requests refer to it), so editing only changes the other fields.
app.put('/api/projects/:id', authenticateToken, requireRole('FIN', 'ADM', 'OWN'), (req, res, next) => {
  const { id } = req.params;
  const { name, details, partnerName, partnerPhone } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Project name is required' });

  db.get('SELECT code FROM projects WHERE id = ?', [id], (err, row) => {
    if (err) return next(err);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    db.run('UPDATE projects SET name = ?, details = ?, partner_name = ?, partner_phone = ? WHERE id = ?',
      [name.trim(), details || null, partnerName || null, partnerPhone || null, id], (err2) => {
        if (err2) return next(err2);
        res.json({ id, name: name.trim(), code: row.code, details, partner_name: partnerName, partner_phone: partnerPhone });
      });
  });
});

// ══════════ OTP VERIFICATION FOR PARTNER PROJECTS ══════════
app.post('/api/projects/send-otp', authenticateToken, async (req, res) => {
  const { phone, projectCode } = req.body;
  if (!phone || !projectCode) return res.status(400).json({ error: 'Phone and project code required' });

  // Clean the phone number (remove country codes, spaces, non-digits)
  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length > 10 && cleanPhone.startsWith('91')) {
    cleanPhone = cleanPhone.slice(-10);
  }

  // Validate clean phone number length
  if (cleanPhone.length !== 10) {
    return res.status(400).json({ error: 'Invalid phone number format. Please ensure it is a valid 10-digit mobile number.' });
  }

  // Generate 6-digit OTP using a CSPRNG (Math.random() is not suitable for security codes)
  const otp = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  otpStore.set(cleanPhone, { otp, expiresAt, projectCode });

  logger.info({ phone, cleanPhone, projectCode }, 'OTP generated for partner verification');
  if (process.env.NODE_ENV === 'development') {
    console.log(`\n🔑 [Local Console Debug] OTP for ${phone} (${cleanPhone}): ${otp} (Project: ${projectCode})\n`);
  }

  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    logger.warn('FAST2SMS_API_KEY not configured. Falling back to simulated OTP.');
    return res.json({
      success: true,
      message: 'OTP generated (Simulated - API key missing)',
      debug_otp: process.env.NODE_ENV === 'development' ? otp : undefined
    });
  }

  try {
    const url = 'https://www.fast2sms.com/dev/bulkV2';
    const payload = {
      route: 'q',
      message: `Your Ai Collective Finance verification OTP is: ${otp}. Valid for 5 minutes.`,
      language: 'english',
      flash: 0,
      numbers: cleanPhone
    };

    const apiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await apiRes.json();
    logger.info({ fast2smsResponse: data }, 'Fast2SMS API Response');

    if (apiRes.ok && data.return === true) {
      return res.json({
        success: true,
        message: 'OTP sent successfully to your registered mobile number.',
        debug_otp: process.env.NODE_ENV === 'development' ? otp : undefined
      });
    } else {
      const errMsg = data.message || 'Fast2SMS gateway error';
      logger.error({ data }, 'Fast2SMS OTP delivery failure');

      // Smart testing fallback: only in explicit local development do we fall back to a
      // simulated OTP — this must never trigger based on the gateway's error message alone,
      // otherwise an attacker could intentionally provoke that error to have the real OTP
      // handed back in the response body, bypassing phone verification entirely.
      if (process.env.NODE_ENV === 'development') {
        logger.warn('Fast2SMS failed. Falling back to simulated OTP for local development.');
        return res.json({
          success: true,
          message: `Simulated OTP (Real SMS requires ₹100 Fast2SMS recharge: ${errMsg})`,
          debug_otp: otp
        });
      }

      return res.status(500).json({ error: `Failed to send OTP via SMS: ${errMsg}` });
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Exception during sending OTP via Fast2SMS');
    return res.status(500).json({ error: 'Network error occurred while sending OTP' });
  }
});

app.post('/api/projects/verify-otp', authenticateToken, (req, res) => {
  const { phone, otp, projectCode } = req.body;
  if (!phone || !otp || !projectCode) return res.status(400).json({ error: 'Phone, OTP and project code required' });

  // Clean phone number the exact same way to align with stored key
  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length > 10 && cleanPhone.startsWith('91')) {
    cleanPhone = cleanPhone.slice(-10);
  }

  const stored = otpStore.get(cleanPhone);
  if (!stored) return res.status(400).json({ error: 'No OTP was requested for this phone number. Please request a new OTP.' });
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(cleanPhone);
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }
  if (stored.otp !== otp) return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
  if (stored.projectCode !== projectCode) return res.status(400).json({ error: 'OTP does not match this project.' });

  otpStore.delete(cleanPhone);
  res.json({ success: true, verified: true });
});

app.put('/api/projects/:id/complete', authenticateToken, requireRole('FIN', 'ADM', 'OWN'), (req, res, next) => {
  const { id } = req.params;
  const completedAt = new Date().toISOString();
  
  const sql = "UPDATE projects SET status = 'Completed', completed_at = $1 WHERE id = $2";
  if (isPostgres) {
    pool.query(pgSql(sql), [completedAt, id], (err) => {
      if (err) return next(err);
      res.json({ success: true, id });
    });
  } else {
    sqliteDb.run("UPDATE projects SET status = 'Completed', completed_at = ? WHERE id = ?", [completedAt, id], (err) => {
      if (err) return next(err);
      res.json({ success: true, id });
    });
  }
});

// Get Requests (paginated, excludes soft-deleted)
app.get('/api/requests', authenticateToken, (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const status = req.query.status;
  const search = req.query.search;

  let baseWhere = 'WHERE deleted_at IS NULL';
  let params = [];

  if (req.user.role === 'DEV' || req.user.role === 'EMP' || req.user.role === 'VND') {
    // Employees & Vendors only see their own
    baseWhere += ' AND requester = ?';
    params.push(req.user.id);
  } else if (req.user.role === 'VRF') {
    // Verifiers only see requests the submitter assigned to them (matched by name)
    baseWhere += ' AND LOWER(TRIM(verifier)) = ?';
    params.push((req.user.name || '').trim().toLowerCase());
  }
  // FIN, OWN, ADM see all requests
  if (status) {
    baseWhere += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    baseWhere += ' AND (purpose LIKE ? OR id LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const countQuery = `SELECT COUNT(*) as total FROM requests ${baseWhere}`;
  const dataQuery = `SELECT * FROM requests ${baseWhere} ORDER BY ts DESC LIMIT ? OFFSET ?`;

  db.get(countQuery, params, (err, countRow) => {
    if (err) return next(err);
    db.all(dataQuery, [...params, limit, offset], (err2, rows) => {
      if (err2) return next(err2);
      res.json({
        data: rows,
        pagination: {
          page, limit,
          total: countRow.total,
          totalPages: Math.ceil(countRow.total / limit)
        }
      });
    });
  });
});

// Create Request (UUID-based)
// ── Partner project lock ──
// Partners share login accounts, so the lock belongs to one login (one token), not to the account:
// the first project a partner picks after logging in is frozen until they log out. Logging in
// again issues a new token, which starts with no lock.
const projectDisplayName = (p) => (p.code ? `${p.name} (${p.code})` : p.name);

function loginSessionKey(req) {
  const token = String(req.headers['authorization'] || '').split(' ')[1] || '';
  return crypto.createHash('sha256').update(token).digest('hex');
}

function tokenExpiryIso(req) {
  const token = String(req.headers['authorization'] || '').split(' ')[1] || '';
  const decoded = jwt.decode(token);
  return decoded && decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null;
}

async function getPartnerProjectLock(req) {
  const lock = await dbGetAsync('SELECT project_id FROM partner_project_locks WHERE session_key = ? AND user_id = ?',
    [loginSessionKey(req), req.user.id]);
  if (!lock) return null;
  return (await dbGetAsync('SELECT * FROM projects WHERE id = ?', [lock.project_id])) || null;
}

async function setPartnerProjectLock(req, projectId) {
  // Clear this account's expired locks while we're here, so the table doesn't grow forever
  await dbRunAsync('DELETE FROM partner_project_locks WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at < ?',
    [req.user.id, new Date().toISOString()]);
  await dbRunAsync('INSERT INTO partner_project_locks (session_key, user_id, project_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    [loginSessionKey(req), req.user.id, projectId, tokenExpiryIso(req), new Date().toISOString()]);
}

app.get('/api/partner/project-lock', authenticateToken, requireRole('VND'), async (req, res, next) => {
  try {
    const project = await getPartnerProjectLock(req);
    res.json({ project: project ? { ...project, display_name: projectDisplayName(project) } : null });
  } catch (err) { next(err); }
});

app.post('/api/partner/project-lock', authenticateToken, requireRole('VND'), async (req, res, next) => {
  try {
    const projectId = String((req.body && req.body.projectId) || '');
    const locked = await getPartnerProjectLock(req);
    if (locked) {
      if (locked.id === projectId) return res.json({ project: { ...locked, display_name: projectDisplayName(locked) } });
      return res.status(409).json({
        error: `Your project is locked to "${projectDisplayName(locked)}" for this login. Log out and log in again to submit for a different project.`,
        project: { ...locked, display_name: projectDisplayName(locked) },
      });
    }
    const project = await dbGetAsync("SELECT * FROM projects WHERE id = ? AND status = 'Active'", [projectId]);
    if (!project) return res.status(400).json({ error: 'Select an active project from the list.' });
    try {
      await setPartnerProjectLock(req, project.id);
    } catch (err) {
      // Two tabs locking at the same moment: whichever landed first wins
      if (!/unique|duplicate/i.test(err.message || '')) throw err;
      const winner = await getPartnerProjectLock(req);
      if (winner && winner.id !== project.id) {
        return res.status(409).json({ error: `Your project is locked to "${projectDisplayName(winner)}" for this login.`, project: { ...winner, display_name: projectDisplayName(winner) } });
      }
    }
    logger.info({ actor: req.user.id, projectId: project.id }, 'Partner project locked for this login');
    res.json({ project: { ...project, display_name: projectDisplayName(project) } });
  } catch (err) { next(err); }
});

// Partner submissions must carry their own invoice (uploaded or generated — both get an invoice
// code when uploaded), the invoice must not already back another live request, and the project
// must be the one locked for this login.
async function checkPartnerSubmission(req, fileHash, metadata) {
  if (!fileHash) {
    return { status: 400, error: 'An invoice is required. Upload your invoice or use "Generate Invoice from Details" before submitting.' };
  }
  const code = await dbGetAsync("SELECT code FROM invoice_codes WHERE file_hash = ? AND issued_to = ? AND kind = 'PARTNER'", [fileHash, req.user.id]);
  if (!code) {
    return { status: 400, error: 'The attached file is not a partner invoice uploaded from this account. Upload your invoice again or generate one.' };
  }
  const reused = await dbGetAsync("SELECT id FROM requests WHERE file_hash = ? AND deleted_at IS NULL AND status <> 'REJ'", [fileHash]);
  if (reused) {
    return { status: 409, error: `This invoice is already attached to request ${reused.id}. Upload or generate a new invoice for this submission.` };
  }

  let projectName = '';
  try { projectName = String((JSON.parse(metadata || '{}') || {}).projectName || '').trim(); } catch { /* bad metadata */ }
  if (!projectName) return { status: 400, error: 'Select your project from the list.' };

  const locked = await getPartnerProjectLock(req);
  if (locked) {
    if (projectDisplayName(locked) !== projectName && locked.name !== projectName) {
      return { status: 409, error: `Your project is locked to "${projectDisplayName(locked)}" for this login. Log out and log in again to submit for a different project.` };
    }
    return { invoiceCode: code.code };
  }
  const active = await dbAllAsync("SELECT * FROM projects WHERE status = 'Active'");
  const project = active.find(p => projectDisplayName(p) === projectName);
  if (!project) return { status: 400, error: 'Select an active project from the list.' };
  try {
    await setPartnerProjectLock(req, project.id);
  } catch (err) {
    if (!/unique|duplicate/i.test(err.message || '')) throw err;
    const winner = await getPartnerProjectLock(req);
    if (winner && winner.id !== project.id) {
      return { status: 409, error: `Your project is locked to "${projectDisplayName(winner)}" for this login.` };
    }
  }
  return { invoiceCode: code.code };
}

app.post('/api/requests', authenticateToken, validate(createRequestSchema), async (req, res, next) => {
  const { amount, purpose, file_hash, metadata, verifier } = req.validatedBody;
  if (req.user.role === 'VND') {
    try {
      const check = await checkPartnerSubmission(req, file_hash, metadata);
      if (check.error) return res.status(check.status).json({ error: check.error });
    } catch (err) { return next(err); }
  }
  const id = 'REQ-' + crypto.randomUUID().split('-')[0].toUpperCase();
  const ts = new Date().toISOString();
  // All requests start at PND — Debojit verifies as 1st-line first, then Finance, then Owner auth
  const sig = signAuditEntry(id, req.user.id, '-', 'PND', 'Request submitted. Awaiting first-line verification.', ts);

  // Carry the attached invoice's unique code onto the request (only the uploader's own file counts)
  db.get('SELECT code FROM invoice_codes WHERE file_hash = ? AND issued_to = ?', [file_hash || '', req.user.id], (codeErr, codeRow) => {
  if (codeErr) return next(codeErr);
  const invoiceCode = codeRow ? codeRow.code : null;
  db.serialize(() => {
    db.run('INSERT INTO requests (id, amount, purpose, status, requester, verifier, ts, file_hash, metadata, invoice_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, amount, purpose, 'PND', req.user.id, verifier || null, ts, file_hash || null, metadata || null, invoiceCode]);
    db.run('INSERT INTO audit_logs (reqId, actor, prev, next, comment, ts, ip_address, user_agent, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.user.id, '-', 'PND', 'Request submitted. Awaiting first-line verification.', ts, req.clientIp, req.clientAgent, sig]);
    
    // Notify the assigned verifier AND finance team
    const notifyRoles = ['FIN', 'VRF', 'ADM'];
    db.all('SELECT id FROM users WHERE role IN (?, ?, ?)', notifyRoles, (err, notifyUsers) => {
      if (!err && notifyUsers) {
        notifyUsers.forEach(u => {
          db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [u.id, 'New Vendor Request', `${req.user.name || req.user.id} submitted ${id} (₹${amount}) — Verifier: ${verifier || 'Unassigned'}`, 'action']);
        });
      }
    });

    logger.info({ requestId: id, amount, verifier, invoiceCode, actor: req.user.id }, 'Request created with verifier');
    res.json({ success: true, id, invoice_code: invoiceCode });
  });
  });
});

// Get Verifiers list (the 4 first-line people)
app.get('/api/verifiers', authenticateToken, (req, res) => {
  const verifiers = [
    { id: 'rup',     name: 'Rup',     title: 'Tech Head',      role: 'VRF', avatar: 'R', color: '#3b82f6' },
    { id: 'debojit', name: 'Debojit', title: 'Creative Head & Owner', role: 'OWN', avatar: 'D', color: '#8b5cf6' },
    { id: 'yash',    name: 'Yash',    title: 'Finance Head',   role: 'FIN', avatar: 'Y', color: '#22c55e' },
    { id: 'soumana',  name: 'Soumana',  title: 'Content Head',   role: 'VRF', avatar: 'S', color: '#f59e0b' },
  ];
  res.json(verifiers);
});

// Action (state transition with maker-checker & validation)
app.post('/api/action', authenticateToken, actionLimiter, validate(actionSchema), (req, res, next) => {
  const { id, nextState, comment } = req.validatedBody;
  const ts = new Date().toISOString();

  db.get('SELECT * FROM requests WHERE id = ? AND deleted_at IS NULL', [id], (err, reqRow) => {
    if (err) return next(err);
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });

    // Note: the 1st-line verify stage (PND -> VRF) was removed, along with the
    // per-reviewer "verifier isolation" check that used to route a request to
    // whichever of Rup/Soumana it was assigned to. Requests now go straight from
    // PND to OWN, and OWN/FIN are each held by exactly one person, so there's no
    // remaining ambiguity for the state_transitions role check below to resolve.

    // Maker-checker: nobody may approve or pay out their own request.
    // ALLOW_SELF_APPROVAL=true turns this off for single-account local demos only.
    if (process.env.ALLOW_SELF_APPROVAL !== 'true' &&
        reqRow.requester === req.user.id && ['FIN', 'OWN', 'DSB'].includes(nextState)) {
      return res.status(403).json({ error: 'Self-approval is prohibited. Another authorized user must approve.' });
    }

    // Validate state transition. Every role, ADM included, is limited to the moves listed in
    // state_transitions (ADM already has its own override rows there), so no one can jump a
    // request straight from PND to DSB. 'SYSTEM' rows are reserved for automated jobs and are
    // deliberately NOT matched here — otherwise any signed-in user (a partner included) could
    // disburse a request sitting at FIN.
    const prevState = reqRow.status;
    db.get('SELECT * FROM state_transitions WHERE from_state = ? AND to_state = ? AND required_role = ?',
      [prevState, nextState, req.user.role], (err2, transition) => {
        if (err2) return next(err2);

        if (!transition) {
          return res.status(403).json({ error: `Invalid state transition: ${prevState} → ${nextState} for role ${req.user.role}` });
        }

        const sig = signAuditEntry(id, req.user.id, prevState, nextState, comment, ts);

        db.serialize(() => {
          db.run('UPDATE requests SET status = ? WHERE id = ?', [nextState, id]);
          db.run('INSERT INTO audit_logs (reqId, actor, prev, next, comment, ts, ip_address, user_agent, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, req.user.id, prevState, nextState, comment, ts, req.clientIp, req.clientAgent, sig]);

          if (nextState === 'DSB') {
            // Notify requester of successful disbursement
            db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
              [reqRow.requester, 'Transfer Complete', `Request ${id} has been disbursed.`, 'success']);
          }

          logger.info({ requestId: id, from: prevState, to: nextState, actor: req.user.id }, 'Action processed');
          res.json({ success: true });
        });
      });
  });
});

// Get Audit Logs (paginated)
app.get('/api/audit', authenticateToken, (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const reqId = req.query.reqId;
  // Only FIN/OWN/ADM see every request's audit trail. Everyone else sees the trail of requests
  // they submitted, and a VRF also sees requests assigned to them (mirrors /api/requests scoping).
  const isRestricted = !['FIN', 'OWN', 'ADM'].includes(req.user.role);

  if (reqId) {
    // Fetch logs for a specific request, join with users to get actor names
    const countQuery = "SELECT COUNT(*) as total FROM audit_logs WHERE reqId = ?";
    const dataQuery = "SELECT a.*, u.name as actor_name, u.role as actor_role FROM audit_logs a LEFT JOIN users u ON a.actor = u.id WHERE a.reqId = ? ORDER BY a.id ASC LIMIT ? OFFSET ?";

    const runQuery = () => {
      db.get(countQuery, [reqId], (err, countRow) => {
        if (err) return next(err);
        db.all(dataQuery, [reqId, limit, offset], (err, rows) => {
          if (err) return next(err);
          res.json({
            data: rows,
            pagination: {
              page, limit,
              total: countRow ? countRow.total : 0,
              totalPages: Math.ceil((countRow ? countRow.total : 0) / limit)
            }
          });
        });
      });
    };

    if (isRestricted) {
      db.get('SELECT requester, verifier FROM requests WHERE id = ?', [reqId], (err, reqRow) => {
        if (err) return next(err);
        const userName = (req.user.name || '').trim().toLowerCase();
        const isAssignedVerifier = reqRow && req.user.role === 'VRF' && userName &&
          (reqRow.verifier || '').trim().toLowerCase() === userName;
        if (!reqRow || (reqRow.requester !== req.user.id && !isAssignedVerifier)) {
          return res.status(403).json({ error: 'You do not have access to this request\'s audit trail.' });
        }
        runQuery();
      });
    } else {
      runQuery();
    }
    return;
  }

  let countQuery = "SELECT COUNT(*) as total FROM audit_logs";
  let dataQuery = "SELECT * FROM audit_logs ORDER BY id ASC LIMIT ? OFFSET ?";
  let params = [limit, offset];

  if (isRestricted) {
    db.all("SELECT id FROM requests WHERE requester = ?", [req.user.id], (err, userReqs) => {
      if (err) return next(err);
      const myIds = userReqs.map(r => r.id);
      db.all("SELECT * FROM audit_logs ORDER BY id ASC", [], (err, rows) => {
        if (err) return next(err);
        const filtered = rows.filter(l => myIds.includes(l.reqId) || (l.reqId === 'SYS' && l.actor === req.user.id));
        res.json({
          data: filtered.slice(offset, offset + limit),
          pagination: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) }
        });
      });
    });
  } else {
    db.get(countQuery, [], (err, countRow) => {
      if (err) return next(err);
      db.all(dataQuery, params, (err, rows) => {
        if (err) return next(err);
        res.json({
          data: rows,
          pagination: {
            page, limit,
            total: countRow.total,
            totalPages: Math.ceil(countRow.total / limit)
          }
        });
      });
    });
  }
});

// Update User Role (ADM only)
app.post('/api/users/:id/role', authenticateToken, requireRole('ADM'), validate(updateRoleSchema), (req, res, next) => {
  const { role } = req.validatedBody;
  const targetId = req.params.id;
  
  db.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, new Date().toISOString(), targetId], function(err) {
    if (err) return next(err);
    if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
    
    logger.info({ actor: req.user.id, target: targetId, newRole: role }, 'User role updated');
    res.json({ success: true });
  });
});

// Full user list (ids, names, roles) — admins only; nothing in the UI needs it for other roles.
app.get('/api/users', authenticateToken, requireRole('ADM'), (req, res, next) => {
  db.all("SELECT id, name, role FROM users", [], (err, rows) => {
    if (err) return next(err);
    res.json(rows);
  });
});

// ══════════ NEW ENDPOINTS (SUBSCRIPTIONS, QUERIES, INVOICES) ══════════

// Subscriptions
// Same roles that can add subscriptions (and that see the Subscriptions page in the sidebar)
app.get('/api/subscriptions', authenticateToken, requireRole('FIN', 'OWN', 'ADM'), (req, res, next) => {
  db.all("SELECT * FROM subscriptions", [], (err, rows) => {
    if (err) return next(err);
    res.json(rows);
  });
});

app.post('/api/subscriptions', authenticateToken, requireRole('FIN', 'OWN', 'ADM'), (req, res, next) => {
  const { name, vendor_id, cost, billing_cycle, next_renewal_date } = req.body;
  const id = 'SUB-' + crypto.randomUUID().split('-')[0].toUpperCase();
  db.run('INSERT INTO subscriptions (id, name, vendor_id, cost, billing_cycle, next_renewal_date) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, vendor_id, cost, billing_cycle, next_renewal_date], (err) => {
      if (err) return next(err);
      res.json({ success: true, id });
  });
});

// Employee Queries - GET
// viewAs param lets Finance/Owner see their inbox; employees see their own queries
app.get('/api/queries', authenticateToken, (req, res, next) => {
  const viewAs = req.query.viewAs; // can be 'FIN', 'OWN', or empty
  let query = "SELECT * FROM employee_queries ORDER BY created_at DESC";
  let params = [];

  const dbRole = req.user.role;
  const allowedManagerRoles = ['FIN', 'OWN', 'ADM'];
  const canViewAs = viewAs && allowedManagerRoles.includes(viewAs) &&
    (dbRole === viewAs || dbRole === 'ADM');

  if (canViewAs) {
    // Allow viewing as Finance or Owner inbox if:
    // 1. Their DB role matches viewAs
    // 2. Their DB role is ADM (admin can see everything)
    query = "SELECT * FROM employee_queries WHERE recipient_role = ? ORDER BY created_at DESC";
    params.push(viewAs);
  } else if (dbRole === 'FIN' || dbRole === 'OWN') {
    // If their actual DB role is FIN or OWN, show their inbox
    query = "SELECT * FROM employee_queries WHERE recipient_role = ? ORDER BY created_at DESC";
    params.push(dbRole);
  } else {
    // Default: employees see their own submitted queries
    query = "SELECT * FROM employee_queries WHERE employee_id = ? ORDER BY created_at DESC";
    params.push(req.user.id);
  }
  
  db.all(query, params, (err, rows) => {
    if (err) return next(err);
    res.json(rows);
  });
});

// Submit Employee Query
app.post('/api/queries', authenticateToken, (req, res, next) => {
  const { subject, message, recipient_role } = req.body;
  if (!subject || !message || !recipient_role) {
    return res.status(400).json({ error: 'subject, message, and recipient_role are required' });
  }
  const id = 'QRY-' + crypto.randomUUID().split('-')[0].toUpperCase();
  db.run('INSERT INTO employee_queries (id, employee_id, recipient_role, subject, message) VALUES (?, ?, ?, ?, ?)',
    [id, req.user.id, recipient_role, subject, message], function(err) {
      if (err) return next(err);
      logger.info({ id, from: req.user.id, to: recipient_role }, 'Query submitted');
      res.json({ success: true, id });
  });
});

// Reply to Query (Finance/Owner/ADM only — role switching was removed, so DEV no longer qualifies)
app.post('/api/queries/:id/reply', authenticateToken, requireRole('FIN', 'OWN', 'ADM'), (req, res, next) => {
  const { response } = req.body;
  if (!response) return res.status(400).json({ error: 'response text is required' });
  db.run("UPDATE employee_queries SET response = ?, status = 'Answered', updated_at = ? WHERE id = ?",
    [response, new Date().toISOString(), req.params.id], function(err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Query not found' });
      res.json({ success: true });
  });
});

// File Upload Setup
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Extension is derived from the validated MIME type, never from the client-supplied
// filename — otherwise a file declared as image/png but named "x.html" would be written
// to disk as .html and served as text/html by express.static, enabling stored XSS.
const MIME_TO_EXT = {
  'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/gif': '.gif', 'image/bmp': '.bmp', 'image/tiff': '.tiff',
  'image/heic': '.heic', 'image/heif': '.heif', 'application/pdf': '.pdf'
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || '.bin';
    cb(null, `invoice_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (MIME_TO_EXT[file.mimetype]) cb(null, true);
    else cb(new Error(`File type "${file.mimetype}" is not supported. Allowed: JPG, PNG, WEBP, GIF, BMP, TIFF, HEIC, PDF`));
  }
});

// Uploaded invoices, cancelled cheques and payslips contain bank details, so they are NOT
// served statically. They are only available through this authenticated endpoint:
//  - FIN / OWN / ADM can open any file (they review every request);
//  - the person who uploaded a file can open it (preview before submitting);
//  - the requester of a request that uses the file can open it;
//  - a VRF can open the files of requests assigned to them.
const UPLOAD_NAME_RE = /^invoice_\d+_[0-9a-f]{8}\.(jpg|png|webp|gif|bmp|tiff|heic|heif|pdf)$/;
const FULL_FILE_ACCESS_ROLES = ['FIN', 'OWN', 'ADM'];

app.get('/api/files/:name', authenticateToken, (req, res, next) => {
  const name = req.params.name;
  if (!UPLOAD_NAME_RE.test(name)) return res.status(404).json({ error: 'File not found' });

  const sendIt = () => {
    res.sendFile(path.join(uploadsDir, name), {
      headers: { 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store' }
    }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File not found' });
    });
  };
  const deny = () => res.status(403).json({ error: 'You do not have access to this file.' });

  if (FULL_FILE_ACCESS_ROLES.includes(req.user.role)) return sendIt();

  db.get('SELECT uploaded_by FROM attachments WHERE id = ?', [name], (err, att) => {
    if (err) return next(err);
    if (att && att.uploaded_by === req.user.id) return sendIt();

    // The invoice is stored in requests.file_hash; a cancelled cheque only inside the metadata JSON.
    db.all('SELECT requester, verifier FROM requests WHERE deleted_at IS NULL AND (file_hash = ? OR metadata LIKE ?)',
      [name, `%"${name}"%`], (err2, rows) => {
        if (err2) return next(err2);
        const userName = (req.user.name || '').trim().toLowerCase();
        const allowed = (rows || []).some(r =>
          r.requester === req.user.id ||
          (req.user.role === 'VRF' && userName && (r.verifier || '').trim().toLowerCase() === userName)
        );
        return allowed ? sendIt() : deny();
      });
  });
});

// Vendor Invoice Upload - returns file hash to be submitted with request form
// ══════════ HIGH-CLASS OCR SYSTEM (Gemini + Tesseract Fallback) ══════════

const https = require('https');

// Dynamic module loading to prevent crashes if packages aren't installed yet
let sharp = null;
try { sharp = require('sharp'); } catch (e) { logger.warn('sharp is not installed. Image preprocessing bypassed.'); }

let tesseract = null;
try { tesseract = require('tesseract.js'); } catch (e) { logger.warn('tesseract.js is not installed. Local Tesseract OCR fallback disabled.'); }

let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch (e) { logger.warn('pdf-parse is not installed. Local PDF text extraction fallback disabled.'); }

// Helper to preprocess image using sharp for better OCR results
async function preprocessImage(filePath) {
  if (!sharp) return filePath;
  try {
    const outputPath = filePath + '_preprocessed.png';
    await sharp(filePath)
      .grayscale()
      .normalize()
      .toFile(outputPath);
    return outputPath;
  } catch (err) {
    logger.warn({ err: err.message }, 'Sharp image preprocessing failed. Using raw file.');
    return filePath;
  }
}

// Call Gemini 2.5 Flash Vision API natively
async function callGeminiVision(apiKey, base64Data, mimeType) {
  return new Promise((resolve, reject) => {
    // Structured output prompt for invoice extraction
    const promptText = `You are a professional invoice OCR and data extraction system. Carefully analyze this invoice image and extract all financial information.

Return ONLY a valid JSON object with NO markdown, NO code fences, NO backticks. Just raw JSON:
{"amount": <number: base invoice amount before tax, or total amount if no breakdown>, "vendorName": "<string: the seller/company name at top of invoice>", "invoiceDate": "<string: date in YYYY-MM-DD format>", "gstNumber": "<string: 15-char Indian GSTIN if present, otherwise null>", "purpose": "<string: 1 sentence describing what this invoice is for>", "confidence": <number: 0-100 how confident you are>}`;

    // Gemini 1.5+ supports application/pdf directly natively
    const safeMimeType = mimeType;

    const requestBody = {
      contents: [{
        parts: [
          { text: promptText },
          { inlineData: { mimeType: safeMimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024
      }
    };

    const payloadBuffer = Buffer.from(JSON.stringify(requestBody), 'utf8');

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payloadBuffer.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);

          // Log the full response for debugging
          if (parsed.error) {
            logger.error({ geminiError: parsed.error }, 'Gemini API returned an error');
            return reject(new Error(parsed.error.message || 'Gemini API error'));
          }

          if (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts[0]) {
            let responseText = parsed.candidates[0].content.parts[0].text || '';
            // Strip markdown code fences if Gemini wraps the JSON
            responseText = responseText.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
            
            // Try clean parse first
            try {
              const extracted = JSON.parse(responseText);
              return resolve(extracted);
            } catch (parseErr) {
              // Gemini may have hit MAX_TOKENS mid-JSON — extract partial fields via regex
              logger.warn({ parseErr: parseErr.message }, 'Gemini JSON truncated, attempting partial field extraction...');
              const partial = {};
              const amtMatch = responseText.match(/"amount"\s*:\s*([\d.]+)/);
              if (amtMatch) partial.amount = parseFloat(amtMatch[1]);
              const vendorMatch = responseText.match(/"vendorName"\s*:\s*"([^"]+)"/);
              if (vendorMatch) partial.vendorName = vendorMatch[1];
              const dateMatch = responseText.match(/"invoiceDate"\s*:\s*"([^"]+)"/);
              if (dateMatch) partial.invoiceDate = dateMatch[1];
              const gstMatch = responseText.match(/"gstNumber"\s*:\s*"([^"]+)"/);
              if (gstMatch) partial.gstNumber = gstMatch[1];
              const purposeMatch = responseText.match(/"purpose"\s*:\s*"([^"]+)"/);
              if (purposeMatch) partial.purpose = purposeMatch[1];
              const confMatch = responseText.match(/"confidence"\s*:\s*([\d]+)/);
              if (confMatch) partial.confidence = parseInt(confMatch[1]);
              
              if (partial.amount || partial.vendorName) {
                partial.confidence = partial.confidence || 75;
                logger.info({ partial }, 'Partial field extraction from truncated Gemini response succeeded.');
                return resolve(partial);
              }
              return reject(new Error('Gemini JSON response could not be parsed even partially.'));
            }
          }

          // Check if response was blocked or empty
          const blockReason = parsed.candidates?.[0]?.finishReason;
          logger.warn({ blockReason, parsed }, 'Gemini returned no usable candidates');
          return reject(new Error(`Gemini returned no candidates. Reason: ${blockReason || 'unknown'}`));
        } catch (e) {
          logger.error({ err: e.message, responseBody: body.substring(0, 500) }, 'Error parsing Gemini response');
          return reject(e);
        }
      });
    });

    req.on('error', (e) => {
      logger.error({ err: e.message }, 'Gemini HTTPS request error');
      reject(e);
    });
    req.write(payloadBuffer);
    req.end();
  });
}

// ── Text parsing heuristics for the local (non-AI) OCR fallbacks ──
// Everything here returns null when it cannot find a value, instead of guessing: a blank field the
// partner fills in is better than a plausible-looking wrong one.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';

// Builds YYYY-MM-DD without going through Date/toISOString, which shifts the day across timezones
function isoDateOrNull(y, m, d) {
  y = Number(y); m = Number(m); d = Number(d);
  if (y < 100) y += 2000;
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCMonth() !== m - 1) return null; // e.g. 31 Feb
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Understands 12 Nov 2026, Nov 12, 2026, 2026-11-12 and Indian day-first 12/11/2026 or 12-11-26.
// A date written right after the word "date" wins over other dates (due date, PO date ...).
function extractInvoiceDate(text) {
  const patterns = [
    [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s,.\\-/]+${MONTH_RE}[\\s,.\\-/]+(\\d{2,4})\\b`, 'ig'), (m) => isoDateOrNull(m[3], MONTHS[m[2].toLowerCase()], m[1])],
    [new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'ig'), (m) => isoDateOrNull(m[3], MONTHS[m[1].toLowerCase()], m[2])],
    [/\b(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/g, (m) => isoDateOrNull(m[1], m[2], m[3])],
    [/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/g, (m) => isoDateOrNull(m[3], m[2], m[1])],
  ];
  const found = [];
  for (const [re, toIso] of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const iso = toIso(m);
      if (iso) found.push({ iso, at: m.index });
    }
  }
  if (!found.length) return null;
  found.sort((a, b) => a.at - b.at);
  const labelled = found.find(({ at }) => {
    const before = text.slice(Math.max(0, at - 14), at);
    return /date\W{0,4}$/i.test(before) && !/due\s*date\W{0,4}$/i.test(before);
  });
  return (labelled || found[0]).iso;
}

// Amounts need a decimal part, a thousands separator or 3+ digits, so a stray "1" (a row number) is never read as money
const AMOUNT_RE = /(?:rs\.?|inr|₹)?\s*((?:\d{1,3}(?:,\d{2,3})+|\d{3,})(?:\.\d{1,2})?|\d+\.\d{2})\b/i;

function amountOnLine(line) {
  const m = line.match(AMOUNT_RE);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

// Returns the base amount (before GST) when the invoice shows one, otherwise the total
function extractInvoiceAmount(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const firstAmount = (test) => {
    for (const line of lines) {
      if (test(line)) { const a = amountOnLine(line); if (a) return a; }
    }
    return null;
  };
  const base = firstAmount((l) => /sub\s*-?\s*total|taxable\s*(value|amount)|base\s*amount|amount\s*before\s*tax/i.test(l));
  if (base) return { amount: base, basis: 'base' };
  const total = firstAmount((l) => /(grand\s*)?total|amount\s*payable|net\s*payable|balance\s*due/i.test(l) && !/in\s*words/i.test(l));
  if (total) return { amount: total, basis: 'total' };
  return null;
}

function extractVendorName(lines) {
  const clean = (s) => s
    .replace(/\s+(tax\s+)?invoice\b.*$/i, '')     // "Test Studio  INVOICE   Invoice No.: 12"
    .replace(/\s+(invoice\s*(no|number|#)|date|gstin?)\b.*$/i, '')
    .replace(/^(billed by|from|seller|sold by)\s*:?\s*/i, '')
    .trim().substring(0, 60);
  const isLabelOnly = (l) => /^(tax\s+)?invoice$/i.test(l) || /^(original|duplicate|copy|for recipient)/i.test(l);

  const labelled = lines.find((l) => /^(billed by|from|seller|sold by)\s*:\s*\S/i.test(l));
  if (labelled) return clean(labelled) || null;
  const idx = lines.findIndex((l) => /^(billed by|from|seller|sold by)\s*:?$/i.test(l));
  if (idx >= 0 && lines[idx + 1]) return clean(lines[idx + 1]) || null;

  const first = lines.find((l) => !isLabelOnly(l) && /[a-z]{3}/i.test(l));
  return first ? clean(first) || null : null;
}

// Regex-based text parsing heuristic for fallback OCR. Confidence reflects how many fields were found.
function parseRawInvoiceText(text, originalFilename) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const gstMatch = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/);
  const found = extractInvoiceAmount(text);
  const invoiceDate = extractInvoiceDate(text);
  const vendorName = extractVendorName(lines);

  let confidence = 20;
  if (found) confidence += 25;
  if (invoiceDate) confidence += 15;
  if (vendorName) confidence += 15;
  if (gstMatch) confidence += 10;

  return {
    amount: found ? found.amount : null,
    vendorName,
    invoiceDate,
    gstNumber: gstMatch ? gstMatch[0] : null,
    purpose: `Extracted from ${originalFilename}`,
    confidence: Math.min(confidence, 85),
    engine: 'Tesseract OCR (Local Fallback)'
  };
}

// Main OCR Processor Pipeline
async function processInvoiceOCR(filePath, originalFilename, mimeType) {
  const isPdf = mimeType === 'application/pdf';
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');
  
  const geminiKey = process.env.GEMINI_API_KEY;
  
  // ── OPTION A: Gemini AI (Superb handwriting support) ──
  if (geminiKey && geminiKey !== 'your_key_here') {
    try {
      logger.info({ filename: originalFilename }, 'Running high-class Gemini Vision OCR...');
      const result = await callGeminiVision(geminiKey, base64Data, mimeType);
      logger.info({ filename: originalFilename, result }, 'Gemini OCR extraction completed.');
      return {
        success: true,
        extracted_amount: Number(result.amount) || 0,
        vendor_name: result.vendorName || '',
        invoice_date: result.invoiceDate || '',
        gst_number: result.gstNumber || null,
        purpose: result.purpose || `Vendor Invoice: ${originalFilename}`,
        ocr_confidence: result.confidence || 90,
        ocr_engine: 'Gemini 2.5 Flash (AI OCR)'
      };
    } catch (err) {
      logger.warn({ err: err.message }, 'Gemini OCR failed. Falling back to local methods...');
    }
  }

  // ── OPTION B: PDF Text Extraction ──
  if (isPdf && pdfParse) {
    try {
      logger.info({ filename: originalFilename }, 'Attempting local PDF text parsing fallback...');
      const pdfData = await pdfParse(fileBuffer);
      const text = pdfData.text;
      if (text && text.trim().length > 5) {
        const parsed = parseRawInvoiceText(text, originalFilename);
        return {
          success: true,
          extracted_amount: parsed.amount || 0,
          vendor_name: parsed.vendorName || '',
          invoice_date: parsed.invoiceDate || '',
          gst_number: parsed.gstNumber,
          purpose: parsed.purpose,
          ocr_confidence: parsed.confidence,
          ocr_engine: 'Local PDF Text Engine'
        };
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Local PDF text parsing failed.');
    }
  }

  // ── OPTION C: Tesseract OCR (Local Fallback) ──
  if (!isPdf && tesseract) {
    try {
      logger.info({ filename: originalFilename }, 'Running local Tesseract OCR fallback...');
      const preprocessedPath = await preprocessImage(filePath);
      const { data: { text } } = await tesseract.recognize(preprocessedPath, 'eng');
      
      // Clean up preprocessed file if we created one
      if (preprocessedPath !== filePath) {
        try { fs.unlinkSync(preprocessedPath); } catch (e) {}
      }

      if (text && text.trim().length > 5) {
        const parsed = parseRawInvoiceText(text, originalFilename);
        return {
          success: true,
          extracted_amount: parsed.amount || 0,
          vendor_name: parsed.vendorName || '',
          invoice_date: parsed.invoiceDate || '',
          gst_number: parsed.gstNumber,
          purpose: parsed.purpose,
          ocr_confidence: parsed.confidence,
          ocr_engine: 'Tesseract OCR (Local)'
        };
      }
    } catch (err) {
      logger.error({ err: err.message }, 'Tesseract OCR fallback failed.');
    }
  }

  // ── OPTION D: nothing could read the file ──
  // Return blanks (not an invented amount) so the partner types the details in themselves.
  logger.warn('All OCR pipelines failed/disabled. Returning empty extraction.');
  return {
    success: true,
    extracted_amount: 0,
    vendor_name: '',
    invoice_date: '',
    gst_number: null,
    purpose: '',
    ocr_confidence: 0,
    ocr_engine: 'None (could not read this file)'
  };
}

// Vendor Invoice Upload - returns file hash & extracted invoice parameters
// ── Unique invoice numbers: ONE series for every invoice ──
// Every invoice in the app draws its number from the same running series:
//   AiC/<FY>/<NNNN>   e.g. AiC/26-27/0042
// shared by partner invoices (uploaded or generated), salary requests and Tax Invoices made on
// the Invoices & Estimates page. invoice_codes is the single register of issued numbers (its
// primary key guarantees no duplicates); `kind` records where each one went. The count restarts
// each financial year (April–March). Numbers are never reused — one reserved for a generated PDF
// that is then discarded stays unused, so there can be gaps but never duplicates.
const INVOICE_CODE_KINDS = { PARTNER: 'Partner invoice', SALARY: 'Salary request', BILLING: 'Tax Invoice' };
const UPLOAD_INVOICE_KINDS = ['PARTNER', 'SALARY']; // kinds a request form may ask for

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const invoiceSeriesPrefix = (isoDate) => `AiC/${financialYear(isoDate || todayIso())}/`;

async function nextInvoiceSeq(prefix) {
  const rows = await dbAllAsync('SELECT code FROM invoice_codes WHERE code LIKE ?', [prefix + '%']);
  let max = 0;
  for (const { code } of rows) {
    const n = parseInt(String(code).slice(prefix.length), 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max + 1;
}

async function issueInvoiceCode(kind, userId, fileHash = null, isoDate = null) {
  const prefix = invoiceSeriesPrefix(isoDate);
  // Retry if two invoices are numbered at the same moment and pick the same number
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = prefix + String(await nextInvoiceSeq(prefix)).padStart(4, '0');
    try {
      await dbRunAsync('INSERT INTO invoice_codes (code, kind, issued_to, file_hash, created_at) VALUES (?, ?, ?, ?, ?)',
        [code, kind, userId, fileHash, new Date().toISOString()]);
      return code;
    } catch (err) {
      if (!/unique|duplicate/i.test(err.message || '')) throw err;
    }
  }
  throw new Error('Could not issue a unique invoice code');
}

// Generated PDFs need their code before the PDF is drawn, so the form reserves one first
// and sends it back with the upload (field "invoice_code").
app.post('/api/invoices/reserve-code', authenticateToken, async (req, res, next) => {
  try {
    const kind = String((req.body || {}).kind || '').toUpperCase();
    if (!UPLOAD_INVOICE_KINDS.includes(kind)) return res.status(400).json({ error: 'kind must be PARTNER or SALARY' });
    res.json({ invoice_code: await issueInvoiceCode(kind, req.user.id) });
  } catch (err) { next(err); }
});

// Links an uploaded invoice file to its code: the reserved one if valid, else a fresh one.
async function assignInvoiceCode(kind, userId, fileHash, reservedCode) {
  if (reservedCode) {
    const row = await dbGetAsync('SELECT code, kind, issued_to, file_hash FROM invoice_codes WHERE code = ?', [reservedCode]);
    if (row && row.issued_to === userId && row.kind === kind && !row.file_hash) {
      await dbRunAsync('UPDATE invoice_codes SET file_hash = ? WHERE code = ? AND file_hash IS NULL', [fileHash, reservedCode]);
      return reservedCode;
    }
  }
  return issueInvoiceCode(kind, userId, fileHash);
}

app.post('/api/invoices/upload', authenticateToken, upload.single('invoice'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded. Field name must be "invoice".' });

  const file = req.file;
  const skipOcr = req.body.skip_ocr === 'true' || req.body.skip_ocr === true;
  // invoice_kind marks the file as the request's invoice (not a cheque / bank document),
  // so it gets a unique invoice code.
  const invoiceKind = String(req.body.invoice_kind || '').toUpperCase();
  logger.info({ filename: file.filename, size: file.size, mime: file.mimetype, skipOcr, invoiceKind }, 'Invoice file uploaded for processing');

  // Record who uploaded the file so /api/files can let them (and only them, besides
  // reviewers) preview it before the request is submitted.
  let invoiceCode = null;
  try {
    await new Promise((resolve, reject) => {
      db.run('INSERT INTO attachments (id, filename, mime_type, file_size, file_hash, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
        [file.filename, file.originalname, file.mimetype, file.size, file.filename, req.user.id],
        (err) => (err ? reject(err) : resolve()));
    });
    if (UPLOAD_INVOICE_KINDS.includes(invoiceKind)) {
      invoiceCode = await assignInvoiceCode(invoiceKind, req.user.id, file.filename, req.body.invoice_code);
    }
  } catch (err) {
    try { fs.unlinkSync(file.path); } catch (e) {}
    return next(err);
  }

  // If skip_ocr is set (e.g. for cancelled cheque / bank doc uploads), skip AI OCR for speed
  if (skipOcr) {
    return res.json({
      success: true,
      invoice_code: invoiceCode,
      file_hash: file.filename,
      filename: file.originalname,
      file_size: file.size,
      extracted_amount: 0,
      vendor_name: '',
      invoice_date: '',
      gst_number: '',
      purpose: '',
      ocr_confidence: 0,
      ocr_engine: 'Skipped (bank document)'
    });
  }

  try {
    const ocrData = await processInvoiceOCR(file.path, file.originalname, file.mimetype);
    res.json({
      success: true,
      invoice_code: invoiceCode,
      file_hash: file.filename,
      filename: file.originalname,
      file_size: file.size,
      ...ocrData
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Error in invoice OCR pipeline');
    next(err);
  }
});

// ══════════ WORKSHEETS ══════════
// Employee submits daily worksheet
app.post('/api/worksheets', authenticateToken, (req, res, next) => {
  const { date, tasks_completed, tasks_in_progress, blockers, tomorrow_plan, productivity, hours_worked, mood } = req.body;
  if (!date || !tasks_completed) return res.status(400).json({ error: 'date and tasks_completed are required' });
  const id = 'WS-' + crypto.randomUUID().split('-')[0].toUpperCase();
  db.run(`INSERT INTO worksheets (id, employee_id, date, tasks_completed, tasks_in_progress, blockers, tomorrow_plan, productivity, hours_worked, mood)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.user.id, date, tasks_completed, tasks_in_progress || '', blockers || '', tomorrow_plan || '', productivity || 3, hours_worked || 8, mood || 3],
    function(err) {
      if (err) return next(err);
      logger.info({ id, employee: req.user.id, date }, 'Worksheet submitted');
      res.json({ success: true, id });
    });
});

// Get worksheets - employee sees own, ADM/OWN see all
app.get('/api/worksheets', authenticateToken, (req, res, next) => {
  const viewAll = req.query.all === '1' && (req.user.role === 'ADM' || req.user.role === 'OWN');
  const query = viewAll
    ? 'SELECT * FROM worksheets ORDER BY date DESC, created_at DESC'
    : 'SELECT * FROM worksheets WHERE employee_id = ? ORDER BY date DESC';
  const params = viewAll ? [] : [req.user.id];
  db.all(query, params, (err, rows) => {
    if (err) return next(err);
    res.json(rows);
  });
});

// ══════════ BILLING: INVOICES / ESTIMATES ══════════
// Accounts fill in a few key details; the server assigns the document number, links the
// project's AiC code (creating the project + code on the fly if needed) and computes all totals.
//
// Document number (FY = Indian financial year, April–March, of the issue date):
//   Tax Invoice                      AiC/<FY>/<NNNN>         e.g. AiC/26-27/0042
//       — the single invoice series shared with partner and salary invoices (see invoice_codes)
//   Proforma / Estimate / Quotation  AiC/<TYPE>/<FY>/<NNN>   e.g. AiC/EST/26-27/007
// Documents are never deleted (only marked Cancelled), so numbers are never reused — as GST rules expect.
const BILLING_DOC_TYPES = {
  INV: 'Tax Invoice',
  PI: 'Proforma Invoice',
  EST: 'Estimate',
  QUO: 'Quotation',
};
const BILLING_TAX_RATES = [0, 5, 12, 18, 28];
const BILLING_STATUSES = ['Issued', 'Sent', 'Accepted', 'Paid', 'Cancelled'];
const BILLING_ROLES = ['FIN', 'OWN', 'ADM'];
// A Tax Invoice can be for the full amount, an advance, or the final bill after advances:
//   ADVANCE  no GST; recorded so the final invoice can deduct it
//   FINAL    GST on the full project value, then less the project's open advance invoices = balance due
// An advance is adjusted in at most one final invoice (adjusted_in); cancelling that final frees it again.
const BILLING_STAGES = { FULL: 'Full invoice', ADVANCE: 'Advance invoice', FINAL: 'Final invoice' };

const billingCompany = () => ({
  name: process.env.BILLING_COMPANY_NAME || 'AI Collective',
  address: process.env.BILLING_COMPANY_ADDRESS || '',
  gstin: process.env.BILLING_COMPANY_GSTIN || '',
  pan: process.env.BILLING_COMPANY_PAN || '',
  // Same default as OUR_COMPANY_STATE in the partner form (SubmitRequest.js)
  state: process.env.BILLING_COMPANY_STATE || 'Uttar Pradesh',
  email: process.env.BILLING_COMPANY_EMAIL || '',
  phone: process.env.BILLING_COMPANY_PHONE || '',
  bank: process.env.BILLING_BANK_DETAILS || '',
});

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function financialYear(isoDate) {
  const [y, m] = isoDate.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`;
}
const docNumberPrefix = (type, isoDate) => `AiC/${type}/${financialYear(isoDate)}/`;

async function nextDocSeq(prefix) {
  const rows = await dbAllAsync('SELECT doc_number FROM billing_docs WHERE doc_number LIKE ?', [prefix + '%']);
  let max = 0;
  for (const { doc_number } of rows) {
    const n = parseInt(String(doc_number).slice(prefix.length), 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max + 1;
}

function computeTotals(items, taxMode, taxRate) {
  const lines = items.map(it => ({
    description: it.description.trim(),
    sac: (it.sac || '').trim(),
    qty: Number(it.qty),
    rate: round2(it.rate),
    amount: round2(Number(it.qty) * Number(it.rate)),
  }));
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const rate = taxMode === 'NONE' ? 0 : Number(taxRate);
  const taxAmount = round2(subtotal * rate / 100);
  return { lines, subtotal, taxRate: rate, taxAmount, total: round2(subtotal + taxAmount) };
}

const billingItemSchema = z.object({
  description: z.string().trim().min(1, 'Item description is required').max(300),
  sac: z.string().max(20).optional(),
  qty: z.coerce.number().positive('Quantity must be more than 0').max(1000000),
  rate: z.coerce.number().min(0).max(1000000000),
});

const billingDocSchema = z.object({
  docType: z.enum(Object.keys(BILLING_DOC_TYPES)),
  issueDate: z.string().regex(ISO_DATE_RE, 'Issue date must be YYYY-MM-DD'),
  dueDate: z.string().regex(ISO_DATE_RE).optional().or(z.literal('')),
  projectId: z.string().max(64).optional().or(z.literal('')),
  newProject: z.object({
    name: z.string().trim().min(1).max(200),
    clientCode: z.string().max(5),
    projectTag: z.string().max(6),
    type: z.string().max(5),
    startDate: z.string().regex(ISO_DATE_RE),
  }).optional(),
  client: z.object({
    name: z.string().trim().min(1, 'Client name is required').max(200),
    address: z.string().max(500).optional(),
    gstin: z.string().trim().max(15).optional(),
    state: z.string().max(60).optional(),
    email: z.string().max(200).optional(),
    phone: z.string().max(30).optional(),
  }),
  items: z.array(billingItemSchema).min(1, 'Add at least one item').max(50),
  taxMode: z.enum(['CGST_SGST', 'IGST', 'NONE']),
  taxRate: z.coerce.number().refine(r => BILLING_TAX_RATES.includes(r), 'GST rate must be 0, 5, 12, 18 or 28'),
  notes: z.string().max(2000).optional(),
  stage: z.enum(Object.keys(BILLING_STAGES)).optional(),
  advanceIds: z.array(z.string().max(64)).max(20).optional(),
});

function formatBillingRow(row) {
  if (!row) return row;
  let items = [];
  try { items = JSON.parse(row.items || '[]'); } catch { /* keep empty */ }
  let adjusted_advances = [];
  try { adjusted_advances = JSON.parse(row.adjusted_advances || '[]'); } catch { /* keep empty */ }
  return { ...row, items, adjusted_advances, billing_stage: row.billing_stage || 'FULL' };
}

// Advance invoices of a project that are not cancelled and not yet deducted in a final invoice
function openAdvances(projectId) {
  return dbAllAsync(
    `SELECT id, doc_number, issue_date, total FROM billing_docs
     WHERE project_id = ? AND doc_type = 'INV' AND billing_stage = 'ADVANCE' AND status != 'Cancelled' AND adjusted_in IS NULL
     ORDER BY issue_date, created_at`,
    [projectId]
  );
}

// Number for a new billing document. Tax Invoices take the next number from the single invoice
// series shared with partner and salary invoices (AiC/26-27/0042); Proforma, Estimate and
// Quotation are not invoices, so they keep their own per-type series (AiC/EST/26-27/001).
async function nextBillingDocNumber(fields) {
  if (fields.doc_type === 'INV') return issueInvoiceCode('BILLING', fields.created_by, null, fields.issue_date);
  const prefix = docNumberPrefix(fields.doc_type, fields.issue_date);
  return prefix + formatSeq(await nextDocSeq(prefix));
}

// Inserts a document with the next number (retrying on a clash).
async function insertBillingDoc(fields) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const docNumber = await nextBillingDocNumber(fields);
    const id = 'BIL-' + crypto.randomUUID().split('-')[0].toUpperCase();
    const row = { id, doc_number: docNumber, status: 'Issued', created_at: new Date().toISOString(), ...fields };
    try {
      await dbRunAsync(
        `INSERT INTO billing_docs (id, doc_type, doc_number, project_id, project_code, project_name, client_name, client_address,
          client_gstin, client_state, client_email, client_phone, issue_date, due_date, items, tax_mode, tax_rate, subtotal,
          tax_amount, total, notes, status, source_id, created_by, created_at, billing_stage, advance_amount, balance_due, adjusted_advances)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.doc_type, row.doc_number, row.project_id, row.project_code, row.project_name, row.client_name, row.client_address,
          row.client_gstin, row.client_state, row.client_email, row.client_phone, row.issue_date, row.due_date, row.items, row.tax_mode,
          row.tax_rate, row.subtotal, row.tax_amount, row.total, row.notes, row.status, row.source_id || null, row.created_by, row.created_at,
          row.billing_stage || 'FULL', row.advance_amount ?? null, row.balance_due ?? null, row.adjusted_advances || null]
      );
      return formatBillingRow(row);
    } catch (err) {
      if (!/unique|duplicate/i.test(err.message || '')) throw err;
    }
  }
  const e = new Error('Could not reserve a unique document number. Please try again.');
  e.status = 409;
  throw e;
}

app.get('/api/billing/config', authenticateToken, requireRole(...BILLING_ROLES), (req, res) => {
  res.json({
    company: billingCompany(),
    docTypes: Object.entries(BILLING_DOC_TYPES).map(([code, label]) => ({ code, label })),
    taxRates: BILLING_TAX_RATES,
    statuses: BILLING_STATUSES,
    stages: Object.entries(BILLING_STAGES).map(([code, label]) => ({ code, label })),
  });
});

// Open advance invoices of a project, for the final invoice to deduct
app.get('/api/billing/advances', authenticateToken, requireRole(...BILLING_ROLES), async (req, res, next) => {
  try {
    const projectId = String(req.query.projectId || '');
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    res.json(await openAdvances(projectId));
  } catch (err) { next(err); }
});

// Preview of the number the next document would get (only reserved on create)
app.get('/api/billing/next-number', authenticateToken, requireRole(...BILLING_ROLES), async (req, res, next) => {
  try {
    const type = String(req.query.type || '').toUpperCase();
    const date = String(req.query.date || '');
    if (!BILLING_DOC_TYPES[type]) return res.status(400).json({ error: 'Unknown document type' });
    if (!ISO_DATE_RE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    if (type === 'INV') {
      const prefix = invoiceSeriesPrefix(date);
      return res.json({ number: prefix + String(await nextInvoiceSeq(prefix)).padStart(4, '0') });
    }
    const prefix = docNumberPrefix(type, date);
    res.json({ number: prefix + formatSeq(await nextDocSeq(prefix)) });
  } catch (err) { next(err); }
});

app.get('/api/billing/docs', authenticateToken, requireRole(...BILLING_ROLES), async (req, res, next) => {
  try {
    const type = String(req.query.type || '').toUpperCase();
    const rows = BILLING_DOC_TYPES[type]
      ? await dbAllAsync('SELECT * FROM billing_docs WHERE doc_type = ? ORDER BY created_at DESC', [type])
      : await dbAllAsync('SELECT * FROM billing_docs ORDER BY created_at DESC');
    res.json(rows.map(formatBillingRow));
  } catch (err) { next(err); }
});

app.get('/api/billing/docs/:id', authenticateToken, requireRole(...BILLING_ROLES), async (req, res, next) => {
  try {
    const row = await dbGetAsync('SELECT * FROM billing_docs WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Document not found' });
    res.json(formatBillingRow(row));
  } catch (err) { next(err); }
});

app.post('/api/billing/docs', authenticateToken, requireRole(...BILLING_ROLES), validate(billingDocSchema), async (req, res, next) => {
  const b = req.validatedBody;
  try {
    // Resolve the project — an existing one, or a new one created here with its own AiC code
    let project = null;
    if (b.projectId) {
      project = await dbGetAsync('SELECT id, name, code FROM projects WHERE id = ?', [b.projectId]);
      if (!project) return res.status(400).json({ error: 'Selected project was not found' });
    } else if (b.newProject) {
      const created = await createProjectWithCode({ ...b.newProject, partnerName: b.client.name, partnerPhone: b.client.phone });
      if (created.error) return res.status(created.status).json({ error: created.error });
      project = created.project;
    } else {
      return res.status(400).json({ error: 'Pick a project or create a new one (needed for the AiC code)' });
    }

    const stage = b.docType === 'INV' ? (b.stage || 'FULL') : 'FULL';
    if (stage === 'FINAL' && !b.projectId) {
      return res.status(400).json({ error: 'A final invoice needs an existing project, so its advance invoices can be found.' });
    }
    // Advance invoices carry no GST; GST is charged on the full value in the final invoice
    const taxMode = stage === 'ADVANCE' ? 'NONE' : b.taxMode;
    const t = computeTotals(b.items, taxMode, stage === 'ADVANCE' ? 0 : b.taxRate);

    let advances = [];
    if (stage === 'FINAL') {
      const ids = [...new Set(b.advanceIds || [])];
      advances = (await openAdvances(project.id)).filter(a => ids.includes(a.id));
      if (advances.length !== ids.length) {
        return res.status(409).json({ error: 'One of the advance invoices was cancelled or already deducted in another final invoice. Reload and try again.' });
      }
    }
    const advanceAmount = round2(advances.reduce((s, a) => s + Number(a.total || 0), 0));
    if (advanceAmount > t.total) {
      return res.status(400).json({ error: `The advances (Rs. ${advanceAmount}) are more than this invoice's total (Rs. ${t.total}).` });
    }
    const doc = await insertBillingDoc({
      doc_type: b.docType,
      project_id: project.id,
      project_code: project.code,
      project_name: project.name,
      client_name: b.client.name.trim(),
      client_address: b.client.address || null,
      client_gstin: b.client.gstin ? b.client.gstin.toUpperCase() : null,
      client_state: b.client.state || null,
      client_email: b.client.email || null,
      client_phone: b.client.phone || null,
      issue_date: b.issueDate,
      due_date: b.dueDate || null,
      items: JSON.stringify(t.lines),
      tax_mode: taxMode,
      tax_rate: t.taxRate,
      subtotal: t.subtotal,
      tax_amount: t.taxAmount,
      total: t.total,
      notes: b.notes || null,
      created_by: req.user.id,
      billing_stage: stage,
      advance_amount: stage === 'FINAL' ? advanceAmount : null,
      balance_due: stage === 'FINAL' ? round2(t.total - advanceAmount) : null,
      adjusted_advances: stage === 'FINAL'
        ? JSON.stringify(advances.map(a => ({ id: a.id, doc_number: a.doc_number, issue_date: a.issue_date, amount: round2(a.total) })))
        : null,
    });
    for (const a of advances) {
      await dbRunAsync('UPDATE billing_docs SET adjusted_in = ? WHERE id = ? AND adjusted_in IS NULL', [doc.id, a.id]);
    }
    logger.info({ id: doc.id, number: doc.doc_number, code: doc.project_code, stage, by: req.user.id }, 'Billing document created');
    res.json(doc);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// Turn an Estimate / Quotation / Proforma into a Tax Invoice (new invoice number, same project + AiC code)
app.post('/api/billing/docs/:id/convert', authenticateToken, requireRole(...BILLING_ROLES), async (req, res, next) => {
  try {
    const src = await dbGetAsync('SELECT * FROM billing_docs WHERE id = ?', [req.params.id]);
    if (!src) return res.status(404).json({ error: 'Document not found' });
    if (src.doc_type === 'INV') return res.status(400).json({ error: 'This is already a Tax Invoice' });
    if (src.status === 'Cancelled') return res.status(400).json({ error: 'A cancelled document cannot be converted' });
    const existing = await dbGetAsync("SELECT doc_number FROM billing_docs WHERE source_id = ? AND doc_type = 'INV' AND status != 'Cancelled'", [src.id]);
    if (existing) return res.status(409).json({ error: `Already converted to invoice ${existing.doc_number}` });

    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const { id, doc_number, status, created_at, created_by, ...fields } = src; // eslint-disable-line no-unused-vars
    const doc = await insertBillingDoc({
      ...fields, doc_type: 'INV', issue_date: today, due_date: null, source_id: src.id, created_by: req.user.id,
      billing_stage: 'FULL', advance_amount: null, balance_due: null, adjusted_advances: null,
    });
    await dbRunAsync('UPDATE billing_docs SET status = ? WHERE id = ?', ['Accepted', src.id]);
    logger.info({ from: src.doc_number, to: doc.doc_number, by: req.user.id }, 'Billing document converted to invoice');
    res.json(doc);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

app.put('/api/billing/docs/:id/status', authenticateToken, requireRole(...BILLING_ROLES), async (req, res, next) => {
  try {
    const status = String((req.body || {}).status || '');
    if (!BILLING_STATUSES.includes(status)) return res.status(400).json({ error: `Status must be one of: ${BILLING_STATUSES.join(', ')}` });
    const row = await dbGetAsync('SELECT id, status, billing_stage, adjusted_in FROM billing_docs WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Document not found' });
    if (row.billing_stage === 'ADVANCE' && row.adjusted_in && status === 'Cancelled') {
      const fin = await dbGetAsync('SELECT doc_number FROM billing_docs WHERE id = ?', [row.adjusted_in]);
      return res.status(400).json({ error: `This advance is deducted in final invoice ${fin ? fin.doc_number : row.adjusted_in}. Cancel that invoice first.` });
    }
    if (row.billing_stage === 'FINAL' && row.status === 'Cancelled' && status !== 'Cancelled') {
      return res.status(400).json({ error: 'A cancelled final invoice cannot be reopened, because its advances were released. Create a new final invoice instead.' });
    }
    await dbRunAsync('UPDATE billing_docs SET status = ? WHERE id = ?', [status, req.params.id]);
    // Cancelling a final invoice frees its advances for the next final invoice
    if (row.billing_stage === 'FINAL' && status === 'Cancelled') {
      await dbRunAsync('UPDATE billing_docs SET adjusted_in = NULL WHERE adjusted_in = ?', [req.params.id]);
    }
    res.json({ id: req.params.id, status });
  } catch (err) { next(err); }
});

// ══════════ PROJECT PROFIT & GST ══════════
// One AiC code ties a project's client invoices (billing_docs) to the partner bills paid against it
// (requests, whose metadata.projectName is "Name (CODE)"). Profit is worked out before GST: GST
// collected from clients and GST paid to partners pass through to the government, so they are
// reported separately (output GST, input GST, net payable) for the GST return.
const REPORT_ROLES = ['FIN', 'OWN', 'ADM'];
const codeFromProjectName = (s) => { const m = String(s || '').match(/\(([^()]+)\)\s*$/); return m ? m[1].trim() : ''; };
const nameFromProjectName = (s) => String(s || '').replace(/\s*\([^()]*\)\s*$/, '').trim();
const isoDay = (v) => String(v || '').slice(0, 10);
function splitGst(amount, mode) {
  const a = round2(amount);
  if (mode === 'IGST') return { cgst: 0, sgst: 0, igst: a };
  const half = round2(a / 2);
  return { cgst: half, sgst: round2(a - half), igst: 0 };
}

function summariseProject(p) {
  const inv = p.client.filter(d => d.doc_type === 'INV');
  // An advance that a final invoice has deducted is already inside that final's value
  const counted = inv.filter(d => !(d.stage === 'ADVANCE' && d.adjusted_in));
  const billed = round2(counted.reduce((s, d) => s + d.subtotal, 0));
  const outputGst = round2(inv.reduce((s, d) => s + d.tax_amount, 0));
  const paid = inv.filter(d => d.status === 'Paid');
  const received = round2(paid.reduce((s, d) => s + (d.stage === 'FINAL' && d.balance_due != null ? Number(d.balance_due) : d.total), 0));
  const advanceReceived = round2(paid.filter(d => d.stage === 'ADVANCE').reduce((s, d) => s + d.total, 0));
  const quotes = p.client.filter(d => d.doc_type !== 'INV').sort((a, b) => String(b.issue_date).localeCompare(String(a.issue_date)));
  const quoted = quotes.length ? quotes[0].subtotal : null;

  const partnerCost = round2(p.partners.reduce((s, r) => s + r.base, 0));
  const paidOut = round2(p.partners.filter(r => r.status === 'DSB').reduce((s, r) => s + r.total, 0));
  const toPay = round2(p.partners.filter(r => r.status !== 'DSB').reduce((s, r) => s + r.payable, 0));
  const inputGst = round2(p.partners.filter(r => r.gstin).reduce((s, r) => s + r.gst, 0));

  const profit = round2(billed - partnerCost);
  return {
    quoted, billed, outputGst, received, advanceReceived,
    partnerCost, paidOut, toPay, inputGst,
    profit, margin: billed > 0 ? round2((profit / billed) * 100) : null,
    cashPosition: round2(received - paidOut), // money actually in minus money actually out, GST included
    netGst: round2(outputGst - inputGst),
  };
}

app.get('/api/reports/project-profit', authenticateToken, requireRole(...REPORT_ROLES), async (req, res, next) => {
  try {
    const [projects, docs, requests] = await Promise.all([
      dbAllAsync('SELECT id, name, code, status, partner_name, created_at FROM projects'),
      dbAllAsync("SELECT * FROM billing_docs WHERE status != 'Cancelled'"),
      dbAllAsync("SELECT id, amount, status, ts, metadata FROM requests WHERE deleted_at IS NULL AND status != 'REJ'"),
    ]);
    const byCode = new Map();
    const entry = (code, name) => {
      if (!byCode.has(code)) byCode.set(code, { code, name: name || code, id: null, status: null, client: [], partners: [] });
      return byCode.get(code);
    };
    for (const p of projects) Object.assign(entry(p.code, p.name), { id: p.id, status: p.status, client_name: p.partner_name || '', created_at: p.created_at });

    const gstLines = [];
    for (const d of docs) {
      if (!d.project_code) continue;
      const stage = d.doc_type === 'INV' ? (d.billing_stage || 'FULL') : 'FULL';
      entry(d.project_code, d.project_name).client.push({
        id: d.id, doc_type: d.doc_type, stage, doc_number: d.doc_number, issue_date: d.issue_date, client_name: d.client_name,
        subtotal: Number(d.subtotal) || 0, tax_amount: Number(d.tax_amount) || 0, total: Number(d.total) || 0,
        balance_due: d.balance_due, status: d.status, adjusted_in: d.adjusted_in || null,
      });
      if (d.doc_type === 'INV' && Number(d.tax_amount) > 0) {
        gstLines.push({
          direction: 'OUTPUT', date: d.issue_date, number: d.doc_number, party: d.client_name, gstin: d.client_gstin || '',
          project_code: d.project_code, taxable: Number(d.subtotal) || 0, tax: Number(d.tax_amount) || 0,
          ...splitGst(d.tax_amount, d.tax_mode), claimable: true,
        });
      }
    }

    for (const r of requests) {
      let m = {};
      try { m = JSON.parse(r.metadata || '{}') || {}; } catch { /* bad metadata */ }
      const code = codeFromProjectName(m.projectName);
      if (!code) continue; // salary and other requests without a project
      const gst = m.isGst ? Number(m.gstAmount) || 0 : 0;
      const total = Number(m.totalAmount) || Number(r.amount) || 0;
      const base = m.baseAmount != null && m.baseAmount !== '' ? Number(m.baseAmount) || 0 : round2(total - gst);
      const gstin = String(m.gstNumber || '').trim().toUpperCase();
      const party = m.companyName || m.vendorName || '';
      entry(code, nameFromProjectName(m.projectName)).partners.push({
        id: r.id, status: r.status, date: isoDay(r.ts), partner: party, role: m.department || '',
        base: round2(base), gst: round2(gst), total: round2(total), payable: Number(r.amount) || 0, gstin,
      });
      if (gst > 0) {
        gstLines.push({
          direction: 'INPUT', date: isoDay(r.ts), number: r.id, party, gstin, project_code: code,
          taxable: round2(base), tax: round2(gst), ...splitGst(gst, /IGST/i.test(m.gstType || '') ? 'IGST' : 'CGST_SGST'),
          claimable: !!gstin, request_status: r.status,
        });
      }
    }

    const list = [...byCode.values()].map(p => ({ ...p, summary: summariseProject(p) }));
    // Projects with money moving first, then newest
    list.sort((a, b) => (b.summary.billed + b.summary.partnerCost) - (a.summary.billed + a.summary.partnerCost)
      || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const sum = (k) => round2(list.reduce((s, p) => s + (Number(p.summary[k]) || 0), 0));
    const totals = {
      billed: sum('billed'), partnerCost: sum('partnerCost'), profit: sum('profit'), received: sum('received'),
      paidOut: sum('paidOut'), toPay: sum('toPay'), outputGst: sum('outputGst'), inputGst: sum('inputGst'),
      netGst: sum('netGst'), cashPosition: sum('cashPosition'),
    };
    totals.margin = totals.billed > 0 ? round2((totals.profit / totals.billed) * 100) : null;
    gstLines.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    res.json({ projects: list, totals, gstLines });
  } catch (err) { next(err); }
});

// Fallback to index.html for SPA routing
app.use((req, res) => {
  const frontendIndexPath = path.join(__dirname, 'frontend', 'build', 'index.html');
  if (fs.existsSync(frontendIndexPath)) {
    res.sendFile(frontendIndexPath);
  } else {
    res.status(503).json({ error: 'Frontend build not found. Run "npm run build".' });
  }
});

// Register error handler
app.use(errorHandler);

// Graceful Shutdown
function shutdown() {
  logger.info('SIGTERM/SIGINT received. Shutting down gracefully.');
  db.close((err) => {
    if (err) {
      logger.error({ err }, 'Error closing database');
      process.exit(1);
    }
    logger.info('Database connection closed.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
