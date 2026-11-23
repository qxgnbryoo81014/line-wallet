## LINE 文字記帳機器人｜第一版摘要

**目標**是讓我在手機 LINE 聊天室打一段話，就能記下一筆支出，不用手動選日期、金額或類別。第一版先支援個人使用、文字記帳，以及查詢本週和本月總支出。

### 使用方式

- 輸入「今天吃了兩碗炸醬麵，一共 100 元」，機器人記下今天的餐飲支出 100 元，回覆「已記下：炸醬麵 100 元」。
- 輸入「炸醬麵兩碗，一碗 100」，應記 200 元。如果只寫「炸醬麵兩碗，100」，就追問「100 元是一碗的價格，還是兩碗的總價？」
- 輸入「本週」或「本月」，直接回覆自己的支出總額。日期以台灣時間為準。

### 技術選擇

| 元件 | 在這個工具裡負責什麼 |
|---|---|
| LINE 官方帳號 | 提供聊天室。啟用 Messaging API 後，把 Worker 網址填入 Webhook，掃 QR Code 加好友就能使用。[developers.line.biz](https://developers.line.biz/en/docs/messaging-api/getting-started/?utm_source=chatgpt.com) |
| Cloudflare Workers ＋ TypeScript | 在 Cloudflare 上執行後端程式，接收訊息、檢查解析結果、存帳及回覆。自己的電腦可以關機。 |
| Cloudflare Workers AI | 理解口語，辨識品項、實付金額、日期與類別。有歧義時回問。「本週」「本月」這類固定指令直接由程式處理。[developers.cloudflare.com](https://developers.cloudflare.com/workers-ai/configuration/bindings/?ref=creativeainews.com\&utm_source=chatgpt.com) |
| Cloudflare D1 | 保存每筆支出和 LINE 使用者 ID。查帳時用 SQL 依使用者及日期加總。以後開放給朋友，同一套程式就能分開記帳。 |

### 免費額度與可靠性

| 服務 | 每日免費額度 | 換成記帳情境 |
|---|---:|---|
| Workers | 每帳號 100,000 次請求，所有使用者共用 | LINE 傳一次請求進來算一次。每次有 10 毫秒 CPU 時間，等待資料庫查詢不計入。[developers.cloudflare.com](https://developers.cloudflare.com/workers/platform/limits/?utm_source=chatgpt.com) |
| D1 | 讀取 5,000,000 列、寫入 100,000 列 | 每天記 10 筆，30 天共 300 筆。依使用者和日期建索引後，月總額可直接由資料庫加總。[developers.cloudflare.com](https://developers.cloudflare.com/d1/platform/pricing/?utm_source=chatgpt.com) |
| Workers AI | 10,000 Neurons，也就是運算點數 | 以 Llama 3.2 3B、每筆輸入 100 tokens、輸出 30 tokens **估算**，約 1.38 點／筆、7,200 筆／天。實際用量隨模型和文字長度改變。免費額度用完，AI 呼叫會失敗，不會自動扣款。[developers.cloudflare.com](https://developers.cloudflare.com/workers-ai/platform/pricing/?utm_source=chatgpt.com) |

**第一版驗收方式：**用空帳本傳「午餐 120」和「車票 30」，再傳「本月」，應收到「本月支出 150 元」。接著傳「炸醬麵兩碗，100」，確認機器人會先追問，在釐清前總額仍是 150 元。