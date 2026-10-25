---
name: carddemo-modernizer
description: Autonomously researches, benchmarks, rewrites, and verifies the multi-artifact AWS CardDemo mainframe repository (COBOL, CICS, BMS 3270, VSAM, DB2, IMS, JCL, Assembler) into a modern Safe Rust + SQLite + React 19 product with 100.00% golden parity.
---

# CardDemo Autonomous Mainframe Modernization Workflow

## Phase 1: Deep Multi-Artifact Research (1M Unified Context)
1. Scan the entire `aws-mainframe-modernization-carddemo/app/` directory tree across all 8 artifact classes:
   - `app/cpy/*.cpy` and `app/cpy-bms/*.cpy` (VSAM & Screen Copybooks)
   - `app/cbl/CB*.cbl` (Batch COBOL) and `app/cbl/CO*.cbl` (Online CICS COBOL)
   - `app/bms/*.bms` (3270 Green-Screen Maps) and `app/csd/CARDDEMO.CSD` (Transaction IDs)
   - `app/jcl/*.jcl` and `app/ctl/*` (Batch DAGs, SORT fields, IDCAMS rules)
   - `app/app-transaction-type-db2/` (DB2 DDL, DCLGENs, Embedded SQL cursors)
   - `app/app-authorization-ims-db2-mq/` (IMS DBD/PSB segments, MQ layouts, Fraud DB2 table)
   - `app/asm/*.asm` (Mainframe Assembler utilities)
   - `app/data/ASCII/*` (Seed files: inspect byte-level encoding for signed zoned-decimal overpunch characters `{`, `}`, `A`–`I`, `J`–`R`).
2. Emit `MAINFRAME_DISCOVERY_REPORT.md` documenting:
   - The complete JCL + CICS + DB2 + VSAM + IMS dependency graph.
   - All 6 hidden mainframe landmines (overpunch byte offsets in `acctdata.txt` and `dailytran.txt`, `ACCT-ADDR-ZIP` vs `ACCT-GROUP-ID` misalignment triggering `DISCGRP-STATUS = '23'` fallback to `DEFAULT`, inverted sign semantics on `ACCT-CURR-CYC-DEBIT` in `CBTRN02C.cbl`, unrounded intermediate `COMPUTE` truncation in `CBACT04C.cbl`, EOF cycle reset behavior, and IMS 9's complement date/time keys).

## Phase 2: Automated Golden Baseline Harness
1. Run `python3 scripts/run_golden_baseline.py` against `aws-mainframe-modernization-carddemo/app/data/ASCII/`.
2. Record `golden_baseline/baseline_metrics.json`, `golden_accounts_post_batch.json`, `golden_rejects.json`, `golden_interest_transactions.json`, `golden_db2_tx_types.json`, and `golden_statements.txt`.

## Phase 3: Single-Pass 1M-Token Full-Stack Generation
1. `migrations/001_schema.sql`: Unified SQLite/PostgreSQL schema unifying VSAM KSDS/AIX, DB2 tables (`TRANSACTION_TYPE`, `TRANSACTION_TYPE_CATEGORY`, `AUTHFRDS`), and IMS segments (`PAUTSUM0`, `PAUTDTL1`).
2. `src/` (`carddemo-modern`, `#![forbid(unsafe_code)]`, `rust_decimal`, `axum`, `rusqlite`):
   - Bidirectional VSAM Overpunch flat-file codec (`src/vsam_codec.rs`)
   - Online CICS transaction engine (`src/cics_engine.rs`) for `CC00`, `CM00`, `CADM`, `CAVW`, `CAUP`, `CCLI`, `CT00`, `CBIL`, `CTLI`, `CPVS`
   - Nightly JCL Batch DAG & Golden Parity Verifier (`src/batch_engine.rs`)
3. `carddemo-web/` (React 19 + TypeScript + Tailwind):
   - Interactive split-screen / toggleable **1980s IBM `3270` Green-Screen Terminal** AND **Modern Instant Banking & Back-Office Web App**.

## Phase 4: Closed-Loop Sandbox Verification & Measured Improvement
1. Compile and run `cargo test && cargo run --release -- verify-parity`.
2. Verify all 50 accounts, 262 posted transactions, 38 rejects, and 50 interest transactions match `golden_accounts_post_batch.json` with `$0.00` drift (`100.00%` parity).
3. Emit `MEASURED_IMPROVEMENT_REPORT.json`.
