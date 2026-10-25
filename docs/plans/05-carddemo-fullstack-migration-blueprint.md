---
title: "CardDemo Full-Stack Mainframe & DB2 Migration Blueprint"
source: "https://github.com/aws-samples/aws-mainframe-modernization-carddemo"
date: 2026-10-25
category: "Execution Blueprint"
status: "active"
priority: "Critical"
track: "Problem Statement One: Million Token Engineering + Best Use of Managed Agents ($5,000)"
tags:
  - hackathon
  - carddemo
  - mainframe
  - cobol
  - db2
  - vsam
  - rust
  - managed-agents
  - gemini-4-argon
aliases:
  - "CardDemo Blueprint"
  - "CardDemo Migration Plan"
---

# 🏦 `CardDemo` Full-Stack Mainframe & DB2 Migration Blueprint

> [!IMPORTANT] Why This Architecture Wins Both PS1 + \$5,000 Managed Agents
> Instead of manually writing brittle C-FFI wrappers around IBM CICS/DB2 middleware, we hand the entire **`aws-samples/aws-mainframe-modernization-carddemo`** repository (~120 files across **COBOL, Copybooks, DB2 DDL/DCLGEN, VSAM, IMS, MQ, JCL, CSD, BMS `3270` Green Screens, and Assembler**) to the **Antigravity Managed Agent (`antigravity-preview-09-2026` + `gemini-4-argon`)**.
>
> The Managed Agent autonomously:
> 1. **Researches the entire 120-file repo in one 1M-token window** and uncovers hidden mainframe landmines (EBCDIC signed overpunch bytes in `acctdata.txt`, `V99` intermediate truncation in `CBACT04C.cbl`, and mandatory JCL `DFSORT` pre-sorting before `CBTRN02C.cbl`).
> 2. **Builds a Golden Baseline Harness inside the Linux sandbox** using `gnucobol` + raw VSAM/DB2 seed data.
> 3. **Emits the complete, zero-dependency Modern Stack in a single Long Decode pass**: **SQLite/PostgreSQL** (unifying VSAM + DB2 + IMS) + **Safe Rust (`axum` + `sqlx` + `rust_decimal`)** + **React 19 Dual-Mode UI (`3270` Green Screen ↔ Modern Banking Web App)**.
> 4. **Verifies 100.00% penny-exact transactional and batch parity** inside the Linux sandbox.

---

## 🏗️ 1. Complete Cross-Artifact Mapping (`CardDemo` → Modern Stack)

```mermaid
flowchart TD
    subgraph Legacy["📦 AWS CardDemo Repository (~120 Files Across 8 Mainframe Technologies)"]
        VSAM["1. VSAM KSDS + AIX Copybooks<br/>app/cpy/CVACT*.cpy, CVTRA*.cpy<br/>app/data/acctdata.txt, dalytx.txt"]
        DB2["2. DB2 DDL + DCLGEN + Embedded SQL<br/>app-transaction-type-db2/ctl/DB2CREAT.ctl<br/>COTRTLIC.cbl, COBTUPDT.cbl, AUTHFRDS"]
        IMS["3. IMS Hierarchical DB + IBM MQ<br/>app-authorization-ims-db2-mq/<br/>ims/DBPAUTP0.dbd, COPAUA0C.cbl"]
        JCL["4. JCL Batch Pipeline + IDCAMS/SORT<br/>app/jcl/COMBTRAN.jcl, INTCALC.jcl<br/>MNTTRDB2.jcl + COND= Step Checks"]
        BMS["5. BMS 3270 Green-Screen Maps<br/>app/bms/COSGN00.bms, COMEN01.bms,<br/>COACTVW.bms, COBIL00.bms, CTLI.bms"]
        CSD["6. CICS CSD + Assembler Utilities<br/>app/csd/CARDDEMO.CSD (CC00, CAVW, CBIL)<br/>app/asm/COBDATFT.asm, MVSWAIT.asm"]
    end

    Legacy --> Agent["🤖 Antigravity Managed Agent<br/>(antigravity-preview-09-2026 + gemini-4-argon)<br/>1M Context Research + Single-Pass Long Decode"]

    subgraph Sandbox["🐳 Verified Modern Product (Running Inside Antigravity Linux Container)"]
        DB["🗄️ Unified SQLite / PostgreSQL Engine<br/>- VSAM KSDS -> Indexed Relational Tables<br/>- VSAM AIX (CARDAIX) -> Secondary B-Tree Index<br/>- DB2 Tables (TRANSACTION_TYPE, AUTHFRDS) -> Native SQL<br/>- IMS Parent/Child (PAUTSUM0/PAUTDTL1) -> FK Tables"]
        RustCore["🦀 Safe Rust Core + Axum API (`carddemo-rs`)<br/>- Exact Decimal Math (`rust_decimal` + COBOL truncation)<br/>- Overpunch Parser (`{`, `A`-`I`, `}`, `J`-`R`)<br/>- CICS `DFHCOMMAREA` -> Stateless REST/JSON Routes<br/>- JCL Batch Runner (`sort -> post_tx -> calc_interest`)"]
        WebUI["🖥️ React 19 + TypeScript Dual-Mode Banking App<br/>- Left/Toggle: Live 24x80 `3270` Green-Screen Emulator<br/>- Right: Instant Modern Credit Card & Back-Office App<br/>- Command Palette (`Cmd+K` / `CC00` / `CBIL` / `PF3`)"]
        Parity["✅ Autonomous Golden Parity Loop<br/>- Compares 100% of Account Balances, Interest Postings,<br/>  DB2 Transaction Types & Statements vs Baseline"]
        
        DB --> RustCore --> WebUI
        RustCore --> Parity
    end

    Agent --> Sandbox
```

---

## 🔬 2. Deep-Dive: How Every Mainframe File Type Is Handled

### A. DB2 Files (`app/app-transaction-type-db2/` & `app/app-authorization-ims-db2-mq/`)
- **What's in the Repo:**
  - `ctl/DB2CREAT.ctl`: Raw DB2 DDL creating `CARDDEMO.TRANSACTION_TYPE`, `CARDDEMO.TRANSACTION_TYPE_CATEGORY`, and `CARDDEMO.AUTHFRDS` (fraud alerts).
  - `cpy/DCLTRTYP.cpy` & `DCLTRCAT.cpy`: DB2 `DCLGEN` host-variable copybooks included into COBOL via `EXEC SQL INCLUDE`.
  - `cbl/COTRTLIC.cbl`, `COTRTUPC.cbl`, `COBTUPDT.cbl`: CICS + Batch COBOL programs using `EXEC SQL DECLARE CURSOR`, `FETCH`, `UPDATE`, `COMMIT`, and checking `SQLCODE` (`0`, `+100` Not Found, `-803` Duplicate Key).
  - `data/`: Plain-text seed records loaded by `jcl/DB2LTTYP.jcl` and `DB2LTCAT.jcl`.
- **How the Managed Agent Migrates It:**
  1. Converts `DB2CREAT.ctl` directly into **SQLite / PostgreSQL migrations** (`migrations/001_schema.sql`) with strict foreign keys.
  2. Parses the plain-text DB2 seed files in `app-transaction-type-db2/data/` and seeds the database automatically inside the sandbox.
  3. Translates `SQLCODE` error branches (`-803`, `+100`) into typed Rust error enums that return the **exact same BMS screen message** (`RECORD ALREADY EXISTS` / `END OF DATA`) as the mainframe!

### B. VSAM Datasets (`KSDS`, `ESDS`, `RRDS`, and `AIX` Alternate Indexes)
- **What's in the Repo:**
  - `app/data/acctdata.txt` (Accounts), `custdata.txt` (Customers), `carddata.txt` (Cards), `cardxref.txt` (Card Cross-Reference), `dalytx.txt` (Daily Transactions), `usrsec.dat` (User Security).
  - `app/jcl/DEFGDGD.jcl` & `IDCAMS` definitions: Defines Primary Keys (`ACCT-ID`) and **Alternate Indexes (`CARDAIX`)** so CICS programs can look up cards either by 16-digit Card Number OR by 11-digit Account ID.
- **How the Managed Agent Migrates It:**
  1. **Bidirectional Flat-File Codec (`vsam_codec.rs`):** Reads the original fixed-width ASCII/EBCDIC `.txt` files directly (including **signed zoned-decimal overpunch bytes** like `{` for `+0` and `J` for `-1`), loads them into SQLite/Postgres, and **exports updated records back into fixed-width 300-byte `.txt` files** so the sandbox verification harness can `diff` the Rust batch output directly against the GnuCOBOL baseline output!

### C. JCL Batch Jobs (`app/jcl/*.jcl`) & PROCs (`app/proc/*.prc`)
- **What's in the Repo:**
  - `COMBTRAN.jcl`: Uses `SORT` / `IDCAMS` to merge and sort daily transactions before running `CBTRN02C.cbl` (Transaction Posting).
  - `INTCALC.jcl`: Runs `CBACT04C.cbl` (Monthly Interest Calculation) across all accounts and appends generated interest transactions.
  - `STATEMENT.jcl`: Runs `CBSTM03A.cbl` & `CBSTM03B.cbl` to generate plain-text and HTML/PDF monthly credit card statements.
- **How the Managed Agent Migrates It:**
  - Builds a unified Rust CLI & API endpoint (`cargo run --bin carddemo-batch -- run-nightly-cycle`) that executes the exact JCL DAG (`Sort -> Validate -> Post Transactions -> Calculate Interest -> Emit Statements`), checks step return codes (`RC <= 4`), and runs in **~3 milliseconds instead of 400+ milliseconds**.

### D. IMS Hierarchical DB (`DBD` / `PSB`) & IBM MQ (`app-vsam-mq/`)
- **What's in the Repo:**
  - `ims/DBPAUTP0.dbd`: Hierarchical `HIDAM` database with root segment `PAUTSUM0` (Pending Authorization Summary) and child segment `PAUTDTL1` (Authorization Details).
  - `cbl/COPAUA0C.cbl` & `CBPAUP0C.cbl`: Uses `EXEC DLI GU / GN / ISRT / DLET` calls and `MQGET` / `MQPUT` to process real-time credit card swipe authorizations and purge expired holds.
- **How the Managed Agent Migrates It:**
  - Maps the IMS parent/child segments into two relational tables (`pending_auth_summary` and `pending_auth_details` with `ON DELETE CASCADE`) and exposes the MQ authorization message layout (`cpy/MQ*.cpy`) as a high-throughput **JSON + Binary Fixed-Width Authorization API endpoint** (`POST /api/mq/authorize`).

---

## 🛠️ 3. Custom Managed Agent Skill (`carddemo-modernizer/SKILL.md`)

Here is the exact custom skill we attach to **`antigravity-preview-09-2026`** so the Managed Agent executes the 4-phase Research → Baseline → 1M Rewrite → Sandbox Verification loop autonomously:

```markdown
---
name: carddemo-modernizer
description: Autonomously researches, benchmarks, rewrites, and verifies the multi-artifact AWS CardDemo mainframe repository (COBOL, CICS, BMS 3270, VSAM, DB2, IMS, JCL, Assembler) into a modern Rust + SQLite + React 19 product with 100% golden parity.
---

# CardDemo Autonomous Mainframe Modernization Workflow

## Phase 1: Deep Multi-Artifact Research (1M Unified Context)
1. Scan the entire `app/` directory tree across all 8 artifact classes:
   - `app/cpy/*.cpy` and `app/cpy-bms/*.cpy` (VSAM & Screen Copybooks)
   - `app/cbl/CB*.cbl` (Batch COBOL) and `app/cbl/CO*.cbl` (Online CICS COBOL)
   - `app/bms/*.bms` (3270 Green-Screen Maps) and `app/csd/CARDDEMO.CSD` (Transaction IDs)
   - `app/jcl/*.jcl` and `app/ctl/*` (Batch DAGs, SORT fields, IDCAMS rules)
   - `app/app-transaction-type-db2/` (DB2 DDL, DCLGENs, Embedded SQL cursors)
   - `app/app-authorization-ims-db2-mq/` (IMS DBD/PSB segments, MQ layouts, Fraud DB2 table)
   - `app/asm/*.asm` (Mainframe Assembler utilities)
   - `app/data/*` (Seed files: inspect byte-level encoding for signed zoned-decimal overpunch characters `{`, `}`, `A`–`I`, `J`–`R`).
2. Emit `MAINFRAME_DISCOVERY_REPORT.md` documenting:
   - The complete JCL + CICS + DB2 + VSAM dependency graph.
   - Every undocumented edge case discovered (e.g., overpunch byte offsets in `acctdata.txt`, unrounded intermediate `COMPUTE` truncation in `CBACT04C.cbl`, mandatory `SORT` ordering in `COMBTRAN.jcl`, and `SQLCODE` error mappings).

## Phase 2: Automated Baseline Harness in the Linux Sandbox
1. Using the seed datasets in `app/data/` and `app/app-transaction-type-db2/data/`, run the baseline batch calculation & transaction posting harness (using `gnucobol` / reference evaluator) inside the sandbox.
2. Record `baseline_metrics.json`:
   - Execution time (`ms`) for nightly batch cycle (`COMBTRAN` + `INTCALC` + `STATEMENT`).
   - Golden output snapshots (`golden_accounts_post_batch.json`, `golden_statements.txt`, `golden_db2_tx_types.json`).

## Phase 3: Single-Pass 1M-Token Full-Stack Generation
Generate the complete modernized workspace in one coherent multi-file architecture:
1. `carddemo-db`: SQLite/PostgreSQL schema unifying VSAM KSDS/AIX, DB2 tables (`TRANSACTION_TYPE`, `TRANSACTION_TYPE_CATEGORY`, `AUTHFRDS`), and IMS segments (`PAUTSUM0`, `PAUTDTL1`), plus the bidirectional VSAM overpunch flat-file loader/exporter.
2. `carddemo-core` & `carddemo-api` (Safe Rust, `#[forbid(unsafe_code)]`, `rust_decimal`, `axum`):
   - All online CICS transactions (`CC00`, `CM00`, `CAVW`, `CAUP`, `CCLI`, `CCSL`, `CBIL`, `CT00`, `CTLI`, `CTTU`, `CPVS`).
   - Full Nightly Batch DAG runner (`COMBTRAN`, `INTCALC`, `STATEMENT`, `MNTTRDB2`, `CBPAUP0C`).
3. `carddemo-web` (React 19 + TypeScript + Tailwind):
   - Interactive split-screen / toggleable **1980s IBM `3270` Green-Screen Terminal** (rendered from the `.bms` coordinates with `PF3`/`PF4`/`PF7`/`PF8` keys) AND **Modern Instant Banking & Back-Office Web App**.

## Phase 4: Closed-Loop Sandbox Verification & Measured Improvement
1. Compile and run `cargo test --release` inside the Linux container.
2. Replay all seed accounts, daily transactions, DB2 maintenance operations, and monthly interest cycles against `golden_accounts_post_batch.json`.
3. If any account balance, interest posting, or statement line differs by even `$0.01`, autonomously patch the Rust decimal/overpunch logic and re-run until parity == `100.00%`.
4. Output `MEASURED_IMPROVEMENT_REPORT.json` comparing Baseline vs. Modernized execution latency, throughput, memory safety, and workflow keystrokes.
```

---

## 💻 4. Python Script to Launch the Managed Agent on `CardDemo`

```python
import time
from google import genai

client = genai.Client()

# 1. Create (or warm-reuse) the Linux Sandbox Environment with Rust, GnuCOBOL, SQLite, and Node
env = client.environments.create(
    config={
        "display_name": "carddemo-mainframe-sandbox",
        "container": {
            "image": "ubuntu:24.04",
            "packages": ["gnucobol", "rustc", "cargo", "sqlite3", "libsqlite3-dev", "nodejs", "npm", "git"],
        },
    }
)

# 2. Launch Antigravity Managed Agent with Gemini 4 Argon (1M Window + Long Decode + High Thinking)
interaction = client.interactions.create(
    agent="antigravity-preview-09-2026",
    model="gemini-4-argon",
    background=True,
    input="""
    Clone https://github.com/aws-samples/aws-mainframe-modernization-carddemo into /workspace/carddemo.
    Follow the carddemo-modernizer skill:
    1. Research all COBOL (.cbl), Copybook (.cpy), BMS (.bms), JCL (.jcl), CSD (.csd), DB2 (.ctl), IMS (.dbd/.psb), Assembler (.asm), and seed data files.
    2. Write MAINFRAME_DISCOVERY_REPORT.md highlighting overpunch bytes, COMP-3/V99 rounding rules, JCL sort dependencies, and DB2/IMS schemas.
    3. Build and run the Golden Baseline Harness on app/data/ and app-transaction-type-db2/data/.
    4. Generate the complete Rust (Axum + SQLite + rust_decimal) + React 19 (3270 Emulator <-> Modern Banking UI) application.
    5. Run the differential parity test suite in the sandbox until 100.00% penny-exact parity is achieved and emit MEASURED_IMPROVEMENT_REPORT.json.
    """,
    config={
        "environment_id": env.id,
        "thinking_Config": {"thinking_level": "high"},
        "skills": ["./skills/carddemo-modernizer"],
        "hooks_path": "./.agents/hooks.json",
    },
)

print(f"Launched Managed Agent Interaction: {interaction.id}")
```

---

## 🎬 5. The 3-Minute Live Demo Flow (No Slides!)

| Time | What You Show on Screen | Judge Impact |
| :--- | :--- | :--- |
| **0:00 – 0:40** | Show the raw **`aws-mainframe-modernization-carddemo`** repo (COBOL, BMS `3270` screens, DB2 `DB2CREAT.ctl`, IMS `DBD`, JCL batch jobs, and raw `acctdata.txt` with cryptic `{` / `A` overpunch bytes) + the live **`3270` Green-Screen Terminal** (`COSGN00` → `COMEN01` → `COBIL00`). | Judges see this isn't a toy snippet—it's a real multi-technology mainframe banking codebase with DB2, VSAM, CICS, and JCL. |
| **0:40 – 1:30** | Show the **Antigravity Managed Agent Research & Long Decode Pass**: Argon ingested all 8 mainframe artifact types in its 1M window, flagged the **3 hidden mainframe landmines** (signed overpunch bytes, `CBACT04C` intermediate cent truncation, and `COMBTRAN.jcl` sort preconditions), and emitted the unified **SQLite/Postgres + Safe Rust + React 19** workspace in one pass. | Directly proves **why 1M unified context + Long Decode + Managed Agents** is mandatory. |
| **1:30 – 2:15** | Run the **Live Sandbox Verification & Nightly Batch Benchmark** in the terminal: watch the Rust engine process the nightly JCL batch (`COMBTRAN` + `INTCALC` + `MNTTRDB2`) across all accounts and DB2 transaction types in **`2.8ms` vs. `410ms` baseline (`146x faster`)** with **`100.00% ($0.00 discrepancy)`** against the golden mainframe outputs. | Nails Problem Statement One's exact prompt: *"Pick something that has before seemed as a monumental task, do it, and measure your improvement over a baseline."* |
| **2:15 – 3:00** | Flip the **Live UI Toggle** from the `3270` Green Screen (`CC00` / `CAVW` / `CBIL` / `CTLI`) to the **Modern React 19 Banking & DB2 Admin App** running on the exact same database: execute a live Bill Payment, inspect a DB2 Transaction Type, and trigger an IMS/MQ Fraud Authorization hold in 1 click (`2.1s` vs `54s` of green-screen keystrokes). | Ends on a visceral, shipped tail-end product. |

---

## 🔗 Connected Vault Notes
- [[MonumentalShift Product Examples]]
- [[Legacy Systems Migration Pitch and Plan]]
- [[Managed Agents Strategy and Examples]]
- [[Problem Statements Minimal Set]]
- [[Welcome]]
