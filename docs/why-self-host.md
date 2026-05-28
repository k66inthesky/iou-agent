# 為什麼這專案是「自架」而不是公開服務？

iou-agent 是 open source 軟體 —— **程式碼**公開，但**部署**請各自跑。Repo 不會
提供共用的 LINE bot QR code 或共用的伺服器。下面說明為什麼。

## 隱私

LINE 群組的每則訊息都會被 webhook server 收到，並且為了給 LLM 做 context，
最近 N 則訊息會存進 SQLite。如果你接共用伺服器：

- 你群組裡所有的閒聊、私事、誰跟誰吵架、誰欠誰錢，全部進到那個伺服器的硬碟
- 維運者（我或任何人）技術上可以看到所有內容
- 任何資安事件（DB 外洩、SQLi、伺服器被打）會影響所有使用者的群組

自架 = 訊息只待在你自己的機器上。

## 法律責任

LINE 的 Messaging API 條款規範 **channel 擁有者** 要對 channel 收到的內容
負責。如果使用者群裡有：

- 違反 LINE 條款的內容
- 違反當地法律的內容（騷擾、誹謗、洩密）
- 被通報濫用

LINE 會聯絡 **channel 擁有者**（不是訊息發送者）。共用 channel = 一個人收到
所有別人群組的紅黃信。

## 費用

- **Nemotron**：每次 API 呼叫都吃 NVIDIA Build 免費額度（個人帳號約 1000
  credits）。共用 = 你的額度被別人燒光。
- **LINE push**：免費版每月 200 則 broadcast message，超過要付費；自架你只
  消耗自己的 quota。
- **Cloudflare / VPS / 電費**：共用伺服器 24/7 跑要錢，自架你只開自己用的時候。

## LINE 速率限制

LINE Messaging API 對單一 channel 有 rate limit（push 約 500 req/s）。共用
channel = 全世界使用者搶同一個 token，撞牆時一起癱掉。自架 = 各自獨立。

## Bot 身分

LINE Messaging API channel 對應一個獨立 bot user。共用 = 別人群組裡顯示的
是「我的」bot 名字、頭像、QR code，這對使用者是混亂的。自架 = 你的 bot 有
自己的名字、頭像、品牌。

## 開源社群的標準做法

幾乎所有自管型開源工具都這樣：

- n8n、Dify、LangFlow、Flowise（工作流 / agent 平台）
- Mattermost、Rocket.Chat、Matrix Synapse（即時通訊）
- Vaultwarden、Joplin Server（密碼/筆記同步）
- LINE 官方 SDK 範例本身也叫你自己申請 channel

軟體共享、部署各自負責。

## 那我怎麼讓朋友用？

兩個選項：

1. **自己架一份**，發 QR code 給朋友加你的 bot 進他們的群。**你**就成為他們的
   小型維運者 —— 隱私、責任、費用、伺服器都是你的事。
2. **教他們自己 fork & deploy**。提供他們 [`README.md`](../README.md) 連結，
   30 分鐘自架完成。

如果你只是給家人 / 自己幾個群組用，方案 1 就夠了。如果你想分享給陌生人，請
強烈考慮方案 2 並把責任邊界講清楚。
