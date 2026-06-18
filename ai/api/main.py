from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
import json
import uuid

from api.graph.main_graph import app_graph
from langchain_core.messages import HumanMessage

from dotenv import load_dotenv
load_dotenv() # Load the .env file with LangSmith API key

app = FastAPI(title="Gordan Belfort AI Brain")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow UI on port 5173
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None

async def event_generator(message: str, session_id: str):
    config = {"configurable": {"thread_id": session_id}}
    
    # Use astream_events to catch all internal LLM tokens and tool executions
    async for event in app_graph.astream_events(
        {"messages": [HumanMessage(content=message)]}, 
        config=config, 
        version="v1"
    ):
        kind = event["event"]
        
        # Stream intermediate thoughts/routing
        if kind == "on_chain_start":
            if event["name"] == "supervisor_node":
                yield f"data: {json.dumps({'type': 'thought', 'content': 'Supervisor analyzing intent...'})}\n\n"
            elif event["name"] == "simulation_node":
                yield f"data: {json.dumps({'type': 'thought', 'content': 'Simulation Agent activated...'})}\n\n"
                
        # Stream tool executions
        elif kind == "on_tool_start":
            tool_name = event.get("name", "unknown")
            msg_content = f"Running tool: {tool_name}..."
            yield f"data: {json.dumps({'type': 'thought', 'content': msg_content})}\n\n"
            
        # Stream actual LLM response tokens
        elif kind == "on_chat_model_stream":
            # We only want to stream tokens from actual sub-agents, not the supervisor's JSON routing output.
            tags = event.get("tags", [])
            # Supervisor chain usually has "supervisor_node" in its path or tags.
            # A safer way: Check if the name is ChatOllama but it's part of the simulation agent.
            # In LangGraph, the sub-agent will have "langgraph_node" == "simulation" in its metadata.
            node_name = event.get("metadata", {}).get("langgraph_node", "")
            if node_name != "supervisor":
                chunk = event["data"]["chunk"]
                if chunk.content:
                    yield f"data: {json.dumps({'type': 'token', 'content': chunk.content})}\n\n"
                
    yield f"data: {json.dumps({'type': 'end'})}\n\n"

@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    session = req.session_id or str(uuid.uuid4())
    return StreamingResponse(event_generator(req.message, session), media_type="text/event-stream")

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "gordan-belfort-ai"}
