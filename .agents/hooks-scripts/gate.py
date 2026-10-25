#!/usr/bin/env python3
"""
Synchronous Human-in-the-Loop Security Gate for Antigravity Managed Agent (antigravity-preview-09-2026).
Intercepts pre_tool_execution events in the sandbox to block destructive financial DB mutations or unapproved merges.
"""
import json
import sys


def main():
  try:
    data = json.load(sys.stdin)
  except Exception:
    print(json.dumps({"decision": "allow"}))
    return

  tool_args = data.get("tool_call", {}).get("args", {})
  cmd = str(tool_args.get("code", "") or tool_args.get("command", ""))

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
              "reason": (
                  f"Blocked by CardDemo Financial Safety Policy: '{pattern}'"
                  " requires explicit human sign-off."
              ),
          })
      )
      sys.exit(0)

  print(json.dumps({"decision": "allow"}))


if __name__ == "__main__":
  main()
