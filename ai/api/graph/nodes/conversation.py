"""
Conversation Agent Node.
Handles general chat, explanations, and questions that don't require tools.
Rich persona-driven responses with injected long-term memory context.
"""

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import AIMessage
from langsmith import traceable
from api.config import get_llm, PERSONAS, DEFAULT_PERSONA


@traceable(name="Conversation Node")
async def conversation_node(state, config):
    # Get active persona
    persona_key = state.get("persona", DEFAULT_PERSONA)
    persona = PERSONAS.get(persona_key, PERSONAS[DEFAULT_PERSONA])
    system_prompt = persona["system_prompt"]

    # Inject memory context if available
    memory_context = ""
    if state.get("memory_context"):
        memories = state["memory_context"]
        if memories:
            memory_context = "\n\nYOUR LONG-TERM MEMORIES (from past sessions):\n" + "\n".join(
                f"- [{m['memory_type']}] {m['content']}" for m in memories
            )

    full_prompt = system_prompt + memory_context

    llm = get_llm(temperature=0.7)

    prompt = ChatPromptTemplate.from_messages([
        ("system", full_prompt),
        ("placeholder", "{messages}")
    ])

    chain = prompt | llm

    response = await chain.ainvoke({"messages": state["messages"]}, config=config)

    return {
        "messages": [response],
        "next_agent": "FINISH"
    }
