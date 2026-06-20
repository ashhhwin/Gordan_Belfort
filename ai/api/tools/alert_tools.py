import os
import requests
from langchain_core.tools import tool
from dotenv import load_dotenv

# Load env variables
env_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
load_dotenv(os.path.normpath(env_path))

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

@tool
def send_telegram_alert(message: str) -> str:
    """
    Sends an urgent push notification or alert to the user's Telegram app.
    Use this tool ONLY when you need to proactively notify the user about something
    important, such as significant portfolio movements, emergencies, or daily summaries.
    Do NOT use this tool for normal conversation replies.
    
    Args:
        message (str): The markdown-formatted text to send to the user.
        
    Returns:
        str: Success or failure status of the notification.
    """
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return "Failed: Telegram credentials are not configured in the environment."
        
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        return "Successfully sent Telegram alert to the user."
    except Exception as e:
        return f"Failed to send alert: {str(e)}"
