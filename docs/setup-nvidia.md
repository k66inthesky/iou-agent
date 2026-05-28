# 拿 NVIDIA API key for Nemotron

iou-agent 用 NVIDIA Build 平台的 Nemotron 模型。免費額度足以 demo 和小規模日常使用。

## 步驟

1. **註冊 / 登入**
   - 開 https://build.nvidia.com/
   - 右上 **Login**，沒帳號按 **Create Account**（免費）
   - email 收驗證信，國家選你所在地

2. **挑一個 Nemotron 模型**
   - 搜尋 `nemotron` 看候選
   - 推薦穩定可用的（依強度 / credit 消耗排序）：
     - [`nemotron-3-super-120b-a12b`](https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b) — **iou-agent 預設**，最強、NemoClaw-aligned
     - [`llama-3.1-nemotron-70b-instruct`](https://build.nvidia.com/nvidia/llama-3.1-nemotron-70b-instruct) — 中英文 reasoning 均衡，credit 較省
     - [`llama-3.1-nemotron-nano-8b-v1`](https://build.nvidia.com/nvidia/llama-3.1-nemotron-nano-8b-v1) — 輕量，free credit 最耐用

3. **拿 API key**
   - 進 model 頁，右側程式碼範例區塊上方有 **Get API Key**
   - 第一次按會跳 **Generate Key**
   - 一串 `nvapi-xxxx...` 顯示出來
   - **立刻複製**（通常只顯示一次）
   - 寫進 `.env` 的 `NVIDIA_API_KEY=`

4. **設定要用哪個模型**（可選）
   - `.env` 裡的 `NEMOTRON_MODEL=` 填模型完整名（例：`nvidia/nemotron-3-super-120b-a12b`）
   - 不填就用 `.env.example` 裡的預設（120B）

5. **確認額度**
   - Model 頁面通常會顯示剩餘 credits
   - 個人帳號通常給 1000 free credits，跑 demo 完全夠

## 之後

回 [`README.md`](../README.md) 繼續 setup 流程。
