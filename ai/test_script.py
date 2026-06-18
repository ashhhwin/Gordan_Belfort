from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage
import asyncio
import sys

async def main():
    print("Initializing Ollama Model (llama3.1:latest)...")
    
    # Initialize the model pointing to local ollama instance
    llm = ChatOllama(
        model="llama3.1:latest",
        temperature=0.1,
        base_url="http://localhost:11434"
    )
    
    print("\nSending prompt: 'Hello! Are you working?'")
    print("-" * 50)
    
    # Stream the response back to the terminal
    async for chunk in llm.astream([HumanMessage(content="Hello! Are you working?")]):
        sys.stdout.write(chunk.content)
        sys.stdout.flush()
        
    print("\n" + "-" * 50)
    print("Done!")

if __name__ == "__main__":
    asyncio.run(main())
