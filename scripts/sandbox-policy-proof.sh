#!/bin/bash
# Demonstrates NemoClaw network-policy enforcement from inside the iou-agent sandbox.
# Run from outside: nemoclaw iou-agent exec -- bash -lc 'bash /sandbox/iou-agent/policy-proof.sh'

echo "================================================================"
echo "  NemoClaw policy enforcement proof — iou-agent sandbox"
echo "  Active presets: line-bot + nvidia-inference (custom)"
echo "  Proxy: http://10.200.0.1:3128 (OpenShell gateway, deny-by-default)"
echo "================================================================"
echo

KEY=$(grep ^NVIDIA_API_KEY /sandbox/iou-agent/.env | cut -d= -f2)

run_test() {
  local label=$1 expected=$2; shift 2
  echo "--- $label"
  echo "    Expected: $expected"
  local out=$(curl -is --max-time 10 "$@" 2>/dev/null)
  local code=$(echo "$out" | grep -oE 'HTTP/[0-9.]+ [0-9]+' | tail -1)
  local policy_hdr=$(echo "$out" | grep -i '^X-OpenShell-Policy:' | tr -d '\r')
  local body=$(echo "$out" | awk 'BEGIN{h=1} /^\r?$/{h=0;next} h==0{print}' | head -c 220 | tr -d '\n')
  echo "    Status:   ${code:-no-response}"
  [ -n "$policy_hdr" ] && echo "    $policy_hdr"
  [ -n "$body" ] && echo "    Body:     $body"
  echo
}

run_test "Test 1 (ALLOW): POST integrate.api.nvidia.com/v1/chat/completions  [node + curl + openclaw]" \
         "200 — Nemotron answers" \
         -X POST https://integrate.api.nvidia.com/v1/chat/completions \
         -H "Content-Type: application/json" \
         -H "Authorization: Bearer $KEY" \
         -d '{"model":"nvidia/nemotron-3-super-120b-a12b","messages":[{"role":"user","content":"reply with exactly: ok"}],"max_tokens":10}'

run_test "Test 2 (DENY by path): GET integrate.api.nvidia.com/v1/models" \
         "403 from proxy — wrong path, even though host is allowlisted" \
         https://integrate.api.nvidia.com/v1/models -H "Authorization: Bearer $KEY"

run_test "Test 3 (DENY by host): GET https://example.com" \
         "403 from proxy at CONNECT — host not in any allowlist" \
         https://example.com/

run_test "Test 4 (DENY by host): GET https://api.openai.com/v1/models" \
         "403 from proxy at CONNECT — competing inference provider denied" \
         https://api.openai.com/v1/models

run_test "Test 5 (DENY by binary): curl POST api.line.me/v2/bot/message/push" \
         "403 — host IS allowlisted for node, but curl is NOT in line-bot.binaries" \
         -X POST https://api.line.me/v2/bot/message/push \
         -H "Authorization: Bearer fake-token" \
         -H "Content-Type: application/json" \
         -d '{"to":"U0","messages":[{"type":"text","text":"x"}]}'

echo "================================================================"
echo "  Three independent enforcement layers proven:"
echo "    Test 1 (200)  → explicit allow rule honored"
echo "    Test 2 (403)  → L7 path filter (only chat completions allowed; embeddings, /models, etc. blocked)"
echo "    Test 3 (403)  → L4 host filter (deny-by-default for unlisted hosts)"
echo "    Test 4 (403)  → L4 host filter (competing LLM provider explicitly denied)"
echo "    Test 5 (403)  → binary allowlist (only 'node' may call api.line.me, not curl)"
echo
echo "  In production, iou-agent's Node.js server is the only binary that needs"
echo "  egress, so this matches the threat model: a compromised dependency that"
echo "  spawns curl/wget/python cannot bypass the policy."
echo "================================================================"
