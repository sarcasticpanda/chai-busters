# Cloudflare deployment

The production Chai Busters site and Telegram webhook run on one Cloudflare Worker. The Worker uses Cloudflare D1 for group scores and serves the landing page from `site/`.

## Live addresses

- Website and Worker: <https://chai-busters.kadakchai-panda.workers.dev>
- Telegram bot: <https://t.me/Kadak_chai_ahhh_bot>
- Health check: <https://chai-busters.kadakchai-panda.workers.dev/health>

## Connected database

The Cloudflare D1 database is named `chai-busters`. It is connected in `wrangler.jsonc` through the binding `DB`. The migration in `migrations/0001_initial.sql` creates the group, daily chai event, and champion tables.

The Worker stores group IDs, Telegram user IDs and display names, daily totals, and monthly champion results. It does not store the full chat history, use RAG, or call an AI service. Each group has its own scores.

## Publish a code update

Install Node.js, open PowerShell in the `cloudflare` folder, and run:

```powershell
npx wrangler login
npx wrangler deploy
```

The landing page files are uploaded with the Worker. The bot token, webhook secret, D1 database, and scheduled jobs are already configured in Cloudflare. Do not add secrets to `wrangler.jsonc` or Git.

## First-time setup or recovery

1. Log in with `npx wrangler login` from the `cloudflare` folder.
2. If you are creating a new D1 database, run `npx wrangler d1 create chai-busters`, place the returned ID in `wrangler.jsonc`, then run `npx wrangler d1 migrations apply chai-busters --remote`.
3. Store a fresh Telegram token as a Worker secret with `npx wrangler secret put TELEGRAM_BOT_TOKEN`. Paste it only into Wrangler's hidden prompt, never into a source file or Git.
4. Deploy with `npx wrangler deploy`.
5. To generate a new webhook secret and connect Telegram again, make sure `cloudflare/.telegram-token` contains the current token, then run `node rotate-and-connect.mjs`. The script generates the secret privately, stores it in Cloudflare, and registers the webhook with Telegram.

The local `.telegram-token` file is ignored by Git. Keep it private. If the Telegram token is exposed, revoke it with BotFather before updating the Worker secret.

## Add the bot to a group

1. Open <https://t.me/Kadak_chai_ahhh_bot> and add the bot to a Telegram group.
2. Send `/start` in the group.
3. Try `+chai 4`, `/today`, `/groupstats`, and `/leaderboard`.

To let the bot receive plain `+chai` messages, Group Privacy must be disabled for the bot in BotFather. After changing that setting, remove and re-add the bot to an existing group.

## Scheduled messages

Cloudflare runs the daily reminder at 4 PM IST, the weekly report Sunday at 9 PM IST, and the month-end champion check at 11:55 PM IST. These are configured as UTC cron schedules in `wrangler.jsonc`.
