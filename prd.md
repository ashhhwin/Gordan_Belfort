## Product Requirements Document (PRD)

### Document Control

* **Project Name:** Gordan Belfort (Advanced Multi-Agent Quantitative Platform)
* **Target Audience:** Quantitative Traders / Data Scientists 
* **Architecture Strategy:** Local-first, Open-Source decoupled infrastructure designed for frictionless cloud migration. Strict adherence to Model Context Protocol (MCP) and Multi-Agent Cyclic Graphs.
* **Status:** Final / Baseline v2.0

---

## 1. Executive Summary & Objectives

### 1.1 Core Value Proposition

Gordan Belfort is an institutional-grade, local-first multi-agent intelligence platform. It orchestrates complex, cyclical quantitative workflows via specialized agents. The system fetches market data, performs rigorous statistical backtesting, evaluates predictive machine learning models, and securely executes isolated python code for data manipulation. All tool executions are strictly abstracted via the Model Context Protocol (MCP). The platform ensures rigorous cross-examination of strategies via an LLM-as-a-Judge protocol prior to dispatching validated, high-conviction trading signals directly to mobile endpoints.

### 1.2 Deployment Evolution Strategy

The architecture maintains absolute separation of concerns. Agents never execute logic directly; they delegate to isolated MCP servers.

```
+-----------------------------------------------------------------------+
|                    LangGraph Multi-Agent Core                         |
+-----------------------------------------------------------------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
+-----------------------+                       +-----------------------+
| Local MCP Servers     |                       | Cloud MCP Servers     |
| (SQLite, Sandbox,     |                       | (PostgreSQL, Bedrock, |
|  Local Backtest)      |                       |  AWS Lambda)          |
+-----------------------+                       +-----------------------+
```

---

## 2. System Architecture & Component Design

### 2.1 Multi-Agent Cyclic Graph Architecture
The intelligence core is built on deterministic, cyclic agent workflows. 

* **Supervisor Agent (Heavy LLM):** Orchestrates the workflow. Delegates tasks to specialized agents using native structured tool-calling. Reviews responses and iterates cycles until the objective is resolved.
* **Data Agent (Lightweight LLM, Temp=0.1):** Retrieves specific datasets via Market Data and Database MCPs. Ensures data cleanliness.
* **Quantitative Agent (Heavy LLM):** Formulates hypotheses, writes Python code for the Sandbox MCP, trains ML models, and executes statistical and backtesting operations.
* **Judge Agent (Heavy LLM):** The "Red Team" validator. Scrutinizes the Quant Agent's proofs, evaluates backtest confidence intervals, and seeks to falsify the hypothesis before allowing alert dispatch.

### 2.2 Model Context Protocol (MCP) Ecosystem
All tools are isolated into 5 specialized MCP servers, providing 50 atomic capabilities.

#### I. Database MCP (Safe & Read-Only)
Provides isolated access to relational financial state.
1. `get_portfolio_holdings`: Retrieve active positions and weights.
2. `get_historical_transactions`: Fetch execution history and tax lots.
3. `get_net_worth_summary`: Aggregate total cross-broker account value.
4. `run_readonly_sql`: Execute isolated SELECT queries.
5. `get_asset_allocation`: Return macro asset class split.
6. `get_dividend_history`: Query historical yield data.
7. `get_realized_pnl`: Compute realized capital gains.
8. `get_unrealized_pnl`: Compute current paper gains/losses.
9. `get_cash_balances`: Check available deployable capital.
10. `get_margin_utilization`: Monitor risk limits and margin usage.

#### II. Market Data & Sentiment MCP
Fetches historical and real-time external data.
11. `fetch_ohlcv`: Retrieve historical price bars.
12. `fetch_order_book`: Retrieve L2 market depth.
13. `fetch_options_chain`: Retrieve strikes, expiries, and Greeks.
14. `query_news_database`: Search ingested financial news.
15. `get_reddit_sentiment`: Aggregate social sentiment scores.
16. `get_sec_filings`: Extract 10-K/10-Q text and numerical data.
17. `get_corporate_actions`: Earnings dates and dividend ex-dates.
18. `get_macro_indicators`: Fed rates, CPI, unemployment data.
19. `get_insider_trading`: Form 4 buy/sell queries.
20. `get_short_interest`: Query short volume percentages.

#### III. Quant & Backtesting MCP
Executes core mathematical and statistical models.
21. `run_vector_backtest`: Fast Pandas-based vectorized backtesting.
22. `run_event_backtest`: Granular tick-by-tick simulation.
23. `calculate_var`: Compute Value at Risk metrics.
24. `calculate_cvar`: Compute Conditional Value at Risk.
25. `calculate_correlation_matrix`: Cross-asset correlation analysis.
26. `calculate_rolling_volatility`: Time-series historical volatility tracking.
27. `run_markov_regime_switch`: Detect probabilistic market regimes.
28. `run_monte_carlo_sim`: Probabilistic price path generation.
29. `calculate_black_scholes`: Option pricing modeling.
30. `run_cointegration_test`: Pairs trading statistical test.

#### IV. Sandbox & ML Execution MCP
Provides secure runtime environments for arbitrary logic.
31. `execute_python_code`: Run arbitrary data manipulation scripts.
32. `train_linear_regression`: Baseline ML model training.
33. `train_xgboost_model`: Tree-based classification for signals.
34. `train_lstm_network`: Time-series deep learning training.
35. `generate_candlestick_chart`: Output base64 chart images.
36. `generate_correlation_heatmap`: Output visual correlation matrices.
37. `generate_equity_curve`: Plot backtest performance.
38. `generate_mermaid_flowchart`: System logic visualization.
39. `run_hypothesis_test`: T-tests and Z-tests on quantitative signals.
40. `optimize_portfolio_weights`: Mean-variance optimization algorithms.

#### V. System & Memory MCP
Manages state persistence, orchestration, and notifications.
41. `save_to_memory`: Persist cross-day insights to vector database.
42. `search_memory`: Retrieve historical convictions and strategies.
43. `send_telegram_alert`: Push urgent, proof-backed notifications.
44. `schedule_cron_job`: Automate repetitive daily/hourly tasks.
45. `log_system_trace`: Save graph execution path and UI logs.
46. `get_system_health`: Check MCP service status and latency.
47. `clear_agent_cache`: Reset state across the LangGraph instance.
48. `generate_tax_optimization_report`: Harvest loss recommendations.
49. `generate_rebalancing_options`: Suggestions to revert to target allocations.
50. `flag_risky_bets`: Alert on high-volatility outlier positions.

---

## 3. Core Functional Workflows

### 3.1 Automated Pipeline (Data -> Alert)
The system operates autonomously via scheduled cron triggers:
1. **Ingestion**: The Data Agent utilizes the Market Data MCP to pull news, sentiment, and OHLCV data.
2. **Analysis**: The Quant Agent utilizes the Sandbox MCP and Quant MCP to process the data, formulate a hypothesis, and conduct rigorous statistical testing. 
3. **Validation**: The Judge Agent reviews the hypothesis, ensuring empirical proof exists and maximum drawdown constraints are respected.
4. **Action**: Upon validation, the System MCP pushes an alert via Telegram containing conviction scores, supporting charts, and the validated thesis.

### 3.2 Output & Tracing Constraints
- **Language**: Agent interactions and prompts must employ strictly formal, professional language. Extraneous phrasing ("fluff") and emojis are prohibited.
- **Tracing**: Every tool payload, thought process, and intermediate state must be traced and exposed natively in the user interface. Visualizations (charts, flowcharts) and sandbox execution logs must render perfectly within the trace UI.
- **Deterministic Action**: LLM temperatures for data and execution routing must be strictly constrained (temp=0.1) to ensure consistent structured tool calling.

---

## 4. Technical Stack

| Component | Phase 1 (Local / Open-Source) | Phase 2 (Cloud Migration Target) |
| --- | --- | --- |
| **Orchestration** | LangGraph (Python) | LangGraph (Python on AWS) |
| **Inference** | Local (Ollama/vLLM) | Managed (AWS Bedrock / OpenAI API) |
| **Tool Execution** | Local Node/Python MCP Servers | Containerized Remote MCPs |
| **Database** | SQLite & DuckDB | PostgreSQL & TimescaleDB |
| **Memory** | Local Vector DB | pgvector / Pinecone |
| **Notifications** | Telegram Bot API / ntfy | FCM / Enterprise SMS APIs |

## 5. Non-Functional Requirements
- **No Direct Logic in Agents**: Agents contain zero business logic. All logic is encapsulated in MCP servers.
- **Fail-Safe Fallbacks**: Multi-agent cycles must have strict iteration limits to prevent infinite reasoning loops.