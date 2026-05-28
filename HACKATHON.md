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
| **Deployable + persistent on the user's hardware** | Single `npm start` on any Node 22 host. State is SQLite (`data/iou.db`, WAL mode) so balances survive crashes and restarts. Bot is exposed to LINE via Cloudflare Tunnel (free, stable URL). |
| **Working code that runs, persists, and performs** | All code in this repo. No demo-only stubs. End-to-end loop verified: real LINE messages → Nemotron extraction → SQLite write → reply within 3 s; daily cron pushes summary at 09:00 Asia/Taipei. |

## Bonus track: NemoClaw policy-based guardrails

> **Status on the submitted hardware:** NemoClaw 0.0.50 CLI installs cleanly, but
> `nemoclaw onboard --no-gpu` cannot finish step 2/8 on Ubuntu 22.04 WSL2 with
> host glibc 2.35. The OpenShell-gateway compatibility container starts and
> binds 0.0.0.0:8080 successfully (verified in the gateway log), but
> NemoClaw's readiness probe incorrectly reports `Docker-driver gateway failed
> to start` and the wizard exits before the sandbox is created. The custom
> policy preset (`nemoclaw/iou-agent-policy.yaml`) and the install wrapper
> (`scripts/install_nemoclaw.sh --no-gpu`) are nevertheless committed so a
> reviewer on a glibc-2.39+ host (Ubuntu 24.04, Fedora 39+, etc.) can complete
> the integration with one command.

See `docs/nemoclaw.md` for the full architecture. Summary:

- **Application-layer guardrails** (`src/guardrails.js`) — prompt-injection
  detection on input; member-allowlist + amount-cap + currency validation on
  output. Even a malicious LLM response cannot insert a phantom $9,999,999
  debt against someone not in the group.
- **Platform-layer guardrails** — two NemoClaw artifacts ship in this repo:
  - `nemoclaw/iou-agent-policy.yaml` — custom base policy. Tightens the
    default `openclaw-sandbox.yaml` so even Nemotron inference is restricted
    to `POST /v1/chat/completions` (denies embeddings, model listing, every
    other path).
  - `nemoclaw/presets/line-bot.yaml` — NemoClaw doesn't ship a LINE preset
    (it has Telegram / WeChat / WhatsApp / Slack / Discord / etc., but not
    LINE). This custom preset matches the upstream preset format and
    allowlists exactly the four `/v2/bot/message/{reply,push,multicast,
    broadcast}` endpoints plus read-only profile lookups. Apply with
    `nemoclaw policy apply --preset ./nemoclaw/presets/line-bot.yaml`.
  - Everything else — embeddings, attacker domains, even other LINE API
    paths — is denied at the network layer. Defense in depth: an exploit
    would have to defeat both the host JS layer and the sandbox network
    policy to do real damage.

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
- **better-sqlite3** for synchronous, file-backed persistence (WAL mode)
- **node-cron** for the daily summary
- **openai** client pointed at `integrate.api.nvidia.com/v1` for Nemotron
- **NVIDIA NemoClaw** + OpenClaw + OpenShell for sandboxed inference
- **Cloudflare Tunnel** for stable HTTPS ingress without exposing the home IP

## File map

```
src/server.js          # Express + LINE webhook handler
src/nemotron.js        # Nemotron client + IOU extraction prompt
src/guardrails.js      # Application-layer input/output guardrails
src/db.js              # SQLite schema + balance math
src/scheduler.js       # node-cron daily summary
nemoclaw/iou-agent-policy.yaml  # custom NemoClaw policy preset
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
