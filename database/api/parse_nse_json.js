import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });
const { Client } = pg;

const client = new Client({
  user: process.env.PGUSER || process.env.USER,
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'stock_pilot',
  password: process.env.PGPASSWORD || '',
  port: process.env.PGPORT || 5432,
});

function parseNum(val) {
  if (val === null || val === undefined || val === '' || val === '-') return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

async function main() {
  const args = process.argv.slice(2);
  const backfill = args.includes('--backfill');
  
  try {
    await client.connect();
    console.log(`Connected to database. Backfill mode: ${backfill}`);

    // Read target dates
    let dateQuery = 'SELECT DISTINCT date FROM nse_daily_data ORDER BY date ASC';
    if (!backfill) {
      dateQuery = 'SELECT MAX(date) as date FROM nse_daily_data';
    }

    const { rows: dates } = await client.query(dateQuery);
    
    for (const d of dates) {
      if (!d.date) continue;
      const targetDate = d.date.toISOString().split('T')[0];
      console.log(`\n=== Processing data for ${targetDate} ===`);

      await client.query('BEGIN');

      // 1. stocks_traded -> nse_stocks_daily
      const { rows: stocks } = await client.query(
        `SELECT payload FROM nse_daily_data WHERE date = $1 AND endpoint_name = 'stocks_traded'`, [targetDate]
      );
      if (stocks.length > 0) {
        const data = stocks[0].payload.total?.data || [];
        for (const item of data) {
          if (!item.symbol) continue;
          await client.query(`
            INSERT INTO nse_stocks_daily (date, symbol, close_price, pchange, previous_close, volume, turnover, market_cap)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (date, symbol) DO UPDATE SET
              close_price = EXCLUDED.close_price, pchange = EXCLUDED.pchange, previous_close = EXCLUDED.previous_close, 
              volume = EXCLUDED.volume, turnover = EXCLUDED.turnover, market_cap = EXCLUDED.market_cap
          `, [targetDate, item.symbol, parseNum(item.lastPrice), parseNum(item.pchange), parseNum(item.previousClose), parseNum(item.totalTradedVolume), parseNum(item.totalTradedValue), parseNum(item.totalMarketCap)]);
        }
        console.log(`  Inserted ${data.length} records into nse_stocks_daily`);
      }

      // 2. volume_gainers -> nse_volume_anomalies
      const { rows: volumeGainers } = await client.query(
        `SELECT payload FROM nse_daily_data WHERE date = $1 AND endpoint_name = 'volume_gainers'`, [targetDate]
      );
      if (volumeGainers.length > 0) {
        const data = volumeGainers[0].payload.data || [];
        for (const item of data) {
          if (!item.symbol) continue;
          await client.query(`
            INSERT INTO nse_volume_anomalies (date, symbol, volume, week1_avg_volume, week1_vol_change_pct, week2_avg_volume, week2_vol_change_pct)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (date, symbol) DO UPDATE SET
              volume = EXCLUDED.volume, week1_avg_volume = EXCLUDED.week1_avg_volume, week1_vol_change_pct = EXCLUDED.week1_vol_change_pct, 
              week2_avg_volume = EXCLUDED.week2_avg_volume, week2_vol_change_pct = EXCLUDED.week2_vol_change_pct
          `, [targetDate, item.symbol, parseNum(item.volume), parseNum(item.week1AvgVolume), parseNum(item.week1volChange), parseNum(item.week2AvgVolume), parseNum(item.week2volChange)]);
        }
        console.log(`  Inserted ${data.length} records into nse_volume_anomalies`);
      }

      // 3. 52week_high & 52week_low -> nse_52w_extremes
      for (const endpoint of ['52week_high', '52week_low']) {
        const { rows: extremes } = await client.query(
          `SELECT payload FROM nse_daily_data WHERE date = $1 AND endpoint_name = $2`, [targetDate, endpoint]
        );
        if (extremes.length > 0) {
          const type = endpoint === '52week_high' ? 'HIGH' : 'LOW';
          const data = extremes[0].payload.data || [];
          for (const item of data) {
            if (!item.symbol) continue;
            let prevDate = null;
            if (item.prevHLDate) prevDate = new Date(item.prevHLDate);
            await client.query(`
              INSERT INTO nse_52w_extremes (date, symbol, extreme_type, new_52w_val, prev_52w_val, prev_hl_date)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (date, symbol, extreme_type) DO UPDATE SET
                new_52w_val = EXCLUDED.new_52w_val, prev_52w_val = EXCLUDED.prev_52w_val, prev_hl_date = EXCLUDED.prev_hl_date
            `, [targetDate, item.symbol, type, parseNum(item.new52WHL), parseNum(item.prev52WHL), isNaN(prevDate) ? null : prevDate]);
          }
          console.log(`  Inserted ${data.length} records into nse_52w_extremes (${type})`);
        }
      }

      // 4. indices -> nse_indices_daily
      const { rows: indices } = await client.query(
        `SELECT payload FROM nse_daily_data WHERE date = $1 AND endpoint_name = 'indices'`, [targetDate]
      );
      if (indices.length > 0) {
        const data = indices[0].payload.data || [];
        for (const item of data) {
          if (!item.indexSymbol && !item.index) continue;
          const indexName = item.indexSymbol || item.index;
          await client.query(`
            INSERT INTO nse_indices_daily (date, index_name, open_val, high_val, low_val, close_val, pchange, advances, declines, pe, pb, dy)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (date, index_name) DO UPDATE SET
              open_val = EXCLUDED.open_val, high_val = EXCLUDED.high_val, low_val = EXCLUDED.low_val, close_val = EXCLUDED.close_val,
              pchange = EXCLUDED.pchange, advances = EXCLUDED.advances, declines = EXCLUDED.declines,
              pe = EXCLUDED.pe, pb = EXCLUDED.pb, dy = EXCLUDED.dy
          `, [targetDate, indexName, parseNum(item.open), parseNum(item.high), parseNum(item.low), parseNum(item.last), parseNum(item.percentChange), parseNum(item.advances), parseNum(item.declines), parseNum(item.pe), parseNum(item.pb), parseNum(item.dy)]);
        }
        console.log(`  Inserted ${data.length} records into nse_indices_daily`);
      }

      // 5. etf -> nse_etfs_daily
      const { rows: etfs } = await client.query(
        `SELECT payload FROM nse_daily_data WHERE date = $1 AND endpoint_name = 'etf'`, [targetDate]
      );
      if (etfs.length > 0) {
        const data = etfs[0].payload.data || [];
        for (const item of data) {
          if (!item.symbol) continue;
          await client.query(`
            INSERT INTO nse_etfs_daily (date, symbol, open_price, high_price, low_price, close_price, pchange, volume, turnover, nav)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (date, symbol) DO UPDATE SET
              open_price = EXCLUDED.open_price, high_price = EXCLUDED.high_price, low_price = EXCLUDED.low_price, close_price = EXCLUDED.close_price,
              pchange = EXCLUDED.pchange, volume = EXCLUDED.volume, turnover = EXCLUDED.turnover, nav = EXCLUDED.nav
          `, [targetDate, item.symbol, parseNum(item.open), parseNum(item.high), parseNum(item.low), parseNum(item.ltP), parseNum(item.per), parseNum(item.qty), parseNum(item.trdVal), parseNum(item.nav)]);
        }
        console.log(`  Inserted ${data.length} records into nse_etfs_daily`);
      }

      // 6. price_band_hitters -> nse_price_band_hitters
      const { rows: bandHitters } = await client.query(
        `SELECT payload FROM nse_daily_data WHERE date = $1 AND endpoint_name = 'price_band_hitters'`, [targetDate]
      );
      if (bandHitters.length > 0) {
        const payload = bandHitters[0].payload;
        const data = payload?.both?.AllSec?.data || payload?.data || [];
        for (const item of data) {
          if (!item.symbol) continue;
          await client.query(`
            INSERT INTO nse_price_band_hitters (date, symbol, band_type, close_price, volume)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (date, symbol) DO UPDATE SET
              band_type = EXCLUDED.band_type, close_price = EXCLUDED.close_price, volume = EXCLUDED.volume
          `, [targetDate, item.symbol, item.bandType || 'UPPER', parseNum(item.lastPrice), parseNum(item.totalTradedVolume)]);
        }
        console.log(`  Inserted ${data.length} records into nse_price_band_hitters`);
      }

      // 7. advances_declines -> skipped. 
      // The advances/declines count is already inserted into nse_indices_daily during the indices endpoint parsing.

      // 8. large_deals (block, bulk, short)
      const dealsTypes = { 'large_deals_block': 'BLOCK', 'large_deals_bulk': 'BULK', 'large_deals_short': 'SHORT' };
      for (const [endpoint, dealType] of Object.entries(dealsTypes)) {
        const { rows: deals } = await client.query(
          `SELECT payload FROM nse_daily_data WHERE date = $1 AND endpoint_name = $2`, [targetDate, endpoint]
        );
        if (deals.length > 0) {
          const dataKey = `${dealType}_DEALS_DATA`;
          const data = deals[0].payload[dataKey] || deals[0].payload.data || [];
          for (const item of data) {
            if (!item.symbol) continue;
            await client.query(`
              INSERT INTO nse_large_deals (date, symbol, deal_type, client_name, buy_sell, quantity, price)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [targetDate, item.symbol, dealType, item.clientName, item.buySell || 'BUY', parseNum(item.quantity), parseNum(item.price)]);
          }
          if (data.length > 0) console.log(`  Inserted ${data.length} records into nse_large_deals (${dealType})`);
        }
      }

      await client.query('COMMIT');
    }

    console.log('\nRefreshing Materialized Views (Gold Layer Tech Indicators)...');
    await client.query('REFRESH MATERIALIZED VIEW mv_tech_indicators;');
    await client.query('REFRESH MATERIALIZED VIEW mv_alpha_volume_breakouts;');
    await client.query('REFRESH MATERIALIZED VIEW mv_alpha_smart_money;');
    await client.query('REFRESH MATERIALIZED VIEW mv_alpha_volatility_squeeze;');
    console.log('Successfully refreshed all technical indicators and alpha signals.');

  } catch (err) {
    console.error('Failed to parse NSE data:', err);
    await client.query('ROLLBACK');
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
