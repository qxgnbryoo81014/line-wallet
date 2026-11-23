// Cloudflare Worker 入口：驗證 LINE 簽章 → 交給 bot → 用 reply API 回覆。

import { handleText } from "./bot";
import { makeD1Store } from "./db";
import { makeAiExtractor } from "./parse";

export interface Env {
  DB: D1Database;
  AI: Ai;
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
}

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method !== "POST") return new Response("ok");

    const body = await req.text();
    const ok = await verifySignature(body, req.headers.get("x-line-signature"), env.LINE_CHANNEL_SECRET);
    if (!ok) return new Response("invalid signature", { status: 401 });

    const { events = [] } = JSON.parse(body) as { events?: LineEvent[] };
    // 先回 200 給 LINE，再在背景處理
    ctx.waitUntil(Promise.all(events.map((e) => handleEvent(e, env))));
    return new Response("ok");
  },
};

async function handleEvent(event: LineEvent, env: Env): Promise<void> {
  const userId = event.source?.userId;
  const text = event.message?.text;
  if (event.type !== "message" || event.message?.type !== "text" || !userId || !text || !event.replyToken) {
    return;
  }

  let reply: string;
  try {
    reply = await handleText(userId, text, {
      store: makeD1Store(env.DB),
      extract: makeAiExtractor(env.AI),
    });
  } catch (err) {
    console.error(err);
    reply = "系統暫時出錯，這筆沒有記下，請稍後再試。";
  }

  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken: event.replyToken, messages: [{ type: "text", text: reply }] }),
  });
  if (!res.ok) console.error("LINE reply failed", res.status, await res.text());
}

/** HMAC-SHA256(channel secret, body) 的 base64 必須等於 x-line-signature */
export async function verifySignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "verify",
  ]);
  let sig: Uint8Array;
  try {
    sig = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  return crypto.subtle.verify("HMAC", key, sig, enc.encode(body)); // 常數時間比對
}
