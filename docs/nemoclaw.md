# NemoClaw integration & guardrails

This document explains, in concrete detail, how iou-agent uses **NVIDIA NemoClaw**
to earn the "policy-based guardrails" bonus on the NVIDIA Agent Hackathon, and
exactly which artifacts in this repo implement which part of the threat model.

## What NemoClaw guardrails actually are

NemoClaw layers **three orthogonal sandbox controls** on top of the OpenShell
runtime, plus a tier-based posture selector at onboard time:

| Layer | YAML field | What it enforces |
|---|---|---|
| Filesystem | `filesystem_policy` | Landlock — agent can only read/write listed paths. Everything else is invisible. |
| Network | `network_policies` | OpenShell gateway acts as an egress proxy. Each policy lists `host:port` + allowed HTTP `method`+`path` + which `binaries` may originate the call. Deny-by-default — anything not listed is blocked. |
| Process | `process` | Agent runs as an unprivileged `sandbox` user, not root. |

And three posture **tiers** (chosen at onboard time, see `nemoclaw-blueprint/policies/tiers.yaml`):

| Tier | Adds on top of the base policy |
|---|---|
| `restricted` | Nothing — Nemotron inference + core agent tooling only. |
| `balanced` | `npm`, `pypi`, `huggingface`, `brew`, `brave` (search). |
| `open` | Above + `slack`, `discord`, `telegram`, `wechat`, `whatsapp`, `jira`, `outlook`. |

Each item in the bottom two rows points to a **preset** YAML in
`nemoclaw-blueprint/policies/presets/`. A preset is just a per-service network
allowlist with the same `network_policies` schema as the base policy.

## Why iou-agent needs a custom preset

NemoClaw ships presets for Telegram, WeChat, WhatsApp, Slack, Discord, Jira,
Outlook — but **NOT for LINE**, the platform iou-agent runs on. Without a LINE
preset, even tier=`open` would deny calls to `api.line.me` and the bot couldn't
reply.

This repo therefore ships:

- **`nemoclaw/presets/line-bot.yaml`** — custom NemoClaw preset matching the
  built-in preset schema. Allows only `POST /v2/bot/message/{reply,push,
  multicast,broadcast}` and read-only GETs for profile lookups. Apply with:
  ```bash
  nemoclaw policy apply --preset ./nemoclaw/presets/line-bot.yaml --sandbox iou-agent
  ```

- **`nemoclaw/iou-agent-policy.yaml`** — custom base policy that tightens the
  default `openclaw-sandbox.yaml` so that even Nemotron inference is
  restricted to `POST /v1/chat/completions` (the only endpoint we need —
  embeddings, model listing, etc. are denied).

## Defense in depth: host + sandbox

iou-agent applies guardrails **at two layers** — the application layer (in JS)
and the platform layer (NemoClaw network policy). Either alone is insufficient.

```
┌─── host process (src/server.js) ─────────────────────────────────┐
│                                                                   │
│  src/guardrails.js applyInputGuardrails()                         │
│      • Reject messages > 2000 chars                              │
│      • Reject known prompt-injection phrases                     │
│      • Require members list present                              │
│              │                                                    │
│              ▼                                                    │
│  src/nemotron.js extractIouEvents()                              │
│      • POST integrate.api.nvidia.com/v1/chat/completions          │
│      • 25 s timeout, max 1 retry                                 │
│              │                                                    │
│              ▼                                                    │
│  src/guardrails.js applyOutputGuardrails()                       │
│      • amount > 0 AND amount < 1,000,000 (numeric overflow)     │
│      • debtor ≠ creditor                                         │
│      • currency matches ^[A-Z]{3}$                                │
│      • event.type ∈ {debt, settle}                                │
│      • name length ≤ 80 (DB-overflow guard, NOT validity check)   │
│      • drop events that violate any above                         │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼  (when deployed inside the NemoClaw sandbox)
┌─── NemoClaw OpenClaw sandbox ─────────────────────────────────────┐
│                                                                   │
│  network_policies.iou_inference   →  POST integrate.api.nvidia.com │
│      /v1/chat/completions ONLY    (no embeddings, no /v1/models)   │
│                                                                   │
│  network_policies.line_messaging  →  POST api.line.me/v2/bot/.../  │
│      message/{reply,push,…} + read-only profile GETs               │
│                                                                   │
│  filesystem_policy                →  read-only: /usr /lib /etc     │
│                                       read-write: /tmp ONLY        │
│                                                                   │
│  process.run_as_user              →  `sandbox`, never root         │
│                                                                   │
│  EVERYTHING ELSE                  →  denied (deny-by-default)      │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Concrete attacks and which layer stops them

| Attack | Application layer | Platform layer |
|---|---|---|
| Prompt injection asks Nemotron to insert a $9,999,999 debt against a name not in the group | Output guardrails drop event (amount > cap; also we have no whitelist anymore, but in this case amount cap kicks in) | — (LLM output, no network involved) |
| Prompt injection convinces the LLM to "scrape the NVIDIA model catalog" via `/v1/models` | — (it's a legitimate LLM API endpoint) | **Denied** — only `/v1/chat/completions` is listed |
| Compromised LLM tries to exfiltrate the LINE token via attacker-controlled domain `https://evil.example/leak?token=...` | — | **Denied** — `evil.example` is not in the allowlist |
| Compromised dependency tries to read `/etc/shadow` or write to `/usr/local/bin` | Node runtime doesn't expose these, but a malicious native dep could | **Denied** — `/etc` is read-only, `/usr` is read-only |
| Compromised dependency tries `setuid()` to escalate | Limited by Node | **Denied** — agent runs as `sandbox` user, no setuid capability |
| LINE webhook retries the same message twice during slow Nemotron call | `src/server.js` checks `line_message_id` PRIMARY KEY; second call short-circuits with `[dedup]` log | — |

## Status on the submission hardware

NemoClaw 0.0.50 CLI installs cleanly on Ubuntu 22.04 WSL2. **`nemoclaw onboard`
step 2/8 fails** because the OpenShell gateway runs in a `ubuntu:24.04`
compatibility container with `--network host` (since host glibc 2.35 < the
gateway's required 2.39), and Docker Desktop 4.0.0 on this machine does not
expose `--network host` ports to the WSL distro's network namespace. The
gateway IS running and listening on `0.0.0.0:8080` *inside the container*
(verified with `docker exec ... ss -ltn`) — NemoClaw's host-side readiness
probe just cannot reach it.

Fix paths (any one):
- Upgrade Docker Desktop to **4.34+** and toggle Settings → Resources →
  Network → **Enable host networking**.
- Replace Docker Desktop with **docker-ce** inside WSL (native Linux Docker
  honors `--network host` correctly).
- Run iou-agent on a non-WSL host (any glibc ≥ 2.39 Linux: Ubuntu 24.04+,
  Fedora 39+, etc.) and the install completes end-to-end without these
  workarounds.

The custom preset (`nemoclaw/presets/line-bot.yaml`), custom base policy
(`nemoclaw/iou-agent-policy.yaml`), and install wrapper
(`scripts/install_nemoclaw.sh`) are nevertheless committed so the integration
works with `./scripts/install_nemoclaw.sh && nemoclaw policy apply --preset
./nemoclaw/presets/line-bot.yaml --sandbox iou-agent` on a compatible host.

## Verification — proving the policy is real

After onboard completes on a compatible host:

```bash
nemoclaw iou-agent connect
# inside sandbox:

# allowed → should return 200 OK with chat completion
curl -sS -X POST -H "Authorization: Bearer $NVIDIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"nvidia/nemotron-3-super-120b-a12b","messages":[{"role":"user","content":"hi"}]}' \
  https://integrate.api.nvidia.com/v1/chat/completions

# denied by policy — wrong path on allowed host
curl -sS -o /dev/null -w "%{http_code}\n" \
  https://integrate.api.nvidia.com/v1/models
# expected: blocked

# denied by policy — host not allowlisted
curl -sS -o /dev/null -w "%{http_code}\n" https://example.com/
# expected: blocked

# denied by policy — disallowed binary trying allowed host
wget -q -O- https://integrate.api.nvidia.com/v1/chat/completions
# expected: blocked (only node + openclaw may originate inference calls)
```
