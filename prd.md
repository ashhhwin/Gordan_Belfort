## Product Requirement Document (PRD)

### Document Control

* **Project Name:** Gordan Belfort (Local-First Quantitative & Multi-Agent Intelligence Platform)
* **Target Audience:** Quantitative Traders / Data Scientists (System-to-Agent and System-to-Human Interface)
* **Architecture Strategy:** Local-first, Open-Source decoupled infrastructure designed for frictionless cloud migration.
* **Status:** Draft / Baseline

---

## 1. Executive Summary & Objectives

### 1.1 Core Value Proposition

Gordan Belfort is a local-first, highly modular data ingestion and multi-agent intelligence platform. It orchestrates automated data pipelines, machine learning models, and LLM agents to aggregate financial, macroeconomic, and alternative data sources. The platform analyzes this data through advanced quantitative modeling, preserves long-term contextual insights using a persistent memory layer, and delivers high-conviction trading signals (Buy, Sell, Hold, Swing Strategies) with rigorous empirical proofs directly to a mobile device.

### 1.2 Deployment Evolution Strategy

To minimize upfront overhead while preserving future scalability, the architecture maintains a strict separation of concerns via an abstraction layer (Dependency Injection and Environment Configuration).

```
+-----------------------------------------------------------------------+
|                           Core Application Logic                      |
+-----------------------------------------------------------------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
+-----------------------+                       +-----------------------+
|     Local Drivers     |                       |     Cloud Drivers     |
| (SQLite/DuckDB, Ollama|                       |  (PostgreSQL, Bedrock/|
|  /vLLM, Local Cron)   |                       |   OpenAI, AWS Lambda) |
+-----------------------+                       +-----------------------+

```

* **Phase 1 (Current):** 100% Local, open-source stack (Local DBs, self-hosted LLMs/MCPs, local orchestration, open-source notification gateways).
* **Phase 2 (Target):** Cloud-native deployment (Managed databases, enterprise LLM APIs, serverless orchestration, enterprise push notification services) with **zero modifications to core business/agent logic**.

---

## 2. System Architecture & High-Level Component Design

The platform consists of five decoupled layers. Every boundary must be defined via interfaces/abstract classes to ensure the Phase 1 to Phase 2 transition requires only configuration toggles.

```
+-----------------------------------------------------------------------+
| 1. Data Ingestion Layer (SEC, Reddit, News, Price Data, Alternative)  |
+-----------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
| 2. Storage & Vector Engine (Local DuckDB/SQLite -> Cloud Postgres)     |
+-----------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
| 3. Quantitative & Math Modeling Engine (Backtesting, Anomaly, Stats)  |
+-----------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
| 4. Multi-Agent Orchestration Layer (LangGraph, MCP, Memory Palace)    |
+-----------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
| 5. Output & Alerting Subsystem (Local NTFY/Gotify -> Firebase/APNS)   |
+-----------------------------------------------------------------------+

```

---

## 3. Functional Requirements

### 3.1 Data Ingestion Engine (Multi-Source Pipeline)

The system must concurrently poll, stream, or scrape historical and real-time data.

* **Financial & Market Data:** OHLCV, options order flow, Greeks, and order book dynamics.
* **Regulatory Filings:** SEC EDGAR real-time RSS feeds parsing 10-K, 10-Q, and Form 4 documents.
* **Social & Sentiment Data:** Reddit (e.g., r/wallstreetbets, r/options) via API/scraping, tracking submission velocity and comment sentiment tickers.
* **News & Macro Engines:** General, political, and financial news aggregators.
* **Alternative Data:** Specialized unstructured datasets impacting market sentiment or supply chains.
* **Abstraction Requirement:** All ingestors must output to a uniform schema standard (`RawIngestPayload`) before hitting the storage abstraction layer.

### 3.2 Storage Layer & Hybrid Data Strategy

* **Structured/Relational Data:** Store time-series pricing data, metadata, and transaction states.
* *Local (Phase 1):* DuckDB (optimized for analytical queries/OLAP) and SQLite (for transaction tracking/OLTP).
* *Cloud (Phase 2):* PostgreSQL with TimescaleDB extension.


* **Unstructured Data & Embeddings:** Vector storage for semantic search across news, filings, and social text.
* *Local (Phase 1):* LanceDB or local ChromaDB instance.
* *Cloud (Phase 2):* pgvector or Pinecone.



### 3.3 Quantitative & Mathematical Modeling Engine

Before agents make decisions, quantitative guardrails must process raw numbers to prevent hallucinations.

* **Statistical Modeling:** Compute rolling volatilities, correlation matrices, and statistical arbitrage indicators.
* **Anomaly Detection:** Implement unsupervised algorithms (e.g., Local Outlier Factor, Histogram-based Outlier Score) to identify unusual options volume or erratic price deviations.
* **Backtesting Engine:** Fast, vector-based or event-driven backtesting module to validate agent-generated swing trading strategies over rolling historical windows. Strategies must be scored against Sharpe ratio, Sortino ratio, and Maximum Drawdown.

### 3.4 Multi-Agent Orchestration & Memory Layer

The intelligence core is built on deterministic agent graphs utilizing Model Context Protocol (MCP) servers.

* **Agent Architecture (LangGraph):** Implement stateful multi-agent workflows where nodes represent specialized agents (e.g., Data Miner Agent, Quantitative Math Agent, Strategy Evaluator Agent, Risk Manager Agent).
* **Model Context Protocol (MCP):** Agents must interact with local files, execution environments, and internal DBs exclusively through standardized MCP tools. This isolates tool logic from LLM selection.
* **LLM-as-a-Judge Evaluation:** High-conviction decisions must pass a strict cross-examination protocol. A specialized Judge Agent attempts to falsify the trade thesis using contradictory data points or statistical vulnerabilities before approval.
* **Persistent Memory Layer (Memory Palace Pattern):** The system must maintain cross-day historical memory. This layer stores abstracted, structural insights (e.g., *"Ticker X shows sensitivity to regulatory changes mentioned on Day N"*), preventing information decay across graph execution cycles.

### 3.5 Local-to-Cloud Alerting & Notification Gateway

A cross-platform delivery pipeline optimized for low-latency transmission of signals.

* **Local Execution:** Deliver alerts to mobile devices via lightweight, self-hosted, open-source notification daemons (`ntfy.sh` or Gotify). Calls are made via secure POST requests containing encrypted JSON payloads.
* **Cloud Execution:** Switch target endpoint via configuration variables to Firebase Cloud Messaging (FCM) or Apple Push Notification service (APNs).
* **Payload Requirements:** Alerts must provide high-density analytical structures: Ticker, Strategy Type (e.g., Momentum Swing), Action (Buy/Sell/Hold), Confidence Score, Target Entry/Exit, and a concise Markdown link detailing the model proofs.

---

## 4. Technical Stack & Environment Configuration

| Component | Phase 1 (Local / Open-Source) | Phase 2 (Cloud Migration Target) | Abstraction Mechanism |
| --- | --- | --- | --- |
| **Orchestration** | LangGraph (Python) | LangGraph (Python on AWS ECS/EKS) | Native Python Portability |
| **Inference Engine** | vLLM / Ollama (Llama 3.1/3.3 / Qwen-2.5-Coder) | AWS Bedrock / OpenAI API | LangChain / LiteLLM Provider Wrapper |
| **OLAP Storage** | DuckDB | Snowflake / AWS Redshift / TimescaleDB | SQLAlchemy / SQLGlot Abstraction |
| **OLTP Storage** | SQLite | PostgreSQL | Alembic / SQLAlchemy ORM |
| **Vector DB** | LanceDB / Local Chroma | pgvector / Pinecone | Vector Store Vector Interface |
| **Tool Execution** | Local MCP Servers | Remote/Secure Containerized MCP | Standardized MCP Client Protocol |
| **Notifications** | `ntfy.sh` / Gotify API | FCM / APNs / AWS SNS | Unified `NotificationProvider` Interface |

---

## 5. System Interfaces & Data Flow

```
[Data Ingest] 
      │ 
      ▼
[Storage Layer] ──(Triggers)──► [Quant Engine (Math/Backtest)]
                                        │
                                        ▼
                               [LangGraph Agents] ◄──► [MCP Server Tools]
                                        │
                                        ├── [Memory Palace (Long-Term)]
                                        ▼
                           [LLM-as-a-Judge Evaluation]
                                        │
                                        ▼
                            [Notification Gateway] ──► (Mobile Alert)

```

1. **Ingestion:** Ingestors populate raw tables inside the local abstraction layer.
2. **Processing:** Quantitative engine computes statistical baselines and anomalies.
3. **Agent Analysis:** LangGraph triggers the multi-agent system. The Quantitative Math agent pulls data via MCP, cross-references historical insights via Memory Palace, and scripts out a candidate swing strategy.
4. **Backtest & Judge:** The strategy is executed by the backtester tool. Results are forwarded to the LLM Judge.
5. **Dispatch:** If approved, a high-conviction decision is formatted and pushed to the mobile device via the operational notification wrapper.

---

## 6. Non-Functional Requirements & Guardrails

* **Production-Ready Logic:** The implementation must completely reject placeholder data structures, mock data files, or hard-coded logic paths.
* **Config-Driven Architecture:** All environment switches (DB connections, LLM base URLs, API keys, Notification targets) must be handled exclusively via an externalized `.env` or YAML configuration matrix.
* **Deterministic Fallbacks:** If local inference engine context windows are exceeded or failures occur during multi-day evaluations, state boundaries must safely roll back to the last stable check-pointed state in the relational database.