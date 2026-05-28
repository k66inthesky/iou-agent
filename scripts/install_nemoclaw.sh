#!/usr/bin/env bash
# Installs NemoClaw + onboards an OpenClaw sandbox configured for iou-agent.
#
# Prerequisites:
#   - Docker running and reachable from this shell (`docker ps` succeeds).
#   - Node.js 22+ on PATH (we already installed via nvm).
#   - .env populated with NVIDIA_API_KEY (or pass NVIDIA_API_KEY=... when invoking).
#
# Idempotent: safe to re-run. If a sandbox with the same name exists, onboard
# will refuse to recreate unless NEMOCLAW_RECREATE_SANDBOX=1.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# Pull NVIDIA_API_KEY out of .env without `source` — robust against values
# that contain spaces, wildcards, or shell metacharacters.
if [[ -z "${NVIDIA_API_KEY:-}" && -f .env ]]; then
  while IFS='=' read -r key value; do
    case "$key" in
      \#*|'') continue ;;
      NVIDIA_API_KEY) export NVIDIA_API_KEY="${value%\"}"; export NVIDIA_API_KEY="${NVIDIA_API_KEY#\"}" ;;
    esac
  done < .env
fi

if [[ -z "${NVIDIA_API_KEY:-}" ]]; then
  echo "ERROR: NVIDIA_API_KEY is not set. Put it in .env or export it before running." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not on PATH. Enable Docker Desktop's WSL integration." >&2
  exit 1
fi
if ! docker ps >/dev/null 2>&1; then
  echo "ERROR: docker daemon not reachable. Make sure Docker Desktop is running." >&2
  exit 1
fi

# Ensure nvm-managed node is on PATH.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
fi

SANDBOX_NAME="${NEMOCLAW_SANDBOX:-iou-agent}"
PROVIDER="${NEMOCLAW_PROVIDER:-build}"  # build = NVIDIA Build (integrate.api.nvidia.com) using NVIDIA_API_KEY

# WSL almost never has NVIDIA Container Toolkit + CDI spec ready, and we don't
# need GPU passthrough (Nemotron runs in NVIDIA's cloud). Default to --no-gpu;
# set NEMOCLAW_WITH_GPU=1 to opt back in on a properly configured host.
NO_GPU_FLAG="--no-gpu"
[[ "${NEMOCLAW_WITH_GPU:-0}" == "1" ]] && NO_GPU_FLAG=""

# Step 1: install the CLI (curl|bash from nvidia.com — the official channel
# documented in https://github.com/NVIDIA/NemoClaw README).
if ! command -v nemoclaw >/dev/null 2>&1; then
  echo "==> Installing NemoClaw CLI..."
  curl -fsSL https://www.nvidia.com/nemoclaw.sh | \
    NEMOCLAW_NON_INTERACTIVE=1 \
    NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE=1 \
    NEMOCLAW_YES=1 \
    bash
  # New PATH entry — add ~/.local/bin if not already on PATH.
  export PATH="$HOME/.local/bin:$PATH"
else
  echo "==> nemoclaw CLI already installed: $(nemoclaw --version 2>&1)"
fi

# Step 2: onboard the sandbox. Runs separately so we can pass --no-gpu.
echo "==> Onboarding sandbox '$SANDBOX_NAME' (provider=$PROVIDER, no-gpu=${NEMOCLAW_WITH_GPU:-1 disabled})..."
NEMOCLAW_NON_INTERACTIVE=1 \
NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE=1 \
NEMOCLAW_YES=1 \
NEMOCLAW_AGENT=openclaw \
NEMOCLAW_PROVIDER="$PROVIDER" \
NEMOCLAW_SANDBOX_NAME="$SANDBOX_NAME" \
# Valid tiers in NemoClaw v0.0.50: restricted | balanced | open.
# restricted = Nemotron inference + core only (matches iou-agent's deny-by-default posture).
NEMOCLAW_POLICY_TIER="${NEMOCLAW_POLICY_TIER:-restricted}" \
nemoclaw onboard $NO_GPU_FLAG

echo
echo "==> Applying custom policy presets (nvidia-inference + line-bot)..."
nemoclaw "$SANDBOX_NAME" policy-add --from-file "$REPO_DIR/nemoclaw/iou-agent-policy.yaml" --yes
nemoclaw "$SANDBOX_NAME" policy-add --from-file "$REPO_DIR/nemoclaw/presets/line-bot.yaml" --yes
nemoclaw "$SANDBOX_NAME" policy-add npm --yes   # transient — for npm install inside sandbox

echo
echo "==> Pushing repo into sandbox at /sandbox/iou-agent..."
tar -cf - --exclude=node_modules --exclude=data --exclude=.git --exclude='.env.local' -C "$REPO_DIR" . \
  | nemoclaw "$SANDBOX_NAME" exec --no-tty -- bash -c 'mkdir -p /sandbox/iou-agent && cd /sandbox/iou-agent && tar -xf -'

echo
echo "==> Installing dependencies inside sandbox (npm install)..."
nemoclaw "$SANDBOX_NAME" exec --timeout 240 --no-tty -- bash -lc \
  'cd /sandbox/iou-agent && npm install --no-fund --no-audit 2>&1 | tail -3'

echo
echo "==> Sandbox status:"
nemoclaw "$SANDBOX_NAME" status || true

echo
echo "==> Done. iou-agent is policy-sandboxed and ready."
echo
echo "  Start it (Express server on :3000, LINE webhook + Nemotron extraction):"
echo "       nemoclaw $SANDBOX_NAME exec --no-tty -- bash -lc 'cd /sandbox/iou-agent && npm start'"
echo
echo "  Or shell into the sandbox interactively:"
echo "       nemoclaw $SANDBOX_NAME connect"
echo "       (inside) cd /sandbox/iou-agent && npm start"
echo
echo "  Prove the policy is enforcing (1 allow + 4 deny):"
echo "       nemoclaw $SANDBOX_NAME exec -- bash /sandbox/iou-agent/scripts/sandbox-policy-proof.sh"
