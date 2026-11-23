import { describe, expect, it } from "vitest";
import { handleText, type Expense, type Pending, type Store } from "../src/bot";
import { detectPriceType, validate, type Extracted } from "../src/parse";
import { monthRange, weekRange, taipeiToday } from "../src/time";
import { verifySignature } from "../src/index";

function memoryStore() {
  const expenses: Expense[] = [];
  const pending = new Map<string, Pending>();
  const store: Store = {
    async addExpense(e) { expenses.push(e); },
    async sumBetween(u, s, e) {
      return expenses.filter((x) => x.userId === u && x.date >= s && x.date <= e).reduce((a, x) => a + x.amount, 0);
    },
    async getPending(u) { return pending.get(u) ?? null; },
    async setPending(u, p) { pending.set(u, p); },
    async clearPending(u) { pending.delete(u); },
  };
  return { store, expenses };
}

// 模擬 AI 的輸出（照 prompt 規格），再經過真正的 validate
const fakeAi: Record<string, unknown> = {
  "午餐 120": { item: "午餐", quantity: 1, price: 120, category: "餐飲" },
  "車票 30": { item: "車票", quantity: 1, price: 30, category: "交通" },
  "炸醬麵兩碗，100": { item: "炸醬麵", quantity: 2, price: 100, category: "餐飲" },
  "炸醬麵兩碗，一碗 100": { item: "炸醬麵", quantity: 2, price: 100, category: "餐飲" },
  "今天吃了兩碗炸醬麵，一共 100 元": { item: "炸醬麵", quantity: 2, price: 100, category: "餐飲" },
  "昨天咖啡 80": { item: "咖啡", quantity: 1, price: 80, category: "餐飲" },
  "便當 999": { item: "便當", quantity: 1, price: 100, category: "餐飲" }, // AI 編錯金額
};
const extract = async (t: string): Promise<Extracted | null> => validate(fakeAi[t] ?? { item: null }, t);

const NOW = new Date("2026-11-23T04:00:00Z"); // 台灣 2026-11-23（週一）12:00

function bot() {
  const m = memoryStore();
  const send = (t: string, now = NOW) => handleText("U1", t, { store: m.store, extract, now: () => now });
  return { ...m, send };
}

describe("驗收情境", () => {
  it("午餐 120 + 車票 30 → 本月 150；炸醬麵兩碗，100 先追問，總額不變", async () => {
    const b = bot();
    expect(await b.send("午餐 120")).toBe("已記下：午餐 120 元");
    expect(await b.send("車票 30")).toBe("已記下：車票 30 元");
    expect(await b.send("本月")).toBe("本月支出 150 元");
    expect(await b.send("炸醬麵兩碗，100")).toBe("100 元是一碗的價格，還是兩碗的總價？");
    expect(await b.send("本月")).toBe("本月支出 150 元");
  });
});

describe("單價／總價", () => {
  it("一共 → 總價", async () => {
    expect(await bot().send("今天吃了兩碗炸醬麵，一共 100 元")).toBe("已記下：炸醬麵 100 元");
  });
  it("一碗 100 → 單價 × 2", async () => {
    expect(await bot().send("炸醬麵兩碗，一碗 100")).toBe("已記下：炸醬麵 200 元");
  });
  it("追問後回答「一碗」→ 200", async () => {
    const b = bot();
    await b.send("炸醬麵兩碗，100");
    expect(await b.send("一碗")).toBe("已記下：炸醬麵 200 元");
  });
  it("追問後回答「兩碗的總價」→ 100", async () => {
    const b = bot();
    await b.send("炸醬麵兩碗，100");
    expect(await b.send("兩碗的總價")).toBe("已記下：炸醬麵 100 元");
  });
  it("追問後改傳別的支出：放棄舊的、記新的", async () => {
    const b = bot();
    await b.send("炸醬麵兩碗，100");
    expect(await b.send("午餐 120")).toBe("已記下：午餐 120 元");
    expect(b.expenses).toHaveLength(1);
  });
  it("追問超過 10 分鐘就失效", async () => {
    const b = bot();
    await b.send("炸醬麵兩碗，100");
    const later = new Date(NOW.getTime() + 11 * 60 * 1000);
    expect(await b.send("一碗", later)).toContain("看不懂");
    expect(b.expenses).toHaveLength(0);
  });
  it("detectPriceType", () => {
    expect(detectPriceType("兩杯共 120")).toBe("total");
    expect(detectPriceType("每杯 60")).toBe("unit");
    expect(detectPriceType("咖啡兩杯 120")).toBe("unclear");
  });
});

describe("防呆", () => {
  it("AI 給的金額不在原句裡 → 不記", async () => {
    const b = bot();
    expect(await b.send("便當 999")).toContain("看不懂");
    expect(b.expenses).toHaveLength(0);
  });
  it("非支出句子 → 說明用法", async () => {
    expect(await bot().send("你好")).toContain("看不懂");
  });
  it("昨天 → 日期減一天", async () => {
    const b = bot();
    await b.send("昨天咖啡 80");
    expect(b.expenses[0].date).toBe("2026-11-22");
  });
  it("不同使用者分開記帳", async () => {
    const m = memoryStore();
    const deps = { store: m.store, extract, now: () => NOW };
    await handleText("U1", "午餐 120", deps);
    expect(await handleText("U2", "本月", deps)).toBe("本月支出 0 元");
  });
});

describe("時間（台灣時區）", () => {
  it("UTC 16:30 已經是台灣隔天", () => {
    expect(taipeiToday(new Date("2026-11-22T16:30:00Z"))).toBe("2026-11-23");
  });
  it("本週從週一開始", () => {
    expect(weekRange("2026-11-23")).toEqual(["2026-11-23", "2026-11-23"]); // 週一
    expect(weekRange("2026-11-29")).toEqual(["2026-11-23", "2026-11-29"]); // 週日
  });
  it("本月從 1 號開始", () => {
    expect(monthRange("2026-11-23")).toEqual(["2026-11-01", "2026-11-23"]);
  });
});

describe("LINE 簽章", () => {
  it("正確簽章通過、錯誤簽章拒絕", async () => {
    const secret = "test-secret";
    const body = '{"events":[]}';
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
    const sig = btoa(String.fromCharCode(...mac));
    expect(await verifySignature(body, sig, secret)).toBe(true);
    expect(await verifySignature(body + " ", sig, secret)).toBe(false);
    expect(await verifySignature(body, null, secret)).toBe(false);
  });
});
