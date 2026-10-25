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
  subprocess.run(
      ["cargo", "run", "--release", "--", "verify-parity"],
      cwd=str(workspace_dir),
      check=True,
  )

  measured_path = workspace_dir / "MEASURED_IMPROVEMENT_REPORT.json"
  with open(measured_path, "r", encoding="utf-8") as f:
    measured = json.load(f)

  print("\n📊 Measured Improvement Summary:")
  print(f"  • Legacy JCL Batch Baseline : {measured['legacy_baseline_ms']} ms")
  print(f"  • Modern Safe Rust Engine   : {measured['rust_execution_ms']} ms")
  print(f"  • Measured Speedup          : {measured['speedup_vs_legacy']}x faster")
  print(f"  • Golden Account Parity     : {measured['accounts_matched']}/{measured['accounts_verified']} ({measured['parity_pct']:.2f}%)")
  print(f"  • Max Cent Discrepancy      : ${measured['max_cent_drift']}")


def launch_remote_managed_agent(workspace_dir: Path):
  from google import genai

  api_key = os.environ.get("GEMINI_API_KEY")
  if not api_key:
    raise RuntimeError(
        "GEMINI_API_KEY is not set. Set GEMINI_API_KEY or run with --verify-local."
    )

  client = genai.Client(api_key=api_key)
  skill_content = (
      workspace_dir / ".agents" / "skills" / "carddemo-modernizer" / "SKILL.md"
  ).read_text(encoding="utf-8")
  hooks_content = (workspace_dir / ".agents" / "hooks.json").read_text(
      encoding="utf-8"
  )
  gate_content = (
      workspace_dir / ".agents" / "hooks-scripts" / "gate.py"
  ).read_text(encoding="utf-8")

  print("🚀 Launching Antigravity Managed Agent (antigravity-preview-09-2026 + gemini-4-argon)...")
  interaction = client.interactions.create(
      agent="antigravity-preview-09-2026",
      agent_config={
          "type": "antigravity",
          "model": "gemini-4-argon",
      },
      system_instruction=(
          "You are a principal mainframe modernization engineer. "
          "Always run the golden baseline harness first and verify 100.00% penny-exact parity before finishing."
      ),
      input=(
          "Execute the carddemo-modernizer skill on aws-mainframe-modernization-carddemo. "
          "1. Audit all 8 artifact classes (COBOL, Copybooks, BMS 3270, VSAM overpunch seed files, DB2 DDL/DCLGEN, IMS DBD/PSB, JCL, Assembler). "
          "2. Run the Golden Baseline Harness on app/data/ASCII. "
          "3. Build the unified SQLite + Safe Rust (axum + rust_decimal) + React 19 Dual-Mode 3270/Modern application. "
          "4. Verify 100.00% ($0.00 drift) parity across all 50 accounts and emit MEASURED_IMPROVEMENT_REPORT.json."
      ),
      background=True,
      environment={
          "type": "remote",
          "sources": [
              {
                  "type": "inline",
                  "target": ".agents/skills/carddemo-modernizer/SKILL.md",
                  "content": skill_content,
              },
              {
                  "type": "inline",
                  "target": ".agents/hooks.json",
                  "content": hooks_content,
              },
              {
                  "type": "inline",
                  "target": ".agents/hooks-scripts/gate.py",
                  "content": gate_content,
              },
          ],
      },
  )

  print(f"✓ Created Managed Agent Interaction: {interaction.id}")
  while getattr(interaction, "status", None) in ("in_progress", "queued"):
    time.sleep(5)
    interaction = client.interactions.get(id=interaction.id)
    print(f"  Status: {interaction.status}")

  print(getattr(interaction, "output_text", "Completed."))


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
  if args.verify_local or not os.environ.get("GEMINI_API_KEY"):
    run_local_verification(root)
  else:
    launch_remote_managed_agent(root)
