import express from 'express';
import cors from 'cors';
import pkg from 'pg';
const { Pool, Client } = pkg;
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let bot = null;
if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID) {
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
  console.log('Telegram Bot Initialized');

  // Safe Telegram message sender with basic Markdown -> HTML conversion
  async function sendTelegramSafe(text) {
    if (!bot || !TELEGRAM_CHAT_ID) return;
    
    // Convert standard markdown to HTML
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.*?)\*/g, '<i>$1</i>')
      .replace(/__(.*?)__/g, '<u>$1</u>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');
      
    try {
      return await bot.sendMessage(TELEGRAM_CHAT_ID, html, { parse_mode: 'HTML' });
    } catch (err) {
      // Fallback to plain text if HTML parsing fails
      return await bot.sendMessage(TELEGRAM_CHAT_ID, text);
    }
  }

  // Listen for /health or /ping commands
  bot.onText(/\/(health|ping|status)/, async (msg) => {
    if (msg.chat.id.toString() !== TELEGRAM_CHAT_ID) return; // Ignore unauthorized chats
    
    try {
      const { rows } = await pool.query('SELECT MAX(updated_at) as last_synced FROM holdings');
      const lastSynced = rows[0]?.last_synced ? new Date(rows[0].last_synced).toLocaleString() : 'Never';
      
      const { rows: jobs } = await pool.query('SELECT job_name, status, started_at FROM sync_logs ORDER BY started_at DESC LIMIT 3');
      let jobsText = '';
      jobs.forEach(j => {
        jobsText += `- ${j.job_name}: ${j.status} (${new Date(j.started_at).toLocaleTimeString()})\n`;
      });

      const response = `[SYSTEM] <b>Stock Pilot is ONLINE</b>\n\n<b>Last Portfolio Sync</b>: ${lastSynced}\n\n<b>Recent Jobs</b>:\n${jobsText}`;
      sendTelegramSafe(response).catch(console.error);
    } catch (err) {
      sendTelegramSafe(`[SYSTEM ERROR]\n${err.message}`).catch(console.error);
    }
  });

  // Listen to all text messages for AI interaction
  bot.on('message', async (msg) => {
    if (msg.chat.id.toString() !== TELEGRAM_CHAT_ID) return;
    if (!msg.text || msg.text.startsWith('/')) return; // Ignore commands

    // Send typing indicator
    bot.sendChatAction(TELEGRAM_CHAT_ID, 'typing');

    try {
      const response = await fetch('http://localhost:8001/chat/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: msg.text, 
          session_id: `telegram-session-${uuidv4()}`,
          model: 'qwen3:latest',
          temperature: 0.0
        })
      });
      
      const data = await response.json();
      if (data.response) {
        await sendTelegramSafe(data.response);
      } else {
        await sendTelegramSafe(`[ERROR] Invalid response from AI`).catch(console.error);
      }
    } catch (err) {
      sendTelegramSafe(`[ERROR] Hitting AI endpoint\n${err.message}`).catch(console.error);
    }
  });

} else {
  console.warn('Telegram Bot not initialized. Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.');
}

// Global alert function that can be used inside server.js
function sendTelegramAlert(message) {
  if (bot && TELEGRAM_CHAT_ID) {
    // We recreate sendTelegramSafe logic here in case it's called outside the init block
    let html = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.*?)\*/g, '<i>$1</i>')
      .replace(/__(.*?)__/g, '<u>$1</u>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');
      
    bot.sendMessage(TELEGRAM_CHAT_ID, html, { parse_mode: 'HTML' }).catch(err => {
      bot.sendMessage(TELEGRAM_CHAT_ID, message).catch(console.error);
    });
  }
}

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

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  sendTelegramAlert(`[DATABASE ERROR] Unexpected error on idle client:\n${err.message}`);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  sendTelegramAlert(`[CRITICAL] Uncaught Exception:\n${err.message}\n\n\`\`\`\n${err.stack}\n\`\`\``);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  sendTelegramAlert(`[CRITICAL] Unhandled Rejection:\n${reason}`);
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
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

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
    const globalRes = await pool.query(`
      SELECT MAX(completed_at) as last_synced 
      FROM sync_logs 
      WHERE LOWER(status) IN ('success', 'completed')
    `);
    
    const jobsRes = await pool.query(`
      SELECT DISTINCT ON (job_name) job_name, status, completed_at, started_at
      FROM sync_logs
      WHERE job_name IS NOT NULL
      ORDER BY job_name, started_at DESC
    `);

    res.json({
      last_synced: globalRes.rows[0]?.last_synced || null,
      jobs: jobsRes.rows
    });
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

const gcsRunnerPath = '/Users/ashwinram/Personal Coding Projects/stock_pilot/scripts/ingestion/gcs_runner.sh';
const GCS_MARKET_CRON = '0 19 * * *';
const GCS_ESTIMATES_CRON = '0 20 * * *';
const GCS_EARNINGS_CRON = '0 20 * * *';
const GCS_TIMEZONE = 'UTC';

const DAILY_BRIEFING_CRON = '0 20 * * *'; // 8:00 PM
const MARKET_PULSE_CRON = '0 */2 * * *'; // Every 2 hours

const IBKR_SYNC_CRON = '0 17 * * *'; // 5:00 PM
const IBKR_TIMEZONE = 'America/New_York';

const runningJobs = new Set();

async function runPipeline(command, args = [], jobName = 'Unknown Job', logFile = null) {
  if (runningJobs.has(jobName)) return false;
  runningJobs.add(jobName);

  const id = uuidv4();
  try {
    await pool.query(
      'INSERT INTO sync_logs (id, started_at, status, job_name) VALUES ($1, NOW(), $2, $3)',
      [id, 'IN_PROGRESS', jobName]
    );
  } catch (err) {
    console.error('Failed to log job start:', err);
  }

  console.log(`[CRON/MANUAL] Triggering ${jobName} at ${new Date().toISOString()}`);
  let logStream = null;
  if (logFile) {
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
  }

  // Ensure python path is absolute or runs from project root
  const rootPath = path.resolve(__dirname, '../../');
  const child = spawn(command, args, { cwd: rootPath });
  let output = '';

  child.on('error', async (err) => {
    console.error(`[PIPELINE] Spawn error: ${err.message}`);
    const message = `Failed to spawn process: ${err.message}`;
    sendTelegramAlert(`[CRITICAL] Failed to spawn process ${jobName}:\n${err.message}`);
    try {
      await pool.query(
        'UPDATE sync_logs SET completed_at = NOW(), status = $1, message = $2 WHERE id = $3',
        ['FAILED', message, id]
      );
    } catch (e) {
      console.error('Failed to log job spawn error:', e);
    }
    runningJobs.delete(jobName);
  });

  child.stdout.on('data', (data) => {
    process.stdout.write(data);
    if (logStream) logStream.write(data);
    output += data.toString();
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(data);
    if (logStream) logStream.write(data);
    output += data.toString();
  });

  child.on('close', async (code) => {
    if (logStream) logStream.end();
    if (code !== 0) console.error(`[PIPELINE] Exited with code ${code}`);
    
    const status = code === 0 ? 'SUCCESS' : 'FAILED';
    const message = output.substring(Math.max(0, output.length - 2000)); // Keep last 2000 chars

    try {
      await pool.query(
        'UPDATE sync_logs SET completed_at = NOW(), status = $1, message = $2 WHERE id = $3',
        [status, message, id]
      );
    } catch (err) {
      console.error('Failed to log job end:', err);
    }

    if (status === 'FAILED') {
      sendTelegramAlert(`[FAILED] Job: ${jobName}\n\n\`\`\`\n${message.substring(message.length - 500)}\n\`\`\``);
    } else {
      sendTelegramAlert(`[COMPLETED] Job: ${jobName}`);
    }

    runningJobs.delete(jobName);
  });

  return true;
}

// Schedule the internal cron job for INDMoney
const syncJob = cron.schedule(CRON_EXPRESSION, () => {
  runPipeline('bash', ['scripts/ingestion/sync_pipeline.sh'], 'Portfolio Sync', '/tmp/gordan-belfort_sync.log');
}, { scheduled: true, timezone: CRON_TIMEZONE });

// Schedule the internal cron job for NSE Data
const nseJob = cron.schedule(NSE_CRON_EXPRESSION, () => {
  runPipeline('bash', ['scripts/ingestion/nse_pipeline.sh'], 'NSE Market Data', '/tmp/gordan-belfort_nse_sync.log');
}, { scheduled: true, timezone: NSE_CRON_TIMEZONE });

const gcsMarketJob = cron.schedule(GCS_MARKET_CRON, () => {
  runPipeline('ai/venv/bin/python', ['-u', 'scripts/gcs_market_feeds/gcs_market_data.py'], 'GCS Market Data', '/tmp/gcs_market.log');
}, { scheduled: true, timezone: GCS_TIMEZONE });

const gcsEstimatesJob = cron.schedule(GCS_ESTIMATES_CRON, () => {
  runPipeline('ai/venv/bin/python', ['-u', 'scripts/gcs_market_feeds/gcs_analyst_estimates_data.py'], 'GCS Analyst Estimates Data', '/tmp/gcs_estimates.log');
}, { scheduled: true, timezone: GCS_TIMEZONE });

const gcsEarningsJob = cron.schedule(GCS_EARNINGS_CRON, () => {
  runPipeline('ai/venv/bin/python', ['-u', 'scripts/gcs_market_feeds/gcs_earnings_calendar.py'], 'GCS Earnings Calendar', '/tmp/gcs_earnings.log');
}, { scheduled: true, timezone: GCS_TIMEZONE });

const ibkrSyncJob = cron.schedule(IBKR_SYNC_CRON, () => {
  runPipeline('bash', ['scripts/ingestion/portfolio_pipeline.sh'], 'IBKR Portfolio Sync', '/Users/ashwinram/Personal Coding Projects/stock_pilot/logs/portfolio_ingest.log');
}, { scheduled: true, timezone: IBKR_TIMEZONE });

// ── Autonomous AI Alerting Crons ──
cron.schedule(DAILY_BRIEFING_CRON, async () => {
  console.log(`[CRON] Triggering Daily AI Briefing at ${new Date().toISOString()}`);
  try {
    await fetch('http://localhost:8001/chat/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "Generate a comprehensive End-of-Day briefing for my portfolio and the broader market. Use your tools to check my net worth and today's market performance. Then, use the send_telegram_alert tool to send me this concisely formatted briefing. CRITICAL: Use a highly professional tone. DO NOT use any emojis whatsoever.",
        session_id: 'cron-daily-briefing'
      })
    });
  } catch (err) {
    console.error('Daily briefing failed:', err);
  }
}, { scheduled: true, timezone: CRON_TIMEZONE });

cron.schedule(MARKET_PULSE_CRON, async () => {
  console.log(`[CRON] Triggering Autonomous Market Pulse at ${new Date().toISOString()}`);
  try {
    await fetch('http://localhost:8001/chat/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "Review the current market conditions and my portfolio holdings. If you detect any sudden crashes, major anomalies, or significant trends that I need to know about right now, use your send_telegram_alert tool to notify me with a professional, concise alert. CRITICAL: DO NOT use any emojis whatsoever. If the market is stable, reply with exactly 'NO_ALERT_NEEDED' without using any tools.",
        session_id: 'cron-market-pulse'
      })
    });
  } catch (err) {
    console.error('Market pulse failed:', err);
  }
}, { scheduled: true, timezone: CRON_TIMEZONE });

  app.post('/api/sync-all', (req, res) => {
  const jobs = [
    { cmd: 'bash', args: ['scripts/ingestion/portfolio_pipeline.sh'], name: 'IBKR Portfolio Sync', log: '/Users/ashwinram/Personal Coding Projects/stock_pilot/logs/portfolio_ingest.log' },
    { cmd: 'bash', args: ['scripts/ingestion/sync_pipeline.sh'], name: 'Portfolio Sync', log: '/tmp/gordan-belfort_sync.log' },
    { cmd: 'bash', args: ['scripts/ingestion/nse_pipeline.sh'], name: 'NSE Market Data', log: '/tmp/gordan-belfort_nse_sync.log' },
    { cmd: 'ai/venv/bin/python', args: ['-u', 'scripts/gcs_market_feeds/gcs_market_data.py'], name: 'GCS Market Data', log: '/tmp/gcs_market.log' },
    { cmd: 'ai/venv/bin/python', args: ['-u', 'scripts/gcs_market_feeds/gcs_analyst_estimates_data.py'], name: 'GCS Analyst Estimates Data', log: '/tmp/gcs_estimates.log' },
    { cmd: 'ai/venv/bin/python', args: ['-u', 'scripts/gcs_market_feeds/gcs_earnings_calendar.py'], name: 'GCS Earnings Calendar', log: '/tmp/gcs_earnings.log' }
  ];
  
  let startedCount = 0;
  for (const job of jobs) {
    if (runPipeline(job.cmd, job.args, job.name, job.log)) {
      startedCount++;
    }
  }
  
  // Fire and forget the AI Market Pulse
  fetch('http://localhost:8001/chat/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: "Review the current market conditions and my portfolio holdings. If you detect any sudden crashes, major anomalies, or significant trends that I need to know about right now, use your send_telegram_alert tool to notify me with a professional, concise alert. CRITICAL: DO NOT use any emojis whatsoever. If the market is stable, reply with exactly 'NO_ALERT_NEEDED' without using any tools.",
      session_id: 'cron-market-pulse'
    })
  }).catch(err => console.error('AI Market Pulse trigger failed:', err));
  
  sendTelegramAlert(`[SYSTEM] Global Sync Pipeline Triggered (${startedCount} background jobs + AI Pulse)`);
  res.json({ message: `Triggered ${startedCount} jobs successfully.`, startedCount });
});

app.post('/api/sync-run', (req, res) => {
  const started = runPipeline('bash', ['scripts/ingestion/sync_pipeline.sh'], 'Portfolio Sync', '/tmp/gordan-belfort_sync.log');
  if (!started) return res.status(409).json({ error: 'Sync is already running' });
  res.json({ message: 'Sync started' });
});

app.post('/api/nse-sync-run', (req, res) => {
  const started = runPipeline('bash', ['scripts/ingestion/nse_pipeline.sh'], 'NSE Market Data', '/tmp/gordan-belfort_nse_sync.log');
  if (!started) return res.status(409).json({ error: 'Sync is already running' });
  res.json({ message: 'NSE Sync started' });
});

app.post('/api/gcs-market-run', (req, res) => {
  const started = runPipeline('ai/venv/bin/python', ['-u', 'scripts/gcs_market_feeds/gcs_market_data.py'], 'GCS Market Data', '/tmp/gcs_market.log');
  if (!started) return res.status(409).json({ error: 'Sync is already running' });
  res.json({ message: 'GCS Market Sync started' });
});

app.post('/api/gcs-estimates-run', (req, res) => {
  const started = runPipeline('ai/venv/bin/python', ['-u', 'scripts/gcs_market_feeds/gcs_analyst_estimates_data.py'], 'GCS Analyst Estimates Data', '/tmp/gcs_estimates.log');
  if (!started) return res.status(409).json({ error: 'Sync is already running' });
  res.json({ message: 'GCS Estimates Sync started' });
});

app.post('/api/gcs-earnings-run', (req, res) => {
  const started = runPipeline('ai/venv/bin/python', ['-u', 'scripts/gcs_market_feeds/gcs_earnings_calendar.py'], 'GCS Earnings Calendar', '/tmp/gcs_earnings.log');
  if (!started) return res.status(409).json({ error: 'Sync is already running' });
  res.json({ message: 'GCS Earnings Sync started' });
});

app.post('/api/ibkr-sync-run', (req, res) => {
  const started = runPipeline('bash', ['scripts/ingestion/portfolio_pipeline.sh'], 'IBKR Portfolio Sync', '/Users/ashwinram/Personal Coding Projects/stock_pilot/logs/portfolio_ingest.log');
  if (!started) return res.status(409).json({ error: 'Sync is already running' });
  res.json({ message: 'IBKR Sync started' });
});

app.post('/api/alert', (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });
  
  sendTelegramAlert(message);
  res.json({ success: true, message: 'Alert queued' });
});

app.post('/api/login-alert', async (req, res) => {
  const { user, method } = req.body;
  if (!user) return res.status(400).json({ error: 'Missing user' });

  try {
    const geoResponse = await fetch('http://ip-api.com/json/');
    const geo = await geoResponse.json();
    const location = geo.status === 'success' ? `${geo.city}, ${geo.regionName}, ${geo.country}` : 'Unknown Location';
    const ip = geo.query || 'Unknown IP';
    
    const message = `[SECURITY] *Login Detected*\n\n*User*: ${user}\n*Method*: ${method || 'Unknown'}\n*Location*: ${location}\n*IP Address*: ${ip}\n*Time*: ${new Date().toLocaleString()}`;
    sendTelegramAlert(message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

app.get('/api/market/signals', async (req, res) => {
  try {
    const query = `
      SELECT 'SMART_MONEY' as type, date, symbol, deal_type as detail
      FROM mv_alpha_smart_money
      UNION ALL
      SELECT 'VOL_BREAKOUT' as type, date, symbol, (ROUND(volume_surge_pct, 1) || '% Surge') as detail
      FROM mv_alpha_volume_breakouts
      ORDER BY date DESC
      LIMIT 8
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching alpha signals:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/market/indices', async (req, res) => {
  try {
    const niftyQuery = `
      SELECT date, close_val 
      FROM nse_indices_daily 
      WHERE index_name = 'NIFTY 50' 
      ORDER BY date ASC
    `;
    const { rows: niftyRows } = await pool.query(niftyQuery);

    const spyQuery = `
      SELECT trade_date as date, p_close as close_val 
      FROM market.market_data 
      WHERE symbol = 'SPY' 
      ORDER BY trade_date ASC
    `;
    const { rows: spyRows } = await pool.query(spyQuery);

    // Merge into a single array aligned by date
    const merged = {};
    
    niftyRows.forEach(r => {
      const d = r.date.toISOString().split('T')[0];
      if (!merged[d]) merged[d] = { date: d };
      merged[d].nifty = parseFloat(r.close_val);
    });

    spyRows.forEach(r => {
      const d = r.date.toISOString().split('T')[0];
      if (!merged[d]) merged[d] = { date: d };
      merged[d].spy = parseFloat(r.close_val);
    });

    const result = Object.values(merged).sort((a, b) => new Date(a.date) - new Date(b.date));
    res.json(result);
  } catch (error) {
    console.error('Error fetching market indices:', error);
    res.status(500).json({ error: error.message });
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

const dynamicPools = new Map();

async function executeDynamicQuery(query, params, dbName) {
  const currentDb = process.env.PGDATABASE || 'stock_pilot';
  if (!dbName || dbName === currentDb) {
    return pool.query(query, params);
  }
  
  if (!dynamicPools.has(dbName)) {
    const newPool = new Pool({
      user: process.env.PGUSER || process.env.USER,
      host: process.env.PGHOST || 'localhost',
      database: dbName,
      password: process.env.PGPASSWORD || '',
      port: process.env.PGPORT || 5432,
    });
    dynamicPools.set(dbName, newPool);
  }
  
  return dynamicPools.get(dbName).query(query, params);
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
    const gcsMarketInterval = parser.parse(GCS_MARKET_CRON, { tz: GCS_TIMEZONE });
    const gcsEstimatesInterval = parser.parse(GCS_ESTIMATES_CRON, { tz: GCS_TIMEZONE });
      const gcsEarningsInterval = parser.parse(GCS_EARNINGS_CRON, { tz: GCS_TIMEZONE });
    const ibkrInterval = parser.parse(IBKR_SYNC_CRON, { tz: IBKR_TIMEZONE });
    
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
      },
      { job: 'GCS Market Data', configured: true, nextRun: gcsMarketInterval.next().toDate().toISOString(), cronExpression: GCS_MARKET_CRON, tz: GCS_TIMEZONE },
      { job: 'GCS Analyst Estimates Data', configured: true, nextRun: gcsEstimatesInterval.next().toDate().toISOString(), cronExpression: GCS_ESTIMATES_CRON, tz: GCS_TIMEZONE },
      { job: 'GCS Earnings Calendar', configured: true, nextRun: gcsEarningsInterval.next().toDate().toISOString(), cronExpression: GCS_EARNINGS_CRON, tz: GCS_TIMEZONE },
      { job: 'IBKR Portfolio Sync', configured: true, nextRun: ibkrInterval.next().toDate().toISOString(), cronExpression: IBKR_SYNC_CRON, tz: IBKR_TIMEZONE },
      { job: 'AI Daily Briefing', configured: true, nextRun: parser.parse(DAILY_BRIEFING_CRON, { tz: CRON_TIMEZONE }).next().toDate().toISOString(), cronExpression: DAILY_BRIEFING_CRON, tz: CRON_TIMEZONE },
      { job: 'AI Market Pulse', configured: true, nextRun: parser.parse(MARKET_PULSE_CRON, { tz: CRON_TIMEZONE }).next().toDate().toISOString(), cronExpression: MARKET_PULSE_CRON, tz: CRON_TIMEZONE }
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
