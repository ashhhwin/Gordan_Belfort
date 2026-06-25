"""
Memory Node — Replaced stub with real Mem0 semantic memory.
Retrieves relevant past insights before the pipeline starts,
and saves key insights after the pipeline finishes.
"""

import time
from api.graph.state import AgentState
from langchain_core.messages import SystemMessage


async def memory_retrieve_node(state: AgentState, config):
    """
    Before the pipeline runs: search Mem0 for relevant past insights.
    Injects retrieved memories as a SystemMessage so agents have context.
    """
    try:
        from mcps.system.system_tools import search_memory
        # Get the user's current question
        messages = state.get("messages", [])
        if not messages:
            return {"thinking_steps": [], "sender": "memory"}

        last_user_msg = ""
        for msg in reversed(messages):
            if hasattr(msg, 'type') and msg.type == 'human':
                last_user_msg = msg.content
                break
            elif isinstance(msg, dict) and msg.get('role') == 'user':
                last_user_msg = msg.get('content', '')
                break

        if not last_user_msg:
            return {"thinking_steps": [], "sender": "memory"}

        # Search for relevant memories
        memory_result = search_memory.invoke({"query": last_user_msg[:200], "limit": 4})

        import json
        memories = json.loads(memory_result)
        results = memories.get("results", [])

        if results:
            memory_text = "\n".join([f"- {r.get('content', '')}" for r in results if r.get('content')])
            if memory_text.strip():
                memory_msg = SystemMessage(
                    content=f"[RELEVANT PAST INSIGHTS FROM MEMORY]\n{memory_text}\n[END MEMORY]"
                )
                return {
                    "messages": [memory_msg],
                    "thinking_steps": [{"step": "memory_retrieve", "content": f"🧠 Retrieved {len(results)} relevant past insights.", "timestamp": time.time()}],
                    "sender": "memory"
                }

    except Exception:
        pass  # Memory failure is non-critical

    return {"thinking_steps": [], "sender": "memory"}


async def memory_write_node(state: AgentState, config):
    """
    After the pipeline finishes: save key insights to Mem0.
    Looks for the last assistant message to extract insights.
    """
    try:
        from mcps.system.system_tools import save_to_memory
        messages = state.get("messages", [])

        # Find the last substantive AI message
        last_ai_content = ""
        for msg in reversed(messages):
            content = ""
            if hasattr(msg, 'type') and msg.type == 'ai':
                content = getattr(msg, 'content', '')
            elif isinstance(msg, dict) and msg.get('role') == 'assistant':
                content = msg.get('content', '')

            if content and len(content) > 100:
                last_ai_content = content[:1000]  # Save summary only
                break

        if last_ai_content:
            # Only save if it contains analysis-worthy content
            keywords = ['bullish', 'bearish', 'buy', 'sell', 'watch', 'breakout', 'signal',
                       'sharpe', 'var', 'volatility', 'backtest', 'anomaly', '%', '₹', '$']
            has_insight = any(k.lower() in last_ai_content.lower() for k in keywords)

            if has_insight:
                save_to_memory.invoke({
                    "content": last_ai_content,
                    "memory_type": "insight"
                })

    except Exception:
        pass  # Memory write failure is non-critical

    return {"thinking_steps": [], "sender": "memory"}
