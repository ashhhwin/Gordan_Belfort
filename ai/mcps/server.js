import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
dotenv.config({ path: path.join(path.dirname(__filename), '../.env') });

const { Pool } = pkg;
const pool = new Pool({
  user: process.env.PGUSER || process.env.USER,
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'stock_pilot',
  password: process.env.PGPASSWORD || '',
  port: process.env.PGPORT || 5432,
});

const server = new Server(
  { name: 'alpha-engine-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_net_worth_summary',
        description: 'Get an aggregated summary of the user\'s net worth, split by assets and liabilities.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_portfolio_details',
        description: 'Get a detailed list of all the user\'s active financial holdings.',
        inputSchema: { type: 'object', properties: {} },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'get_net_worth_summary') {
    try {
      const { rows } = await pool.query('SELECT asset_class, cmp, avg_buy, qty FROM holdings');
      
      let totalAssets = 0;
      let totalLiabilities = 0;
      const breakdown = {};

      for (const h of rows) {
        const val = parseFloat(h.cmp || h.avg_buy) * parseFloat(h.qty);
        if (h.asset_class === 'CREDIT_CARD') {
          totalLiabilities += Math.abs(val);
        } else {
          totalAssets += val;
        }
        breakdown[h.asset_class] = (breakdown[h.asset_class] || 0) + val;
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalAssets,
            totalLiabilities,
            netWorth: totalAssets - totalLiabilities,
            breakdown
          }, null, 2)
        }]
      };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }

  if (request.params.name === 'get_portfolio_details') {
    try {
      const { rows } = await pool.query('SELECT * FROM holdings ORDER BY created_at DESC');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(rows, null, 2)
        }]
      };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }

  throw new Error('Unknown tool');
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 Gordan Belfort MCP Server running on stdio');
}

main().catch(console.error);
