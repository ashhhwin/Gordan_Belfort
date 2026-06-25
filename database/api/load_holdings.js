import { readFileSync } from 'fs';
import pkg from 'pg';
const { Client } = pkg;
import xlsx from 'xlsx';
import { v5 as uuidv5, v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Namespace for generating deterministic UUIDs for holdings
const HOLDING_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';

const ASSET_CLASS_MAP = {
  'mutual fund': 'MF',
  'us stock': 'US_EQUITY',
  'stock': 'IND_EQUITY',
  'debt': 'BONDS',
  'fixed deposit': 'FD',
  'savings account': 'BANK',
  'nps': 'NPS',
  'epf': 'EPF',
  'ppf': 'PPF',
  'credit card': 'CREDIT_CARD',
  'real estate': 'REAL_ESTATE',
  'oi': 'OTHER'
};

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/stock_pilot'
  });
  await client.connect();
  console.log("Connected to database.");

  try {
    // 1. Get the family ID
    const familyRes = await client.query('SELECT id FROM families LIMIT 1');
    if (familyRes.rowCount === 0) throw new Error("No family found in database.");
    const familyId = familyRes.rows[0].id;

    // 2. Read existing users so we don't overwrite Ashwin's webauthn/pin
    const usersRes = await client.query('SELECT id, name FROM users');
    const existingUsers = usersRes.rows.reduce((acc, u) => {
      acc[u.name.toLowerCase()] = u.id;
      return acc;
    }, {});

    // Read Excel
    const excelPath = path.join(__dirname, '..', 'data', 'processed', 'cleaned_indmoney_family_report.xlsx');
    const wb = xlsx.readFile(excelPath);

    let totalInserted = 0;

    for (const sheetName of wb.SheetNames) {
      const data = xlsx.utils.sheet_to_json(wb.Sheets[sheetName]);
      if (data.length === 0) continue;

      const userName = sheetName;
      let userId = existingUsers[userName.toLowerCase()];

      // 3. Create user if they don't exist
      if (!userId) {
        // Look for Ashwin if the name is slightly different
        if (userName.toLowerCase() === 'ashwin ram' && existingUsers['ashwin']) {
           userId = existingUsers['ashwin'];
        } else {
           userId = uuidv4();
           const initials = userName.split(' ').map(n => n[0]).join('').substring(0, 3).toUpperCase();
           // Generate random color from a set
           const colors = ['#4B7BEC', '#00D4A1', '#FF4D6A', '#9B59B6', '#F7B731', '#1ABC9C'];
           const color = colors[Math.floor(Math.random() * colors.length)];
           
           await client.query(`
             INSERT INTO users (id, family_id, name, role, color, initials)
             VALUES ($1, $2, $3, 'member', $4, $5)
           `, [userId, familyId, userName, color, initials]);
           console.log(`Created new user: ${userName}`);
           existingUsers[userName.toLowerCase()] = userId;
        }
      }

      // 4. Upsert holdings
      for (const row of data) {
        const assetTypeRaw = row['Asset Type'] || 'Stock';
        const assetClass = ASSET_CLASS_MAP[assetTypeRaw.toLowerCase()] || 'OTHER';
        const symbol = row['Investment'] || 'UNKNOWN';
        const name = row['Name'] || symbol; // 'Name' column in excel is user name, Investment is the stock name
        const sector = row['Category'] || null;
        const qty = parseFloat(row['Total Units']) || 1;
        const currentVal = parseFloat(row['Market Value']) || 0;
        const cmp = qty > 0 ? currentVal / qty : 0;
        const investedAmount = parseFloat(row['Invested Amount']) || 0;
        const avgBuy = qty > 0 ? investedAmount / qty : 0;
        
        let buyDate = new Date();
        if (row['Investment Date'] && row['Investment Date'] !== 'NA') {
          buyDate = new Date(row['Investment Date']);
          if (isNaN(buyDate)) buyDate = new Date();
        }

        // Generate deterministic UUID so we can UPSERT cleanly based on user + asset_class + symbol
        const uniqueString = `${userId}-${assetClass}-${symbol}`;
        const holdingId = uuidv5(uniqueString, HOLDING_NAMESPACE);

        await client.query(`
          INSERT INTO holdings (
            id, user_id, asset_class, symbol, name, sector, qty, avg_buy, cmp, buy_date
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
          ) ON CONFLICT (id) DO UPDATE SET
            qty = EXCLUDED.qty,
            avg_buy = EXCLUDED.avg_buy,
            cmp = EXCLUDED.cmp,
            sector = EXCLUDED.sector,
            updated_at = NOW()
        `, [
          holdingId, userId, assetClass, symbol, symbol, sector, qty, avgBuy, cmp, buyDate
        ]);

        totalInserted++;
      }
    }

    console.log(`Reconciliation complete! Upserted ${totalInserted} holdings.`);

    // 5. Create History Snapshot for today
    const today = new Date().toISOString().split('T')[0];
    const { rows: historyData } = await client.query(`
      SELECT user_id, asset_class, SUM(cmp * qty) as total_value, SUM(avg_buy * qty) as invested_amount
      FROM holdings
      GROUP BY user_id, asset_class
    `);

    for (const row of historyData) {
      await client.query(`
        INSERT INTO portfolio_history (id, user_id, date, asset_class, total_value, invested_amount)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, date, asset_class) DO UPDATE SET
          total_value = EXCLUDED.total_value,
          invested_amount = EXCLUDED.invested_amount,
          created_at = NOW()
      `, [uuidv4(), row.user_id, today, row.asset_class, row.total_value, row.invested_amount]);
    }
    console.log(`Saved historical snapshot for ${today}.`);

  } catch (err) {
    console.error("Error during reconciliation:", err);
  } finally {
    await client.end();
  }
}

main();
