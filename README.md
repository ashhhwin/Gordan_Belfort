# Gordan Belfort: Agentic Execution

[![Python](https://img.shields.io/badge/Python-3.13-blue.svg?style=flat-square&logo=python)](#)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110.0-009688.svg?style=flat-square&logo=fastapi)](#)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.0.39-orange.svg?style=flat-square)](#)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?style=flat-square&logo=react)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg?style=flat-square&logo=postgresql)](#)

> **Multi-agent orchestration for automated algorithmic trading.**
> * Yes, the name is a ruthless crossbreed of Jordan Belfort and Gordon Gekko. Greed is good.*

Engineered a multi-agent system leveraging MemPalace memory and MCP sandboxes to analyze US/IND markets, monitor cross-market portfolios, push notifications, and automate trading decisions.

## System Architecture

The system is constructed using a decoupled, event-driven architecture with distinct service boundaries.

### 1. Multi-Agent Orchestrator (LangGraph)
A hierarchical routing engine determines execution paths based on real-time state analysis. 
- **Supervisor Node:** Analyzes inbound data and delegates execution to specialized sub-agents.
- **Simulation Agent:** Operates strictly within mathematical bounds to compute forecasts and plot data.
- **Database Agent:** Communicates with local financial databases via standard MCP protocols.

### 2. Isolated Execution Environments (MCP Sandboxes)
All mathematical evaluations and quantitative backtesting execute inside isolated Model Context Protocol (MCP) environments.
- High-fidelity plotting via intercepted standard output streams.
- Deterministic sandbox constraints to prevent LLM hallucination and ensure secure data handling.

### 3. Long-Term State Persistence (MemPalace)
Cross-session contextual memory is maintained using MemPalace architecture, allowing the orchestrator to recall historical trades, portfolio drift, and systemic execution records seamlessly over time.

## Core Capabilities

- **Cross-Market OHLCV Analysis:** Continuous ingestion and evaluation of daily price-volume action across both US and Indian indices.
- **Portfolio Reconciliation:** Automated tracking of individual holdings, delta calculations, and aggregated net worth across multiple brokerage platforms.
- **Algorithmic Automation:** Zero-hallucination mathematical execution via strictly typed tool calling.
- **Asynchronous Notifications:** Real-time push alerts triggered by systemic thresholds or anomalous market deviations.

## Technology Stack

**Infrastructure & Orchestration**
- Python 3.13
- LangChain / LangGraph (Hierarchical Agent State Management)
- LangSmith (Real-time Execution Tracing)
- Model Context Protocol (MCP)

**Backend & Data Layer**
- FastAPI & Uvicorn (Asynchronous API & SSE Streaming)
- PostgreSQL (Time-series OHLCV & Portfolio State)
- Playwright (Headless Browser Ingestion Pipelines)

**Frontend Application**
- React 18 & Vite
- Server-Sent Events (SSE) (Real-time Token Streaming)
- Electron (Desktop Wrapper)

## Getting Started

### Prerequisites
- Node.js (v20+)
- Python (3.12+)
- PostgreSQL Server
- Ollama (Local LLM Daemon)

### Initialization

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/gordan-belfort.git
cd gordan-belfort
```

2. **Configure Environment Variables**
Generate a `.env` file in the root directory and the `ai/` directory. Ensure `LANGCHAIN_API_KEY` is set for telemetry.

3. **Install Dependencies**
```bash
# Frontend
cd ui && npm install

# Database / Core API
cd ../database && npm install

# AI Backend 
cd ../ai && uv venv && uv pip install -r requirements.txt
```

4. **Launch the Ecosystem**
The system is configured to launch the React frontend, Node.js database layer, and Python LangGraph orchestrator concurrently within a single process.

```bash
cd ui
npm run dev
```

## System Telemetry
The orchestration layer natively streams trace data to LangSmith. Monitor execution latency, tool invocation payloads, and deterministic routing paths directly via the LangSmith dashboard.

---
*Architected and maintained by Ashwin Ram*
