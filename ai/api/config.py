"""
Centralized configuration for the Gordan Belfort AI Engine.
Provider-agnostic LLM factory: switch between Ollama, Anthropic, OpenAI,
and Google by changing only the .env file — zero code changes needed.
"""

import os
from pathlib import Path
from dotenv import load_dotenv
import itertools

# ── Paths ──
_AI_DIR = Path(__file__).resolve().parent.parent
_PROMPTS_DIR = _AI_DIR / "prompts"
_KNOWLEDGE_DIR = _AI_DIR / "knowledge"

# Load the root .env first (for Telegram, DB, openrouter keys)
load_dotenv(_AI_DIR.parent / ".env")
# Then load ai/.env (overrides with AI-specific settings)
load_dotenv(_AI_DIR / ".env", override=True)

# ══════════════════════════════════════════════════════════════
#  LLM Configuration
#  Switch providers by changing LLM_PROVIDER in .env only.
#
#  Supported providers:
#    ollama     — local Ollama (default)
#    anthropic  — Claude Sonnet/Haiku/Opus
#    openai     — GPT-4o / GPT-4o-mini
#    google     — Gemini Pro / Flash
# ══════════════════════════════════════════════════════════════
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen3:latest")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434")
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.1"))

# Supervisor uses lower temperature for deterministic routing
SUPERVISOR_MODEL = os.getenv("SUPERVISOR_MODEL", LLM_MODEL)
SUPERVISOR_TEMPERATURE = float(os.getenv("SUPERVISOR_TEMPERATURE", "0"))

# ── Cloud Provider API Keys ──
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

# ── OpenRouter Key Rotation ──
OPENROUTER_API_KEYS_RAW = os.getenv("OPENROUTER_API_KEYS", "")
OPENROUTER_API_KEYS = [k.strip() for k in OPENROUTER_API_KEYS_RAW.split(",") if k.strip()]
_openrouter_key_cycle = itertools.cycle(OPENROUTER_API_KEYS) if OPENROUTER_API_KEYS else None

# ── Persistence ──
DATA_DIR = _AI_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

CHECKPOINT_DB_PATH = os.getenv("CHECKPOINT_DB_PATH", str(DATA_DIR / "checkpoints.db"))
CONVERSATIONS_DB_PATH = os.getenv("CONVERSATIONS_DB_PATH", str(DATA_DIR / "conversations.db"))

# Mem0 + ChromaDB vector memory directory
MEMORY_DIR = DATA_DIR / "memory"
MEMORY_DIR.mkdir(exist_ok=True)

# ── PostgreSQL (Portfolio + Market Data) ──
PG_HOST = os.getenv("DB_HOST", os.getenv("PGHOST", "localhost"))
PG_PORT = int(os.getenv("DB_PORT", os.getenv("PGPORT", "5432")))
PG_NAME = os.getenv("DB_NAME", os.getenv("PGDATABASE", "stock_pilot"))
PG_USER = os.getenv("DB_USER", os.getenv("PGUSER", os.getenv("USER", "postgres")))
PG_PASSWORD = os.getenv("DB_PASSWORD", os.getenv("PGPASSWORD", ""))
PG_DSN = f"postgresql://{PG_USER}:{PG_PASSWORD}@{PG_HOST}:{PG_PORT}/{PG_NAME}"

# ── Telegram ──
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# ── LangSmith ──
LANGSMITH_PROJECT = os.getenv("LANGCHAIN_PROJECT", "AlphaEngine")


# ══════════════════════════════════════════════════════════════
#  Model-Agnostic LLM Factory
# ══════════════════════════════════════════════════════════════

# ── Agent Specific Models ──
AGENT_MODELS_OPENROUTER = {
    "supervisor": "meta-llama/llama-3.3-70b-instruct:free",
    "sandbox": "qwen/qwen3-coder:free",
    "data": "meta-llama/llama-3.3-70b-instruct:free",
    "quant": "nousresearch/hermes-3-llama-3.1-405b:free",
    "judge": "nvidia/nemotron-3-super-120b-a12b:free",
    "default": "nousresearch/hermes-3-llama-3.1-405b:free"
}

AGENT_MODELS_OLLAMA = {
    "default": os.getenv("LLM_MODEL", "qwen3:latest")
}

def get_llm(model: str = None, agent_name: str = None, temperature: float = None, streaming: bool = True):
    """
    Return the appropriate LangChain chat model based on LLM_PROVIDER env var.
    To switch providers, update .env — no code changes required.

    Env vars:
        LLM_PROVIDER:   ollama | anthropic | openai | google
        LLM_MODEL:      Model name (provider-specific)
        LLM_BASE_URL:   Ollama base URL (ignored for cloud providers)
        ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY
    """
    provider = LLM_PROVIDER.lower()
    
    if not model:
        if provider == "openrouter":
            model = AGENT_MODELS_OPENROUTER.get(agent_name, AGENT_MODELS_OPENROUTER["default"])
        else:
            model = AGENT_MODELS_OLLAMA.get(agent_name, AGENT_MODELS_OLLAMA.get("default", LLM_MODEL))

    _model = model
    _temp = temperature if temperature is not None else LLM_TEMPERATURE

    if provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model=_model,
            temperature=_temp,
            base_url=LLM_BASE_URL,
            streaming=streaming,
        )

    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        if not ANTHROPIC_API_KEY:
            raise ValueError("Set ANTHROPIC_API_KEY in .env to use Anthropic.")
        return ChatAnthropic(
            model=_model,
            temperature=_temp,
            api_key=ANTHROPIC_API_KEY,
            streaming=streaming,
        )

    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        if not OPENAI_API_KEY:
            raise ValueError("Set OPENAI_API_KEY in .env to use OpenAI.")
        return ChatOpenAI(
            model=_model,
            temperature=_temp,
            api_key=OPENAI_API_KEY,
            streaming=streaming,
        )

    elif provider == "openrouter":
        from langchain_openai import ChatOpenAI
        
        if not _openrouter_key_cycle:
            raise ValueError("Set OPENROUTER_API_KEYS in .env to use OpenRouter.")
        
        api_key = next(_openrouter_key_cycle)
        
        primary_llm = ChatOpenAI(
            model=_model,
            temperature=_temp,
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            streaming=streaming,
            max_retries=0
        )

        # Build fallback chain using a robust sequence of other powerful free models
        fallback_models = [
            "meta-llama/llama-3.3-70b-instruct:free",
            "nousresearch/hermes-3-llama-3.1-405b:free",
            "nvidia/nemotron-3-super-120b-a12b:free",
            "qwen/qwen3-coder:free",
            "google/gemma-4-31b-it:free",
            "openrouter/free"
        ]
        
        fallback_chain = []
        for fb_model in fallback_models:
            if fb_model != _model:
                fallback_chain.append(
                    ChatOpenAI(
                        model=fb_model,
                        temperature=_temp,
                        api_key=api_key,
                        base_url="https://openrouter.ai/api/v1",
                        streaming=streaming,
                        max_retries=0
                    )
                )
                
        return primary_llm.with_fallbacks(fallback_chain)

    elif provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        if not GOOGLE_API_KEY:
            raise ValueError("Set GOOGLE_API_KEY in .env to use Google.")
        return ChatGoogleGenerativeAI(
            model=_model,
            temperature=_temp,
            google_api_key=GOOGLE_API_KEY,
        )

    else:
        raise ValueError(
            f"Unknown LLM_PROVIDER='{provider}'. "
            "Supported: ollama | anthropic | openai | google"
        )


def get_supervisor_llm():
    """Return the LLM for the supervisor node (strict deterministic routing)."""
    return get_llm(
        agent_name="supervisor",
        temperature=SUPERVISOR_TEMPERATURE,
        streaming=False,
    )


# ══════════════════════════════════════════════════════════════
#  Prompt + Knowledge Template Loaders
# ══════════════════════════════════════════════════════════════

def load_prompt(name: str) -> str:
    """Load a prompt template from ai/prompts/<name>.md"""
    path = _PROMPTS_DIR / f"{name}.md"
    if not path.exists():
        raise FileNotFoundError(f"Prompt template not found: {path}")
    return path.read_text(encoding="utf-8")


def load_kt() -> str:
    """Load the DB schema knowledge-transfer document."""
    path = _KNOWLEDGE_DIR / "db_schema_kt.md"
    if not path.exists():
        return "[DB Schema KT not yet generated. Run: python3 scripts/generate_kt.py]"
    return path.read_text(encoding="utf-8")
