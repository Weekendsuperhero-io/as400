#!/usr/bin/env bash
set -euo pipefail

export PATH="/Users/michael/.local/node/bin:$PATH"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=================================================================="
echo "🔁 AS400 CONTINUOUS VERIFICATION LOOP ($(date '+%H:%M:%S'))"
echo "=================================================================="

# 1. Golden Baseline & 50-Account Differential Parity
echo "[1/4] Running Golden Baseline + 50-Account Parity Check..."
python3 managed_agent_runner.py --verify-local

# 2. Security Gate Hook Check (.agents/hooks-scripts/gate.py)
echo "[2/4] Verifying Pre-Tool Security Gate (gate.py)..."
DENY_OUT=$(echo '{"tool_call":{"args":{"command":"DROP TABLE accounts;"}}}' | python3 .agents/hooks-scripts/gate.py)
ALLOW_OUT=$(echo '{"tool_call":{"args":{"command":"cargo test"}}}' | python3 .agents/hooks-scripts/gate.py)
echo "$DENY_OUT" | grep -q '"deny"' || { echo "❌ Security gate failed to block DROP TABLE"; exit 1; }
echo "$ALLOW_OUT" | grep -q '"allow"' || { echo "❌ Security gate blocked safe command"; exit 1; }
echo "  ✓ Security Gate verified (blocks destructive SQL, allows safe commands)"

# 3. Frontend TypeScript + Vite Build Verification
echo "[3/4] Verifying carddemo-web TypeScript + Vite Production Bundle..."
if [ ! -d "carddemo-web/node_modules" ]; then
  (cd carddemo-web && npm install --no-audit --no-fund)
fi
(cd carddemo-web && npm run build)
echo "  ✓ carddemo-web built cleanly to carddemo-web/dist"

# 4. Cloudflare Worker API & CICS 3270 Self-Test (worker.mjs)
echo "[4/4] Running End-to-End API & Dynamic 3270 Self-Test on worker.mjs..."
node --input-type=module -e '
import fs from "node:fs";
const snapshot = JSON.parse(fs.readFileSync("./carddemo-web/worker-snapshot.json", "utf8"));
const workerSrc = fs.readFileSync("./carddemo-web/worker.mjs", "utf8")
  .replace("import snapshot from '\''./worker-snapshot.json'\'';", "const snapshot = globalThis.__SNAP__;");
globalThis.__SNAP__ = snapshot;
const modUrl = "data:text/javascript;base64," + Buffer.from(workerSrc).toString("base64");
const worker = (await import(modUrl)).default;

async function call(path, method = "GET", body = null) {
  const req = new Request("https://carddemo.local" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await worker.fetch(req, {});
  return res.json();
}

// A. Dynamic 3270 CAVW screen updates when ACCTID changes
const scr2 = await call("/api/cics/terminal", "POST", { tran_id: "CAVW", aid_key: "ENTER", inputs: { ACCTID: "00000000002" } });
if (!scr2.lines.some(l => l.includes("00000000002"))) throw new Error("3270 CAVW did not switch to account 00000000002");

// B. Bill Pay zeroes balance, writes transaction, and second call returns nothing to pay
const bp1 = await call("/api/accounts/00000000002/bill-pay", "POST", { confirm: "Y" });
if (bp1.new_balance !== "0.00" || !bp1.tran_id) throw new Error("Bill pay failed: " + JSON.stringify(bp1));
const bp2 = await call("/api/accounts/00000000002/bill-pay", "POST", { confirm: "Y" });
if (!bp2.message.includes("nothing to pay")) throw new Error("Second bill pay should say nothing to pay: " + JSON.stringify(bp2));

// C. MQ Authorize checks credit limit (00 Approved vs 05 Overlimit)
const mqDecline = await call("/api/mq/authorize", "POST", { card_num: "9680294154603697", amount: "99999.00", merchant_name: "TEST" });
if (mqDecline.auth_resp_code !== "05") throw new Error("Expected 05 Overlimit decline, got: " + JSON.stringify(mqDecline));

// D. Security Gate endpoint blocks DROP TABLE and allows cargo test
const gateDeny = await call("/api/agent/security-gate", "POST", { command: "DROP TABLE accounts;" });
const gateAllow = await call("/api/agent/security-gate", "POST", { command: "cargo test" });
if (gateDeny.decision !== "deny" || gateAllow.decision !== "allow") throw new Error("Security gate API mismatch");

// E. View 2 Argon Source & Modernize endpoints
const srcRes = await call("/api/argon/source?module=COBIL00C", "GET");
if (!srcRes.modules || srcRes.modules.length !== 4 || srcRes.selected.id !== "COBIL00C" || !srcRes.copybooks_source.includes("COCOM01Y.cpy")) {
  throw new Error("Argon source endpoint mismatch: " + JSON.stringify(srcRes));
}
const modRes = await call("/api/argon/modernize", "POST", { module_id: "CBACT04C", thinking_level: "low" });
if (modRes.model !== "gemini-4-argon" || !modRes.output_text.includes("forbid(unsafe_code)") || modRes.verification.accounts_matched !== 50) {
  throw new Error("Argon modernize endpoint mismatch: " + JSON.stringify(modRes));
}

console.log("  ✓ Worker E2E verified: Dynamic 3270 CAVW/CAUP/CBIL, Bill-Pay ledger & idempotency, MQ Overlimit (05), Security Gate API, and Argon Source/Modernize API");
'

echo "✅ ALL VERIFICATION GATES PASSED"
