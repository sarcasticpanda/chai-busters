# ☕ Chai-O'Clock Bot

A deeply unserious Telegram bot that screams **CHAI TIME** at 4pm IST every day,
tracks who actually brews, roasts the slackers weekly, and crowns a monthly
**Chai Champion**. 👑

## What it does

- **4:00pm IST daily** — pings the group: it's chai o'clock, who's brewing?
- **`+chai`** — anyone replies `+chai` when their chai is made; the bot logs it (once per person per day, no cheating)
- **`/leaderboard`** — this month's chai standings with medals
- **`/champion`** — last crowned Chai Champion
- **Sunday 9pm IST** — weekly roast of the group's brewing habits
- **Month-end 11:55pm IST** — crowns the Chai Champion 👑

## Setup (5 minutes)

### 1. Create the bot
1. Open Telegram, chat with **@BotFather**
2. Send `/newbot`, pick a name + username (e.g. `chai_o_clock_bot`)
3. Copy the **token** BotFather gives you
4. Send `/setprivacy` to BotFather → select your bot → **Disable** — so it can see `+chai` replies in groups (commands work either way)
5. Add your bot to your group chat and send `/start`

### 2. Run locally
```bash
cd chai-oclock
pip install -r requirements.txt
export TELEGRAM_BOT_TOKEN=<redacted>
python bot.py
```

### 3. Deploy free on Railway
1. Push this folder to a GitHub repo
2. Railway → **New Project → Deploy from GitHub**
3. Set **Start Command** to `python bot.py`
4. Add env var: `TELEGRAM_BOT_TOKEN` = your token
5. (Optional) Add a **Volume** mounted at `/data` and set `DATABASE_PATH=/data/chai.db` so the leaderboard survives redeploys

That's it. At 4pm IST tomorrow, your group gets yelled at. ☕
