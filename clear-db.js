const { Pool } = require('pg');
require('dotenv').config();

async function clearDb() {
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
    // Try connecting to PostgreSQL
    await pool.query('SELECT 1');
    console.log("Connected to PostgreSQL. Clearing tables...");

    await pool.query("TRUNCATE TABLE requests, audit_logs, notifications, worksheets RESTART IDENTITY CASCADE");
    console.log("PostgreSQL Database cleared successfully (Requests, Audit Logs, Notifications, Worksheets deleted).");
    
    await pool.end();
  } catch (err) {
    console.warn('PostgreSQL connection failed (' + err.message + '). Falling back to SQLite database clear...');
    await pool.end();
    
    // SQLite clearer
    const sqlite3 = require('sqlite3').verbose();
    const sqliteDb = new sqlite3.Database('./finance.db');
    
    sqliteDb.serialize(() => {
      sqliteDb.run("DELETE FROM requests", (err) => {
        if (err) console.error("Error clearing SQLite requests:", err.message);
      });
      sqliteDb.run("DELETE FROM audit_logs", (err) => {
        if (err) console.error("Error clearing SQLite audit_logs:", err.message);
      });
      sqliteDb.run("DELETE FROM notifications", (err) => {
        if (err) console.error("Error clearing SQLite notifications:", err.message);
      });
      sqliteDb.run("DELETE FROM worksheets", (err) => {
        if (err) console.error("Error clearing SQLite worksheets:", err.message);
      });
      console.log("SQLite Database cleared successfully (Requests, Audit Logs, Notifications, Worksheets deleted).");
    });
    sqliteDb.close();
  }
}

clearDb();
