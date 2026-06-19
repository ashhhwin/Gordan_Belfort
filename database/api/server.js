import express from 'express';
import cors from 'cors';
import pkg from 'pg';
const { Pool, Client } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Postgres connection
const pool = new Pool({
  user: process.env.PGUSER || process.env.USER,
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'stock_pilot',
  password: process.env.PGPASSWORD || '',
  port: process.env.PGPORT || 5432,
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Failed to connect to PostgreSQL:', err.message);
    console.error('Please ensure PostgreSQL is running and the database exists.');
  } else {
    console.log('Connected to PostgreSQL at', res.rows[0].now);
  }
});

// ─── Families ───
app.get('/api/family', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM families LIMIT 1');
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/family', async (req, res) => {
  const { id, name, config, created_by, created_at } = req.body;
  try {
    const query = `
      INSERT INTO families (id, name, config, created_by, created_at) 
      VALUES ($1, $2, $3, $4, $5) 
      ON CONFLICT (id) DO UPDATE SET name = $2, config = $3
      RETURNING *
    `;
    const { rows } = await pool.query(query, [id, name, config, created_by, created_at]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/family/:id/config', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('UPDATE families SET config = $1 WHERE id = $2 RETURNING *', [req.body, id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Users ───
app.get('/api/users', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { id, family_id, name, role, color, initials, created_at } = req.body;
  try {
    const query = `
      INSERT INTO users (id, family_id, name, role, color, initials, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
      RETURNING *
    `;
    const { rows } = await pool.query(query, [id, family_id, name, role, color, initials, created_at]);
    res.json(rows[0] || req.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'created_at');
  if (fields.length === 0) return res.json({});
  
  const setString = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map(f => updates[f]);
  
  try {
    const query = `UPDATE users SET ${setString} WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [id, ...values]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Holdings ───
app.get('/api/holdings', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM holdings ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/holdings', async (req, res) => {
  const { id, user_id, assetClass, symbol, name, sector, qty, avgBuy, cmp, dayChange, dayChangePct, buyDate, sparkline, created_at } = req.body;
  try {
    const query = `
      INSERT INTO holdings (id, user_id, asset_class, symbol, name, sector, qty, avg_buy, cmp, day_change, day_change_pct, buy_date, sparkline, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (id) DO UPDATE SET 
        qty = EXCLUDED.qty, avg_buy = EXCLUDED.avg_buy, cmp = EXCLUDED.cmp, updated_at = NOW()
      RETURNING *
    `;
    const { rows } = await pool.query(query, [
      id, user_id, assetClass, symbol, name, sector, qty, avgBuy, cmp, dayChange, dayChangePct, buyDate, 
      sparkline ? JSON.stringify(sparkline) : null, created_at || new Date().toISOString()
    ]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/holdings/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  // A simple dynamic update builder for Postgres
  const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'created_at');
  if (fields.length === 0) return res.json({});
  
  const setString = fields.map((f, i) => {
    // Map camelCase keys to snake_case column names if needed
    const colName = f === 'assetClass' ? 'asset_class' : 
                    f === 'avgBuy' ? 'avg_buy' : 
                    f === 'buyDate' ? 'buy_date' : 
                    f === 'dayChange' ? 'day_change' :
                    f === 'dayChangePct' ? 'day_change_pct' : f;
    return `${colName} = $${i + 2}`;
  }).join(', ');
  
  const values = fields.map(f => {
    if (f === 'sparkline' && updates[f]) return JSON.stringify(updates[f]);
    return updates[f];
  });
  
  try {
    const query = `UPDATE holdings SET ${setString}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [id, ...values]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/holdings/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM holdings WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Analytics & History ───
app.get('/api/history', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM portfolio_history ORDER BY date ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sync-status', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT MAX(updated_at) as last_synced FROM holdings');
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sync-logs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 50');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sync-logs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM sync_logs WHERE id = $1', [id]);
    res.json({ message: 'Log deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

import { spawn } from 'child_process';
import fs from 'fs';
import cronParser from 'cron-parser';
import cron from 'node-cron';

const pipelinePath = '/Users/ashwinram/Personal Coding Projects/stock_pilot/scripts/ingestion/sync_pipeline.sh';
const CRON_EXPRESSION = '0 19 * * *'; // 7:00 PM
const CRON_TIMEZONE = 'Asia/Kolkata';

const nsePipelinePath = '/Users/ashwinram/Personal Coding Projects/stock_pilot/scripts/ingestion/nse_pipeline.sh';
const NSE_CRON_EXPRESSION = '0 17 * * *'; // 5:00 PM
const NSE_CRON_TIMEZONE = 'Asia/Kolkata';

function runPipeline(path, logFile) {
  console.log(`[CRON/MANUAL] Triggering ${path} at ${new Date().toISOString()}`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const child = spawn('bash', [path]);

  child.stdout.on('data', (data) => {
    process.stdout.write(data);
    logStream.write(data);
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(data);
    logStream.write(data);
  });

  return new Promise((resolve) => {
    child.on('close', (code) => {
      logStream.end();
      if (code !== 0) console.error(`[PIPELINE] Exited with code ${code}`);
      resolve(code);
    });
  });
}

// Schedule the internal cron job for INDMoney
const syncJob = cron.schedule(CRON_EXPRESSION, () => {
  runPipeline(pipelinePath, '/tmp/gordan-belfort_sync.log');
}, {
  scheduled: true,
  timezone: CRON_TIMEZONE
});

// Schedule the internal cron job for NSE Data
const nseJob = cron.schedule(NSE_CRON_EXPRESSION, () => {
  runPipeline(nsePipelinePath, '/tmp/gordan-belfort_nse_sync.log');
}, {
  scheduled: true,
  timezone: NSE_CRON_TIMEZONE
});

let isSyncRunning = false;

app.post('/api/sync-run', async (req, res) => {
  if (isSyncRunning) {
    return res.status(409).json({ error: 'Sync is already running' });
  }
  
  isSyncRunning = true;
  res.json({ message: 'Sync started' }); // Return immediately to unblock UI
  
  await runPipeline(pipelinePath, '/tmp/gordan-belfort_sync.log');
  isSyncRunning = false;
});

app.post('/api/nse-sync-run', async (req, res) => {
  if (isSyncRunning) {
    return res.status(409).json({ error: 'Sync is already running' });
  }
  
  isSyncRunning = true;
  res.json({ message: 'NSE Sync started' }); // Return immediately to unblock UI
  
  await runPipeline(nsePipelinePath, '/tmp/gordan-belfort_nse_sync.log');
  isSyncRunning = false;
});

// ─── Market Data ───
app.get('/api/market/overview', async (req, res) => {
  try {
    const { region = 'USA', search, industry, cap_category } = req.query;

    if (region === 'IND') {
      const indQuery = `
        SELECT elem->>'symbol' AS symbol,
               elem->>'symbol' AS company_name,
               (elem->>'lastPrice')::numeric AS p_close,
               (elem->>'previousClose')::numeric AS prev_close,
               (elem->>'pchange')::numeric AS day_change_pct,
               (elem->>'totalTradedVolume')::numeric AS volume
        FROM public.nse_daily_data, jsonb_array_elements(payload->'total'->'data') AS elem
        WHERE endpoint_name = 'stocks_traded'
          AND date = (SELECT MAX(date) FROM public.nse_daily_data WHERE endpoint_name = 'stocks_traded')
      `;
      const { rows } = await pool.query(indQuery);
      
      let results = rows;
      if (search) {
        const s = search.toLowerCase();
        results = results.filter(r => r.symbol.toLowerCase().includes(s));
      }
      
      results.sort((a, b) => b.volume - a.volume);
      return res.json(results.slice(0, 100));
    }

    let queryArgs = [];
    let conditions = ['trade_date = (SELECT MAX(trade_date) FROM market.market_data)'];

    if (search) {
      queryArgs.push(`%${search.toUpperCase()}%`);
      conditions.push(`symbol LIKE $${queryArgs.length}`);
    }
    if (industry) {
      queryArgs.push(industry);
      conditions.push(`industry = $${queryArgs.length}`);
    }
    if (cap_category) {
      if (cap_category === 'Mega') {
        conditions.push(`market_cap >= 200000`);
      } else if (cap_category === 'Large') {
        conditions.push(`market_cap >= 10000 AND market_cap < 200000`);
      } else if (cap_category === 'Mid') {
        conditions.push(`market_cap >= 2000 AND market_cap < 10000`);
      } else if (cap_category === 'Small') {
        conditions.push(`market_cap >= 300 AND market_cap < 2000`);
      } else if (cap_category === 'Micro') {
        conditions.push(`market_cap < 300`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT * FROM market.market_data 
      ${whereClause}
      ORDER BY trade_date DESC, volume DESC NULLS LAST
      LIMIT 100
    `;
    const { rows } = await pool.query(query, queryArgs);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/market/earnings', async (req, res) => {
  try {
    const query = `
      SELECT * FROM market.earnings_calendar 
      WHERE date >= CURRENT_DATE
      ORDER BY date ASC
      LIMIT 100
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/market/estimates/:symbol', async (req, res) => {
  const { symbol } = req.params;
  try {
    const revQuery = `
      SELECT * FROM market.revenue_estimates 
      WHERE ticker = $1 
        AND api_run_date = (SELECT MAX(api_run_date) FROM market.revenue_estimates WHERE ticker = $1)
      ORDER BY period ASC
    `;
    const revResult = await pool.query(revQuery, [symbol.toUpperCase()]);
    
    const epsQuery = `
      SELECT * FROM market.eps_estimates 
      WHERE ticker = $1 
        AND api_run_date = (SELECT MAX(api_run_date) FROM market.eps_estimates WHERE ticker = $1)
      ORDER BY period ASC
    `;
    const epsResult = await pool.query(epsQuery, [symbol.toUpperCase()]);
    
    res.json({
      revenue: revResult.rows,
      eps: epsResult.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function executeDynamicQuery(query, params, dbName) {
  const currentDb = process.env.PGDATABASE || 'stock_pilot';
  if (!dbName || dbName === currentDb) {
    return pool.query(query, params);
  }
  const client = new Client({
    user: process.env.PGUSER || process.env.USER,
    host: process.env.PGHOST || 'localhost',
    database: dbName,
    password: process.env.PGPASSWORD || '',
    port: process.env.PGPORT || 5432,
  });
  await client.connect();
  try {
    const res = await client.query(query, params);
    return res;
  } finally {
    await client.end();
  }
}

app.get('/api/database/meta', async (req, res) => {
  try {
    const targetDb = req.query.db || 'stock_pilot';
    const dbQuery = `SELECT datname FROM pg_database WHERE datistemplate = false;`;
    const { rows: dbRows } = await pool.query(dbQuery); // Always query main pool for database list
    
    const tableQuery = `SELECT table_name FROM information_schema.tables WHERE table_schema IN ('public', 'market');`;
    const { rows: tableRows } = await executeDynamicQuery(tableQuery, [], targetDb);
    
    const colQuery = `
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema IN ('public', 'market')
    `;
    const { rows: colRows } = await executeDynamicQuery(colQuery, [], targetDb);
    
    const fkQuery = `
      SELECT
          tc.table_name, 
          kcu.column_name, 
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name 
      FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY';
    `;
    const { rows: fkRows } = await executeDynamicQuery(fkQuery, [], targetDb);
    
    res.json({
      databases: dbRows.map(r => r.datname),
      tables: tableRows.map(r => r.table_name),
      columns: colRows,
      foreignKeys: fkRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sql-query', async (req, res) => {
  try {
    const { query, db } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: "Invalid query string." });
    }
    const result = await executeDynamicQuery(query, [], db);
    res.json({
      command: result.command,
      rowCount: result.rowCount,
      fields: result.fields.map(f => f.name),
      rows: result.rows
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/cron-status', async (req, res) => {
  try {
    const parser = cronParser.CronExpressionParser || cronParser.default?.CronExpressionParser;
    
    const indInterval = parser.parse(CRON_EXPRESSION, { tz: CRON_TIMEZONE });
    const nseInterval = parser.parse(NSE_CRON_EXPRESSION, { tz: NSE_CRON_TIMEZONE });
    
    res.json([
      { 
        job: 'Portfolio Sync',
        configured: true, 
        nextRun: indInterval.next().toDate().toISOString(), 
        cronExpression: CRON_EXPRESSION, 
        tz: CRON_TIMEZONE 
      },
      { 
        job: 'NSE Market Data',
        configured: true, 
        nextRun: nseInterval.next().toDate().toISOString(), 
        cronExpression: NSE_CRON_EXPRESSION, 
        tz: NSE_CRON_TIMEZONE 
      }
    ]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5005;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[SERVER] Gordan Belfort Database API running on http://localhost:${PORT}`);
  });
}

export default app;

export { app, pool };
