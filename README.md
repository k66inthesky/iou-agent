# iou-agent

> **IOU Agent 幫人類做想做但不敢做的事 — 定時提醒朋友還錢。**
> *IOU Agent does what you wish you could but don't dare to — nag your friends about the money they owe you.*

> 你不催，當凱子。你催了，又怕傷感情。
> 這種尷尬本來只能你自己扛，直到 IOU agent 來了。
>
> *Don't nag → you eat the loss. Do nag → you risk the friendship. iou-agent takes the awkward part off your hands.*

NVIDIA Agent Hackathon 2026 參賽作品。LINE 群組記帳 bot，用 **Nemotron** 讀懂自然語言、**NemoClaw** 做沙箱防護。


🎥 [Youtube Demo Video](https://www.youtube.com/watch?v=QAmPNZIoqwM)
---

## 架構 / Architecture

```mermaid
flowchart LR
    User([LINE 群組成員]) -->|"我幫 B 墊 200"| LINE[LINE Messaging API]
    LINE -->|webhook| CF[Cloudflare Tunnel]

    subgraph Sandbox["NemoClaw sandbox · policy-based guardrails"]
        direction LR
        CF --> Server["Express /webhook<br/>src/server.js"]
        Server --> GIn["輸入防護欄<br/>src/guardrails.js"]
        GIn --> Nemo["NVIDIA Nemotron<br/>nemotron-3-super-120b-a12b"]
        Nemo --> GOut["輸出防護欄<br/>amount / currency / 自欠自"]
        GOut --> DB[("SQLite<br/>data/iou.db")]
        Cron["node-cron<br/>每日 09:00 Asia/Taipei"] --> DB
    end

    GOut -->|reply| LINE
    Cron -->|daily push| LINE
    LINE -->|"已更新紀錄..."| User
```

---

## 怎麼用 / How it works

1. 把 bot 加進 LINE 群組
2. 群裡有人說「我幫 Bob 墊了 200」、「Carol 欠我 30 美元飲料錢」
3. Nemotron 抽出欠條 → 寫進 SQLite → bot 回 `已更新紀錄，目前欠條...`
4. 每天 09:00 (Asia/Taipei) 自動推當日結算

---

## 三個帳號要先準備好 / Three things to set up

| 要準備什麼 | 去哪申請 | 詳細步驟 |
|---|---|---|
| **LINE Messaging API channel**（免費） | https://developers.line.biz/console/ | [`docs/setup-line.md`](docs/setup-line.md) |
| **NVIDIA Build API key**（免費 ~1000 credits） | https://build.nvidia.com/ | [`docs/setup-nvidia.md`](docs/setup-nvidia.md) |
| **Cloudflare Tunnel**（給 LINE webhook 用的公開 URL） | 一行 `cloudflared tunnel --url http://localhost:3000` | [`docs/setup-tunnel.md`](docs/setup-tunnel.md) |

把這三組值填進 `.env`（複製 `.env.example`），就可以照下面跑起來。

---

## 安裝到執行 / Install to running

從 `git clone` 到「群組裡發訊息看到 bot 回」，照這個順序做。

### 1. 準備 `.env`

```bash
cp .env.example .env
# 編輯 .env，填入：
#   LINE_CHANNEL_SECRET=xxx          ← 從 LINE Developers Console > Basic settings
#   LINE_CHANNEL_ACCESS_TOKEN=xxx    ← 從 LINE Developers Console > Messaging API
#   NVIDIA_API_KEY=nvapi-xxx         ← 從 https://build.nvidia.com/
```

詳細申請步驟見 [`docs/setup-line.md`](docs/setup-line.md)、[`docs/setup-nvidia.md`](docs/setup-nvidia.md)。

### 2. 安裝依賴

```bash
npm install
```

### 3. 開 **Terminal #1**：啟動 server（**保持開著**）

```bash
npm start
```

看到下面 2 行表示成功，這個視窗不要關：

```
[iou-agent] listening on :3000
[scheduler] daily summary cron="50 17 * * *" tz=Asia/Taipei
```

### 4. 開 **Terminal #2**：啟動 tunnel（**保持開著**）

```bash
cloudflared tunnel --url http://localhost:3000
```

往下捲找到方框裡的 URL：

```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created!                                                       |
|  https://xxx-xxx-xxx-xxx.trycloudflare.com                ← 把這個 URL 複製下來            |
+--------------------------------------------------------------------------------------------+
```

> ⚠️ **不要用 localtunnel**——它對未知 IP 的第一次請求會跳「click to continue」攔截頁，LINE 是 server-to-server 沒辦法按按鈕，會回 408 timeout。

### 5. 設定 LINE Webhook URL

去 [LINE Developers Console](https://developers.line.biz/console/) → 你的 channel → **Messaging API** 分頁 → **Webhook settings** 區塊：

1. 按 **Edit**，貼上 `https://xxx-xxx-xxx-xxx.trycloudflare.com/webhook`（**結尾加 `/webhook`**）
2. 按 **Update**
3. 按 **Verify** → 預期回綠色 **Success**
4. **`Use webhook` 開關打開（綠色）**

### 6. 關掉 LINE 內建自動回覆（重要）

同一頁找 **LINE Official Account features**，按 **Greeting messages** 旁的 **Edit**（會跳到 LINE Official Account Manager）：

- **Greeting messages** → **Disabled**
- **Auto-reply messages** → **Disabled**
- **Webhooks** → **Enabled**

不關掉的話 LINE 會搶在 iou-agent 之前回預設訊息。

### 7. 允許 bot 加入群組

回 LINE Developers Console，**Messaging API** 分頁：

- **Allow bot to join group chats** → **Edit** → **Enabled**

### 8. 把 bot 拉進群組

- **Messaging API** 分頁最上方有 **QR code**
- 手機 LINE 掃 → 加 bot 為好友
- 開一個測試群組（或建一個只有你的）→ 邀剛加的 bot 進群

### 9. 在群組裡發訊息測試

```
我幫 Bob 墊了 200
```

預期：
- Terminal #1 印出 `[msg] text="我幫 Bob 墊了 200"` → `[extract] is_iou=true events=1` → DB 寫入 → reply
- LINE 群組看到 bot 回 `已更新紀錄...`

> 想要**固定 URL、重啟不變**（適合長期運行）見 [`docs/setup-tunnel.md`](docs/setup-tunnel.md)。

---

## 原則導向防護欄 / Policy-based guardrails

iou-agent 用 **NVIDIA NemoClaw** 把推論放進沙箱，做 **defense-in-depth** 兩層防護：

- **應用層**（`src/guardrails.js`）— 輸入端擋 prompt injection、輸出端擋金額溢位／非法幣別／自欠自。
- **平台層**（NemoClaw policy）— 沙箱只允許 `POST integrate.api.nvidia.com/v1/chat/completions` 和 `POST api.line.me/v2/bot/message/*`，其他全 deny。

> **這節是「安全證明 demo」，不是日常 LINE bot 運作路徑。**
> LINE webhook 對外靠 cloudflared，cloudflared 跑在 host 比較單純（見上節）。
> 這節示範**同一份 code 也能在 NemoClaw 沙箱裡正常啟動**，且五個 enforcement 測試（1 allow + 4 deny）全部通過——這就是 hackathon 的 bonus 證據。
> 完整 proof log 見 [`demo/sandbox-proof-2026-05-28.log`](demo/sandbox-proof-2026-05-28.log)。

設定 NemoClaw：

**前置條件 / Prerequisites**

NemoClaw 沙箱在 Docker 容器裡跑，所以執行安裝腳本前，請先確認：

1. **Docker Desktop 已開啟**（Windows / macOS 使用者）— 從工作列／選單列開啟 Docker Desktop，等到鯨魚 icon 變綠（穩定狀態）。
2. **WSL2 使用者**：Docker Desktop → Settings → Resources → **WSL Integration**，把你的 distro 打開，**然後一定要按下方的 `Apply & restart`**（只打勾沒按 Apply 不會生效）。改完設定後另開一個新的 WSL terminal，否則舊 shell 的 PATH 快取還是錯的。
3. **Linux 原生使用者**：用 `docker-ce`，並確認 `docker ps` 不會跳權限錯誤（必要時把使用者加進 `docker` group）。
4. **`NVIDIA_API_KEY`** 已寫進 `.env`（從 https://build.nvidia.com/ 申請）。注意 `.env` 是給應用程式讀的純文字檔，**bash 不會自動載入**，所以 `echo $NVIDIA_API_KEY` 在 shell 印不出東西是正常的，安裝腳本會自己去 `.env` 撈。

驗證環境準備好了：

```bash
# Docker：要看到容器列表表頭（即使沒有任何容器），不能報 daemon 連不到
docker ps

# Integration 真的掛上了嗎？這三項都要通過：
ls -la /usr/bin/docker          # symlink 指到 /mnt/wsl/docker-desktop/...
ls /var/run/docker.sock         # socket file 存在
which -a docker                 # 第一個是 /usr/bin/docker，不是 /mnt/c/...

# NVIDIA_API_KEY：直接看 .env 檔，不要看 shell 變數
grep -E "^NVIDIA_API_KEY=" .env && echo "OK: .env 有設 NVIDIA_API_KEY"
```

**安裝 / Install**

```bash
./scripts/install_nemoclaw.sh
```

這個 script 會一次做完：onboard sandbox、套兩個 custom preset (`nvidia-inference`、`line-bot`)、把 repo 推進 `/sandbox/iou-agent`、在 sandbox 內跑 `npm install`。

跑完之後驗證沙箱內一切正常：

```bash
# 1. 在 sandbox 內啟動 server（驗證 native 依賴 0 個、純 JS、能在不同 glibc 跑）
nemoclaw iou-agent exec --no-tty -- bash -lc 'cd /sandbox/iou-agent && npm start'
# 預期看到：[iou-agent] listening on :3000
# 預期看到：[scheduler] daily summary cron="50 17 * * *" tz=Asia/Taipei

# 2. 跑 enforcement proof（5 個 curl：1 通 4 擋，證明 policy 是活的）
nemoclaw iou-agent exec -- bash /sandbox/iou-agent/scripts/sandbox-policy-proof.sh

# 3. 確認兩個 custom preset 是 active（行首 ● 標記）
nemoclaw iou-agent policy-list | grep -E "nvidia-inference|line-bot"
```

常見錯誤：

| 錯誤訊息 | 原因 / 解法 |
|---|---|
| `ERROR: docker daemon not reachable` | Docker Desktop 沒開，或 WSL Integration 沒打開／沒 Apply。回到上面前置條件第 1、2 步。 |
| `ERROR: docker not on PATH` | 同上，Docker Desktop 沒裝或 WSL Integration 沒打開。 |
| `The command 'docker' could not be found in this WSL 2 distro.` | 這段訊息是 Docker Desktop 在 Windows 端那支 stub binary（`/mnt/c/Program Files/Docker/Docker/resources/bin/docker`）印的，代表 Integration 還沒掛上。即使你在 Docker Desktop 介面看到那個 distro 已打勾，常見原因是：(a) 沒按 **Apply & restart**；(b) 按了但 shell 是舊的（PATH 快取了 Windows 路徑），開新 terminal 即可；(c) 偶爾要在 PowerShell 跑 `wsl --shutdown` 後再進 distro。 |
| `ERROR: NVIDIA_API_KEY is not set` | `.env` 裡沒這行，或直接用 `NVIDIA_API_KEY=xxx ./scripts/install_nemoclaw.sh` 傳進來。注意 `echo $NVIDIA_API_KEY` 印不出來**不代表沒設**，bash 不會讀 `.env`，請用 `grep -E "^NVIDIA_API_KEY=" .env` 確認。 |
| `nemoclaw onboard` 卡在 step 2/8（WSL2） | Docker Desktop 對 `--network host` 的相容性問題，見 [`docs/nemoclaw.md`](docs/nemoclaw.md#status-on-the-submission-hardware) 的三個 fix paths。 |

兩個 YAML 都在 [`nemoclaw/`](nemoclaw/) 裡，更多細節（防護欄分層、攻擊面分析、WSL2 已知問題）見 [`docs/nemoclaw.md`](docs/nemoclaw.md)。

---

## 不接 LINE 也能 demo / Demo without LINE

```bash
npm install
cp .env.example .env       # 填 NVIDIA_API_KEY 就好
npm run test:extract       # 跑 4 句範例，看 Nemotron 抽出來的 JSON
npm run demo:seed          # 灌假資料 + 印餘額
```

---

## 為什麼要自架 / Why self-host

這是 self-hosted 開源軟體，不會提供共用 bot。原因（隱私、責任、費用、rate limit）見 [`docs/why-self-host.md`](docs/why-self-host.md)。

## License

Apache 2.0
