import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { vi, describe, beforeEach, it, expect } from 'vitest';
import SyncJobs from '../SyncJobs';

// Mock the global store to avoid Zustand issues in tests
vi.mock('../../store', () => ({
  useStore: () => ({})
}));

// Mock Axios
vi.mock('axios');

describe('SyncJobs Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading state and fetches data successfully', async () => {
    const mockCronStatus = [
      { job: 'Portfolio Sync', configured: true, nextRun: '2026-06-18T19:00:00Z', cronExpression: '0 19 * * *', tz: 'Asia/Kolkata' },
      { job: 'NSE Market Data', configured: true, nextRun: '2026-06-18T17:00:00Z', cronExpression: '0 17 * * *', tz: 'Asia/Kolkata' }
    ];

    const mockLogs = [
      { id: '1', job_name: 'Portfolio Sync', status: 'SUCCESS', started_at: '2026-06-17T19:00:00Z', completed_at: '2026-06-17T19:05:00Z', message: 'Success' },
      { id: '2', job_name: 'NSE Market Data', status: 'FAILED', started_at: '2026-06-17T17:00:00Z', completed_at: '2026-06-17T17:01:00Z', message: 'Failed to fetch' }
    ];

    axios.get.mockImplementation((url) => {
      if (url.includes('cron-status')) return Promise.resolve({ data: mockCronStatus });
      if (url.includes('sync-logs')) return Promise.resolve({ data: mockLogs });
      return Promise.reject(new Error('Not found'));
    });

    render(<SyncJobs />);

    // Wait for data to load
    await waitFor(async () => {
      const portfolioSyncElements = await screen.findAllByText('Portfolio Sync');
      expect(portfolioSyncElements.length).toBeGreaterThan(0);
      
      const nseElements = await screen.findAllByText('NSE Market Data');
      expect(nseElements.length).toBeGreaterThan(0);
      
      expect(screen.getByText('System Healthy')).toBeInTheDocument(); // Because log[0] is SUCCESS
    });

    // Verify both logs are rendered in the table
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThan(2); // Header + 2 data rows
  });
});
