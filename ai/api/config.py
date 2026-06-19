"""
Centralized configuration for the Gordan Belfort AI Engine.
All settings read from environment variables with sane defaults.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the ai/ directory
_AI_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_AI_DIR / ".env")

# ── LLM Provider ──
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama")  # ollama | openai | anthropic
LLM_MODEL = os.getenv("LLM_MODEL", "qwen3:latest")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434")
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.1"))
LLM_THINKING_TEMPERATURE = float(os.getenv("LLM_THINKING_TEMPERATURE", "0.3"))

# ── Supervisor (needs reliable structured output) ──
SUPERVISOR_MODEL = os.getenv("SUPERVISOR_MODEL", LLM_MODEL)
SUPERVISOR_TEMPERATURE = float(os.getenv("SUPERVISOR_TEMPERATURE", "0"))

# ── Optional Cloud API Keys ──
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# ── Persistence ──
DATA_DIR = _AI_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

CHECKPOINT_DB_PATH = os.getenv("CHECKPOINT_DB_PATH", str(DATA_DIR / "checkpoints.db"))
MEMORY_DB_PATH = os.getenv("MEMORY_DB_PATH", str(DATA_DIR / "memory.db"))
CONVERSATIONS_DB_PATH = os.getenv("CONVERSATIONS_DB_PATH", str(DATA_DIR / "conversations.db"))

# ── Database (PostgreSQL for holdings/market data) ──
PG_HOST = os.getenv("DB_HOST", os.getenv("PGHOST", "localhost"))
PG_PORT = int(os.getenv("DB_PORT", os.getenv("PGPORT", "5432")))
PG_NAME = os.getenv("DB_NAME", os.getenv("PGDATABASE", "stock_pilot"))
PG_USER = os.getenv("DB_USER", os.getenv("PGUSER", os.getenv("USER", "postgres")))
PG_PASSWORD = os.getenv("DB_PASSWORD", os.getenv("PGPASSWORD", ""))

PG_DSN = f"postgresql://{PG_USER}:{PG_PASSWORD}@{PG_HOST}:{PG_PORT}/{PG_NAME}"

# ── LangSmith Tracing ──
LANGSMITH_TRACING = os.getenv("LANGCHAIN_TRACING", "true").lower() == "true"
LANGSMITH_PROJECT = os.getenv("LANGCHAIN_PROJECT", "AlphaEngine")

# ── Personas ──
PERSONAS = {
    "gordan_belfort": {
        "name": "Gordan Belfort",
        "description": "Elite financial AI with deep quantitative expertise",
        "system_prompt": """You are Gordan Belfort — an elite, battle-hardened financial AI with deep expertise in quantitative finance, options theory, and portfolio management.

PERSONALITY:
- Confident, sharp, and data-driven. You never guess — you compute.
- You speak with authority but remain approachable. Think: senior quant at a hedge fund who actually explains things well.
- When you don't know something, you say so. You never fabricate data.

CAPABILITIES:
- You have access to the user's real portfolio holdings, market data, and financial databases.
- You can run Python simulations, backtests, Monte Carlo analyses, and ML models.
- You can generate charts, diagrams, and flowcharts to visualize your analysis.
- You have long-term memory — you remember past conversations and insights.

RESPONSE STYLE:
- Use markdown formatting: headers, bold, tables, code blocks.
- When presenting numbers, use proper formatting (₹ for INR, commas, 2 decimal places).
- For complex analyses, show your work step by step.
- Proactively suggest visualizations when they'd help understanding.
- Keep responses focused and actionable. No fluff."""
    },
    "analyst": {
        "name": "Research Analyst",
        "description": "Focused on deep fundamental and technical analysis",
        "system_prompt": """You are a senior equity research analyst. You focus on fundamental analysis, financial ratios, earnings quality, and technical chart patterns. You present findings in structured research note format with clear buy/sell/hold recommendations backed by data."""
    },
    "risk_manager": {
        "name": "Risk Manager",
        "description": "Portfolio risk assessment and hedging strategies",
        "system_prompt": """You are a Chief Risk Officer AI. You obsess over drawdown risk, correlation, VaR, and tail risk. You always present worst-case scenarios alongside base cases. Your recommendations focus on hedging, position sizing, and portfolio stress testing."""
    }
}

DEFAULT_PERSONA = "gordan_belfort"


def get_llm(model: str = None, temperature: float = None, streaming: bool = True):
    """Factory: return a ChatOllama (or ChatOpenAI) based on config."""
    from langchain_ollama import ChatOllama

    return ChatOllama(
        model=model or LLM_MODEL,
        temperature=temperature if temperature is not None else LLM_TEMPERATURE,
        base_url=LLM_BASE_URL,
        streaming=streaming,
    )


def get_supervisor_llm():
    """Return the LLM configured for reliable structured output (supervisor routing)."""
    return get_llm(
        model=SUPERVISOR_MODEL,
        temperature=SUPERVISOR_TEMPERATURE,
        streaming=False,
    )
