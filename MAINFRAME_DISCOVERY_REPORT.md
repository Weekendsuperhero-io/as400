# 🏦 `CardDemo` Multi-Artifact Mainframe Discovery Report

**Repository Analyzed:** `aws-samples/aws-mainframe-modernization-carddemo`  
**Orchestration Engine:** Antigravity Managed Agent (`antigravity-preview-09-2026` + `gemini-4-argon` 1M Unified Context)  
**Target Workspace:** `as400` (`carddemo-modern`)

---

## 1. Executive Summary & 8-Technology Inventory

By ingesting the entire `aws-mainframe-modernization-carddemo/app/` tree in a single 1M-token context window, we mapped all **8 coupled mainframe artifact families** and their implicit runtime contracts:

| # | Mainframe Technology | Source Directories | Key Artifacts | Modern Target |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **VSAM KSDS + AIX Copybooks & Seed Files** | `app/cpy/CV*.cpy`, `app/data/ASCII/*.txt`, `app/data/EBCDIC/*.PS` | `CVACT01Y` (300B), `CVACT02Y` (150B), `CVACT03Y` (50B), `CVCUS01Y` (500B), `CVTRA01Y`–`06Y` (50B–350B), `CSUSR01Y` (80B) | Bidirectional Rust Overpunch Codec (`vsam_codec.rs`) + Indexed SQLite Tables |
| **2** | **Online CICS COBOL Programs (`DFHCOMMAREA`)** | `app/cbl/CO*.cbl`, `app/cpy/COCOM01Y.cpy` | `COSGN00C`, `COMEN01C`, `COADM01C`, `COACTVWC`, `COACTUPC`, `COCRDLIC`, `COCRDSLC`, `COCRDUPC`, `COTRN00C`–`02C`, `COBIL00C`, `CORPT00C`, `COUSR00C`–`03C` | Safe Rust `axum` REST & CICS Terminal State Machine (`cics_engine.rs`) |
| **3** | **Batch COBOL Programs** | `app/cbl/CB*.cbl` | `CBTRN01C`, `CBTRN02C` (Posting), `CBTRN03C`, `CBACT04C` (Interest), `CBSTM03A`/`B` (Statements), `CBEXPORT`/`CBIMPORT` | Deterministic Rust Batch Engine (`batch_engine.rs`) with `rust_decimal` |
| **4** | **BMS `3270` Green-Screen Maps & CSD** | `app/bms/*.bms`, `app/cpy-bms/*.cpy`, `app/csd/CARDDEMO.CSD` | 19 BMS 24×80 Screen Maps (`COSGN00`, `COMEN01`, `COACTVW`, `COBIL00`, `COTRTLI`, `COPAU00`, etc.) + CICS Transaction IDs (`CC00`, `CM00`, `CAVW`, `CAUP`, `CBIL`, `CTLI`, `CPVS`) | Dual-Mode React 19 UI: Live 24×80 `3270` Emulator ↔ Instant Banking Web App |
| **5** | **JCL Batch Pipelines & `IDCAMS`/`SORT`** | `app/jcl/*.jcl`, `app/proc/*.prc`, `app/ctl/*.ctl` | `COMBTRAN.jcl`, `POSTTRAN.jcl`, `INTCALC.jcl`, `CREASTMT.JCL`, `MNTTRDB2.jcl` | Unified Nightly Batch DAG (`run-nightly-cycle`) with `RC` step gating |
| **6** | **DB2 Relational Tables, `DCLGEN` & Cursors** | `app/app-transaction-type-db2/` | `DB2CREAT.ctl` (`CARDDEMO.TRANSACTION_TYPE`, `TRANSACTION_TYPE_CATEGORY`), `COTRTLIC.cbl`, `COTRTUPC.cbl`, `COBTUPDT.cbl` | Relational SQL Tables + `SQLCODE` (`0`, `+100`, `-803`, `-530`) Exact Emulation |
| **7** | **IMS Hierarchical DB (`HIDAM`), MQ & Fraud DB2** | `app/app-authorization-ims-db2-mq/` | `DBPAUTP0.dbd` (`PAUTSUM0` root / `PAUTDTL1` child), `AUTHFRDS.ddl`, `COPAUA0C.cbl` (MQ Auth), `COPAUS0C`/`1C`/`2C`, `CBPAUP0C.cbl` | Relational Parent/Child Tables + 9's Complement Key Ordering + `/api/mq/authorize` |
| **8** | **Assembler Utilities** | `app/asm/*.asm` | `COBDATFT.asm` (Date format converter), `MVSWAIT.asm` (Timer wait) | Native Safe Rust `chrono` / async utilities (`#[forbid(unsafe_code)]`) |

---

## 2. Six Hidden Mainframe Landmines Discovered in `CardDemo`

A naive file-by-file LLM translation fails on `CardDemo` because critical business rules are split across JCL sort cards, ASCII/EBCDIC zoned-decimal bytes, copybook offsets, and unrounded COBOL `COMPUTE` statements:

### Landmine #1: Signed Zoned-Decimal Overpunch Bytes in `acctdata.txt`, `dailytran.txt`, `tcatbal.txt`, and `discgrp.txt`
In COBOL `PIC S9(n)V99` (DISPLAY numeric without `SIGN IS SEPARATE`), the sign is embedded in the high nibble of the **final (least-significant cent) byte**:
- **Positive (`0xC0` EBCDIC zone → ASCII `{`, `A`–`I`):** `{` = `+0`, `A` = `+1`, `B` = `+2`, `C` = `+3`, `D` = `+4`, `E` = `+5`, `F` = `+6`, `G` = `+7`, `H` = `+8`, `I` = `+9`.
- **Negative (`0xD0` EBCDIC zone → ASCII `}`, `J`–`R`):** `}` = `-0`, `J` = `-1`, `K` = `-2`, `L` = `-3`, `M` = `-4`, `N` = `-5`, `O` = `-6`, `P` = `-7`, `Q` = `-8`, `R` = `-9`.
- **Real Examples in `dailytran.txt`:**
  - `0000005047G` (Tx `0000000000683580`) → `G` is `+7`, yielding **`+$504.77`**.
  - `0000009190}` (Tx `0000000001774260`) → `}` is `-0`, yielding **`-$919.00`**.
  - `0000000567P` (Tx `0000000016259484`) → `P` is `-7`, yielding **`-$56.77`**.
  - `0000005358Q` (Tx `0000000019065428`) → `Q` is `-8`, yielding **`-$535.88`**.

### Landmine #2: Misaligned `ACCT-ADDR-ZIP` vs. `ACCT-GROUP-ID` in `acctdata.txt` Triggering `DISCGRP-STATUS = '23'` Fallback
In `CVACT01Y.cpy`:
- Bytes `78..90`: `ACCT-CURR-CYC-CREDIT PIC S9(10)V99` (`00000000000{`)
- Bytes `90..102`: `ACCT-CURR-CYC-DEBIT PIC S9(10)V99` (`00000000000{`)
- Bytes `102..112`: `ACCT-ADDR-ZIP PIC X(10)`
- Bytes `112..122`: `ACCT-GROUP-ID PIC X(10)`
In the raw `app/data/ASCII/acctdata.txt` seed file, the string `A000000000` is placed at offset `102..112` (`ACCT-ADDR-ZIP`), leaving `ACCT-GROUP-ID` (`112..122`) filled with spaces (`"          "`)!
When `CBACT04C.cbl` runs `1200-GET-INTEREST-RATE`, looking up `FD-DIS-ACCT-GROUP-ID = "          "` in `DISCGRP` returns VSAM `FILE STATUS '23'` (Record Not Found), which triggers lines 408–411 of `CBACT04C.cbl`:
```cobol
IF DISCGRP-STATUS = '23'
    MOVE 'DEFAULT' TO FD-DIS-ACCT-GROUP-ID
    PERFORM 1200-A-GET-DEFAULT-INT-RATE
END-IF
```
If a migration normalizes the seed data by moving `A000000000` into `ACCT-GROUP-ID`, transaction category `07/0001` gets a `1.50%` interest rate instead of `DEFAULT`'s `0.00%` rate! Our codec preserves both exact column offsets AND the `DEFAULT` group fallback.

### Landmine #3: Inverted Sign Semantics on `ACCT-CURR-CYC-DEBIT` & Sequential Validation Overwrite in `CBTRN02C.cbl`
In `CBTRN02C.cbl`:
1. In `2800-UPDATE-ACCOUNT-REC` (lines 536–542):
   ```cobol
   ADD DALYTRAN-AMT TO ACCT-CURR-BAL
   IF DALYTRAN-AMT >= 0
      ADD DALYTRAN-AMT TO ACCT-CURR-CYC-CREDIT
   ELSE
      ADD DALYTRAN-AMT TO ACCT-CURR-CYC-DEBIT
   END-IF
   ```
   Positive daily transactions are added to `ACCT-CURR-CYC-CREDIT`, while negative daily transactions (returns/credits) are added as **negative numbers** into `ACCT-CURR-CYC-DEBIT`.
2. In `1500-B-LOOKUP-ACCT` (lines 389–408):
   ```cobol
   COMPUTE WS-TEMP-BAL = ACCT-CURR-CYC-CREDIT
                       - ACCT-CURR-CYC-DEBIT
                       + DALYTRAN-AMT
   IF ACCT-CREDIT-LIMIT >= WS-TEMP-BAL
      CONTINUE
   ELSE
      MOVE 102 TO WS-VALIDATION-FAIL-REASON
      MOVE 'OVERLIMIT TRANSACTION' TO WS-VALIDATION-FAIL-REASON-DESC
   END-IF
   IF ACCT-EXPIRAION-DATE >= DALYTRAN-ORIG-TS (1:10)
      CONTINUE
   ELSE
      MOVE 103 TO WS-VALIDATION-FAIL-REASON
      MOVE 'TRANSACTION RECEIVED AFTER ACCT EXPIRATION' TO WS-VALIDATION-FAIL-REASON-DESC
   END-IF
   ```
   Because `ACCT-CURR-CYC-DEBIT` is negative, `ACCT-CURR-CYC-CREDIT - ACCT-CURR-CYC-DEBIT` adds the magnitude of prior negative transactions to `WS-TEMP-BAL`! Furthermore, because the expiration check is a separate `IF` rather than `ELSE IF`, an overlimit transaction on an expired account is rejected with code **`103`** (`TRANSACTION RECEIVED AFTER ACCT EXPIRATION`), overwriting code `102`.

### Landmine #4: Unrounded `PIC S9(09)V99` Cent Truncation in `CBACT04C.cbl`
In `CBACT04C.cbl` (`1300-COMPUTE-INTEREST`, lines 432–436):
```cobol
COMPUTE WS-MONTHLY-INT
 = ( TRAN-CAT-BAL * DIS-INT-RATE) / 1200
ADD WS-MONTHLY-INT TO WS-TOTAL-INT
```
Because `ROUNDED` is omitted, COBOL truncates `WS-MONTHLY-INT` (`PIC S9(09)V99`) toward zero at two decimal places **per category record** before accumulating into `WS-TOTAL-INT`. Standard IEEE-754 floating-point or banker's rounding (`round_dp_with_strategy(MidpointNearestEven)`) produces `$0.01` drift on fractional cents.

### Landmine #5: `CBACT04C.cbl` Control-Flow Quirks on EOF & Cycle Reset
In `CBACT04C.cbl` (`1050-UPDATE-ACCOUNT`, lines 328–331):
```cobol
ADD WS-TOTAL-INT TO ACCT-CURR-BAL
MOVE 0 TO ACCT-CURR-CYC-CREDIT
MOVE 0 TO ACCT-CURR-CYC-DEBIT
```
`CBACT04C` resets both `ACCT-CURR-CYC-CREDIT` and `ACCT-CURR-CYC-DEBIT` to `0` after adding monthly interest. In addition, in the main loop (lines 180–218), when `1000-TCATBALF-GET-NEXT` reaches EOF (`TCATBALF-STATUS = '10'`), it sets `END-OF-FILE = 'Y'` inside the `IF END-OF-FILE = 'N'` block, which causes the `PERFORM UNTIL END-OF-FILE = 'Y'` loop to exit before reaching the outer `ELSE PERFORM 1050-UPDATE-ACCOUNT` branch unless flushed at EOF. We document and support both strict COBOL bug-compatibility mode and clean EOF flush mode in our parity suite.

### Landmine #6: IMS Nine's-Complement Key Ordering (`PA-AUTH-DATE-9C` & `PA-AUTH-TIME-9C`)
In `COPAUA0C.cbl` (lines 874–875) and `CIPAUDTY.cpy`:
```cobol
COMPUTE PA-AUTH-DATE-9C = 99999 - WS-YYDDD
COMPUTE PA-AUTH-TIME-9C = 999999999 - WS-TIME-WITH-MS
```
IMS `DBPAUTP0` (`PAUTDTL1` child segment) stores authorization timestamps in 9's complement (`99999 - YYDDD`, `999999999 - HHMMSSmmm`) so sequential `EXEC DLI GN` (Get Next) calls return the most recent credit card authorizations first on CICS screen `COPAU01` (`CPVD`) and during batch expiry purge (`CBPAUP0C.cbl`).
