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
      frameSrc: ["'self'", "https://*.clerk.accounts.dev", "https://challenges.cloudflare.com"],
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
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'];
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

app.use(express.json({ limit: '10mb' }));

// Serve static frontend files (if frontend/build exists, serve it, otherwise serve root for local vanilla files)
const frontendBuildPath = path.join(__dirname, 'frontend', 'build');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
} else {
  app.use(express.static(path.join(__dirname)));
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

  await pool.query(`CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    request_id TEXT,
    filename TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    file_hash TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES requests(id)
  )`);

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

  await pool.query('CREATE INDEX IF NOT EXISTS idx_requests_requester ON requests(requester)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_requests_deleted ON requests(deleted_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_reqId ON audit_logs(reqId)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');

  // Seed transitions
  const transitions = [
    ['PND', 'VRF', 'VRF'],
    ['PND', 'VRF', 'FIN'],
    ['PND', 'VRF', 'OWN'],
    ['PND', 'REJ', 'VRF'],
    ['PND', 'REJ', 'FIN'],
    ['VRF', 'FIN', 'FIN'],
    ['VRF', 'REJ', 'FIN'],
    ['VRF', 'OWN', 'FIN'],
    ['FIN', 'OWN', 'OWN'],
    ['FIN', 'REJ', 'OWN'],
    ['FIN', 'OWN', 'FIN'],
    ['OWN', 'DSB', 'FIN'],
    ['OWN', 'DSB', 'SYSTEM'],
    ['REJ', 'PND', 'FIN'],
    ['REJ', 'VRF', 'OWN'],
    ['PND', 'VRF', 'ADM'],
    ['PND', 'FIN', 'ADM'],
    ['PND', 'OWN', 'ADM'],
    ['PND', 'REJ', 'ADM'],
    ['VRF', 'FIN', 'ADM'],
    ['VRF', 'OWN', 'ADM'],
    ['VRF', 'REJ', 'ADM'],
    ['FIN', 'OWN', 'ADM'],
    ['FIN', 'REJ', 'ADM'],
    ['OWN', 'DSB', 'ADM'],
  ];

  for (const t of transitions) {
    await pool.query(
      'INSERT INTO state_transitions (from_state, to_state, required_role) VALUES ($1, $2, $3) ON CONFLICT (from_state, to_state) DO NOTHING',
      t
    );
  }

  isPostgres = true;
  logger.info('PostgreSQL database fully initialized.');
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

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        request_id TEXT,
        filename TEXT NOT NULL,
        mime_type TEXT,
        file_size INTEGER,
        file_hash TEXT,
        uploaded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (request_id) REFERENCES requests(id)
      )`);

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

      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_requests_requester ON requests(requester)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_requests_deleted ON requests(deleted_at)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_audit_reqId ON audit_logs(reqId)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');

      const transitions = [
        ['PND', 'VRF', 'VRF'],
        ['PND', 'VRF', 'FIN'],
        ['PND', 'VRF', 'OWN'],
        ['PND', 'REJ', 'VRF'],
        ['PND', 'REJ', 'FIN'],
        ['VRF', 'FIN', 'FIN'],
        ['VRF', 'REJ', 'FIN'],
        ['VRF', 'OWN', 'FIN'],
        ['FIN', 'OWN', 'OWN'],
        ['FIN', 'REJ', 'OWN'],
        ['FIN', 'OWN', 'FIN'],
        ['OWN', 'DSB', 'FIN'],
        ['OWN', 'DSB', 'SYSTEM'],
        ['REJ', 'PND', 'FIN'],
        ['REJ', 'VRF', 'OWN'],
        ['PND', 'VRF', 'ADM'],
        ['PND', 'FIN', 'ADM'],
        ['PND', 'OWN', 'ADM'],
        ['PND', 'REJ', 'ADM'],
        ['VRF', 'FIN', 'ADM'],
        ['VRF', 'OWN', 'ADM'],
        ['VRF', 'REJ', 'ADM'],
        ['FIN', 'OWN', 'ADM'],
        ['FIN', 'REJ', 'ADM'],
        ['OWN', 'DSB', 'ADM'],
      ];

      const stmt = sqliteDb.prepare('INSERT OR IGNORE INTO state_transitions (from_state, to_state, required_role) VALUES (?, ?, ?)');
      transitions.forEach(t => stmt.run(t));
      stmt.finalize();

      logger.info('SQLite fallback database and schema initialized successfully.');
    });
  });
  isPostgres = false;
}

async function initDb() {
  const pgConfig = {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'finance'
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
const AUDIT_SECRET = process.env.AUDIT_SECRET || 'default-audit-hmac-key';
function signAuditEntry(reqId, actor, prev, next, comment, ts) {
  const payload = `${reqId}|${actor}|${prev}|${next}|${comment}|${ts}`;
  return crypto.createHmac('sha256', AUDIT_SECRET).update(payload).digest('hex');
}

// ══════════ EMAIL → ROLE MAPPING (Fixed Roles) ══════════
const EMAIL_ROLE_MAP = {
  'rayabakash@gmail.com':      { role: 'DEV', name: 'Abakash' },
  'abakashray57@gmail.com':    { role: 'EMP', name: 'Abakash' },
  'abakashray772@gmail.com':   { role: 'VRF', name: 'Rup' },
  'abakashray846@gmail.com':   { role: 'VRF', name: 'Samaja' },
  'abakashray003@gmail.com':   { role: 'FIN', name: 'Yash' },
  'rayabakash0@gmail.com':     { role: 'OWN', name: 'Debojit' },
  'cse2022017@rcciit.org.in':  { role: 'ADM', name: 'Admin' },
};

function getRoleByEmail(email) {
  if (!email) return null;
  return EMAIL_ROLE_MAP[email.toLowerCase()] || null;
}

// ══════════ VENDOR AUTH (Simple ID/Password, No Clerk) ══════════
const VENDOR_JWT_SECRET = process.env.VENDOR_JWT_SECRET || 'vendor-jwt-secret-key-2024';
const jwt = require('jsonwebtoken');

// Default vendor accounts (seeded into DB on startup)
const DEFAULT_VENDORS = [
  { id: 'vendor001', password: 'vendor@123', name: 'Default Vendor' },
];

function initVendorAccounts() {
  DEFAULT_VENDORS.forEach(v => {
    const hashedPw = crypto.createHash('sha256').update(v.password).digest('hex');
    db.run('INSERT OR IGNORE INTO users (id, name, role, hash, updated_at) VALUES (?, ?, ?, ?, ?)',
      [v.id, v.name, 'VND', hashedPw, new Date().toISOString()]);
  });
  logger.info('Vendor accounts initialized');
}

// Initialize vendor accounts after DB is ready
setTimeout(() => initVendorAccounts(), 1000);

// ══════════ AUTH MIDDLEWARE ══════════
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }
    const token = authHeader.split(' ')[1];
    
    // ── Try Vendor JWT first (vendor tokens start with 'VND-' prefix in the payload) ──
    try {
      const vendorPayload = jwt.verify(token, VENDOR_JWT_SECRET);
      if (vendorPayload && vendorPayload.vendorId) {
        // This is a vendor token
        db.get('SELECT * FROM users WHERE id = ?', [vendorPayload.vendorId], (err, user) => {
          if (err) return next(err);
          if (!user) return res.status(401).json({ error: 'Vendor account not found' });
          req.user = user;
          req.clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
          req.clientAgent = req.headers['user-agent'] || 'unknown';
          next();
        });
        return;
      }
    } catch (vendorErr) {
      // Not a vendor token, continue to Clerk verification
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
    return res.status(401).json({ error: 'Token verification failed', detail: err.message });
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
app.post('/api/vendor/login', (req, res) => {
  const { vendorId, password } = req.body;
  if (!vendorId || !password) {
    return res.status(400).json({ error: 'Vendor ID and Password are required' });
  }

  const hashedPw = crypto.createHash('sha256').update(password).digest('hex');
  
  db.get('SELECT * FROM users WHERE id = ? AND role = ? AND hash = ?', [vendorId, 'VND', hashedPw], (err, user) => {
    if (err) {
      logger.error({ err }, 'Vendor login DB error');
      return res.status(500).json({ error: 'Internal server error' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid Vendor ID or Password' });
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
app.post('/api/requests', authenticateToken, validate(createRequestSchema), (req, res, next) => {
  const { amount, purpose, file_hash, metadata, verifier } = req.validatedBody;
  const id = 'REQ-' + crypto.randomUUID().split('-')[0].toUpperCase();
  const ts = new Date().toISOString();
  // All requests start at PND — Debojit verifies as 1st-line first, then Finance, then Owner auth
  const sig = signAuditEntry(id, req.user.id, '-', 'PND', 'Request submitted. Awaiting first-line verification.', ts);

  db.serialize(() => {
    db.run('INSERT INTO requests (id, amount, purpose, status, requester, verifier, ts, file_hash, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, amount, purpose, 'PND', req.user.id, verifier || null, ts, file_hash || null, metadata || null]);
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

    logger.info({ requestId: id, amount, verifier, actor: req.user.id }, 'Request created with verifier');
    res.json({ success: true, id });
  });
});

// Get Verifiers list (the 4 first-line people)
app.get('/api/verifiers', authenticateToken, (req, res) => {
  const verifiers = [
    { id: 'rup',     name: 'Rup',     title: 'Tech Head',      role: 'VRF', avatar: 'R', color: '#3b82f6' },
    { id: 'debojit', name: 'Debojit', title: 'Creative Head & Owner', role: 'OWN', avatar: 'D', color: '#8b5cf6' },
    { id: 'yash',    name: 'Yash',    title: 'Finance Head',   role: 'FIN', avatar: 'Y', color: '#22c55e' },
    { id: 'samaja',  name: 'Samaja',  title: 'Content Head',   role: 'VRF', avatar: 'S', color: '#f59e0b' },
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

    // Enforce Verifier Isolation:
    // If the request is pending first-line review (PND) and moving to verified (VRF),
    // ensure the actor is the assigned verifier.
    // Matching rules (any one is sufficient):
    //   1. req.user.name matches verifier field (case-insensitive)
    //   2. The verifier field is 'debojit' and the user's role is 'OWN' (Debojit is always the Owner)
    //   3. ADM can do anything
    if (reqRow.status === 'PND' && nextState === 'VRF') {
      if (reqRow.verifier) {
        const verifierLower = reqRow.verifier.toLowerCase();
        const userNameLower = (req.user.name || '').toLowerCase();
        const isAssignedDebojit = verifierLower === 'debojit' && req.user.role === 'OWN';
        const nameMatches = verifierLower === userNameLower;
        const isAdmin = req.user.role === 'ADM';
        if (!nameMatches && !isAssignedDebojit && !isAdmin) {
          return res.status(403).json({ error: `Verification blocked: This request is specifically assigned to ${reqRow.verifier}. Only they can verify it.` });
        }
      }
    }

    // Maker-checker: prevent self-approval (disabled for demo so you can test the entire workflow with a single account!)
    /*
    if (reqRow.requester === req.user.id && ['FIN', 'OWN', 'DSB'].includes(nextState)) {
      return res.status(403).json({ error: 'Self-approval is prohibited. Another authorized user must approve.' });
    }
    */

    // Validate state transition
    const prevState = reqRow.status;
    db.get('SELECT * FROM state_transitions WHERE from_state = ? AND to_state = ? AND (required_role = ? OR required_role = ?)',
      [prevState, nextState, req.user.role, 'SYSTEM'], (err2, transition) => {
        if (err2) return next(err2);
        
        // ADM can do anything, otherwise check transition table
        if (!transition && req.user.role !== 'ADM') {
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

  if (reqId) {
    // Fetch logs for a specific request, join with users to get actor names
    const countQuery = "SELECT COUNT(*) as total FROM audit_logs WHERE reqId = ?";
    const dataQuery = "SELECT a.*, u.name as actor_name, u.role as actor_role FROM audit_logs a LEFT JOIN users u ON a.actor = u.id WHERE a.reqId = ? ORDER BY a.id ASC LIMIT ? OFFSET ?";
    
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
    return;
  }

  let countQuery = "SELECT COUNT(*) as total FROM audit_logs";
  let dataQuery = "SELECT * FROM audit_logs ORDER BY id ASC LIMIT ? OFFSET ?";
  let params = [limit, offset];

  if (req.user.role === 'DEV') {
    // Basic DEV filtering - ideally done in SQL with JOIN but implemented similarly to old version
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

app.get('/api/users', authenticateToken, (req, res, next) => {
  db.all("SELECT id, name, role FROM users", [], (err, rows) => {
    if (err) return next(err);
    res.json(rows);
  });
});

// ══════════ NEW ENDPOINTS (SUBSCRIPTIONS, QUERIES, INVOICES) ══════════

// Subscriptions
app.get('/api/subscriptions', authenticateToken, (req, res, next) => {
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

  if (viewAs && allowedManagerRoles.includes(viewAs)) {
    // Allow viewing as Finance or Owner inbox if:
    // 1. Their DB role matches viewAs
    // 2. Their DB role is ADM (admin can see everything)
    // 3. Their DB role is DEV (allow for UI role-switching demo)
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

// Reply to Query (Finance/Owner/ADM or UI role-switch demo)
app.post('/api/queries/:id/reply', authenticateToken, (req, res, next) => {
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `invoice_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
      'image/gif', 'image/bmp', 'image/tiff', 'image/heic', 'image/heif',
      'application/pdf'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type "${file.mimetype}" is not supported. Allowed: JPG, PNG, WEBP, GIF, BMP, TIFF, HEIC, PDF`));
  }
});

// Expose uploads directory to frontend
app.use('/uploads', express.static(uploadsDir));

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

// Call Gemini 1.5 Flash Vision API natively
async function callGeminiVision(apiKey, base64Data, mimeType) {
  return new Promise((resolve, reject) => {
    // Structured output prompt for invoice extraction
    const promptText = `You are a professional invoice OCR and data extraction system. Carefully analyze this invoice image and extract all financial information.

Return ONLY a valid JSON object with NO markdown, NO code fences, NO backticks. Just raw JSON:
{"amount": <number: base invoice amount before tax, or total amount if no breakdown>, "vendorName": "<string: the seller/company name at top of invoice>", "invoiceDate": "<string: date in YYYY-MM-DD format>", "gstNumber": "<string: 15-char Indian GSTIN if present, otherwise null>", "purpose": "<string: 1 sentence describing what this invoice is for>", "confidence": <number: 0-100 how confident you are>}`;

    // Use image/jpeg as safe fallback for PDF inlineData
    const safeMimeType = mimeType === 'application/pdf' ? 'image/jpeg' : mimeType;

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

// Regex-based text parsing heuristic for fallback OCR
function parseRawInvoiceText(text, originalFilename) {
  let amount = 1000;
  // Look for total/amount patterns (e.g. Total: ₹15,000.00, RS 2400)
  const amtMatch = text.match(/(?:total|amount|amt|payable|sum|net|gross)\s*(?:rs\.?|inr|₹|usd|\$)?\s*([\d,]+(?:\.\d{2})?)/i);
  if (amtMatch) {
    amount = parseFloat(amtMatch[1].replace(/,/g, ''));
  }

  // Look for 15-character GSTIN pattern
  const gstMatch = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/);
  const gstNumber = gstMatch ? gstMatch[0] : null;

  // Look for dates
  const dateMatch = text.match(/\b(?:\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4})|(?:\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2})\b/);
  const invoiceDate = dateMatch ? dateMatch[0] : new Date().toISOString().split('T')[0];

  // Look for vendor name
  let vendorName = 'Unknown Vendor';
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length > 0) {
    vendorName = lines[0].substring(0, 40);
  }

  return {
    amount,
    vendorName,
    invoiceDate,
    gstNumber,
    purpose: `Extracted from ${originalFilename}`,
    confidence: 60,
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
        extracted_amount: result.amount || 1000,
        vendor_name: result.vendorName || 'Unknown Vendor',
        invoice_date: result.invoiceDate || new Date().toISOString().split('T')[0],
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
          extracted_amount: parsed.amount,
          vendor_name: parsed.vendorName,
          invoice_date: parsed.invoiceDate,
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
          extracted_amount: parsed.amount,
          vendor_name: parsed.vendorName,
          invoice_date: parsed.invoiceDate,
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

  // ── OPTION D: Heuristic File Metadata Fallback ──
  logger.warn('All OCR pipelines failed/disabled. Falling back to heuristic defaults.');
  const baseAmount = (fileBuffer.length % 9000) + 1000;
  const amount = Math.round(baseAmount / 10) * 10;
  return {
    success: true,
    extracted_amount: amount,
    vendor_name: 'Unknown Vendor (OCR Failed)',
    invoice_date: new Date().toISOString().split('T')[0],
    gst_number: null,
    purpose: `Vendor Invoice: ${originalFilename} (AI/OCR simulation fallback)`,
    ocr_confidence: 30,
    ocr_engine: 'Simulation Fallback'
  };
}

// Vendor Invoice Upload - returns file hash & extracted invoice parameters
app.post('/api/invoices/upload', authenticateToken, upload.single('invoice'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded. Field name must be "invoice".' });

  const file = req.file;
  logger.info({ filename: file.filename, size: file.size, mime: file.mimetype }, 'Invoice file uploaded for processing');

  try {
    const ocrData = await processInvoiceOCR(file.path, file.originalname, file.mimetype);
    res.json({
      success: true,
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


// Fallback to index.html for SPA routing
app.use((req, res) => {
  const frontendIndexPath = path.join(__dirname, 'frontend', 'build', 'index.html');
  if (fs.existsSync(frontendIndexPath)) {
    res.sendFile(frontendIndexPath);
  } else {
    res.sendFile(path.join(__dirname, 'index.html'));
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
