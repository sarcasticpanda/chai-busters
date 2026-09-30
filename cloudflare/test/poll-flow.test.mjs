import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const workerSource = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");
const workerUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(workerSource)}`;
const { default: worker } = await import(workerUrl);

class MemoryD1 {
  events = new Map();
  polls = new Map();
  votes = new Map();

  prepare(sql) {
    const db = this;
    let args = [];
    const keyForEvent = (chatId, userId, day) => `${chatId}|${userId}|${day}`;
    return {
      bind(...values) {
        args = values;
        return this;
      },
      async first() {
        if (sql.includes("SELECT cups, base_cups FROM chai_events")) {
          return db.events.get(keyForEvent(...args)) || null;
        }
        if (sql.includes("SELECT COALESCE(SUM(v.wants_chai)")) {
          const [, brewerId, day] = args;
          const cups = [...db.polls.values()]
            .filter((poll) => poll.chat_id === String(args[0]) && poll.brewer_id === String(brewerId) && poll.day === day)
            .reduce((sum, poll) => sum + [...(db.votes.get(poll.poll_id)?.values() || [])].reduce((n, vote) => n + vote.wants_chai, 0), 0);
          return { cups };
        }
        if (sql.includes("SELECT poll_id, chat_id, brewer_id, day FROM chai_polls")) {
          const poll = db.polls.get(args[0]);
          return poll?.status === "open" ? poll : null;
        }
        if (sql.includes("SELECT poll_id, chat_id, brewer_id, brewer_name, day FROM chai_polls")) {
          const poll = db.polls.get(args[0]);
          return poll?.status === "open" ? poll : null;
        }
        if (sql.includes("SELECT cups FROM chai_events")) {
          return db.events.get(keyForEvent(...args)) || null;
        }
        return null;
      },
      async all() {
        return { results: [] };
      },
      async run() {
        if (sql.startsWith("INSERT INTO chai_events")) {
          const [chat_id, user_id, user_name, day, month] = args;
          const isBrewStart = sql.includes("VALUES (?, ?, ?, ?, ?, 1, 1)");
          const cups = isBrewStart ? 1 : args[5];
          const base_cups = isBrewStart ? 1 : args[6];
          const key = keyForEvent(chat_id, user_id, day);
          const current = db.events.get(key);
          if (current) {
            current.user_name = user_name;
            current.month = month;
            if (sql.includes("base_cups")) {
              current.cups = Number(cups);
              current.base_cups = Number(base_cups);
            }
          } else {
            db.events.set(key, { chat_id, user_id, user_name, day, month, cups: Number(cups), base_cups: Number(base_cups ?? cups) });
          }
        } else if (sql.startsWith("INSERT INTO chai_polls")) {
          const [poll_id, chat_id, brewer_id, brewer_name, day, month, message_id] = args;
          db.polls.set(poll_id, { poll_id, chat_id, brewer_id, brewer_name, day, month, message_id, status: "open" });
        } else if (sql.startsWith("INSERT INTO chai_poll_votes")) {
          const [pollId, voterId, wantsChai] = args;
          const votes = db.votes.get(pollId) || new Map();
          votes.set(voterId, { wants_chai: Number(wantsChai) });
          db.votes.set(pollId, votes);
        } else if (sql.startsWith("UPDATE chai_events SET cups=base_cups")) {
          const [chatId, brewerId, day] = args;
          const event = db.events.get(keyForEvent(chatId, brewerId, day));
          if (event) {
            const pollCups = [...db.polls.values()]
              .filter((poll) => poll.chat_id === chatId && poll.brewer_id === brewerId && poll.day === day)
              .reduce((sum, poll) => sum + [...(db.votes.get(poll.poll_id)?.values() || [])].reduce((n, vote) => n + vote.wants_chai, 0), 0);
            event.cups = event.base_cups + pollCups;
          }
        } else if (sql.startsWith("UPDATE chai_polls SET status='closed'")) {
          const poll = db.polls.get(args[0]);
          if (poll) poll.status = "closed";
        }
        return { success: true };
      },
    };
  }
}

const telegramCalls = [];
globalThis.fetch = async (url, options) => {
  const method = String(url).split("/").at(-1);
  const payload = JSON.parse(options.body);
  telegramCalls.push({ method, payload });
  const result = method === "getChatMemberCount"
    ? 3
    : method === "sendPoll"
      ? { poll: { id: "test-poll-1" }, message_id: 45 }
      : { message_id: 46 };
  return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
};

const DB = new MemoryD1();
const env = { DB, TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_BOT_USERNAME: "chai_test_bot", WEBHOOK_SECRET: "test-secret" };
const group = { id: -100123, type: "supergroup", title: "Chai test" };
async function update(body) {
  const pending = [];
  const response = await worker.fetch(new Request("https://example.test/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": env.WEBHOOK_SECRET },
    body: JSON.stringify(body),
  }), env, { waitUntil: (promise) => pending.push(promise) });
  assert.equal(response.status, 200);
  await Promise.all(pending);
}

await update({ update_id: 1, message: { chat: group, from: { id: 10, first_name: "Brewer" }, text: "/chai" } });
const event = [...DB.events.values()][0];
assert.equal(event.cups, 1, "brewer is counted exactly once when the poll starts");
const pollCall = telegramCalls.find((call) => call.method === "sendPoll");
assert.ok(pollCall, "/chai sends a Telegram poll");
assert.equal(pollCall.payload.is_anonymous, false, "voter identity is available for accounting");
assert.equal(pollCall.payload.open_period, 600, "poll closes after ten minutes");

await update({ update_id: 2, poll_answer: { poll_id: "test-poll-1", user: { id: 11 }, option_ids: [0] } });
assert.equal(event.cups, 2, "one Haan adds one cup to the brewer");
await update({ update_id: 3, poll_answer: { poll_id: "test-poll-1", user: { id: 11 }, option_ids: [0] } });
assert.equal(event.cups, 2, "duplicate update is idempotent");
await update({ update_id: 4, poll_answer: { poll_id: "test-poll-1", user: { id: 11 }, option_ids: [1] } });
assert.equal(event.cups, 1, "changing to Nahi removes the extra cup");
await update({ update_id: 5, poll_answer: { poll_id: "test-poll-1", user: { id: 12 }, option_ids: [0] } });
await update({ update_id: 6, poll_answer: { poll_id: "test-poll-1", user: { id: 10 }, option_ids: [0] } });
assert.equal(event.cups, 2, "brewer cannot add a second cup by voting on their own poll");
await update({ update_id: 7, poll: { id: "test-poll-1", is_closed: true } });
assert.equal(DB.polls.get("test-poll-1").status, "closed");
await update({ update_id: 8, poll_answer: { poll_id: "test-poll-1", user: { id: 11 }, option_ids: [0] } });
assert.equal(event.cups, 2, "closed poll no longer changes the score");
await update({ update_id: 9, callback_query: { id: "old-button", from: { id: 11 }, data: "chai_brew:2", message: { chat: group, message_id: 20 } } });
assert.match(telegramCalls.findLast((call) => call.method === "answerCallbackQuery").payload.text, /retired/i, "stale button explains the new flow");
await update({ update_id: 10, message: { chat: group, from: { id: 11, first_name: "Voter" }, text: "/banao" } });
assert.match(telegramCalls.findLast((call) => call.method === "sendMessage").payload.text, /\/chai/, "old command redirects to the poll flow");

console.log("Poll flow tests passed: votes are idempotent; old buttons and /banao redirect cleanly.");
