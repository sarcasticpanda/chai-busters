const IST = "Asia/Kolkata";
const FALLBACK_MAX_CUPS = 100;

const DAILY_PINGS = [
  "☕ *CHAI BUSTERS ROLL CALL!*\nIt's 4pm IST. Who's making chai?\nReply `+chai` or `+chai 4` once it is brewed.",
  "🚨 *KADAK CHAI EMERGENCY*\nThe kettle is waiting. Reply `+chai` or `+chai 4` with today's total cups.",
  "4pm IST = chai time. Brew it, log it, own the leaderboard. `+chai 4`",
];

const WEEKLY_ROASTS = [
  "📊 *Weekly chai report:*\n{top} leads with {cups} cups. The rest of you: please find the kettle.",
  "📊 *Weekly chai report:*\n{top} carried this group with {cups} cups. Respectfully, everyone else needs to step up.",
];

const CHAMPION_MESSAGES = [
  "👑 *{month} ke Chai Champion!*\n*{name}* ne {cups} cups banaaye. Kettle ka taaj inke naam. ☕",
  "🏆 *Final hisaab — {month}*\n{name} {cups} cups ke saath champion. Baaki sab agli chai pe comeback karna.",
];

const CHAI_JOKES = [
  "Chai ne poocha: tum itne kadak kyun ho? Maine kaha: Monday se training chal rahi hai. ☕",
  "Adrak chai aur group gossip mein kya common hai? Dono jitni der ublein, utna mazaa. 😌",
  "Kettle ka life motto: seeti maaro, pressure mat lo. 🫖",
];

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\*/g, "\\*").replace(/_/g, "\\_").replace(/`/g, "\\`").replace(/\[/g, "\\[");
}

function istParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { day: `${values.year}-${values.month}-${values.day}`, month: `${values.year}-${values.month}` };
}

function isGroup(chat) {
  return chat && (chat.type === "group" || chat.type === "supergroup");
}

function commandFrom(text) {
  const match = String(text || "").match(/^\/([a-z]+)(?:@[A-Za-z0-9_]+)?(?:\s|$)/i);
  return match ? match[1].toLowerCase() : null;
}

async function telegram(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram ${method} failed`);
  }
  return data.result;
}

async function reply(env, chatId, text, markdown = false) {
  const payload = { chat_id: chatId, text, disable_web_page_preview: true };
  if (markdown) payload.parse_mode = "Markdown";
  return telegram(env, "sendMessage", payload);
}

async function registerChat(env, chat) {
  await env.DB.prepare(
    "INSERT INTO chats (chat_id, title) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET title=excluded.title"
  ).bind(String(chat.id), chat.title || "Telegram group").run();
}

async function memberCount(env, chatId) {
  try {
    // Telegram includes this bot in the count; it is not a chai-drinking member.
    return Math.max(0, Number(await telegram(env, "getChatMemberCount", { chat_id: chatId })) - 1);
  } catch {
    return FALLBACK_MAX_CUPS;
  }
}

async function handleChai(env, message) {
  const chat = message.chat;
  if (!isGroup(chat)) return;
  const match = String(message.text || "").match(/^\s*\+chai(?:\s+([1-9]\d{0,5}))?\s*[!.?]*\s*$/i);
  if (!match) return;

  await registerChat(env, chat);
  const cups = Number(match[1] || 1);
  const maxCups = await memberCount(env, chat.id);
  if (cups > maxCups) {
    await reply(env, chat.id, `Arre, is group mein ${maxCups} human chai-peene-waale hain (bot ko count nahi kiya 😌). 1 se ${maxCups} cups ke beech likho.`);
    return;
  }

  const user = message.from || {};
  const name = String(user.first_name || "mystery human").trim() || "mystery human";
  const { day, month } = istParts();
  const existing = await env.DB.prepare(
    "SELECT cups, base_cups FROM chai_events WHERE chat_id=? AND user_id=? AND day=?"
  ).bind(String(chat.id), String(user.id), day).first();

  if (existing) {
    if (!match[1]) {
      await reply(env, chat.id, `${escapeMarkdown(name)}, tumhari chai ka hisaab aaj ho chuka hai. Total badla hai toh \`+chai 4\` bhejo; warna kettle ko bhi aaram do. ☕`, true);
      return;
    }
    const pollCups = await pollCupCount(env, chat.id, user.id, day);
    if (cups < pollCups + 1) {
      await reply(env, chat.id, `Tumhari chai poll mein ${pollCups} log haan bol chuke hain, aur tumhara apna cup bhi count hai. Total kam se kam ${pollCups + 1} hi rahega ☕`);
      return;
    }
    if (Number(existing.cups) === cups) {
      await reply(env, chat.id, `${escapeMarkdown(name)}, aaj ka total pehle se ${cups} cups hai. Ek hi chai ko do baar credit nahi milega 😄`, true);
      return;
    }
    await env.DB.prepare(
      "UPDATE chai_events SET base_cups=?, cups=? WHERE chat_id=? AND user_id=? AND day=?"
    ).bind(cups - pollCups, cups, String(chat.id), String(user.id), day).run();
    await reply(env, chat.id, `☕ *${escapeMarkdown(name)}* ka aaj ka total ${existing.cups} se ${cups} cups ho gaya. Ek brew round pakka. Hisaab update!`, true);
    return;
  }

  await env.DB.prepare(
    "INSERT INTO chai_events (chat_id, user_id, user_name, day, month, cups, base_cups) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(String(chat.id), String(user.id), name, day, month, cups, cups).run();
  await reply(env, chat.id, `☕ *${escapeMarkdown(name)}* ne ${cups} cup${cups === 1 ? "" : "s"} aur 1 brew round log kiya. Group ka chai hero spotted! 🫡`, true);
}

async function pollCupCount(env, chatId, brewerId, day) {
  const result = await env.DB.prepare(
    "SELECT COALESCE(SUM(v.wants_chai), 0) AS cups FROM chai_poll_votes v JOIN chai_polls p ON p.poll_id=v.poll_id WHERE p.chat_id=? AND p.brewer_id=? AND p.day=?"
  ).bind(String(chatId), String(brewerId), day).first();
  return Number(result?.cups || 0);
}

async function ensureBrewEvent(env, chat, user, name, day, month) {
  await env.DB.prepare(
    "INSERT INTO chai_events (chat_id, user_id, user_name, day, month, cups, base_cups) VALUES (?, ?, ?, ?, ?, 1, 1) ON CONFLICT(chat_id, user_id, day) DO UPDATE SET user_name=excluded.user_name, month=excluded.month"
  ).bind(String(chat.id), String(user.id), name, day, month).run();
}

async function startChaiPoll(env, message) {
  const chat = message.chat;
  if (!isGroup(chat)) {
    await reply(env, chat.id, "Chai poll group mein hi chalega — mujhe apne group mein add karke /chai dabao ☕");
    return;
  }
  await registerChat(env, chat);
  const user = message.from || {};
  const brewerId = String(user.id || "");
  if (!brewerId) return;
  const name = String(user.first_name || "Chai dost").trim() || "Chai dost";
  const { day, month } = istParts();
  await ensureBrewEvent(env, chat, user, name, day, month);
  const sent = await telegram(env, "sendPoll", {
    chat_id: chat.id,
    question: `${name} chai bana raha/rahi hai! Kaun piyega?`,
    options: ["Haan, mere liye ek ☕", "Nahi, aaj skip 😌"],
    is_anonymous: false,
    allows_multiple_answers: false,
    open_period: 600,
  });
  await env.DB.prepare(
    "INSERT INTO chai_polls (poll_id, chat_id, brewer_id, brewer_name, day, month, message_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(String(sent.poll.id), String(chat.id), brewerId, name, day, month, sent.message_id).run();
  await reply(env, chat.id, `Poll khul gaya! ${escapeMarkdown(name)} ka ek cup pehle se count hai; har alag “Haan” vote unke aaj ke brewed total mein ek cup jodega. Poll 10 minute mein band hoga ☕`, true);
}

async function handlePollAnswer(env, answer) {
  if (!answer?.poll_id || !answer.user || !Array.isArray(answer.option_ids)) return;
  const poll = await env.DB.prepare(
    "SELECT poll_id, chat_id, brewer_id, day FROM chai_polls WHERE poll_id=? AND status='open'"
  ).bind(String(answer.poll_id)).first();
  if (!poll) return;
  const voterId = String(answer.user.id);
  // The brewer's own cup was added when the poll was created; never count it twice.
  if (voterId === String(poll.brewer_id)) return;
  const wantsChai = answer.option_ids.includes(0) ? 1 : 0;
  await env.DB.prepare(
    "INSERT INTO chai_poll_votes (poll_id, voter_id, wants_chai) VALUES (?, ?, ?) ON CONFLICT(poll_id, voter_id) DO UPDATE SET wants_chai=excluded.wants_chai"
  ).bind(String(answer.poll_id), voterId, wantsChai).run();
  await env.DB.prepare(
    "UPDATE chai_events SET cups=base_cups + (SELECT COALESCE(SUM(v.wants_chai), 0) FROM chai_poll_votes v JOIN chai_polls p ON p.poll_id=v.poll_id WHERE p.chat_id=chai_events.chat_id AND p.brewer_id=chai_events.user_id AND p.day=chai_events.day) WHERE chat_id=? AND user_id=? AND day=?"
  ).bind(String(poll.chat_id), String(poll.brewer_id), poll.day).run();
}

async function handlePollClosed(env, pollUpdate) {
  if (!pollUpdate?.id || !pollUpdate.is_closed) return;
  const poll = await env.DB.prepare(
    "SELECT poll_id, chat_id, brewer_id, brewer_name, day FROM chai_polls WHERE poll_id=? AND status='open'"
  ).bind(String(pollUpdate.id)).first();
  if (!poll) return;
  await env.DB.prepare("UPDATE chai_polls SET status='closed' WHERE poll_id=? AND status='open'")
    .bind(String(pollUpdate.id)).run();
  const total = await env.DB.prepare(
    "SELECT cups FROM chai_events WHERE chat_id=? AND user_id=? AND day=?"
  ).bind(String(poll.chat_id), String(poll.brewer_id), poll.day).first();
  if (total) {
    await reply(env, poll.chat_id, `Poll band! ${escapeMarkdown(poll.brewer_name)} ka aaj ka total: ${total.cups} brewed cup${Number(total.cups) === 1 ? "" : "s"}. Kettle ne hisaab lock kar diya ☕`, true);
  }
}

async function handleCommand(env, message) {
  const chat = message.chat;
  const command = commandFrom(message.text);
  if (!command) return false;

  if (["help", "madad"].includes(command)) {
    await reply(env, chat.id, "☕ *Chai Busters ka menu*\n\n`/chai` — chai poll kholo; tumhara cup auto-count, har Haan vote = brewer ke liye ek cup\n`+chai` — apna brewed cup log karo\n`+chai 4` — aaj ka brewed total 4 set karo\n`/mychai` ya `/mera` — apna personal chai card\n`/today` ya `/aaj` — aaj kisne chai banaayi?\n`/groupstats` ya `/hisab` — group ka poora chai hisaab\n`/leaderboard` ya `/taaj` — iss mahine ka chai champion\n`/champion` ya `/badshah` — pichhle mahine ka taaj\n`/mood` — button dabao, apna chai mood chuno\n`/chutkula` — ek chai wala joke\n`/help` ya `/madad` — yahi menu, dost!", true);
    return true;
  }

  if (!isGroup(chat)) {
    await reply(env, chat.id, "☕ Mujhe apne Telegram group mein add karo, phir wahaan command bhejo. Chai ka hisaab group mein hi chalega.");
    return true;
  }
  await registerChat(env, chat);

  if (command === "start") {
    const username = String(env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
    await reply(env, chat.id, `☕ *Chai Busters haazir hai!*\n\nChai bana rahe ho? /chai se poll kholo; tumhara cup auto-count hoga, aur har Haan voter tumhare brewed total mein judega.\n\`+chai 4\` se aaj ka total set kar sakte ho.\n\`/mera\` se apna chai card, \`/aaj\` se aaj ka scene, aur /taaj se leaderboard.\n\nBot ka adda: https://t.me/${username}`, true);
    return true;
  }

  if (["brew", "banao"].includes(command)) {
    await reply(env, chat.id, "Purana button-wala flow hata diya — ab /chai se real group poll kholo, ya +chai 4 se apna total set karo ☕");
    return true;
  }

  if (command === "chai") {
    await startChaiPoll(env, message);
    return true;
  }

  if (["mood", "chaimood"].includes(command)) {
    await telegram(env, "sendMessage", {
      chat_id: chat.id,
      text: "Aaj chai ka mood kya hai? Neeche tap karke apna order batao 😌",
      reply_markup: { inline_keyboard: [[
        { text: "Kadak ☕", callback_data: "chai_mood:kadak" },
        { text: "Extra adrak 🌶️", callback_data: "chai_mood:adrak" },
        { text: "Cutting chai 🫖", callback_data: "chai_mood:cutting" },
      ]] },
    });
    return true;
  }

  if (["chutkula", "joke"].includes(command)) {
    await reply(env, chat.id, pick(CHAI_JOKES));
    return true;
  }

  const { day, month } = istParts();
  if (["mychai", "mera"].includes(command)) {
    const user = message.from || {};
    const stats = await env.DB.prepare(
      "SELECT COALESCE(SUM(CASE WHEN day=? THEN cups ELSE 0 END), 0) AS today_cups, COALESCE(SUM(CASE WHEN month=? THEN cups ELSE 0 END), 0) AS month_cups, COALESCE(SUM(CASE WHEN month=? THEN 1 ELSE 0 END), 0) AS month_rounds FROM chai_events WHERE chat_id=? AND user_id=?"
    ).bind(day, month, month, String(chat.id), String(user.id)).first();
    const name = escapeMarkdown(user.first_name || "Chai dost");
    const quip = Number(stats.month_cups) > 0
      ? "Kettle tumhe pehchaanne lagi hai 😎"
      : "Abhi tak koi entry nahi. Aaj ki pehli chai tumhare naam?";
    await reply(env, chat.id, `📒 *${name} ka chai card*\nAaj: *${stats.today_cups} cups*\nIss mahine: *${stats.month_cups} cups* · *${stats.month_rounds} brew rounds*\n\n${quip}`, true);
    return true;
  }

  if (["today", "aaj"].includes(command)) {
    const { results } = await env.DB.prepare(
      "SELECT user_name, cups FROM chai_events WHERE chat_id=? AND day=? ORDER BY created_at ASC"
    ).bind(String(chat.id), day).all();
    if (!results.length) {
      await reply(env, chat.id, "Aaj abhi tak chai log nahi hui. Kettle tumhara intezaar kar rahi hai ☕ `+chai` karke entry maaro.");
      return true;
    }
    const rows = results.map((row) => `• ${escapeMarkdown(row.user_name)} — ${row.cups} cup${Number(row.cups) === 1 ? "" : "s"}`);
    await reply(env, chat.id, `☕ *Aaj ki chai gang*\n${rows.join("\n")}`, true);
    return true;
  }

  if (["groupstats", "hisab"].includes(command)) {
    const stats = await env.DB.prepare(
      "SELECT COUNT(*) AS rounds, COUNT(DISTINCT user_id) AS brewers, COALESCE(SUM(cups), 0) AS cups FROM chai_events WHERE chat_id=? AND month=?"
    ).bind(String(chat.id), month).first();
    const members = await memberCount(env, chat.id);
    await reply(env, chat.id, `📊 *Group ka chai hisaab — ${month}*\nChai-peene waale humans: *${members}* (main bot hoon, chai nahi peeta 😌)\nActive chai-makers: *${stats.brewers}*\nBrew rounds: *${stats.rounds}*\nTotal cups: *${stats.cups}*`, true);
    return true;
  }

  if (["leaderboard", "taaj"].includes(command)) {
    const { results } = await env.DB.prepare(
      "SELECT user_name, COUNT(*) AS rounds, SUM(cups) AS cups FROM chai_events WHERE chat_id=? AND month=? GROUP BY user_id, user_name ORDER BY cups DESC, rounds DESC, user_name COLLATE NOCASE LIMIT 10"
    ).bind(String(chat.id), month).all();
    if (!results.length) {
      await reply(env, chat.id, "Iss mahine abhi koi chai entry nahi. Taaj khaali pada hai, dosto! `+chai` se shuruaat karo ☕");
      return true;
    }
    const medals = ["🥇", "🥈", "🥉"];
    const rows = results.map((row, index) => `${medals[index] || `${index + 1}.`} ${escapeMarkdown(row.user_name)} — ${row.cups} cups · ${row.rounds} brew round${Number(row.rounds) === 1 ? "" : "s"}`);
    await reply(env, chat.id, `☕ *Iss mahine ka Chai Taaj — ${month}*\n${rows.join("\n")}\n\nBaaki log: kettle abhi bhi open hai 😄`, true);
    return true;
  }

  if (["champion", "badshah"].includes(command)) {
    const champion = await env.DB.prepare(
      "SELECT month, user_name, cups FROM champions WHERE chat_id=? ORDER BY month DESC LIMIT 1"
    ).bind(String(chat.id)).first();
    await reply(env, chat.id, champion
      ? `👑 *${champion.month} ke Chai Champion!*\n*${escapeMarkdown(champion.user_name)}* ke ${champion.cups} cups. Kettle ka taaj mubaarak ☕`
      : "Abhi tak chai ka taaj kisi ko nahi mila. Mahine ke end tak banaao, phir dekhenge asli chai-baaz kaun hai 👑", true);
    return true;
  }

  return false;
}

async function handleCallback(env, callback) {
  const data = String(callback.data || "");
  if (data.startsWith("chai_brew:")) {
    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Old chai buttons are retired. Use /chai for the new group poll.",
    });
    return;
  }
  if (data.startsWith("chai_mood:")) {
    const moods = {
      kadak: ["Kadak chai", "Kadak choice! Ab biscuit bhi arrange karo 😌☕"],
      adrak: ["Extra adrak", "Adrak extra, drama zero. Approved 🌶️☕"],
      cutting: ["Cutting chai", "Chhoti chai, bade iraade. Cutting gang zindabad 🫖"],
    };
    const [label, response] = moods[data.split(":")[1]] || moods.kadak;
    await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id, text: response });
    if (callback.message) {
      await telegram(env, "editMessageText", {
        chat_id: callback.message.chat.id,
        message_id: callback.message.message_id,
        text: `Aaj ka order: *${label}*. Ab koi kettle chadhaao!`,
        parse_mode: "Markdown",
      });
    }
    return;
  }

}

async function handleUpdate(env, update) {
  if (update.poll_answer) {
    await handlePollAnswer(env, update.poll_answer);
    return;
  }
  if (update.poll) {
    await handlePollClosed(env, update.poll);
    return;
  }
  if (update.callback_query) {
    await handleCallback(env, update.callback_query);
    return;
  }
  const message = update.message;
  if (!message || !message.chat) return;
  if (await handleCommand(env, message)) return;
  await handleChai(env, message);
}

async function sendDailyPing(env) {
  const { results } = await env.DB.prepare("SELECT chat_id FROM chats").all();
  await Promise.allSettled(results.map((chat) => reply(env, chat.chat_id, pick(DAILY_PINGS), true)));
}

async function sendWeeklyRoast(env) {
  const { month } = istParts();
  const { results: chats } = await env.DB.prepare("SELECT chat_id FROM chats").all();
  await Promise.allSettled(chats.map(async (chat) => {
    const top = await env.DB.prepare(
      "SELECT user_name, SUM(cups) AS cups FROM chai_events WHERE chat_id=? AND month=? GROUP BY user_id, user_name ORDER BY cups DESC LIMIT 1"
    ).bind(chat.chat_id, month).first();
    const text = top
      ? pick(WEEKLY_ROASTS).replace("{top}", escapeMarkdown(top.user_name)).replace("{cups}", top.cups)
      : "📊 *Haftay ka chai hisaab:*\nZero cups? Kettle bhi soch rahi hai: group mute pe hai kya? `+chai` likho ☕";
    await reply(env, chat.chat_id, text, true);
  }));
}

async function crownChampions(env) {
  const now = new Date();
  const { month } = istParts(now);
  const tomorrowMonth = istParts(new Date(now.getTime() + 24 * 60 * 60 * 1000)).month;
  if (tomorrowMonth === month) return;
  const { results: chats } = await env.DB.prepare("SELECT chat_id FROM chats").all();
  await Promise.allSettled(chats.map(async (chat) => {
    const top = await env.DB.prepare(
      "SELECT user_id, user_name, SUM(cups) AS cups FROM chai_events WHERE chat_id=? AND month=? GROUP BY user_id, user_name ORDER BY cups DESC, COUNT(*) DESC LIMIT 1"
    ).bind(chat.chat_id, month).first();
    if (!top) return;
    await env.DB.prepare(
      "INSERT INTO champions (chat_id, month, user_id, user_name, cups) VALUES (?, ?, ?, ?, ?) ON CONFLICT(chat_id, month) DO NOTHING"
    ).bind(chat.chat_id, month, top.user_id, top.user_name, top.cups).run();
    const text = pick(CHAMPION_MESSAGES).replace("{month}", month).replace("{name}", escapeMarkdown(top.user_name)).replace("{cups}", top.cups);
    await reply(env, chat.chat_id, text, true);
  }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }
    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return new Response("Not found", { status: 404 });
    }
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    ctx.waitUntil(handleUpdate(env, update).catch((error) => console.error("update failed", error.message)));
    return new Response("OK");
  },

  async scheduled(controller, env, ctx) {
    const task = controller.cron === "30 10 * * *"
      ? sendDailyPing(env)
      : controller.cron === "30 15 * * SUN"
        ? sendWeeklyRoast(env)
        : crownChampions(env);
    ctx.waitUntil(task.catch((error) => console.error("scheduled task failed", error.message)));
  },
};
