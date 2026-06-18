import fs from 'fs';
import path from 'path';
import pkg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });
const { Client } = pkg;

const client = new Client({
  user: process.env.PGUSER || process.env.USER,
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'stock_pilot',
  password: process.env.PGPASSWORD || '',
  port: process.env.PGPORT || 5432,
});

async function main() {
  const rawDir = path.join(__dirname, '../data/raw/nse');
  if (!fs.existsSync(rawDir)) {
    console.error(`Directory not found: ${rawDir}`);
    process.exit(1);
  }

  // Get current date in IST (YYYY-MM-DD)
  const istDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  try {
    await client.connect();
    console.log(`Connected to database. Processing NSE data for ${istDate}`);

    const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.json'));
    
    await client.query('BEGIN');

    for (const file of files) {
      const endpointName = path.basename(file, '.json');
      const filePath = path.join(rawDir, file);
      const fileData = fs.readFileSync(filePath, 'utf8');
      
      let payload;
      try {
        payload = JSON.parse(fileData);
      } catch (e) {
        console.warn(`Skipping ${file}: Invalid JSON`);
        continue;
      }

      await client.query(`
        INSERT INTO nse_daily_data (date, endpoint_name, payload)
        VALUES ($1, $2, $3)
        ON CONFLICT (date, endpoint_name) 
        DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW()
      `, [istDate, endpointName, JSON.stringify(payload)]);
      
      console.log(`Upserted ${endpointName} data.`);
    }

    await client.query('COMMIT');
    console.log('NSE Data ingestion complete!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to load NSE data:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
