"""
System MCP Tools — Real Telegram alerts + Mem0 semantic agent memory.
Mem0 uses ChromaDB as the vector store with local sentence-transformer embeddings.
No external API required for memory — fully local.
"""

import json
import os
import requests
import base64
from io import BytesIO
from datetime import datetime
from typing import Optional
from langchain_core.tools import tool
from api.config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, MEMORY_DIR, PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD


# ══════════════════════════════════════════════════════════════
#  Mem0 Agent Memory (Semantic Search via ChromaDB)
# ══════════════════════════════════════════════════════════════

_mem0_client = None

def _get_memory():
    """Lazy-initialize Mem0 with ChromaDB backend and local embeddings."""
    global _mem0_client
    if _mem0_client is not None:
        return _mem0_client
    try:
        from mem0 import Memory
        config = {
            "vector_store": {
                "provider": "chroma",
                "config": {
                    "collection_name": "gordan_belfort_memory",
                    "path": str(MEMORY_DIR),
                }
            },
            "embedder": {
                "provider": "huggingface",
                "config": {
                    "model": "BAAI/bge-small-en-v1.5"
                }
            },
            "llm": {
                "provider": "ollama",
                "config": {
                    "model": os.getenv("LLM_MODEL", "qwen3:latest"),
                    "base_url": os.getenv("LLM_BASE_URL", "http://localhost:11434"),
                    "temperature": 0.1,
                }
            }
        }
        _mem0_client = Memory.from_config(config)
        return _mem0_client
    except ImportError:
        return None
    except Exception:
        return None


@tool
def save_to_memory(content: str, memory_type: str = "insight") -> str:
    """
    Save an insight, risk flag, or observation to the AI's long-term semantic memory.
    This memory persists across conversations and can be retrieved semantically.

    Args:
        content: The insight to remember. Be specific and include dates/symbols.
                 Example: "PARAS hit a new 52W high on 2026-06-18 with 19% volume surge.
                          Strong momentum signal. Watched at 1295."
        memory_type: 'insight' | 'risk_flag' | 'portfolio_note' | 'market_pattern' | 'trade_idea'
    """
    try:
        mem = _get_memory()
        if mem is None:
            # Fallback: SQLite-based memory
            return _sqlite_save(content, memory_type)

        enriched = f"[{memory_type.upper()}] [{datetime.now().strftime('%Y-%m-%d')}] {content}"
        result = mem.add(
            [{"role": "user", "content": enriched}],
            user_id="ashwin_gordan_belfort",
            metadata={"type": memory_type, "date": datetime.now().isoformat()}
        )
        return json.dumps({"status": "saved", "memory_type": memory_type, "mem0_result": str(result)})
    except Exception as e:
        return json.dumps({"status": "error", "error": str(e)})


@tool
def search_memory(query: str, limit: int = 5) -> str:
    """
    Search the AI's long-term semantic memory for relevant past insights.
    Uses vector similarity — finds conceptually related memories even with different wording.

    Args:
        query: Natural language query. Example: "Indian mid-cap momentum stocks" or
               "risk flags on IBKR positions" or "backtests that worked"
        limit: Number of results to return (default: 5)
    Returns: List of past insights ranked by relevance.
    """
    try:
        mem = _get_memory()
        if mem is None:
            return _sqlite_search(query)

        results = mem.search(
            query,
            user_id="ashwin_gordan_belfort",
            limit=limit
        )
        memories = []
        for r in (results.get("results") or results or []):
            memories.append({
                "content": r.get("memory", r.get("text", "")),
                "score": round(r.get("score", 0), 4),
                "metadata": r.get("metadata", {})
            })
        return json.dumps({"query": query, "results": memories, "count": len(memories)}, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "error": str(e)})


def _sqlite_save(content: str, memory_type: str) -> str:
    """SQLite fallback for memory when Mem0/ChromaDB is unavailable."""
    import sqlite3
    db_path = str(MEMORY_DIR / "fallback_memory.db")
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT,
            memory_type TEXT,
            created_at TEXT
        )
    """)
    conn.execute(
        "INSERT INTO memories (content, memory_type, created_at) VALUES (?, ?, ?)",
        (content, memory_type, datetime.now().isoformat())
    )
    conn.commit(); conn.close()
    return json.dumps({"status": "saved_to_sqlite_fallback", "memory_type": memory_type})


def _sqlite_search(query: str) -> str:
    """SQLite keyword search fallback."""
    import sqlite3
    db_path = str(MEMORY_DIR / "fallback_memory.db")
    try:
        conn = sqlite3.connect(db_path)
        words = query.lower().split()
        rows = conn.execute("SELECT content, memory_type, created_at FROM memories ORDER BY id DESC LIMIT 50").fetchall()
        results = [
            {"content": r[0], "memory_type": r[1], "date": r[2]}
            for r in rows
            if any(w in r[0].lower() for w in words)
        ][:5]
        conn.close()
        return json.dumps({"query": query, "results": results, "mode": "sqlite_fallback"})
    except Exception as e:
        return json.dumps({"error": str(e)})


# ══════════════════════════════════════════════════════════════
#  Telegram Integration (Real API Calls)
# ══════════════════════════════════════════════════════════════

def _tg_url(method: str) -> str:
    return f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"


@tool
def send_telegram_alert(message: str) -> str:
    """
    Send a text alert to Ashwin's Telegram chat.
    Supports Markdown formatting (bold, italic, code blocks).
    Max ~4000 characters. For longer messages, split them.

    Args:
        message: Text to send. Use Markdown: *bold*, _italic_, `code`, ```block```
    """
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return json.dumps({"error": "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured in .env"})
    try:
        resp = requests.post(
            _tg_url("sendMessage"),
            json={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": message,
                "parse_mode": "Markdown",
                "disable_web_page_preview": True
            },
            timeout=10
        )
        data = resp.json()
        if data.get("ok"):
            return json.dumps({"status": "sent", "message_id": data["result"]["message_id"]})
        else:
            return json.dumps({"status": "failed", "error": data.get("description")})
    except Exception as e:
        return json.dumps({"status": "error", "error": str(e)})


@tool
def send_telegram_html(html_message: str) -> str:
    """
    Send an HTML-formatted message to Telegram.
    Supports: <b>bold</b>, <i>italic</i>, <code>code</code>, <pre>block</pre>

    Args:
        html_message: HTML-formatted text string
    """
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return json.dumps({"error": "Telegram not configured"})
    try:
        resp = requests.post(
            _tg_url("sendMessage"),
            json={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": html_message,
                "parse_mode": "HTML",
                "disable_web_page_preview": True
            },
            timeout=10
        )
        data = resp.json()
        return json.dumps({"status": "sent" if data.get("ok") else "failed", "response": data})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def send_telegram_chart(image_b64: str, caption: str = "") -> str:
    """
    Send a matplotlib chart or any image to Telegram as a photo.
    Use this to share analysis visualizations directly to Telegram.

    Args:
        image_b64: Base64-encoded PNG image string (the [[IMAGE_BASE64:...]] content)
        caption: Caption text for the image (supports Markdown)
    """
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return json.dumps({"error": "Telegram not configured"})
    try:
        # Strip the [[IMAGE_BASE64:...]] wrapper if present
        b64_clean = image_b64
        if image_b64.startswith("[[IMAGE_BASE64:") and image_b64.endswith("]]"):
            b64_clean = image_b64[15:-2]

        img_bytes = base64.b64decode(b64_clean)
        resp = requests.post(
            _tg_url("sendPhoto"),
            data={"chat_id": TELEGRAM_CHAT_ID, "caption": caption, "parse_mode": "Markdown"},
            files={"photo": ("chart.png", BytesIO(img_bytes), "image/png")},
            timeout=30
        )
        data = resp.json()
        return json.dumps({"status": "sent" if data.get("ok") else "failed"})
    except Exception as e:
        return json.dumps({"error": str(e)})


# ══════════════════════════════════════════════════════════════
#  Portfolio Snapshot Tools
# ══════════════════════════════════════════════════════════════

@tool
def get_portfolio_pnl_snapshot() -> str:
    """
    Quick P&L snapshot across both IBKR and India portfolios.
    Useful for pulse scans and alerts. Returns total values and P&L in one call.
    """
    import psycopg2
    import psycopg2.extras
    try:
        conn = psycopg2.connect(
            host=PG_HOST, port=PG_PORT, dbname=PG_NAME,
            user=PG_USER, password=PG_PASSWORD,
            cursor_factory=psycopg2.extras.RealDictCursor
        )
        cur = conn.cursor()

        # IBKR
        cur.execute("""
            SELECT SUM(market_value) AS total_value_usd,
                   SUM(unrealized_pnl) AS total_pnl_usd,
                   MAX(date) AS snapshot_date
            FROM ibkr_portfolio_holdings
            WHERE date = (SELECT MAX(date) FROM ibkr_portfolio_holdings)
        """)
        ibkr = dict(cur.fetchone() or {})

        # India
        cur.execute("""
            SELECT SUM(qty * cmp) AS total_value_inr,
                   SUM((cmp - avg_buy) * qty) AS total_pnl_inr,
                   COUNT(*) AS positions
            FROM holdings WHERE qty > 0 AND asset_class != 'CREDIT_CARD'
        """)
        india = dict(cur.fetchone() or {})

        # Today's movers
        cur.execute("""
            SELECT symbol, day_change_pct, qty * cmp AS value
            FROM holdings WHERE qty > 0 AND day_change_pct > 2
            ORDER BY day_change_pct DESC LIMIT 3
        """)
        top_movers = [dict(r) for r in cur.fetchall()]

        cur.close(); conn.close()

        import decimal
        def s(v): return float(v) if isinstance(v, decimal.Decimal) else v

        return json.dumps({
            "ibkr": {
                "total_value_usd": round(s(ibkr.get('total_value_usd') or 0), 2),
                "unrealized_pnl_usd": round(s(ibkr.get('total_pnl_usd') or 0), 2),
                "date": str(ibkr.get('snapshot_date') or 'N/A')
            },
            "india": {
                "total_value_inr": round(s(india.get('total_value_inr') or 0), 2),
                "unrealized_pnl_inr": round(s(india.get('total_pnl_inr') or 0), 2),
                "positions": int(india.get('positions') or 0)
            },
            "today_top_movers": top_movers
        }, default=str, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


# ══════════════════════════════════════════════════════════════
#  System Health
# ══════════════════════════════════════════════════════════════

@tool
def get_system_health() -> str:
    """
    Check connectivity of all critical system components.
    Returns status of PostgreSQL, Ollama LLM, and Telegram bot.
    """
    import psycopg2
    status = {}

    # PostgreSQL
    try:
        conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME, user=PG_USER, password=PG_PASSWORD)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM nse_stocks_daily WHERE date >= CURRENT_DATE - 7")
        count = cur.fetchone()[0]
        conn.close()
        status["postgresql"] = {"status": "UP", "recent_nse_rows": count}
    except Exception as e:
        status["postgresql"] = {"status": "DOWN", "error": str(e)}

    # Ollama
    try:
        llm_url = os.getenv("LLM_BASE_URL", "http://localhost:11434")
        r = requests.get(f"{llm_url}/api/tags", timeout=3)
        models = [m["name"] for m in r.json().get("models", [])] if r.status_code == 200 else []
        status["ollama"] = {"status": "UP" if r.status_code == 200 else "ERROR", "models": models[:5]}
    except Exception as e:
        status["ollama"] = {"status": "DOWN", "error": str(e)}

    # Telegram
    if TELEGRAM_BOT_TOKEN:
        try:
            r = requests.get(_tg_url("getMe"), timeout=5)
            data = r.json()
            status["telegram"] = {
                "status": "UP" if data.get("ok") else "ERROR",
                "bot_name": data.get("result", {}).get("username")
            }
        except Exception as e:
            status["telegram"] = {"status": "DOWN", "error": str(e)}
    else:
        status["telegram"] = {"status": "NOT_CONFIGURED"}

    return json.dumps(status, indent=2)


# ══════════════════════════════════════════════════════════════
#  Portfolio Advisory Tools (Stubs → will use real data via DB tools)
# ══════════════════════════════════════════════════════════════

@tool
def generate_rebalancing_options() -> str:
    """
    Analyze the India portfolio for rebalancing opportunities.
    Checks sector concentration, position sizing, and drift from target allocation.
    """
    import psycopg2
    import psycopg2.extras
    try:
        conn = psycopg2.connect(
            host=PG_HOST, port=PG_PORT, dbname=PG_NAME,
            user=PG_USER, password=PG_PASSWORD,
            cursor_factory=psycopg2.extras.RealDictCursor
        )
        cur = conn.cursor()
        cur.execute("""
            SELECT sector, COUNT(*) AS positions, SUM(qty*cmp) AS sector_value,
                   SUM(qty*cmp) / SUM(SUM(qty*cmp)) OVER() * 100 AS pct_of_portfolio
            FROM holdings WHERE qty > 0 AND asset_class = 'IND_EQUITY'
            GROUP BY sector ORDER BY sector_value DESC
        """)
        sector_breakdown = [dict(r) for r in cur.fetchall()]

        # Overconcentrated positions (>10% of equity portfolio)
        cur.execute("""
            WITH total AS (SELECT SUM(qty*cmp) AS tv FROM holdings WHERE qty > 0 AND asset_class='IND_EQUITY')
            SELECT symbol, qty*cmp AS value, qty*cmp / total.tv * 100 AS portfolio_pct
            FROM holdings, total
            WHERE qty > 0 AND asset_class='IND_EQUITY'
              AND qty*cmp / total.tv * 100 > 10
            ORDER BY portfolio_pct DESC
        """)
        concentrated = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()

        import decimal
        def s(v): return float(v) if isinstance(v, decimal.Decimal) else v

        return json.dumps({
            "sector_breakdown": [{k: s(v) for k, v in r.items()} for r in sector_breakdown],
            "overconcentrated_positions": [{k: s(v) for k, v in r.items()} for r in concentrated],
            "suggestion": "Positions > 10% of equity portfolio may warrant trimming for risk management."
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})
