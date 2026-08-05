"""Chai-O'Clock bot: screams CHAI TIME at 4pm IST, tracks who brews."""

import logging
import os
import random
from datetime import datetime, time
from zoneinfo import ZoneInfo

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from db import already_logged_today, all_chats, init_db, log_chai, upsert_chat

IST = ZoneInfo("Asia/Kolkata")
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")

PINGS = [
    "☕ *CHAI O'CLOCK!* It's 4pm IST. Who's making chai? Reply `+chai` once brewed.",
    "🚨 *CHAI EMERGENCY DRILL* All members report to the kitchen. Reply `+chai` once brewed.",
]

PRAISE = [
    "☕ *{name} made chai!* The nation salutes you. 🫡",
    "{name} has brewed chai. Productivity +200%. ☕⚡",
]

ALREADY = [
    "{name}, we already counted your chai today. One per day, calm down. 😤",
]

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("chai-oclock")


def now_ist():
    return datetime.now(IST)


async def track_chat(update: Update):
    chat = update.effective_chat
    if chat:
        upsert_chat(chat.id, chat.title or chat.first_name or "DM")


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await track_chat(update)
    await update.message.reply_text(
        "☕ *Chai-O'Clock Bot* reporting for duty!\n\n"
        "Every day at 4pm IST I'll scream CHAI TIME in this chat.\n"
        "When you make chai, send `+chai` and I'll track it.\n\n"
        "May the kettle be ever in your favor. 🫖",
        parse_mode="Markdown",
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await track_chat(update)
    if not update.message or not update.message.text:
        return
    if "+chai" not in update.message.text.lower():
        return
    user = update.effective_user
    name = (user.first_name or "mystery human").strip()
    day = now_ist().strftime("%Y-%m-%d")
    chat_id = update.effective_chat.id
    if already_logged_today(chat_id, user.id, day):
        await update.message.reply_text(random.choice(ALREADY).format(name=name))
    else:
        log_chai(chat_id, user.id, name, day)
        await update.message.reply_text(random.choice(PRAISE).format(name=name))


async def daily_chai_ping(context: ContextTypes.DEFAULT_TYPE):
    msg = random.choice(PINGS)
    for chat_id in all_chats():
        try:
            await context.bot.send_message(chat_id=chat_id, text=msg, parse_mode="Markdown")
        except Exception as e:
            log.warning("chai ping failed for %s: %s", chat_id, e)


def main():
    if not BOT_TOKEN:
        raise SystemExit("Set TELEGRAM_BOT_TOKEN first.")
    init_db()
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.job_queue.run_daily(daily_chai_ping, time=time(16, 0, tzinfo=IST))
    log.info("☕ Chai-O'Clock is live. 4pm IST, no mercy.")
    app.run_polling()


if __name__ == "__main__":
    main()
