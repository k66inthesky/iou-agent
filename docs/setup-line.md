# 申請 LINE Messaging API channel

iou-agent 需要一個 LINE Messaging API channel。免費，5 分鐘搞定。

## 步驟

1. **登入 LINE Developers Console**
   - 開 https://developers.line.biz/console/
   - 用你個人 LINE 帳號登入（手機上那個帳號）
   - 第一次登入要填 Developer name + email，同意條款

2. **建一個 Provider**（如果還沒有）
   - 首頁按 **Create a new provider**
   - 名字隨便取，例：`iou-agent-dev`
   - **Create**

3. **建 Messaging API channel**
   - 進剛建的 provider，選 **Create a Messaging API channel**
   - 欄位：

     | 欄位 | 填法 |
     |---|---|
     | Channel name | 例：`iou-agent`（會是 bot 顯示名） |
     | Channel description | 例：`紀錄 LINE 群欠款的 AI 助手` |
     | Category | `Other` 或 `Personal` |
     | Email | 你的 email |
     | Privacy policy URL / Terms of use URL | 留空也可以 |
   - 勾兩個 agreement → **Create**

4. **拿 Channel secret**
   - 進 channel → **Basic settings** 分頁
   - 捲到底找 **Channel secret** → 按複製
   - 寫進 `.env` 的 `LINE_CHANNEL_SECRET=`

5. **拿 Channel access token (long-lived)**
   - 切到 **Messaging API** 分頁
   - 捲到底找 **Channel access token (long-lived)**
   - 第一次按 **Issue** → 複製產出的字串
   - 寫進 `.env` 的 `LINE_CHANNEL_ACCESS_TOKEN=`

6. **關內建自動回覆**（重要）
   - 還在 **Messaging API** 分頁
   - **LINE Official Account features** 旁邊按 **Edit**（跳去 LINE Official Account Manager）
   - **Greeting messages** → **Disabled**
   - **Auto-reply messages** → **Disabled**
   - **Webhooks** → **Enabled**（webhook URL 等 cloudflared 起來再填）

7. **允許加入群組**
   - 回 LINE Developers Console，**Messaging API** 分頁
   - **Allow bot to join group chats** → **Edit** → **Enabled**

8. **掃 QR code 加 bot 為好友 → 邀進你要監控的群組**
   - **Messaging API** 分頁最上方有 bot QR code
   - 手機 LINE 掃 → 加好友
   - 開目標群組 → 邀請 → 邀剛加的 bot

## 之後

回 [`README.md`](../README.md) 繼續 setup 流程。
