"""Chai-O'Clock bot: screams CHAI TIME at 4pm IST."""

import logging
import os
import random
from datetime import time
from zoneinfo import ZoneInfo

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

IST = ZoneInfo("Asia/Kolkata")
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")

PINGS = [
    "☕ *CHAI O'CLOCK!* It's 4pm IST. Who's making chai? Reply `+chai` once brewed.",
    "🚨 *CHAI EMERGENCY DRILL* All members report to the kitchen. Reply `+chai` once brewed.",
]

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("chai-oclock")


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "☕ *Chai-O'Clock Bot* reporting for duty!\n\n"
        "Every day at 4pm IST I'll scream CHAI TIME in this chat.\n"
        "May the kettle be ever in your favor. 🫖",
        parse_mode="Markdown",
    )


async def daily_chai_ping(context: ContextTypes.DEFAULT_TYPE):
    # v1: chat tracking comes next; for now just log the ping
    log.info("chai ping: %s", random.choice(PINGS))


def main():
    if not BOT_TOKEN:
        raise SystemExit("Set TELEGRAM_BOT_TOKEN first.")
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.job_queue.run_daily(daily_chai_ping, time=time(16, 0, tzinfo=IST))
    log.info("☕ Chai-O'Clock is live. 4pm IST, no mercy.")
    app.run_polling()


if __name__ == "__main__":
    main()
