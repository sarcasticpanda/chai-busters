# 5 New Silly Automation Topics

Fresh ideas in the same spirit as Chai-O'Clock. Each one is a small Telegram bot:
one file of personality, one tiny database, one daily ritual.

---

## 1. Samosa O'Clock 🥟
The 5pm sequel to Chai-O'Clock. Every day at 5pm IST the bot demands to know
who is frying samosas. Log with `+samosa`, climb the monthly leaderboard, and
get crowned **Samosa Sultan** at month end.

- Commands: `/start`, `/leaderboard`, `/sultan`
- Log trigger: `+samosa` (one per user per day)
- Rituals: 5pm IST samosa roll call, Sunday "snack report" roast

## 2. Standup Roast Bot 📋🔥
Daily standup, but the bot has no mercy. At 10am IST it pings the group for
standup updates. Anyone who posts after 10:30am gets publicly roasted.
Tracks streaks of on-time standups.

- Commands: `/start`, `/streak`, `/late`
- Log trigger: any message starting with `standup:` before 10:30am
- Rituals: 10am IST standup call, 10:31am late-list roast

## 3. Meeting Bingo 🎯
Generates a buzzword bingo card for every meeting ("synergy", "circle back",
"low-hanging fruit"...). React to messages with the buzzword to mark your card.
First to complete a row wins and the bot announces it dramatically.

- Commands: `/start`, `/card`, `/board`
- Log trigger: reply with the buzzword to mark it
- Rituals: new card every Monday 9am IST, Friday winners ceremony

## 4. Deploy Dance Party 🚀🎉
Celebrates every production deploy. Post `+deploy` with a version tag and the
bot throws a confetti party in chat, tracks deploy streaks, and crowns a
monthly **Ship-It Champion**. Failed deploys get a dramatic funeral.

- Commands: `/start`, `/streak`, `/ships`
- Log trigger: `+deploy v1.2.3` (or `+deployfail` for the funeral)
- Rituals: instant party on every deploy, month-end Ship-It Champion

## 5. Procrastination Police 🚔⏱️
A Pomodoro focus timer with attitude. Start a 25-minute focus session with
`/focus`; if you send any non-work message before the timer ends, the bot
calls you out. Complete sessions earn "Deep Work" points.

- Commands: `/start`, `/focus`, `/points`
- Log trigger: `/focus` starts timer; any chat message during focus = busted
- Rituals: hourly "focus check" during work hours, daily deep-work leaderboard

---

## How to build one

1. Copy `bot.py`, `db.py`, `messages.py` from Chai-O'Clock.
2. Rewrite `messages.py` — that's where 90% of the personality lives.
3. Change the schedule times and the log trigger in `bot.py`.
4. Keep the same security rules: escape user names for Markdown, use
   parameterized SQL, keep the token in `TELEGRAM_BOT_TOKEN`.

All five follow the exact same shape as the original, so the vulnerability
fixes in Chai-O'Clock (Markdown escaping, parameterized queries, pinned
dependencies) apply to every new topic automatically.
