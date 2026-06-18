import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const pool = new Pool({
  user: process.env.PGUSER || process.env.USER,
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'stock_pilot',
  password: process.env.PGPASSWORD || '',
  port: process.env.PGPORT || 5432,
});

const SEED_FAMILY_ID = '00000000-0000-0000-0000-000000000001';
const SEED_ADMIN_ID  = '00000000-0000-0000-0000-000000000002';
const SEED_USER2_ID  = '00000000-0000-0000-0000-000000000003';

function genId() {
  return crypto.randomUUID();
}

async function migrate() {
  try {
    console.log('Checking database connection...');
    await pool.query('SELECT NOW()');

    console.log('Seeding Family...');
    await pool.query(`
      INSERT INTO families (id, name, config, created_by, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      SEED_FAMILY_ID,
      'Ram Family',
      JSON.stringify({
        baseCurrency: 'INR',
        taxRates: { indiaSTCG: 20, indiaLTCG: 12.5, usSTCG: 30, usLTCG: 20 }
      }),
      null
    ]);

    // Just to ensure it's null initially if conflict was hit
    await pool.query('UPDATE families SET created_by = NULL WHERE id = $1', [SEED_FAMILY_ID]);

    console.log('Seeding Users...');
    await pool.query(`
      INSERT INTO users (id, family_id, name, role, color, initials)
      VALUES 
      ($1, $2, 'Ashwin Ram', 'admin', '#4B7BEC', 'AR'),
      ($3, $2, 'Priya Ram', 'member', '#00D4A1', 'PR')
      ON CONFLICT (id) DO NOTHING
    `, [SEED_ADMIN_ID, SEED_FAMILY_ID, SEED_USER2_ID]);

    await pool.query('UPDATE families SET created_by = $1 WHERE id = $2', [SEED_ADMIN_ID, SEED_FAMILY_ID]);

    console.log('Seeding Holdings (Base samples)...');
    
    // Some basic dummy holdings to get started
    const holdings = [
      { id: genId(), user_id: SEED_ADMIN_ID, assetClass: 'IND_EQUITY', symbol: 'RELIANCE', name: 'Reliance Industries', qty: 50, avgBuy: 2500, cmp: 2900, buyDate: '2023-05-10' },
      { id: genId(), user_id: SEED_ADMIN_ID, assetClass: 'MF', symbol: 'PARAGPPF', name: 'Parag Parikh Flexi Cap', qty: 1542.5, avgBuy: 45.2, cmp: 72.8, buyDate: '2021-06-01' },
      { id: genId(), user_id: SEED_ADMIN_ID, assetClass: 'EPF', symbol: 'EPFO', name: 'Employees Provident Fund', qty: 1, avgBuy: 1850000, cmp: 2240000, buyDate: '2015-01-01' },
      { id: genId(), user_id: SEED_ADMIN_ID, assetClass: 'BANK', symbol: 'HDFC_SAVINGS', name: 'HDFC Bank Savings', qty: 1, avgBuy: 450000, cmp: 450000, buyDate: '2024-01-01' },
      { id: genId(), user_id: SEED_ADMIN_ID, assetClass: 'CREDIT_CARD', symbol: 'AMEX_PLAT', name: 'Amex Platinum Travel', qty: 1, avgBuy: -45200, cmp: -45200, buyDate: '2024-06-01' },
      { id: genId(), user_id: SEED_USER2_ID, assetClass: 'IND_EQUITY', symbol: 'HDFCBANK', name: 'HDFC Bank Ltd.', qty: 60, avgBuy: 1540, cmp: 1642.10, buyDate: '2024-02-15' },
      { id: genId(), user_id: SEED_USER2_ID, assetClass: 'VEHICLE', symbol: 'CAR', name: 'Hyundai Creta', qty: 1, avgBuy: 1800000, cmp: 1200000, buyDate: '2022-01-10' }
    ];

    for (const h of holdings) {
      await pool.query(`
        INSERT INTO holdings (id, user_id, asset_class, symbol, name, qty, avg_buy, cmp, buy_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING
      `, [h.id, h.user_id, h.assetClass, h.symbol, h.name, h.qty, h.avgBuy, h.cmp, h.buyDate]);
    }

    console.log('✅ Migration / Seeding Complete!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
