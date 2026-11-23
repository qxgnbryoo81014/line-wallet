// AI 只負責抽出「品項、數量、金額、類別」；其餘判斷都在這裡用規則做。

export const CATEGORIES = ["餐飲", "交通", "購物", "娛樂", "居家", "醫療", "其他"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Extracted {
  item: string;
  quantity: number;
  price: number; // 句子裡出現的那個金額，尚未判斷是單價或總價
  category: Category;
}

export type PriceType = "unit" | "total" | "unclear";

const CLS = "碗|個|杯|份|盒|包|瓶|張|件|顆|串|片|條|塊|支|本|台|雙|罐|根|隻|盤|客|套|組";
const QTY_RE = new RegExp(`([兩二三四五六七八九十]|\\d+)(${CLS})`);

/** 全形數字轉半形、去頭尾空白 */
export function normalizeText(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .trim();
}

/** 金額是單價還是總價：規則判斷，總價關鍵字優先 */
export function detectPriceType(text: string): PriceType {
  if (/一共|總|共|合計|全部/.test(text)) return "total";
  if (/單價|每|各/.test(text) || new RegExp(`一(${CLS})`).test(text)) return "unit";
  return "unclear";
}

/** 回答追問時，「兩碗」這種非一的數量也視為總價 */
export function detectAnswer(text: string): PriceType {
  const t = detectPriceType(text);
  if (t !== "unclear") return t;
  return new RegExp(`^(${QTY_RE.source})`).test(text) ? "total" : "unclear";
}

/** 產生追問句，例如「100 元是一碗的價格，還是兩碗的總價？」 */
export function askQuestion(text: string, e: Extracted): string {
  const m = text.match(QTY_RE);
  if (m) return `${e.price} 元是一${m[2]}的價格，還是${m[1]}${m[2]}的總價？`;
  return `${e.price} 元是單價，還是 ${e.quantity} 份的總價？`;
}

/** 驗證 AI 輸出；任何一項不合理就回傳 null */
export function validate(raw: unknown, text: string): Extracted | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const item = typeof r.item === "string" ? r.item.trim() : "";
  if (!item || item.length > 30) return null;

  const price = Number(r.price);
  if (!Number.isInteger(price) || price <= 0 || price > 1_000_000) return null;
  // 防止 AI 編金額：金額必須是原句裡出現過的數字
  const numbers: string[] = text.match(/\d+/g) ?? [];
  if (!numbers.includes(String(price))) return null;

  const q = Number(r.quantity);
  const quantity = Number.isInteger(q) && q >= 1 && q <= 99 ? q : 1;

  const category = (CATEGORIES as readonly string[]).includes(r.category as string)
    ? (r.category as Category)
    : "其他";

  return { item, quantity, price, category };
}

const MODEL = "@cf/meta/llama-3.2-3b-instruct";

const PROMPT = `你是記帳助手。從使用者的一句話抽出支出資訊，只輸出一行 JSON，不要任何其他文字。
格式：{"item":"品項","quantity":數量,"price":金額,"category":"類別"}
- item：買了什麼，簡短名詞，例如「炸醬麵」「車票」「午餐」
- quantity：數量整數，沒提到就是 1
- price：句子裡出現的金額數字，照抄，不要自己相乘
- category：只能是 ${CATEGORIES.join("、")} 其中之一
如果這句話不是在記錄支出，輸出 {"item":null}
範例：
輸入：午餐 120 → {"item":"午餐","quantity":1,"price":120,"category":"餐飲"}
輸入：今天吃了兩碗炸醬麵，一共 100 元 → {"item":"炸醬麵","quantity":2,"price":100,"category":"餐飲"}
輸入：炸醬麵兩碗，一碗 100 → {"item":"炸醬麵","quantity":2,"price":100,"category":"餐飲"}
輸入：搭計程車 250 → {"item":"計程車","quantity":1,"price":250,"category":"交通"}`;

export function makeAiExtractor(ai: Ai) {
  return async (text: string): Promise<Extracted | null> => {
    const res = (await ai.run(MODEL, {
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: text },
      ],
      max_tokens: 80,
      temperature: 0,
    })) as { response?: string };
    const json = res.response?.match(/\{[\s\S]*?\}/)?.[0];
    if (!json) return null;
    try {
      return validate(JSON.parse(json), text);
    } catch {
      return null;
    }
  };
}
