import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workerUrl = "https://chai-busters.kadakchai-panda.workers.dev";
const projectDirectory = fileURLToPath(new URL(".", import.meta.url));
const token = readFileSync(new URL(".telegram-token", import.meta.url), "utf8").trim();

if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
  throw new Error("The local Telegram token is missing or invalid.");
}

const webhookSecret = randomBytes(32).toString("hex");
const secretUpload = process.platform === "win32"
  ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npx wrangler secret put WEBHOOK_SECRET"], {
      cwd: projectDirectory,
      input: `${webhookSecret}\n`,
      encoding: "utf8",
    })
  : spawnSync("npx", ["wrangler", "secret", "put", "WEBHOOK_SECRET"], {
      cwd: projectDirectory,
      input: `${webhookSecret}\n`,
      encoding: "utf8",
    });

if (secretUpload.status !== 0) {
  throw new Error(`Cloudflare did not store the webhook secret (${secretUpload.error?.message ?? secretUpload.stderr?.trim() ?? "unknown error"}).`);
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${workerUrl}/webhook`,
    secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query", "poll_answer", "poll"],
  }),
});
const result = await response.json();
if (!response.ok || !result.ok) {
  throw new Error("Telegram rejected the webhook connection.");
}

console.log("Telegram webhook connected successfully.");
