import request from 'supertest';
import { app, pool } from '../server.js';

describe('API Endpoints', () => {
  afterAll(async () => {
    // Close the database connection after all tests
    await pool.end();
  });

  describe('GET /api/cron-status', () => {
    it('should return an array of configured cron jobs', async () => {
      const res = await request(app).get('/api/cron-status');
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      
      const jobs = res.body;
      expect(jobs.length).toBe(2);
      expect(jobs[0].job).toBe('Portfolio Sync');
      expect(jobs[1].job).toBe('NSE Market Data');
    });
  });

  describe('GET /api/sync-logs', () => {
    it('should return recent execution logs', async () => {
      const res = await request(app).get('/api/sync-logs');
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      // Should have at least the ones we just generated
    });
  });

  describe('DELETE /api/sync-logs/:id', () => {
    it('should successfully delete a specific log entry', async () => {
      // First, insert a mock log to delete
      const insertQuery = `
        INSERT INTO sync_logs (id, started_at, status, job_name, message) 
        VALUES ('00000000-0000-0000-0000-000000000000', NOW(), 'FAILED', 'Test Job', 'Test Error')
        RETURNING id;
      `;
      const insertRes = await pool.query(insertQuery);
      const testId = insertRes.rows[0].id;

      // Now attempt to delete it via the API
      const deleteRes = await request(app).delete(`/api/sync-logs/${testId}`);
      expect(deleteRes.statusCode).toEqual(200);
      expect(deleteRes.body).toHaveProperty('message', 'Log deleted successfully');

      // Verify it's gone
      const verifyRes = await pool.query('SELECT * FROM sync_logs WHERE id = $1', [testId]);
      expect(verifyRes.rows.length).toBe(0);
    });
  });
});
