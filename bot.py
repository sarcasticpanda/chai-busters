"""Chai-O'Clock bot: screams CHAI TIME at 4pm IST, tracks who brews."""

import logging
import os
import random
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from db import (
    already_logged_today,
    all_chats,
    init_db,
    log_chai,
    last_champion,
    monthly_leaderboard,
    record_champion,
    upsert_chat,
)

IST = ZoneInfo("Asia/Kolkata")
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")


def _md_escape(text: str) -> str:
    """Escape user-controlled text for Telegram's legacy Markdown parse mode.

    First names and chat titles are fully user-controlled; without escaping,
    a name like "*hacker*" would inject formatting into every bot message.

    Names are stored RAW in the database and escaped only here, at render
    time — never escape before storing, or you'll double-escape.
    """
    return (
        (text or "")
        .replace("\\", "\\\\")
        .replace("*", "\\*")
        .replace("_", "\\_")
        .replace("`", "\\`")
        .replace("[", "\\[")
    )

from messages import (
    ALREADY_LOGGED,
    CHAI_PINGS,
    CHAI_PRAISE,
    LEADERBOARD_EMPTY,
    CHAMPION_ANNOUNCEMENTS,
    WEEKLY_ROASTS,
)

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
    # Store the RAW name. Escaping happens at render time only (_md_escape),
    # otherwise names get double-escaped in the leaderboard.
    raw_name = (user.first_name or "mystery human").strip()
    day = now_ist().strftime("%Y-%m-%d")
    chat_id = update.effective_chat.id
    if already_logged_today(chat_id, user.id, day):
        await update.message.reply_text(
            random.choice(ALREADY_LOGGED).format(name=_md_escape(raw_name))
        )
    else:
        log_chai(chat_id, user.id, raw_name, day)
        await update.message.reply_text(
            random.choice(CHAI_PRAISE).format(name=_md_escape(raw_name))
        )


async def leaderboard_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await track_chat(update)
    month = now_ist().strftime("%Y-%m")
    board = monthly_leaderboard(update.effective_chat.id, month)
    if not board:
        await update.message.reply_text(random.choice(LEADERBOARD_EMPTY))
        return
    medals = ["🥇", "🥈", "🥉"]
    lines = [f"☕ *Chai Leaderboard — {month}*"]
    for i, (name, count, _uid) in enumerate(board[:10]):
        medal = medals[i] if i < 3 else f"{i + 1}."
        lines.append(f"{medal} {name} — {count} chai{'s' if count != 1 else ''}")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def champion_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await track_chat(update)
    champ = last_champion(update.effective_chat.id)
    if not champ:
        await update.message.reply_text(
            "No champion crowned yet. The first crowning happens at the end of this month. 👑"
        )
        return
    month, name, count = champ
    await update.message.reply_text(
        f"👑 *Reigning Chai Champion — {month}*\n*{name}* with {count} chais. All hail. ☕",
        parse_mode="Markdown",
    )


async def weekly_roast(context: ContextTypes.DEFAULT_TYPE):
    month = now_ist().strftime("%Y-%m")
    for chat_id in all_chats():
        board = monthly_leaderboard(chat_id, month)
        if not board:
            msg = random.choice(LEADERBOARD_EMPTY)
        else:
            name, count, _uid = board[0]
            msg = random.choice(WEEKLY_ROASTS).format(top=name, count=count)
        try:
            await context.bot.send_message(chat_id=chat_id, text=msg, parse_mode="Markdown")
        except Exception as e:
            log.warning("weekly roast failed for %s: %s", chat_id, e)


async def maybe_crown_champion(context: ContextTypes.DEFAULT_TYPE):
    """Run near midnight; if tomorrow is a new month, crown this month's champion."""
    today = now_ist().date()
    if (today + timedelta(days=1)).month == today.month:
        return
    month = today.strftime("%Y-%m")
    for chat_id in all_chats():
        board = monthly_leaderboard(chat_id, month)
        if not board:
            continue
        name, count, user_id = board[0]
        record_champion(chat_id, month, user_id, name, count)
        msg = random.choice(CHAMPION_ANNOUNCEMENTS).format(
            month=month, name=_md_escape(name), count=count
        )
        try:
            await context.bot.send_message(chat_id=chat_id, text=msg, parse_mode="Markdown")
        except Exception as e:
            log.warning("champion crowning failed for %s: %s", chat_id, e)


async def daily_chai_ping(context: ContextTypes.DEFAULT_TYPE):
    msg = random.choice(CHAI_PINGS)
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
    app.add_handler(CommandHandler("leaderboard", leaderboard_cmd))
    app.add_handler(CommandHandler("champion", champion_cmd))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    jq = app.job_queue
    jq.run_daily(daily_chai_ping, time=time(16, 0, tzinfo=IST))          # 4pm IST chai time
    jq.run_daily(weekly_roast, time=time(21, 0, tzinfo=IST), days=(6,))  # Sunday roast
    jq.run_daily(maybe_crown_champion, time=time(23, 55, tzinfo=IST))     # month-end crowning
    log.info("☕ Chai-O'Clock is live. 4pm IST, no mercy.")
    app.run_polling()


if __name__ == "__main__":
    main()
