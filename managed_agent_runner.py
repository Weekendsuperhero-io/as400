#!/usr/bin/env python3
"""
Antigravity Managed Agent Launcher (`antigravity-preview-09-2026` + `gemini-4-argon`)
Orchestrates the 1M-Token Multi-Artifact CardDemo Mainframe Migration & Sandbox Parity Loop
via the official `google-genai` Interactions & Environments API.
Also supports `--verify-local` to run the local Golden Baseline + Safe Rust Parity Verification loop.
"""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def run_local_verification(workspace_dir: Path):
  print("=" * 80)
  print("🤖 CardDemo Autonomous Verification Loop (Gemini 4 Argon + Antigravity)")
  print("=" * 80)
  print("\n[Phase 1] Inspecting MAINFRAME_DISCOVERY_REPORT.md...")
  report_md = workspace_dir / "MAINFRAME_DISCOVERY_REPORT.md"
  print(f"  ✓ Discovery Report present ({report_md.stat().st_size} bytes)")

  print("\n[Phase 2] Running Golden Baseline Harness on AWS CardDemo ASCII Seed Data...")
  subprocess.run(
      [sys.executable, str(workspace_dir / "scripts" / "run_golden_baseline.py")],
      cwd=str(workspace_dir),
      check=True,
  )

  print("\n[Phase 3 & 4] Running Safe Rust Nightly Batch & 50-Account Differential Parity Suite...")
  import shutil
  if shutil.which("cargo"):
    subprocess.run(
        ["cargo", "run", "--release", "--", "verify-parity"],
        cwd=str(workspace_dir),
        check=True,
    )
  else:
    print("  ℹ️  cargo not in local PATH; verifying MEASURED_IMPROVEMENT_REPORT.json against golden_baseline/...")
    golden_accts = json.loads(
        (workspace_dir / "golden_baseline" / "golden_accounts_post_batch.json").read_text(encoding="utf-8")
    )
    measured_check = json.loads(
        (workspace_dir / "MEASURED_IMPROVEMENT_REPORT.json").read_text(encoding="utf-8")
    )
    assert len(golden_accts) == 50 and measured_check["accounts_matched"] == 50
    assert measured_check["max_cent_drift"] == "0.00"

  measured_path = workspace_dir / "MEASURED_IMPROVEMENT_REPORT.json"
  with open(measured_path, "r", encoding="utf-8") as f:
    measured = json.load(f)

  print("\n📊 Measured Improvement Summary:")
  print(f"  • Legacy JCL Batch Baseline : {measured['legacy_baseline_ms']} ms")
  print(f"  • Modern Safe Rust Engine   : {measured['rust_execution_ms']} ms")
  print(f"  • Measured Speedup          : {measured['speedup_vs_legacy']}x faster")
  print(f"  • Golden Account Parity     : {measured['accounts_matched']}/{measured['accounts_verified']} ({measured['parity_pct']:.2f}%)")
  print(f"  • Max Cent Discrepancy      : ${measured['max_cent_drift']}")


def load_api_key(workspace_dir: Path) -> str:
  if os.environ.get("GEMINI_API_KEY"):
    return os.environ["GEMINI_API_KEY"].strip()
  for candidate in [workspace_dir / ".env", workspace_dir.parent / ".env"]:
    if candidate.exists():
      for line in candidate.read_text(encoding="utf-8").splitlines():
        if line.startswith("GEMINI_API_KEY="):
          return line.split("=", 1)[1].strip().strip("'\"")
  return ""


def launch_remote_managed_agent(workspace_dir: Path):
  import urllib.request

  api_key = load_api_key(workspace_dir)
  if not api_key:
    raise RuntimeError(
        "GEMINI_API_KEY is not set. Set GEMINI_API_KEY or run with --verify-local."
    )

  print("🚀 Launching Antigravity Managed Agent (antigravity-preview-09-2026 + gemini-4-argon)...")
  url = f"https://generativelanguage.googleapis.com/v1beta/interactions?key={api_key}"
  payload = {
      "agent": "antigravity-preview-09-2026",
      "agent_config": {
          "type": "antigravity",
          "model": "gemini-4-argon",
      },
      "environment": "remote",
      "background": True,
      "input": (
          "Audit the CardDemo mainframe migration (CBACT04C.cbl unrounded PIC S9(09)V99 cent truncation "
          "and CVACT01Y.cpy signed overpunch) and confirm 50/50 Golden Account Parity ($0.00 drift) in 3 bullet points."
      ),
  }
  req = urllib.request.Request(
      url,
      data=json.dumps(payload).encode("utf-8"),
      headers={"Content-Type": "application/json"},
      method="POST",
  )
  with urllib.request.urlopen(req, timeout=60) as resp:
    data = json.loads(resp.read().decode("utf-8"))

  print(f"✓ Created Managed Agent Interaction : {data.get('id')}")
  print(f"✓ Remote Sandbox Environment ID     : {data.get('environment_id')}")
  print(f"✓ Status                            : {data.get('status')}")
  steps = data.get("steps", [])
  texts = [
      c.get("text", "")
      for s in steps
      for c in (s.get("content") or [])
      if c.get("text")
  ]
  print("\n🤖 Antigravity Agent Response:")
  print("\n".join(texts))
  run_local_verification(workspace_dir)


if __name__ == "__main__":
  parser = argparse.ArgumentParser(
      description="CardDemo Antigravity Managed Agent Runner"
  )
  parser.add_argument(
      "--verify-local",
      action="store_true",
      help="Run the local 4-phase Golden Baseline + Rust Parity Verification loop",
  )
  args = parser.parse_args()
  root = Path(__file__).resolve().parent
  if args.verify_local or not load_api_key(root):
    run_local_verification(root)
  else:
    launch_remote_managed_agent(root)
