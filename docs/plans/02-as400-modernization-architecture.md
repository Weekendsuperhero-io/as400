# 🏛️ Plan 02: AS/400 Modernization Architecture & Technical Blueprint

> **Event:** Gemini 4 Argon Hackathon  
> **Track:** Problem Statement #1 (*Million Token Engineering*)  
> **Source Platform:** IBM AS/400 (IBM i) — DDS Display Files, RPGLE, CL, DB2 for i  
> **Target Platform:** React 19 (Dual-Mode Keyboard UI) + Safe API (FastAPI/Rust) + PostgreSQL/SQLite

---

## 🏗️ End-to-End System Architecture

```mermaid
flowchart TD
    subgraph Legacy["📦 IBM AS/400 (IBM i) Source Repo"]
        DDS["1. DDS Display Files (.dspf)\nScreen layouts, fields, attributes\nSubfiles: SFL + SFLCTL\nIndicators: *IN03, *IN04, *IN90"]
        RPG["2. RPG / RPGLE / SQLRPGLE\nBusiness logic, subroutines (EXSR)\nCursor loops, calculations, math\nRecord locking & indicators"]
        CL["3. CL (Control Language)\nJob streams, overrides (OVRDBF)\nProgram calls (CALL), error traps (MONMSG)"]
        DB2["4. DB2 for i (PF & LF)\nPhysical Files (table definitions)\nLogical Files (keyed access paths & joins)"]
    end

    Legacy --> Agent["🤖 Antigravity Managed Agent\n(antigravity-preview-09-2026 + gemini-4-argon)\n1M Context Ingestion + Long Decode Synthesis"]

    subgraph Sandbox["🐳 Antigravity Linux Sandbox Target Stack"]
        DB["🗄️ Relational Database Engine\n- PF -> Relational Tables with Constraints\n- LF -> Secondary B-Tree / Composite Indexes\n- Seed Data Loaded & Validated"]
        API["⚡ Modern Backend API Service\n- Typed Data Models (Pydantic / Rust)\n- Business Logic extracted from RPG\n- Subfile pagination -> REST / WebSocket API"]
        UI["🖥️ Dual-Mode Keyboard-First Web App\n- Mode A: 24x80 5250 CRT Green-Screen Emulator\n- Mode B: Modern Web UI (Command Palette Cmd+K)\n- Full F-Key & Shortcut Parity"]
        Harness["✅ Golden Parity Verification Loop\n- Replays 200 Terminal Keystroke Sequences\n- Diffs API responses vs 5250 screens\n- Validates 100.00% Output Parity"]
        
        DB --> API --> UI
        API --> Harness
    end

    Agent --> Sandbox
```

---

## 🔬 Deconstructing AS/400 Artifacts & Transformation Rules

### 1. DDS Display Files (`.dspf`) & Subfiles (`SFL` / `SFLCTL`)
- **How AS/400 Works:**  
  DDS display files define the 24×80 character grid of the IBM 5250 terminal. Lists and tables are handled by **Subfiles**:
  - `SFL` (Subfile Record): Defines the repeating row layout (e.g., item number, description, quantity).
  - `SFLCTL` (Subfile Control Record): Controls subfile display (`SFLDSP`), initialization (`SFLINZ`), clearing (`SFLCLR`), and pagination (`SFLPAG` vs `SFLSIZ`).
  - **Indicators (`*IN`):** Boolean flags (`*IN01` to `*IN99`) wired to function keys (`CF03` = F3 Exit, `CF04` = F4 Prompt, `CF12` = F12 Cancel) and field display attributes (e.g., `*IN40` triggers reverse image or red error text).
- **Modern Target Transformation:**  
  - Maps `SFL` to responsive React data grids / virtualized tables with inline cell editing.
  - Converts indicators into typed UI state (`uiState.isError`, `uiState.isExitRequested`, `uiState.isPromptActive`).
  - Implements keyboard event listeners capturing `F1`–`F12`, `Tab`, `Enter`, and `Cmd+K` so veteran terminal operators never touch the mouse unless they want to!

### 2. RPG, RPGLE & Free-Format RPG Business Logic
- **How AS/400 Works:**  
  RPG evolved from fixed-column punch-card specifications (`F` File, `D` Definition, `C` Calculation) to RPG IV / Free Format. Business rules feature:
  - Calculation loops (`DOW`, `DOU`, `FOR`), subroutine calls (`EXSR`), and indicator conditioning (`IF *IN03 = *ON`).
  - Embedded SQL (`EXEC SQL DECLARE c1 CURSOR FOR ...`).
  - Packed and zoned decimal arithmetic (`Z-ADD`, `MULT`, `DIV`, rounding flags).
- **Modern Target Transformation:**  
  - Gemini 4 Argon extracts pure domain business logic from calculation specs.
  - Rewrites calculations into clean, typed Python/FastAPI functions or safe Rust routines with exact decimal arithmetic (`rust_decimal` or `decimal.Decimal`).
  - Replaces global indicator mutations with clean, structured return objects and HTTP status codes.

### 3. Control Language (CL / CLP)
- **How AS/400 Works:**  
  CL scripts orchestrate jobs on IBM i:
  - `OVRDBF` (Override Database File): Dynamically redirects file access to test libraries or temporary members.
  - `CALL PGM(...) PARM(...)`: Invokes RPG modules with positional parameter buffers.
  - `MONMSG` (Monitor Message): Catches system exception messages (`CPF0000`, `CPF2817`).
- **Modern Target Transformation:**  
  - Translated into modular API route controllers and orchestration scripts.
  - Environment variables replace `OVRDBF`.
  - Structured `try/catch` and custom exception hierarchies replace `MONMSG`.

### 4. DB2 for i: Physical Files (`PF`) & Logical Files (`LF`)
- **How AS/400 Works:**  
  - **Physical Files (PF):** Fixed-length record format storing actual data rows with field-level data dictionary definitions (`A` specs).
  - **Logical Files (LF):** Views and indexes built over one or more physical files, defining alternative key access paths (e.g., look up customer by SSN vs account number) or select/omit criteria.
- **Modern Target Transformation:**  
  - PFs become relational tables with primary keys, typed columns, and check constraints (`migrations/001_initial.sql`).
  - LFs become relational `INDEX`es and SQL `VIEW`s, maintaining the exact same query efficiency without proprietary database hooks.

---

## 🔄 Dual-Execution Golden Parity Verification Loop

To guarantee that no business rule is broken during modernization:

```mermaid
flowchart LR
    TestGen["Synthetic Test Input Suite\n(200 Warehouse & Inventory Transactions)"] --> ExecAS400["Run Baseline AS/400 Engine\n(Mock 5250 State Machine)"]
    TestGen --> ExecModern["Run Modern API & Web Backend\n(FastAPI / Rust + SQLite)"]

    ExecAS400 --> VecA["State Vector A\n- Database Rows\n- Balances / Quantities\n- Screen Error Messages\n- Function Key Flags"]
    ExecModern --> VecB["State Vector B\n- Database Rows\n- Balances / Quantities\n- JSON Error Responses\n- Action State Flags"]

    VecA --> DiffEngine{"Automated Parity Diff Engine\n(Antigravity Sandbox)"}
    VecB --> DiffEngine

    DiffEngine -->|Parity == 100.00%| Pass["✅ Green Light: Safe Cutover Verified"]
    DiffEngine -->|Parity != 100.00%| Fail["❌ Block Cutover & Refine Code"]
```

1. **Transaction Inputs:** 200 randomized realistic operations (item lookup, bin transfers, inventory adjustments, purchase orders, reorder warnings).
2. **State Vectors Captured:**
   - Pre- and post-transaction database records.
   - Field validation error codes.
   - Inventory quantity and financial balance calculations.
3. **Verification Criterion:** `100.00%` equivalence on all outputs before deployment.
