"""
AI Pulse Runner — Autonomous 30-minute market scanner.
Invokes the full LangGraph multi-agent pipeline with a fixed pulse prompt.
Sends results to Telegram. Runs during Indian market hours (9:15 AM – 3:30 PM IST, Mon–Fri).
"""

import asyncio
import logging
import sys
import os
import argparse
from pathlib import Path
from datetime import datetime

import pytz

# Add the ai/ directory to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

IST = pytz.timezone("Asia/Kolkata")
logger = logging.getLogger("ai_pulse")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)


def _load_pulse_prompt() -> str:
    prompt_path = Path(__file__).parent / "pulse_prompt.md"
    if prompt_path.exists():
        return prompt_path.read_text(encoding="utf-8")
    # Fallback minimal prompt
    return """You are running an autonomous 30-minute market pulse scan.
Step 1 (Data Agent): Fetch get_all_indices_latest, get_ibkr_portfolio, get_india_holdings,
get_volume_anomalies (threshold=200), get_52w_extremes (HIGH), get_block_deals, get_alpha_signals.
Step 2 (Quant Agent): Identify top 3 alpha signals, assess portfolio P&L, generate 3 action items.
Step 3 (Judge Agent): Send comprehensive Telegram HTML message with all findings. Save insights to memory."""


async def run_pulse_once(dry_run: bool = False) -> str:
    """Run one pulse cycle. Returns the final AI output."""
    from api.graph.main_graph import build_app_graph
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
    from langchain_core.messages import HumanMessage
    from api.config import CHECKPOINT_DB_PATH

    now_ist = datetime.now(IST)
    time_str = now_ist.strftime("%H:%M IST")
    date_str = now_ist.strftime("%a, %d %b %Y")

    logger.info(f"🔔 Starting AI Pulse at {time_str} on {date_str}")

    pulse_message = _load_pulse_prompt().replace("{TIME}", time_str).replace("{DATE}", date_str)

    if dry_run:
        logger.info("DRY RUN — Telegram will NOT be sent. Running analysis only.")
        # Add a note to the prompt
        pulse_message += "\n\nDRY RUN MODE: Do NOT call send_telegram_html or send_telegram_alert. Just output the formatted message."

    try:
        async with AsyncSqliteSaver.from_conn_string(CHECKPOINT_DB_PATH) as checkpointer:
            graph = build_app_graph(checkpointer=checkpointer)

            session_id = f"pulse_{now_ist.strftime('%Y%m%d_%H%M')}"
            config = {"configurable": {"thread_id": session_id}}

            final_output = ""
            async for event in graph.astream(
                {"messages": [HumanMessage(content=pulse_message)]},
                config=config,
                stream_mode="values"
            ):
                msgs = event.get("messages", [])
                if msgs:
                    last = msgs[-1]
                    content = getattr(last, 'content', '')
                    if content and len(content) > 50:
                        final_output = content

            logger.info(f"✅ Pulse complete at {now_ist.strftime('%H:%M:%S')} IST")
            return final_output

    except Exception as e:
        logger.error(f"❌ Pulse failed: {e}", exc_info=True)
        # Send error alert to Telegram
        if not dry_run and TELEGRAM_BOT_TOKEN:
            import requests
            try:
                requests.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                    json={
                        "chat_id": TELEGRAM_CHAT_ID,
                        "text": f"⚠️ AI Pulse FAILED at {time_str}\nError: {str(e)[:200]}",
                        "parse_mode": "HTML"
                    }, timeout=10
                )
            except Exception:
                pass
        return f"Pulse failed: {e}"


def run_scheduler():
    """Start the APScheduler that runs the pulse every 30 minutes during market hours."""
    from apscheduler.schedulers.asyncio import AsyncIOScheduler

    scheduler = AsyncIOScheduler(timezone=IST)

    # Run every 30 minutes, Mon–Fri, 9:15 AM to 3:30 PM IST
    @scheduler.scheduled_job(
        "cron",
        day_of_week="mon-fri",
        hour="9-15",
        minute="15,45",
        id="ai_pulse_30min",
        name="AI Pulse — 30min Market Scanner",
        replace_existing=True
    )
    async def scheduled_pulse():
        """The actual pulse job that runs on schedule."""
        now_ist = datetime.now(IST)
        # Extra check: don't run before 9:15 or after 15:30
        if now_ist.hour == 9 and now_ist.minute < 15:
            return
        if now_ist.hour > 15 or (now_ist.hour == 15 and now_ist.minute > 30):
            return

        await run_pulse_once(dry_run=False)

    scheduler.start()
    logger.info("🚀 AI Pulse Scheduler started")
    logger.info("   Schedule: Every 30 min | Mon–Fri | 09:15–15:45 IST")
    logger.info("   Timezone: Asia/Kolkata (IST)")
    logger.info("   Next runs: 09:15, 09:45, 10:15, 10:45 ... 15:15, 15:45")

    return scheduler


def main():
    import asyncio
    parser = argparse.ArgumentParser(description="Gordan Belfort AI Pulse Runner")
    parser.add_argument("--dry-run", action="store_true",
                        help="Run pulse once immediately, do NOT send Telegram")
    parser.add_argument("--run-now", action="store_true",
                        help="Run pulse once immediately AND send Telegram")
    parser.add_argument("--schedule", action="store_true",
                        help="Start the 30-min scheduler (default mode)")
    args = parser.parse_args()

    if args.dry_run:
        logger.info("▶  Running single dry-run pulse (no Telegram)...")
        result = asyncio.run(run_pulse_once(dry_run=True))
        print("\n" + "=" * 60)
        print("PULSE OUTPUT:")
        print("=" * 60)
        print(result)
        print("=" * 60)

    elif args.run_now:
        logger.info("▶  Running single pulse NOW (Telegram will be sent)...")
        result = asyncio.run(run_pulse_once(dry_run=False))
        print(result)

    else:
        # Default: start scheduler
        logger.info("▶  Starting AI Pulse Scheduler...")
        import asyncio

        async def run_scheduler_async():
            scheduler = run_scheduler()
            # Run an immediate pulse on startup
            logger.info("Running initial startup pulse...")
            await run_pulse_once(dry_run=False)
            logger.info("Scheduler is running. Press Ctrl+C to stop.")
            try:
                while True:
                    await asyncio.sleep(60)
            except (KeyboardInterrupt, SystemExit):
                scheduler.shutdown()
                logger.info("Scheduler stopped.")

        asyncio.run(run_scheduler_async())


if __name__ == "__main__":
    main()
