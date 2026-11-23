// 核心流程：收到一句文字 → 回一句文字。不碰 LINE 和 Cloudflare，方便測試。

import { askQuestion, detectAnswer, detectPriceType, normalizeText, type Extracted } from "./parse";
import { addDays, dayOffset, monthRange, taipeiToday, weekRange } from "./time";

export interface Expense {
  userId: string;
  date: string;
  item: string;
  amount: number;
  category: string;
  rawText: string;
}

export interface Pending {
  extracted: Extracted;
  date: string;
  rawText: string;
  createdAt: number;
}

export interface Store {
  addExpense(e: Expense): Promise<void>;
  sumBetween(userId: string, start: string, end: string): Promise<number>;
  getPending(userId: string): Promise<Pending | null>;
  setPending(userId: string, p: Pending): Promise<void>;
  clearPending(userId: string): Promise<void>;
}

export interface Deps {
  store: Store;
  extract: (text: string) => Promise<Extracted | null>;
  now?: () => Date;
}

const PENDING_TTL_MS = 10 * 60 * 1000;
const HELP = "看不懂這筆，請用「品項 金額」的格式，例如：午餐 120\n查帳請輸入「本週」或「本月」";

export async function handleText(userId: string, input: string, deps: Deps): Promise<string> {
  const { store, extract } = deps;
  const now = deps.now?.() ?? new Date();
  const today = taipeiToday(now);
  const text = normalizeText(input);

  // 1. 固定指令
  if (text === "本週" || text === "本月") {
    const [start, end] = text === "本週" ? weekRange(today) : monthRange(today);
    const total = await store.sumBetween(userId, start, end);
    return `${text}支出 ${total} 元`;
  }

  // 2. 回答上一題追問
  const pending = await store.getPending(userId);
  if (pending) {
    await store.clearPending(userId);
    const answer = detectAnswer(text);
    if (now.getTime() - pending.createdAt < PENDING_TTL_MS && answer !== "unclear") {
      return record(userId, pending.extracted, answer, pending.date, pending.rawText, store);
    }
    // 過期或答非所問：放棄那筆，把這句當新訊息處理
  }

  // 3. 新的一筆支出
  const e = await extract(text);
  if (!e) return HELP;

  const date = addDays(today, dayOffset(text));
  const priceType = e.quantity > 1 ? detectPriceType(text) : "total";
  if (priceType === "unclear") {
    await store.setPending(userId, { extracted: e, date, rawText: text, createdAt: now.getTime() });
    return askQuestion(text, e);
  }
  return record(userId, e, priceType, date, text, store);
}

async function record(
  userId: string,
  e: Extracted,
  priceType: "unit" | "total",
  date: string,
  rawText: string,
  store: Store,
): Promise<string> {
  const amount = priceType === "unit" ? e.price * e.quantity : e.price;
  await store.addExpense({ userId, date, item: e.item, amount, category: e.category, rawText });
  return `已記下：${e.item} ${amount} 元`;
}
