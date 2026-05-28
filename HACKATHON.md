# iou-agent — NVIDIA Agent Hackathon submission

Submitted 2026-05-28.

## What it does in one sentence

iou-agent is an always-on LINE-group bookkeeping assistant that uses Nemotron
to read free-form Chinese-and-English chat, track who owes whom in real time,
and post a daily reconciliation — all behind NemoClaw policy-based guardrails.

## How it meets the rules

| Rule | Where it is satisfied |
|------|------------------------|
| **Operates autonomously, no human in the loop** | `src/server.js` Express webhook + `src/scheduler.js` node-cron daily push. Once started, it reacts to every group message without human action. |
| **Uses Nemotron as the core reasoning model** | `src/nemotron.js` calls `integrate.api.nvidia.com/v1/chat/completions` with a Nemotron model — default `nvidia/nemotron-3-super-120b-a12b` (also runs on `llama-3.1-nemotron-70b-instruct` or `nemotron-nano-8b-v1` via the `NEMOTRON_MODEL` env var). Nemotron is the sole inference engine; no fallback model. |
| **Solves a real problem (retrieval + automation + analysis + orchestration)** | Real friction: groups of friends/roommates lose track of small debts. iou-agent reads each Chinese sentence ("我幫 B 墊 200"), extracts a structured event, persists it, reconciles balances across all transactions, and posts an authoritative daily summary. |
| **Deployable + persistent on the user's hardware** | Single `npm start` on any Node 22 host. State is a JSON file (`data/iou.json`) written atomically (write-temp + rename) so balances survive crashes and restarts. Pure JS — zero native deps — so the same code also runs inside a NemoClaw sandbox (different glibc) without recompiling. Bot is exposed to LINE via Cloudflare Tunnel (free, stable URL). |
| **Working code that runs, persists, and performs** | All code in this repo. No demo-only stubs. End-to-end loop verified: real LINE messages → Nemotron extraction → JSON store write → reply within 3 s; daily cron pushes summary at 09:00 Asia/Taipei. |

## Bonus track: NemoClaw policy-based guardrails

> **Status on the submitted hardware:** NemoClaw 0.0.50 CLI installs cleanly
> and `nemoclaw onboard` completes through step 8/8 on Ubuntu 22.04 WSL2
> (Docker Desktop backend). Sandbox `iou-agent` is live (`nemoclaw list`
> shows it as default), dashboard at `http://127.0.0.1:18789/`. Both custom
> presets are applied as policy version 4 — verified by 5-test enforcement
> run captured in **[`demo/sandbox-proof-2026-05-28.log`](demo/sandbox-proof-2026-05-28.log)**
> (script: [`scripts/sandbox-policy-proof.sh`](scripts/sandbox-policy-proof.sh)).

See `docs/nemoclaw.md` for the full architecture. Summary:

- **Application-layer guardrails** (`src/guardrails.js`) — prompt-injection
  detection on input; amount-cap + currency validation + self-reference
  rejection on output. Even a malicious LLM response cannot insert a phantom
  $9,999,999 debt or one in fictional currency.
- **Platform-layer guardrails** — two NemoClaw custom presets ship in this repo:
  - `nemoclaw/iou-agent-policy.yaml` (preset name `nvidia-inference`) —
    tightens Nemotron egress so even the inference call is restricted to
    `POST /v1/chat/completions` (denies embeddings, model listing, every
    other path on `integrate.api.nvidia.com`).
  - `nemoclaw/presets/line-bot.yaml` — NemoClaw doesn't ship a LINE preset
    (it has Telegram / WeChat / WhatsApp / Slack / Discord / etc., but not
    LINE). This custom preset matches the upstream preset format and
    allowlists exactly the four `/v2/bot/message/{reply,push,multicast,
    broadcast}` endpoints plus read-only profile lookups. Restricted to the
    `node` binary — `curl`, `wget`, `python`, etc. cannot reach LINE even
    from inside the sandbox. Apply with:
    `nemoclaw iou-agent policy-add --from-file nemoclaw/presets/line-bot.yaml`
  - Everything else — embeddings, attacker domains, even other LINE API
    paths, and even allowed hosts from disallowed binaries — is denied at
    the OpenShell egress proxy. Defense in depth: a compromised dependency
    that spawns curl/wget/python cannot reach any network at all.

### Proof on the submitted machine

`demo/sandbox-proof-2026-05-28.log` shows five live tests run inside the
sandbox via `nemoclaw iou-agent exec`:

| # | Test | Result | Layer proven |
|---|------|--------|--------------|
| 1 | `POST integrate.api.nvidia.com/v1/chat/completions` | **200** with Nemotron answer | explicit allow rule |
| 2 | `GET integrate.api.nvidia.com/v1/models` | **403** with `X-OpenShell-Policy: nvidia_inference`, body `"GET /v1/models not permitted by policy"` | L7 method+path filter |
| 3 | `GET https://example.com` | **403** at CONNECT | L4 host filter / deny-by-default |
| 4 | `GET https://api.openai.com/v1/models` | **403** at CONNECT | L4 host filter (competing provider) |
| 5 | `curl POST api.line.me/...` | **403** | binary allowlist (curl ∉ line-bot.binaries) |

## Reproducibility

```bash
git clone <this repo>
cd iou-agent
nvm install 22 && npm install
cp .env.example .env  # fill LINE + NVIDIA + cron settings
./scripts/install_nemoclaw.sh   # optional but earns bonus points
npm start
cloudflared tunnel --url http://localhost:3000  # paste URL into LINE webhook
```

## Demo without LINE

If you only want to see the IOU extraction logic against Nemotron without
setting up a LINE bot:

```bash
npm run test:extract   # exercises 4 sample messages
npm run demo:seed      # seeds fake group data, prints current balances
```

## Tech stack

- **Node 22**, ES modules
- **Express** for the LINE webhook
- **@line/bot-sdk** for signature verification + reply/push
- **Pure-JS JSON-file store** for persistence (atomic write-temp + rename) — zero native deps so the same `node_modules` runs on host glibc 2.35 AND sandbox glibc 2.41
- **node-cron** for the daily summary
- **openai** client pointed at `integrate.api.nvidia.com/v1` for Nemotron
- **NVIDIA NemoClaw** + OpenClaw + OpenShell for sandboxed inference
- **Cloudflare Tunnel** for stable HTTPS ingress without exposing the home IP

## File map

```
src/server.js          # Express + LINE webhook handler
src/nemotron.js        # Nemotron client + IOU extraction prompt
src/guardrails.js      # Application-layer input/output guardrails
src/db.js              # JSON-file store + balance math
src/scheduler.js       # node-cron daily summary
nemoclaw/iou-agent-policy.yaml  # custom NemoClaw preset (nvidia-inference)
scripts/install_nemoclaw.sh     # one-shot installer + onboarder
scripts/test_extract.js         # Nemotron smoke test
scripts/seed_demo.js            # demo data + CLI balance viewer
docs/nemoclaw.md                # NemoClaw integration deep-dive
```

## Known limitations / future work

- One-to-one debt resolution only; no group splits ("AA 制") yet — Nemotron
  could handle the language but the schema doesn't capture multi-party splits.
- No multi-currency conversion; balances stay in their original currency.
- LINE Stickers / Images are ignored. Only text messages are parsed.
- Member display names are captured per group, but if someone changes their
  LINE display name mid-thread the canonical name lags by one message.

None of these affect the core "runs, persists, performs" demo.
