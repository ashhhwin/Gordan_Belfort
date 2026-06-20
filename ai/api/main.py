"""
Gordan Belfort AI Brain — FastAPI Backend.
Enhanced with conversation management, rich SSE streaming, and model selection.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import uuid
import time
import sqlite3
from typing import Optional

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from api.graph.main_graph import build_app_graph
from api.config import (
    CONVERSATIONS_DB_PATH, CHECKPOINT_DB_PATH, LLM_MODEL, PERSONAS, DEFAULT_PERSONA,
    LLM_BASE_URL,
)
from langchain_core.messages import HumanMessage

from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="Gordan Belfort AI Brain", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Conversations Database ──

def _get_convos_db():
    conn = sqlite3.connect(CONVERSATIONS_DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            thread_id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT 'New Conversation',
            persona TEXT NOT NULL DEFAULT 'gordan_belfort',
            model TEXT NOT NULL DEFAULT 'qwen3:latest',
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            message_count INTEGER DEFAULT 0,
            is_pinned INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    return conn


# ── Request / Response Models ──

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    persona: Optional[str] = None
    model: Optional[str] = None


class ConversationCreate(BaseModel):
    title: Optional[str] = "New Conversation"
    persona: Optional[str] = "gordan_belfort"


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    is_pinned: Optional[bool] = None


# ── SSE Event Generator ──

async def event_generator(message: str, session_id: str, persona: str = None, model: str = None):
    """Enhanced SSE streaming with thinking, tool, memory, and token events."""
    config = {"configurable": {"thread_id": session_id}}

    # Ensure conversation exists in DB
    conn = _get_convos_db()
    now = time.time()
    cur = conn.cursor()
    cur.execute("SELECT thread_id FROM conversations WHERE thread_id = ?", (session_id,))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO conversations (thread_id, title, persona, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (session_id, message[:50] + "..." if len(message) > 50 else message,
             persona or DEFAULT_PERSONA, model or LLM_MODEL, now, now)
        )
    else:
        cur.execute("UPDATE conversations SET updated_at = ? WHERE thread_id = ?", (now, session_id))
    conn.commit()
    conn.close()

    input_state = {
        "messages": [HumanMessage(content=message)],
        "persona": persona or DEFAULT_PERSONA,
    }

    try:
        async with AsyncSqliteSaver.from_conn_string(CHECKPOINT_DB_PATH) as saver:
            app_graph = build_app_graph(saver)
            async for event in app_graph.astream_events(input_state, config=config, version="v2"):
                kind = event["event"]

                # ── Thinking / Chain-of-Thought events ──
                if kind == "on_chain_start":
                    node_name = event.get("name", "")
                    if node_name == "thinking":
                        yield f"data: {json.dumps({'type': 'thinking_start', 'content': '🧠 Deep thinking...'})}\n\n"
                    elif node_name == "memory_retrieve":
                        yield f"data: {json.dumps({'type': 'thought', 'content': '🔍 Searching long-term memory...'})}\n\n"
                    elif node_name == "memory_write":
                        yield f"data: {json.dumps({'type': 'thought', 'content': '💾 Saving insights to memory...'})}\n\n"

                elif kind == "on_chain_end":
                    node_name = event.get("name", "")
                    if node_name == "thinking":
                        # Extract thinking steps from the output
                        output = event.get("data", {}).get("output", {})
                        thinking_steps = output.get("thinking_steps", [])
                        for step in thinking_steps:
                            yield f"data: {json.dumps({'type': 'thinking_step', 'content': step.get('content', ''), 'step_type': step.get('step', 'reasoning')})}\n\n"

                        route = output.get("next_agent", "conversation")
                        route_labels = {
                            "simulation": "📊 Routing to Simulation Agent",
                            "database": "🗃️ Routing to Database Agent",
                            "conversation": "💬 Routing to Conversation Agent",
                        }
                        yield f"data: {json.dumps({'type': 'thinking_end', 'content': route_labels.get(route, f'Routing to {route}'), 'route': route})}\n\n"

                # ── Tool execution events ──
                elif kind == "on_tool_start":
                    tool_name = event.get("name", "unknown")
                    tool_input = event.get("data", {}).get("input", {})
                    # Truncate large inputs for display
                    input_preview = str(tool_input)[:200] if tool_input else ""
                    yield f"data: {json.dumps({'type': 'tool_start', 'tool_name': tool_name, 'args_preview': input_preview})}\n\n"

                elif kind == "on_tool_end":
                    tool_name = event.get("name", "unknown")
                    output = event.get("data", {}).get("output", "")
                    # Check if output contains an image
                    has_image = "[[IMAGE_BASE64:" in str(output)
                    preview = str(output)[:300] if not has_image else "(Chart generated)"
                    yield f"data: {json.dumps({'type': 'tool_end', 'tool_name': tool_name, 'result_preview': preview, 'has_image': has_image})}\n\n"

                # ── LLM token streaming ──
                elif kind == "on_chat_model_stream":
                    node_name = event.get("metadata", {}).get("langgraph_node", "")
                    # Don't stream thinking node tokens — those are internal reasoning
                    if node_name not in ("thinking", "memory_retrieve", "memory_write", ""):
                        chunk = event["data"]["chunk"]
                        if chunk.content:
                            yield f"data: {json.dumps({'type': 'token', 'content': chunk.content})}\n\n"

    except Exception as e:
        import traceback
        traceback.print_exc()
        yield f"data: {json.dumps({'type': 'error', 'content': f'Agent error: {str(e)}'})}\n\n"

    # Update message count
    try:
        conn = _get_convos_db()
        conn.execute(
            "UPDATE conversations SET message_count = message_count + 2, updated_at = ? WHERE thread_id = ?",
            (time.time(), session_id)
        )
        conn.commit()
        conn.close()
    except Exception:
        pass

    yield f"data: {json.dumps({'type': 'end'})}\n\n"


# ── Chat Endpoints ──

@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    session = req.session_id or str(uuid.uuid4())
    return StreamingResponse(
        event_generator(req.message, session, req.persona, req.model),
        media_type="text/event-stream"
    )

@app.post("/chat/sync")
async def chat_sync(req: ChatRequest):
    """Synchronous chat endpoint that returns just the final text response."""
    session_id = req.session_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": session_id}}

    # Ensure conversation exists in DB
    conn = _get_convos_db()
    now = time.time()
    cur = conn.cursor()
    cur.execute("SELECT thread_id FROM conversations WHERE thread_id = ?", (session_id,))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO conversations (thread_id, title, persona, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (session_id, req.message[:50] + "..." if len(req.message) > 50 else req.message,
             req.persona or DEFAULT_PERSONA, req.model or LLM_MODEL, now, now)
        )
    else:
        cur.execute("UPDATE conversations SET updated_at = ? WHERE thread_id = ?", (now, session_id))
    conn.commit()
    conn.close()

    input_state = {
        "messages": [HumanMessage(content=req.message)],
        "persona": req.persona or DEFAULT_PERSONA,
    }

    try:
        async with AsyncSqliteSaver.from_conn_string(CHECKPOINT_DB_PATH) as saver:
            app_graph = build_app_graph(saver)
            result = await app_graph.ainvoke(input_state, config=config)
            
            # Update message count
            conn = _get_convos_db()
            conn.execute(
                "UPDATE conversations SET message_count = message_count + 2, updated_at = ? WHERE thread_id = ?",
                (time.time(), session_id)
            )
            conn.commit()
            conn.close()
            
            final_message = result["messages"][-1].content
            return {"response": final_message}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ── Conversation Management ──

@app.get("/conversations")
async def list_conversations():
    conn = _get_convos_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT thread_id, title, persona, model, created_at, updated_at, message_count, is_pinned
        FROM conversations
        ORDER BY is_pinned DESC, updated_at DESC
        LIMIT 100
    """)
    cols = ["thread_id", "title", "persona", "model", "created_at", "updated_at", "message_count", "is_pinned"]
    rows = [dict(zip(cols, row)) for row in cur.fetchall()]
    conn.close()
    return {"conversations": rows}


@app.post("/conversations")
async def create_conversation(req: ConversationCreate):
    thread_id = str(uuid.uuid4())
    now = time.time()
    conn = _get_convos_db()
    conn.execute(
        "INSERT INTO conversations (thread_id, title, persona, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (thread_id, req.title, req.persona, LLM_MODEL, now, now)
    )
    conn.commit()
    conn.close()
    return {"thread_id": thread_id, "title": req.title}


@app.get("/conversations/{thread_id}")
async def get_conversation(thread_id: str):
    """Get conversation metadata and message history from checkpointer."""
    conn = _get_convos_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM conversations WHERE thread_id = ?", (thread_id,))
    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    cols = ["thread_id", "title", "persona", "model", "created_at", "updated_at", "message_count", "is_pinned"]
    convo = dict(zip(cols, row))

    # Get messages from LangGraph checkpointer
    try:
        config = {"configurable": {"thread_id": thread_id}}
        async with AsyncSqliteSaver.from_conn_string(CHECKPOINT_DB_PATH) as saver:
            app_graph = build_app_graph(saver)
            state = await app_graph.aget_state(config)
        messages = []
        if state and state.values and "messages" in state.values:
            for msg in state.values["messages"]:
                messages.append({
                    "role": "user" if msg.type == "human" else "assistant",
                    "content": msg.content,
                    "type": msg.type,
                })
    except Exception:
        messages = []

    convo["messages"] = messages
    return convo


@app.patch("/conversations/{thread_id}")
async def update_conversation(thread_id: str, req: ConversationUpdate):
    conn = _get_convos_db()
    updates = []
    params = []
    if req.title is not None:
        updates.append("title = ?")
        params.append(req.title)
    if req.is_pinned is not None:
        updates.append("is_pinned = ?")
        params.append(1 if req.is_pinned else 0)

    if not updates:
        conn.close()
        return {"status": "no changes"}

    params.append(thread_id)
    conn.execute(f"UPDATE conversations SET {', '.join(updates)} WHERE thread_id = ?", params)
    conn.commit()
    conn.close()
    return {"status": "updated"}


@app.delete("/conversations/{thread_id}")
async def delete_conversation(thread_id: str):
    conn = _get_convos_db()
    conn.execute("DELETE FROM conversations WHERE thread_id = ?", (thread_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}


# ── Utility Endpoints ──

@app.get("/models")
async def list_models():
    """List available Ollama models."""
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{LLM_BASE_URL}/api/tags", timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                models = [
                    {
                        "name": m["name"],
                        "size": m.get("size", 0),
                        "modified_at": m.get("modified_at", ""),
                    }
                    for m in data.get("models", [])
                ]
                return {"models": models}
    except Exception:
        pass
    return {"models": [{"name": LLM_MODEL, "size": 0, "modified_at": ""}]}


@app.get("/personas")
async def list_personas():
    """List available AI personas."""
    return {
        "personas": [
            {"key": k, "name": v["name"], "description": v["description"]}
            for k, v in PERSONAS.items()
        ],
        "default": DEFAULT_PERSONA
    }


@app.get("/health")
async def health_check():
    """Enhanced health check with model and memory status."""
    import httpx

    ollama_status = "unknown"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{LLM_BASE_URL}/api/tags", timeout=3.0)
            ollama_status = "connected" if resp.status_code == 200 else "error"
    except Exception:
        ollama_status = "disconnected"

    # Memory stats
    memory_count = 0
    try:
        conn = sqlite3.connect(str(CONVERSATIONS_DB_PATH).replace("conversations", "memory"))
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM memories")
        memory_count = cur.fetchone()[0]
        conn.close()
    except Exception:
        pass

    # Conversation count
    convo_count = 0
    try:
        conn = _get_convos_db()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM conversations")
        convo_count = cur.fetchone()[0]
        conn.close()
    except Exception:
        pass

    return {
        "status": "healthy",
        "service": "gordan-belfort-ai",
        "version": "2.0.0",
        "model": LLM_MODEL,
        "ollama_status": ollama_status,
        "memory_count": memory_count,
        "conversation_count": convo_count,
    }
