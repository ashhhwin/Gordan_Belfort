const fs = require('fs');
const history = [{"id":"85ce81a3-4a97-42c5-8d18-d5f386b5d89e","user_id":"a5b9baaf-e0a4-4318-a3ce-f8b9b6ff2f75","date":"2026-06-17T04:00:00.000Z","asset_class":"IND_EQUITY","total_value":"29635621.7491","invested_amount":"26319280.0000","created_at":"2026-06-17T20:36:59.495Z"},{"id":"3deafc07-28ff-488e-9546-658655e77a9a","user_id":"a5b9baaf-e0a4-4318-a3ce-f8b9b6ff2f75","date":"2026-06-19T04:00:00.000Z","asset_class":"IND_EQUITY","total_value":"29635621.7491","invested_amount":"26319280.0000","created_at":"2026-06-19T00:12:04.548Z"}];
const users = [{id: "a5b9baaf-e0a4-4318-a3ce-f8b9b6ff2f75"}];
const grouped = {};
history.forEach(row => {
  const d = new Date(row.date).toISOString().split('T')[0];
  if (!grouped[d]) grouped[d] = { date: d };
  const uid = row.user_id;
  if (!grouped[d][uid]) {
    grouped[d][uid] = { total_value: 0, invested_amount: 0 };
  }
  grouped[d][uid].total_value += parseFloat(row.total_value);
  grouped[d][uid].invested_amount += parseFloat(row.invested_amount);
});
const dates = Object.keys(grouped).sort((a, b) => new Date(a) - new Date(b));
const earliestDate = new Date(dates[0]);
const data = dates.map(d => {
  const entry = { date: d };
  const currentDate = new Date(d);
  const daysDiff = (currentDate - earliestDate) / (1000 * 60 * 60 * 24);
  entry.benchmark = (Math.pow(1.12, daysDiff / 365) - 1) * 100;
  users.forEach(u => {
    const userStats = grouped[d][u.id];
    if (userStats && userStats.invested_amount > 0) {
      entry[u.id] = ((userStats.total_value / userStats.invested_amount) - 1) * 100;
    }
  });
  return entry;
});
console.log(data);
