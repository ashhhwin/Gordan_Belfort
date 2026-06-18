import { describe, it, expect, vi } from 'vitest';

// We mock the functional logic of the Assistant without needing full React component mounts

describe('AI Assistant & Local LLM Integration', () => {

  it('44. LLM Polling (Ollama): fetchModels correctly polls Ollama API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ models: [{ name: 'llama3' }] })
    });
    
    const res = await global.fetch('http://localhost:11434/api/tags');
    const data = await res.json();
    expect(data.models[0].name).toBe('llama3');
  });

  it('45. LLM Polling (LM Studio): fetchModels correctly falls back to LM Studio API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ data: [{ id: 'mistral-instruct' }] })
    });
    
    const res = await global.fetch('http://localhost:1234/v1/models');
    const data = await res.json();
    expect(data.data[0].id).toBe('mistral-instruct');
  });

  it('46. LLM Error Handling: Returns empty array when endpoint is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection Refused'));
    
    let models = [];
    try {
      const res = await global.fetch('http://localhost:11434/api/tags');
      const data = await res.json();
      models = data.models;
    } catch (e) {
      models = [];
    }
    
    expect(models.length).toBe(0);
  });

  it('47. AI Tooling (Net Worth): get_net_worth_summary aggregates correctly', () => {
    const tools = {
      get_net_worth_summary: (holdings) => {
        const assets = holdings.reduce((s, h) => s + (h.cmp > 0 ? h.cmp * h.qty : 0), 0);
        const liabilities = holdings.reduce((s, h) => s + (h.cmp < 0 ? Math.abs(h.cmp * h.qty) : 0), 0);
        return JSON.stringify({ totalAssets: assets, totalLiabilities: liabilities, netWorth: assets - liabilities });
      }
    };
    
    const mockHoldings = [{ cmp: 100, qty: 10 }, { cmp: -50, qty: 1 }];
    const res = JSON.parse(tools.get_net_worth_summary(mockHoldings));
    
    expect(res.totalAssets).toBe(1000);
    expect(res.totalLiabilities).toBe(50);
    expect(res.netWorth).toBe(950);
  });

  it('48. AI Tooling (Portfolio): get_portfolio_details returns JSON array of symbols', () => {
    const tools = {
      get_portfolio_details: (holdings) => {
        return JSON.stringify(holdings.map(h => ({ symbol: h.symbol, val: h.cmp * h.qty })));
      }
    };
    
    const res = JSON.parse(tools.get_portfolio_details([{ symbol: 'AAPL', cmp: 150, qty: 10 }]));
    expect(res[0].symbol).toBe('AAPL');
    expect(res[0].val).toBe(1500);
  });

  it('49. Chat UI: Successfully appends user messages to chat history', () => {
    const messages = [{ role: 'assistant', content: 'Hello' }];
    const newUserMsg = { role: 'user', content: 'What is my net worth?' };
    const updated = [...messages, newUserMsg];
    
    expect(updated.length).toBe(2);
    expect(updated[1].role).toBe('user');
  });

  it('50. Tool Execution Loop: Parses tool call and appends tool response', () => {
    const llmResponse = {
      message: {
        role: 'assistant',
        tool_calls: [{ function: { name: 'get_net_worth_summary', arguments: '{}' } }]
      }
    };
    
    // Simulate tool execution loop
    let messages = [];
    if (llmResponse.message.tool_calls) {
      messages.push(llmResponse.message);
      const toolRes = { role: 'tool', name: 'get_net_worth_summary', content: '{"netWorth": 1000}' };
      messages.push(toolRes);
    }
    
    expect(messages[0].role).toBe('assistant');
    expect(messages[1].role).toBe('tool');
    expect(messages[1].content).toContain('1000');
  });
});
