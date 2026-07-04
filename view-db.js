const { Pool } = require('pg');
require('dotenv').config();

async function viewDb() {
  const pgConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : {
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432'),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'finance',
        ssl: (process.env.PGHOST && process.env.PGHOST !== 'localhost') ? { rejectUnauthorized: false } : false
      };

  const pool = new Pool(pgConfig);
  try {
    // Try connection
    await pool.query('SELECT 1');
    
    console.log("\n=================== USERS TABLE (PostgreSQL) ===================");
    const users = await pool.query("SELECT id, name, role FROM users");
    console.table(users.rows);

    console.log("\n=================== REQUESTS TABLE (PostgreSQL) ===================");
    const requests = await pool.query("SELECT id, amount, purpose, status, requester, ts FROM requests");
    console.table(requests.rows);

    console.log("\n=================== AUDIT LOGS TABLE (Last 10 Entries - PostgreSQL) ===================");
    const audit = await pool.query("SELECT id, reqId, actor, prev, next, comment, ts FROM audit_logs ORDER BY id DESC LIMIT 10");
    console.table(audit.rows);
    
    await pool.end();
  } catch (err) {
    console.warn('PostgreSQL database query failed (' + err.message + '). Falling back to SQLite viewer...');
    await pool.end();
    
    // SQLite viewer
    const sqlite3 = require('sqlite3').verbose();
    const sqliteDb = new sqlite3.Database('./finance.db');
    
    console.log("\n=================== USERS TABLE (SQLite Fallback) ===================");
    sqliteDb.all("SELECT id, name, role FROM users", [], (err, rows) => {
      if (err) return console.error(err);
      console.table(rows);
      
      console.log("\n=================== REQUESTS TABLE (SQLite Fallback) ===================");
      sqliteDb.all("SELECT id, amount, purpose, status, requester, ts FROM requests", [], (err, rows) => {
        if (err) return console.error(err);
        console.table(rows);
        
        console.log("\n=================== AUDIT LOGS TABLE (Last 10 Entries - SQLite Fallback) ===================");
        sqliteDb.all("SELECT id, reqId, actor, prev, next, comment, ts FROM audit_logs ORDER BY id DESC LIMIT 10", [], (err, rows) => {
          if (err) return console.error(err);
          console.table(rows);
          sqliteDb.close();
        });
      });
    });
  }
}

viewDb();
