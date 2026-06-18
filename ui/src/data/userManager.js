import axios from 'axios';

const API_BASE = 'http://localhost:5005/api';

// ─── Families ───
export async function getFamily() {
  const { data } = await axios.get(`${API_BASE}/family`);
  return data;
}

export async function updateFamilyConfig(config) {
  // Assuming family ID is 00000000-0000-0000-0000-000000000001
  const id = '00000000-0000-0000-0000-000000000001';
  const { data } = await axios.put(`${API_BASE}/family/${id}/config`, config);
  return data;
}

// ─── Users ───
export async function getUsers() {
  const { data } = await axios.get(`${API_BASE}/users`);
  return data;
}

export async function getUserById(id) {
  const users = await getUsers();
  return users.find(u => u.id === id) || null;
}

// ─── Auth ───
export async function setUserWebAuthnCred(userId, credId) {
  const { data } = await axios.put(`${API_BASE}/users/${userId}`, { webauthn_cred_id: credId });
  return data;
}

export async function setUserPinHash(userId, hash) {
  const { data } = await axios.put(`${API_BASE}/users/${userId}`, { pin_hash: hash });
  return data;
}

// ─── Holdings ───
export async function getHoldingsForUser(userId) {
  const { data } = await axios.get(`${API_BASE}/holdings`);
  return data.filter(h => h.user_id === userId).map(mapHoldingFromDB);
}

export async function getFamilyHoldings() {
  const { data } = await axios.get(`${API_BASE}/holdings`);
  return data.map(mapHoldingFromDB);
}

export async function addHolding(userId, holding) {
  const payload = { ...holding, id: crypto.randomUUID(), user_id: userId };
  const { data } = await axios.post(`${API_BASE}/holdings`, payload);
  return mapHoldingFromDB(data);
}

export async function updateHolding(userId, holdingId, patch) {
  const { data } = await axios.put(`${API_BASE}/holdings/${holdingId}`, patch);
  return mapHoldingFromDB(data);
}

export async function deleteHolding(userId, holdingId) {
  await axios.delete(`${API_BASE}/holdings/${holdingId}`);
}

// ─── Analytics & History ───
export async function getPortfolioHistory() {
  const { data } = await axios.get(`${API_BASE}/history`);
  return data;
}

export async function getSyncStatus() {
  const { data } = await axios.get(`${API_BASE}/sync-status`);
  return data;
}

export async function getSyncLogs() {
  const { data } = await axios.get(`${API_BASE}/sync-logs`);
  return data;
}

export async function getCronStatus() {
  const { data } = await axios.get(`${API_BASE}/cron-status`);
  return data;
}

export async function runSyncJob() {
  const { data } = await axios.post(`${API_BASE}/sync-run`);
  return data;
}

export async function executeSqlQuery(query) {
  const { data } = await axios.post(`${API_BASE}/sql-query`, { query });
  return data;
}

export async function deleteSyncLog(id) {
  const { data } = await axios.delete(`${API_BASE}/sync-logs/${id}`);
  return data;
}

function mapHoldingFromDB(h) {
  return {
    ...h,
    assetClass: h.asset_class,
    avgBuy: parseFloat(h.avg_buy),
    cmp: parseFloat(h.cmp),
    qty: parseFloat(h.qty),
    dayChange: parseFloat(h.day_change),
    dayChangePct: parseFloat(h.day_change_pct),
    buyDate: h.buy_date ? h.buy_date.split('T')[0] : null,
  };
}

export const MEMBER_COLORS = [
  '#4B7BEC', '#00D4A1', '#F7B731', '#FF4D6A', 
  '#9B59B6', '#1ABC9C', '#E67E22', '#E91E8C',
];
