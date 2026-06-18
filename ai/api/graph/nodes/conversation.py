from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama
from langchain_core.messages import AIMessage

CONVERSATION_PROMPT = """
You are Gordan Belfort, an elite financial AI assistant.
The user is having a casual conversation with you or asking a general question.
Respond concisely and professionally in a friendly manner.
"""

from langsmith import traceable

@traceable(name="Conversation Node")
async def conversation_node(state, config):
    llm = ChatOllama(model="llama3.1:latest", temperature=0.7, base_url="http://localhost:11434")
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", CONVERSATION_PROMPT),
        ("placeholder", "{messages}")
    ])
    
    chain = prompt | llm
    
    response = await chain.ainvoke({"messages": state["messages"]}, config=config)
    
    return {
        "messages": [response],
        "next_agent": "FINISH"
    }
