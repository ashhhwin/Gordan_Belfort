import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: process.env.USER,
  host: 'localhost',
  database: 'stock_pilot',
  password: '',
  port: 5432,
});

async function run() {
  const { rows: history } = await pool.query(`SELECT * FROM portfolio_history ORDER BY date ASC`);

  const grouped = {};
  history.forEach((row) => {
    const d = new Date(row.date).toISOString().split("T")[0];
    if (!grouped[d]) grouped[d] = { date: d };
    const uid = row.user_id;
    if (!grouped[d][uid]) {
      grouped[d][uid] = { total_value: 0, invested_amount: 0 };
    }
    grouped[d][uid].total_value += parseFloat(row.total_value || 0);
    grouped[d][uid].invested_amount += parseFloat(row.invested_amount || 0);
  });

  const dates = Object.keys(grouped).sort((a, b) => new Date(a) - new Date(b));
  
  const userBaseReturns = {};
  const users = [...new Set(history.map(h => h.user_id))];
  
  users.forEach((u) => {
    const baseStats = grouped[dates[0]][u];
    if (baseStats && baseStats.invested_amount > 0) {
      userBaseReturns[u] = (baseStats.total_value / baseStats.invested_amount - 1) * 100;
    } else {
      userBaseReturns[u] = 0;
    }
  });

  let min = Infinity, max = -Infinity;
  dates.forEach((d) => {
    users.forEach((u) => {
      const userStats = grouped[d][u];
      if (userStats && userStats.invested_amount > 0) {
        const absoluteReturn = (userStats.total_value / userStats.invested_amount - 1) * 100;
        const entry = absoluteReturn - userBaseReturns[u];
        if (entry < min) min = entry;
        if (entry > max) max = entry;
      }
    });
  });
  console.log("Min entry:", min);
  console.log("Max entry:", max);

  process.exit(0);
}

run();
