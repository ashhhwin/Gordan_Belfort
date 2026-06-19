import pkg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const { Client } = pkg;

// Load .env relative to this file and silence dotenvx so it doesn't pollute stdout
dotenv.config({ path: path.join(process.cwd(), '../../.env'), quiet: true });

const client = new Client({
  user: process.env.PGUSER || process.env.USER,
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'stock_pilot',
  password: process.env.PGPASSWORD || '',
  port: process.env.PGPORT || 5432,
});

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    await client.connect();

    if (command === 'start') {
      const id = uuidv4();
      const jobName = args[1] || 'Unknown Job';
      await client.query(
        'INSERT INTO sync_logs (id, started_at, status, job_name) VALUES ($1, NOW(), $2, $3)',
        [id, 'IN_PROGRESS', jobName]
      );
      console.log(id); // Output ID to stdout so bash script can capture it
    } else if (command === 'end') {
      const id = args[1];
      const status = args[2];
      let message = args.slice(3).join(' ') || null;
      
      if (status === 'FAILED') {
        try {
          const logData = fs.readFileSync('/tmp/gordan-belfort_sync.log', 'utf8');
          const tail = logData.split('\n').filter(Boolean).slice(-30).join('\n');
          if (tail) {
            message = `${message}\n\n[RAW LOGS]\n${tail}`;
          }
        } catch (e) {
          // ignore if log file is missing
        }
      }

      await client.query(
        'UPDATE sync_logs SET completed_at = NOW(), status = $1, message = $2 WHERE id = $3',
        [status, message, id]
      );
    }
  } catch (err) {
    console.error('Logger error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
