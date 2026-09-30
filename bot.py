"""Chai Busters bot: screams CHAI TIME at 4pm IST, tracks who brews."""

import logging
import os
import random
import re
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from telegram import Update
from telegram.error import TelegramError
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
    daily_brewers,
    init_db,
    log_chai,
    last_champion,
    monthly_leaderboard,
    monthly_group_stats,
    record_champion,
    update_chai_cups,
    upsert_chat,
)

IST = ZoneInfo("Asia/Kolkata")
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
BOT_USERNAME = os.environ.get("TELEGRAM_BOT_USERNAME", "Kadak_chai_ahhh_bot").lstrip("@")
BOT_LINK = f"https://t.me/{BOT_USERNAME}"


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
# Keep the bot token out of logs: httpx logs full request URLs (which embed
# the token) at INFO level. Silence it to WARNING and above.
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("chai-busters")


def now_ist():
    return datetime.now(IST)


def is_group_chat(update: Update) -> bool:
    chat = update.effective_chat
    return bool(chat and chat.type in {"group", "supergroup"})


async def track_chat(update: Update):
    chat = update.effective_chat
    # Record group chats only. A private /start should not enrol someone in
    # daily broadcasts.
    if is_group_chat(update):
        upsert_chat(chat.id, chat.title or chat.first_name or "DM")


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_group_chat(update):
        await update.message.reply_text(
            "☕ Add me to a Telegram group, then send /start there. "
            "That is where I keep the chai score."
        )
        return
    await track_chat(update)
    await update.message.reply_text(
        "☕ *Chai Busters* reporting for duty!\n\n"
        "Every day at 4pm IST I'll scream CHAI TIME in this chat.\n"
        "When you make chai, send `+chai` or `+chai 4` and I'll track it.\n\n"
        f"Find me here: {BOT_LINK}\n"
        "May the kettle be ever in your favor. 🫖",
        parse_mode="Markdown",
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_group_chat(update):
        return
    await track_chat(update)
    if not update.message or not update.message.text:
        return
    # Require the complete action, so normal conversation containing '+chai'
    # cannot create a score entry. An optional number is today's total cups.
    match = re.fullmatch(r"\s*\+chai(?:\s+([1-9]\d{0,2}))?\s*[!.?]*\s*", update.message.text)
    if not match:
        return
    user = update.effective_user
    # Store the RAW name. Escaping happens at render time only (_md_escape),
    # otherwise names get double-escaped in the leaderboard.
    raw_name = (user.first_name or "mystery human").strip() or "mystery human"
    day = now_ist().strftime("%Y-%m-%d")
    chat_id = update.effective_chat.id
    cups = int(match.group(1) or 1)
    # A chai round is for the people in this group. A fallback keeps the bot
    # usable if Telegram's member-count API is temporarily unavailable.
    try:
        group_size = await context.bot.get_chat_member_count(chat_id)
    except TelegramError:
        group_size = 100
    if cups > group_size:
        await update.message.reply_text(
            f"This group currently has {group_size} members, so chai servings must be between 1 and {group_size}."
        )
        return
    if already_logged_today(chat_id, user.id, day):
        if match.group(1):
            previous_cups = update_chai_cups(chat_id, user.id, day, cups)
            if previous_cups != cups:
                await update.message.reply_text(
                    f"☕ *{_md_escape(raw_name)}* updated today's chai total: "
                    f"{previous_cups} → {cups} cups. One brew round recorded.",
                    parse_mode="Markdown",
                )
                return
        await update.message.reply_text(
            random.choice(ALREADY_LOGGED).format(name=_md_escape(raw_name)),
            parse_mode="Markdown",
        )
    else:
        log_chai(chat_id, user.id, raw_name, day, cups)
        await update.message.reply_text(
            f"☕ *{_md_escape(raw_name)}* logged 1 brew round and {cups} "
            f"cup{'s' if cups != 1 else ''}.",
            parse_mode="Markdown",
        )


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "☕ *Chai Busters commands*\n\n"
        "`+chai` or `+chai 4` — log today's total cups\n"
        "`/today` — see today's brewers and cups\n"
        "`/groupstats` — see group chai hisaab\n"
        "`/leaderboard` — see this month's scores\n"
        "`/champion` — see the reigning champion\n\n"
        "Use scoring commands in a group chat.",
        parse_mode="Markdown",
    )


async def today_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_group_chat(update):
        await update.message.reply_text("☕ Use /today in a group chat.")
        return
    await track_chat(update)
    day = now_ist().strftime("%Y-%m-%d")
    brewers = daily_brewers(update.effective_chat.id, day)
    if not brewers:
        await update.message.reply_text("No chai logged today yet. The kettle is waiting. ☕")
        return
    names = "\n".join(
        f"• {_md_escape(name)} — {cups} cup{'s' if cups != 1 else ''}"
        for name, cups in brewers
    )
    await update.message.reply_text(
        f"☕ *Today's chai crew*\n{names}", parse_mode="Markdown"
    )


async def leaderboard_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_group_chat(update):
        await update.message.reply_text("☕ Use /leaderboard in a group chat.")
        return
    await track_chat(update)
    month = now_ist().strftime("%Y-%m")
    board = monthly_leaderboard(update.effective_chat.id, month)
    if not board:
        await update.message.reply_text(random.choice(LEADERBOARD_EMPTY))
        return
    medals = ["🥇", "🥈", "🥉"]
    lines = [f"☕ *Chai Busters Leaderboard — {month}*"]
    for i, (name, brew_rounds, cups, _uid) in enumerate(board[:10]):
        medal = medals[i] if i < 3 else f"{i + 1}."
        lines.append(
            f"{medal} {_md_escape(name)} — {cups} cups · {brew_rounds} brew "
            f"round{'s' if brew_rounds != 1 else ''}"
        )
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def groupstats_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_group_chat(update):
        await update.message.reply_text("☕ Use /groupstats in a group chat.")
        return
    await track_chat(update)
    chat_id = update.effective_chat.id
    month = now_ist().strftime("%Y-%m")
    rounds, brewers, cups = monthly_group_stats(chat_id, month)
    try:
        members = await context.bot.get_chat_member_count(chat_id)
        member_line = f"Group members: *{members}*\n"
    except TelegramError:
        member_line = "Group members: unavailable right now\n"
    await update.message.reply_text(
        f"📊 *Chai hisaab — {month}*\n"
        f"{member_line}"
        f"Active brewers: *{brewers}*\n"
        f"Brew rounds: *{rounds}*\n"
        f"Total cups: *{cups}*",
        parse_mode="Markdown",
    )


async def champion_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_group_chat(update):
        await update.message.reply_text("☕ Use /champion in a group chat.")
        return
    await track_chat(update)
    champ = last_champion(update.effective_chat.id)
    if not champ:
        await update.message.reply_text(
            "No champion crowned yet. The first crowning happens at the end of this month. 👑"
        )
        return
    month, name, cups = champ
    await update.message.reply_text(
        f"👑 *Reigning Chai Champion — {month}*\n*{_md_escape(name)}* with {cups} cups. All hail. ☕",
        parse_mode="Markdown",
    )


async def weekly_roast(context: ContextTypes.DEFAULT_TYPE):
    month = now_ist().strftime("%Y-%m")
    for chat_id in all_chats():
        board = monthly_leaderboard(chat_id, month)
        if not board:
            msg = random.choice(LEADERBOARD_EMPTY)
        else:
            name, _rounds, cups, _uid = board[0]
            msg = random.choice(WEEKLY_ROASTS).format(top=_md_escape(name), count=cups)
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
        name, _rounds, cups, user_id = board[0]
        record_champion(chat_id, month, user_id, name, cups)
        msg = random.choice(CHAMPION_ANNOUNCEMENTS).format(
            month=month, name=_md_escape(name), count=cups
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
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("today", today_cmd))
    app.add_handler(CommandHandler("groupstats", groupstats_cmd))
    app.add_handler(CommandHandler("leaderboard", leaderboard_cmd))
    app.add_handler(CommandHandler("champion", champion_cmd))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    jq = app.job_queue
    jq.run_daily(daily_chai_ping, time=time(16, 0, tzinfo=IST))          # 4pm IST chai time
    jq.run_daily(weekly_roast, time=time(21, 0, tzinfo=IST), days=(6,))  # Sunday roast
    jq.run_daily(maybe_crown_champion, time=time(23, 55, tzinfo=IST))     # month-end crowning
    log.info("☕ Chai Busters are live. 4pm IST, no mercy.")
    app.run_polling()


if __name__ == "__main__":
    main()
