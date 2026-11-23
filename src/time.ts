// 所有日期都是台灣時間 (UTC+8) 的 YYYY-MM-DD 字串，可直接用字串比較。

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function taipeiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 本週：週一到今天 */
export function weekRange(today: string): [string, string] {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = 週日
  return [addDays(today, -((dow + 6) % 7)), today];
}

/** 本月：1 號到今天 */
export function monthRange(today: string): [string, string] {
  return [`${today.slice(0, 8)}01`, today];
}

/** 從句子判斷日期偏移，規則處理，不交給 AI */
export function dayOffset(text: string): number {
  if (text.includes("大前天")) return -3;
  if (text.includes("前天")) return -2;
  if (text.includes("昨天") || text.includes("昨晚")) return -1;
  return 0;
}
