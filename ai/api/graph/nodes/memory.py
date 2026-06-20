"""
Long-term memory management for the Gordan Belfort AI agent.
Uses SQLite for persistent, cross-session memory storage.
"""

import json
import time
import sqlite3
from langchain_core.prompts import ChatPromptTemplate
from langsmith import traceable
from api.config import get_llm, MEMORY_DB_PATH


def _get_memory_db():
    """Get or create the memory database."""
    conn = sqlite3.connect(MEMORY_DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            memory_type TEXT NOT NULL DEFAULT 'fact',
            ticker TEXT,
            tags TEXT,
            thread_id TEXT,
            relevance_score REAL DEFAULT 0.5,
            created_at REAL NOT NULL,
            accessed_at REAL NOT NULL,
            access_count INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_memories_ticker ON memories(ticker)
    """)
    conn.commit()
    return conn


MEMORY_EXTRACT_PROMPT = """You are a memory extraction system for a financial AI. Analyze the conversation and extract KEY INSIGHTS worth remembering for future sessions.

Extract only meaningful, actionable memories. NOT trivial greetings or obvious facts.

MEMORY TYPES:
- "fact": A verified data point (e.g., "User's portfolio is 60% equity, 40% MF")
- "insight": An analytical conclusion (e.g., "RELIANCE shows high correlation with NIFTY50 during bearish regimes")
- "preference": User preference (e.g., "User prefers SMA crossover strategies over RSI")
- "pattern": A recurring market pattern (e.g., "TCS tends to dip 2-3% around quarterly results")

For each memory, output a JSON array:
[
  {{"content": "...", "memory_type": "fact|insight|preference|pattern", "ticker": "SYMBOL or null", "tags": "comma,separated,tags"}}
]

If nothing worth remembering, output: []"""


@traceable(name="Memory Retrieve Node")
async def memory_retrieve_node(state, config):
    """Retrieve relevant long-term memories before agent execution."""
    # Extract key terms from the latest user message
    messages = state.get("messages", [])
    if not messages:
        return {"memory_context": []}

    last_msg = messages[-1].content if messages else ""

    conn = _get_memory_db()
    cursor = conn.cursor()

    # Simple keyword-based retrieval (upgrade to vector search later)
    words = [w.strip().upper() for w in last_msg.split() if len(w) > 2]
    memories = []

    # Search by ticker mentions
    for word in words:
        cursor.execute(
            "SELECT content, memory_type, relevance_score, thread_id FROM memories WHERE ticker = ? ORDER BY relevance_score DESC, accessed_at DESC LIMIT 5",
            (word,)
        )
        for row in cursor.fetchall():
            memories.append({
                "content": row[0],
                "memory_type": row[1],
                "relevance": row[2],
                "source_thread": row[3] or ""
            })

    # Search by content keywords (simple LIKE matching)
    for word in words[:5]:  # Limit to avoid too many queries
        cursor.execute(
            "SELECT content, memory_type, relevance_score, thread_id FROM memories WHERE content LIKE ? ORDER BY relevance_score DESC LIMIT 3",
            (f"%{word}%",)
        )
        for row in cursor.fetchall():
            mem = {
                "content": row[0],
                "memory_type": row[1],
                "relevance": row[2],
                "source_thread": row[3] or ""
            }
            if mem not in memories:
                memories.append(mem)

    # Also get recent high-relevance memories
    cursor.execute(
        "SELECT content, memory_type, relevance_score, thread_id FROM memories ORDER BY relevance_score DESC, accessed_at DESC LIMIT 5"
    )
    for row in cursor.fetchall():
        mem = {
            "content": row[0],
            "memory_type": row[1],
            "relevance": row[2],
            "source_thread": row[3] or ""
        }
        if mem not in memories:
            memories.append(mem)

    # Update access timestamps
    now = time.time()
    for mem in memories:
        cursor.execute(
            "UPDATE memories SET accessed_at = ?, access_count = access_count + 1 WHERE content = ?",
            (now, mem["content"])
        )
    conn.commit()
    conn.close()

    # Deduplicate and limit
    seen = set()
    unique_memories = []
    for m in memories[:10]:
        if m["content"] not in seen:
            seen.add(m["content"])
            unique_memories.append(m)

    return {"memory_context": unique_memories}


@traceable(name="Memory Write Node")
async def memory_write_node(state, config):
    """Extract and persist key insights from the conversation."""
    messages = state.get("messages", [])
    if len(messages) < 2:
        return {}

    # Get the last exchange (last user message + last AI response)
    recent_msgs = messages[-4:] if len(messages) >= 4 else messages
    conversation_text = "\n".join([
        f"{'User' if m.type == 'human' else 'AI'}: {m.content[:500]}"
        for m in recent_msgs
    ])

    llm = get_llm(temperature=0, streaming=False)
    prompt = ChatPromptTemplate.from_messages([
        ("system", MEMORY_EXTRACT_PROMPT),
        ("human", "{conversation}")
    ])

    chain = prompt | llm

    try:
        response = await chain.ainvoke({"conversation": conversation_text}, config=config)
        content = response.content.strip()

        # Parse JSON from response
        import re
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if not json_match:
            return {}

        new_memories = json.loads(json_match.group())
        if not new_memories:
            return {}

        conn = _get_memory_db()
        cursor = conn.cursor()
        thread_id = config.get("configurable", {}).get("thread_id", "")
        now = time.time()

        for mem in new_memories:
            # Check for duplicate content
            cursor.execute("SELECT id FROM memories WHERE content = ?", (mem["content"],))
            if cursor.fetchone():
                continue

            cursor.execute(
                """INSERT INTO memories (content, memory_type, ticker, tags, thread_id, relevance_score, created_at, accessed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    mem["content"],
                    mem.get("memory_type", "fact"),
                    mem.get("ticker"),
                    mem.get("tags", ""),
                    thread_id,
                    0.7,  # Default relevance
                    now,
                    now
                )
            )

        conn.commit()
        conn.close()

    except Exception:
        # Memory write failure should not crash the graph
        import traceback
        traceback.print_exc()

    return {}
