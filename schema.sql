CREATE TABLE IF NOT EXISTS expenses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL,
  date       TEXT    NOT NULL,          -- 台灣日期 YYYY-MM-DD
  item       TEXT    NOT NULL,
  amount     INTEGER NOT NULL,          -- 新台幣，整數
  category   TEXT    NOT NULL,
  raw_text   TEXT    NOT NULL,          -- 原始訊息，方便查錯
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date);

-- 每位使用者最多一筆待追問的支出
CREATE TABLE IF NOT EXISTS pending (
  user_id    TEXT    PRIMARY KEY,
  data       TEXT    NOT NULL,          -- JSON
  created_at INTEGER NOT NULL           -- epoch ms
);
