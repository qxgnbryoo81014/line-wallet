import type { Expense, Pending, Store } from "./bot";

export function makeD1Store(db: D1Database): Store {
  return {
    async addExpense(e: Expense) {
      await db
        .prepare(
          "INSERT INTO expenses (user_id, date, item, amount, category, raw_text) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(e.userId, e.date, e.item, e.amount, e.category, e.rawText)
        .run();
    },

    async sumBetween(userId, start, end) {
      const row = await db
        .prepare(
          "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?",
        )
        .bind(userId, start, end)
        .first<{ total: number }>();
      return row?.total ?? 0;
    },

    async getPending(userId) {
      const row = await db
        .prepare("SELECT data FROM pending WHERE user_id = ?")
        .bind(userId)
        .first<{ data: string }>();
      return row ? (JSON.parse(row.data) as Pending) : null;
    },

    async setPending(userId, p) {
      await db
        .prepare("INSERT OR REPLACE INTO pending (user_id, data, created_at) VALUES (?, ?, ?)")
        .bind(userId, JSON.stringify(p), p.createdAt)
        .run();
    },

    async clearPending(userId) {
      await db.prepare("DELETE FROM pending WHERE user_id = ?").bind(userId).run();
    },
  };
}
