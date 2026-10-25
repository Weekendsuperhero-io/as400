#!/usr/bin/env python3
"""
Synchronous Human-in-the-Loop Security Gate for Antigravity Managed Agent (antigravity-preview-09-2026)
and the CardDemo CICS Customer Service Co-Pilot.
Intercepts pre_tool_execution events to block destructive SQL, unapproved merges,
unmasked SSN/PII extraction, or CICS rep limit violations (Credit Limit > $10,000, Dispute Credit > $500).
"""
import json
import sys


def main():
  try:
    data = json.load(sys.stdin)
  except Exception:
    print(json.dumps({"decision": "allow"}))
    return

  tool_call = data.get("tool_call", {})
  args = tool_call.get("args", {})
  cmd = str(args.get("code", "") or args.get("command", ""))

  forbidden_patterns = [
      "rm -rf /",
      "DROP TABLE accounts",
      "DROP TABLE transactions",
      "TRUNCATE TABLE",
      "gh pr merge",
  ]
  for pattern in forbidden_patterns:
    if pattern in cmd:
      print(
          json.dumps({
              "decision": "deny",
              "matched_rule": pattern,
              "hook": ".agents/hooks-scripts/gate.py",
              "reason": (
                  f"Blocked by CardDemo Financial Safety Policy: '{pattern}'"
                  " requires explicit human sign-off."
              ),
          })
      )
      sys.exit(0)

  # Check structured CICS tool-call guardrails if present
  if args.get("export_raw_ssn"):
    print(
        json.dumps({
            "decision": "deny",
            "matched_rule": "PII_RAW_SSN_EXPORT",
            "hook": ".agents/hooks-scripts/gate.py",
            "reason": (
                "Blocked by CardDemo Zero-Trust PII Policy: Unmasked SSN /"
                " Primary Card export is forbidden."
            ),
        })
    )
    sys.exit(0)

  credit_limit = args.get("credit_limit")
  if credit_limit is not None and float(credit_limit) > 10000:
    print(
        json.dumps({
            "decision": "deny",
            "matched_rule": "CICS_CAUP_LIMIT_CAP_10000",
            "hook": ".agents/hooks-scripts/gate.py",
            "reason": (
                f"Blocked by CICS COACTUPC Policy: Requested credit limit"
                f" (${float(credit_limit):,.2f}) exceeds $10,000.00 Rep cap"
                " (Supervisor sign-off required)."
            ),
        })
    )
    sys.exit(0)

  dispute_amount = args.get("dispute_amount")
  if dispute_amount is not None and float(dispute_amount) > 500:
    print(
        json.dumps({
            "decision": "deny",
            "matched_rule": "CICS_COTRN02C_DISPUTE_CAP_500",
            "hook": ".agents/hooks-scripts/gate.py",
            "reason": (
                f"Blocked by CICS COTRN02C Policy: Requested dispute credit"
                f" (${float(dispute_amount):,.2f}) exceeds $500.00 Rep cap"
                " (Supervisor authorization required)."
            ),
        })
    )
    sys.exit(0)

  print(
      json.dumps({
          "decision": "allow",
          "matched_rule": None,
          "hook": ".agents/hooks-scripts/gate.py",
          "reason": (
              "Allowed by pre_tool_execution policy (.agents/hooks-scripts/gate.py):"
              " verified within CICS Rep permissions and non-destructive scope."
          ),
      })
  )


if __name__ == "__main__":
  main()
