# line-wallet

LINE 文字記帳機器人，第一版。需求見 `LINE 文字記帳機器人.md`。

## 設計原則

1. 規則做得到的就交給程式，AI 只負責語意。指令、日期、單價或總價判斷、追問由程式處理；AI 只抽出品項、數量、金額、類別。
2. AI 的輸出一律先驗證。金額必須出現在原句中，類別必須在固定清單內；不合格就回覆用法說明，不記帳。
3. 有歧義就問，不猜。待追問的資料存 10 分鐘；答非所問就放棄那筆，把這句當新訊息處理。
4. 核心流程 `src/bot.ts` 不依賴 LINE 或 Cloudflare，用 `npm test` 在本機跑驗收情境。

## 檔案

| 檔案 | 負責 |
|---|---|
| `src/index.ts` | Worker 入口：驗證 LINE 簽章、呼叫 bot、用 reply API 回覆 |
| `src/bot.ts` | 一句話進、一句話出的核心流程 |
| `src/parse.ts` | Workers AI 抽取、輸出驗證、單價／總價規則 |
| `src/time.ts` | 台灣時間、本週（週一起）／本月範圍、昨天／前天 |
| `src/db.ts` | D1 存取 |
| `schema.sql` | 資料表 |

## 部署

```sh
npm install
npx wrangler login
npx wrangler d1 create line-wallet        # 把印出的 database_id 填進 wrangler.toml
npm run db:init
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npm run deploy
```

部署後到 LINE Developers Console：

1. 把 Webhook URL 設成 `https://line-wallet.<你的子網域>.workers.dev`，按 Verify。
2. 開啟 Use webhook。
3. 在 LINE Official Account Manager 關閉「自動回應訊息」。
