import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app, pool } from './server.js';

// Mock the postgres pool
vi.mock('pg', () => {
  return {
    default: {
      Pool: class {
        constructor() {
          this.query = vi.fn();
        }
      }
    }
  };
});

describe('Gordan Belfort Backend API', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- FAMILY TESTS ---
  it('1. GET /api/family - returns family configuration', async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [{ id: '1', name: 'Test Family' }] });
    const res = await request(app).get('/api/family');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test Family');
  });

  it('2. POST /api/family - creates or updates family', async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [{ id: '1', name: 'New Family' }] });
    const res = await request(app).post('/api/family').send({ id: '1', name: 'New Family' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Family');
  });

  it('3. PUT /api/family/:id/config - updates family config JSON', async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [{ id: '1', config: { theme: 'dark' } }] });
    const res = await request(app).put('/api/family/1/config').send({ theme: 'dark' });
    expect(res.status).toBe(200);
    expect(res.body.config.theme).toBe('dark');
  });

  // --- USERS TESTS ---
  it('4. GET /api/users - returns list of users', async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [{ id: 'u1', name: 'Alice' }] });
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Alice');
  });

  it('5. POST /api/users - creates a new user', async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [{ id: 'u2', name: 'Bob' }] });
    const res = await request(app).post('/api/users').send({ id: 'u2', name: 'Bob' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Bob');
  });

  it('6. DELETE /api/users/:id - deletes a user', async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [] });
    const res = await request(app).delete('/api/users/u2');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // --- HOLDINGS TESTS ---
  it('7. GET /api/holdings - returns portfolio holdings', async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [{ id: 'h1', symbol: 'AAPL' }] });
    const res = await request(app).get('/api/holdings');
    expect(res.status).toBe(200);
    expect(res.body[0].symbol).toBe('AAPL');
  });

  it('8. POST /api/holdings - creates a new holding', async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [{ id: 'h2', symbol: 'TSLA' }] });
    const res = await request(app).post('/api/holdings').send({ id: 'h2', symbol: 'TSLA' });
    expect(res.status).toBe(200);
    expect(res.body.symbol).toBe('TSLA');
  });

  it('9. PUT /api/holdings/:id - updates an existing holding', async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [{ id: 'h1', qty: 50 }] });
    const res = await request(app).put('/api/holdings/h1').send({ qty: 50 });
    expect(res.status).toBe(200);
    expect(res.body.qty).toBe(50);
  });

  it('10. DELETE /api/holdings/:id - deletes a holding', async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [] });
    const res = await request(app).delete('/api/holdings/h1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
