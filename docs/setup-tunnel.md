# 設定 Cloudflare Tunnel（webhook 對外入口）

LINE webhook 要 HTTPS public URL。Cloudflare Tunnel 免費、URL 穩定、不用開
router port forward、不用 SSL 憑證自己管。

## 快速版（一行起跑，URL 每次不一樣）

適合開發測試：

```bash
cloudflared tunnel --url http://localhost:3000
```

跑起來會印一行像 `https://random-words.trycloudflare.com`。把這個 URL 加上
`/webhook` 貼進 LINE Developers Console → Messaging API → **Webhook URL**。

**缺點**：每次重啟 URL 會變，要重貼。適合臨時 demo。

## 穩定版（URL 固定，重啟不變）

適合長期運作。需要 Cloudflare 帳號（免費）+ 一個自己的 domain（轉移到
Cloudflare 管 DNS）。

1. **裝 cloudflared**（Linux/WSL）
   ```bash
   curl -fsSL -o /tmp/cloudflared.deb \
     https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i /tmp/cloudflared.deb
   cloudflared --version
   ```

2. **登入 Cloudflare**
   ```bash
   cloudflared tunnel login
   ```
   會開瀏覽器讓你授權，選你的 domain。

3. **建一個 named tunnel**
   ```bash
   cloudflared tunnel create iou-agent
   ```
   記下印出來的 tunnel UUID。

4. **把 hostname 指到這個 tunnel**
   ```bash
   cloudflared tunnel route dns iou-agent iou.your-domain.com
   ```

5. **跑起來**
   ```bash
   cloudflared tunnel run --url http://localhost:3000 iou-agent
   ```

6. **填 LINE webhook**
   - LINE Developers Console → Messaging API → **Webhook URL**
   - 填 `https://iou.your-domain.com/webhook`
   - 按 **Verify** 確認回 `200 OK`
   - **Use webhook** 開關打開

## 之後

回 [`README.md`](../README.md) 完成 `npm start` 步驟。
