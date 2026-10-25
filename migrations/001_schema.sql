-- ============================================================================
-- CardDemo Unified Relational Schema (SQLite / PostgreSQL Compatible)
-- Unifies:
--   1. VSAM KSDS & Alternate Index (AIX) Datasets (CVACT01Y..03Y, CVCUS01Y, CVTRA01Y..06Y, CSUSR01Y)
--   2. IBM DB2 Tables (CARDDEMO.TRANSACTION_TYPE, TRANSACTION_TYPE_CATEGORY, AUTHFRDS)
--   3. IBM IMS HIDAM Hierarchical Segments (DBPAUTP0: PAUTSUM0 Root + PAUTDTL1 Child)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. VSAM USRSEC (CSUSR01Y.cpy - 80 bytes)
CREATE TABLE IF NOT EXISTS sec_users (
    usr_id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    password TEXT NOT NULL,
    usr_type TEXT NOT NULL CHECK (usr_type IN ('A', 'U'))
);

-- 2. VSAM CUSTDATA (CVCUS01Y.cpy - 500 bytes)
CREATE TABLE IF NOT EXISTS customers (
    cust_id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    middle_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    addr_line_1 TEXT NOT NULL,
    addr_line_2 TEXT NOT NULL,
    addr_line_3 TEXT NOT NULL,
    state_cd TEXT NOT NULL,
    country_cd TEXT NOT NULL,
    zip TEXT NOT NULL,
    phone_1 TEXT NOT NULL,
    phone_2 TEXT NOT NULL,
    ssn TEXT NOT NULL,
    govt_id TEXT NOT NULL,
    dob TEXT NOT NULL,
    eft_account_id TEXT NOT NULL,
    pri_cardholder_ind TEXT NOT NULL,
    fico_score INTEGER NOT NULL
);

-- 3. VSAM ACCTDATA (CVACT01Y.cpy - 300 bytes)
CREATE TABLE IF NOT EXISTS accounts (
    acct_id TEXT PRIMARY KEY,
    active_status TEXT NOT NULL,
    initial_bal TEXT NOT NULL,
    curr_bal TEXT NOT NULL,
    credit_limit TEXT NOT NULL,
    cash_credit_limit TEXT NOT NULL,
    open_date TEXT NOT NULL,
    expiration_date TEXT NOT NULL,
    reissue_date TEXT NOT NULL,
    curr_cyc_credit TEXT NOT NULL,
    curr_cyc_debit TEXT NOT NULL,
    addr_zip TEXT NOT NULL,
    group_id TEXT NOT NULL
);

-- 4. VSAM CARDDATA (CVACT02Y.cpy - 150 bytes) + CARDAIX Alternate Index on acct_id
CREATE TABLE IF NOT EXISTS cards (
    card_num TEXT PRIMARY KEY,
    acct_id TEXT NOT NULL,
    cvv_cd TEXT NOT NULL,
    embossed_name TEXT NOT NULL,
    expiration_date TEXT NOT NULL,
    active_status TEXT NOT NULL,
    FOREIGN KEY (acct_id) REFERENCES accounts(acct_id)
);
CREATE INDEX IF NOT EXISTS idx_cards_acct_id_aix ON cards(acct_id);

-- 5. VSAM CARDXREF (CVACT03Y.cpy - 50 bytes) + CXACAIX Alternate Index on acct_id
CREATE TABLE IF NOT EXISTS card_xref (
    card_num TEXT PRIMARY KEY,
    cust_id TEXT NOT NULL,
    acct_id TEXT NOT NULL,
    FOREIGN KEY (acct_id) REFERENCES accounts(acct_id),
    FOREIGN KEY (cust_id) REFERENCES customers(cust_id)
);
CREATE INDEX IF NOT EXISTS idx_card_xref_acct_id_aix ON card_xref(acct_id);

-- 6. VSAM DISCGRP (CVTRA02Y.cpy - 50 bytes)
CREATE TABLE IF NOT EXISTS disclosure_groups (
    acct_group_id TEXT NOT NULL,
    tran_type_cd TEXT NOT NULL,
    tran_cat_cd TEXT NOT NULL,
    int_rate TEXT NOT NULL,
    PRIMARY KEY (acct_group_id, tran_type_cd, tran_cat_cd)
);

-- 7. VSAM TCATBALF (CVTRA01Y.cpy - 50 bytes)
CREATE TABLE IF NOT EXISTS tran_cat_balances (
    acct_id TEXT NOT NULL,
    tran_type_cd TEXT NOT NULL,
    tran_cat_cd TEXT NOT NULL,
    tran_cat_bal TEXT NOT NULL,
    PRIMARY KEY (acct_id, tran_type_cd, tran_cat_cd)
);

-- 8. DB2 CARDDEMO.TRANSACTION_TYPE (DB2CREAT.ctl)
CREATE TABLE IF NOT EXISTS db2_transaction_type (
    tr_type TEXT PRIMARY KEY,
    tr_description TEXT NOT NULL
);

-- 9. DB2 CARDDEMO.TRANSACTION_TYPE_CATEGORY (DB2CREAT.ctl)
CREATE TABLE IF NOT EXISTS db2_transaction_type_category (
    trc_type_code TEXT NOT NULL,
    trc_type_category TEXT NOT NULL,
    trc_cat_data TEXT NOT NULL,
    PRIMARY KEY (trc_type_code, trc_type_category),
    FOREIGN KEY (trc_type_code) REFERENCES db2_transaction_type(tr_type) ON DELETE RESTRICT
);

-- 10. VSAM TRANSACT (CVTRA05Y.cpy - 350 bytes)
CREATE TABLE IF NOT EXISTS transactions (
    tran_id TEXT PRIMARY KEY,
    acct_id TEXT NOT NULL,
    type_cd TEXT NOT NULL,
    cat_cd TEXT NOT NULL,
    source TEXT NOT NULL,
    description TEXT NOT NULL,
    amt TEXT NOT NULL,
    merchant_id TEXT NOT NULL,
    merchant_name TEXT NOT NULL,
    merchant_city TEXT NOT NULL,
    merchant_zip TEXT NOT NULL,
    card_num TEXT NOT NULL,
    orig_ts TEXT NOT NULL,
    proc_ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_acct_id ON transactions(acct_id);
CREATE INDEX IF NOT EXISTS idx_transactions_card_num ON transactions(card_num);

-- 11. VSAM DALYREJS (CBTRN02C Rejects - 430 bytes)
CREATE TABLE IF NOT EXISTS daily_rejects (
    tran_id TEXT PRIMARY KEY,
    card_num TEXT NOT NULL,
    acct_id TEXT,
    amt TEXT NOT NULL,
    orig_ts TEXT NOT NULL,
    fail_reason INTEGER NOT NULL,
    fail_desc TEXT NOT NULL
);

-- 12. IMS DBPAUTP0 Root Segment: PAUTSUM0 (CIPAUSMY.cpy)
CREATE TABLE IF NOT EXISTS ims_pending_auth_summary (
    acct_id TEXT PRIMARY KEY,
    cust_id TEXT NOT NULL,
    auth_status TEXT NOT NULL,
    account_status TEXT NOT NULL,
    credit_limit TEXT NOT NULL,
    cash_limit TEXT NOT NULL,
    credit_balance TEXT NOT NULL,
    cash_balance TEXT NOT NULL,
    approved_auth_cnt INTEGER NOT NULL,
    declined_auth_cnt INTEGER NOT NULL,
    approved_auth_amt TEXT NOT NULL,
    declined_auth_amt TEXT NOT NULL
);

-- 13. IMS DBPAUTP0 Child Segment: PAUTDTL1 (CIPAUDTY.cpy - 9's Complement Key Ordering)
CREATE TABLE IF NOT EXISTS ims_pending_auth_details (
    acct_id TEXT NOT NULL,
    auth_date_9c INTEGER NOT NULL,
    auth_time_9c INTEGER NOT NULL,
    auth_orig_date TEXT NOT NULL,
    auth_orig_time TEXT NOT NULL,
    card_num TEXT NOT NULL,
    auth_type TEXT NOT NULL,
    card_expiry_date TEXT NOT NULL,
    message_type TEXT NOT NULL,
    message_source TEXT NOT NULL,
    auth_id_code TEXT NOT NULL,
    auth_resp_code TEXT NOT NULL,
    auth_resp_reason TEXT NOT NULL,
    processing_code TEXT NOT NULL,
    transaction_amt TEXT NOT NULL,
    approved_amt TEXT NOT NULL,
    merchant_category_code TEXT NOT NULL,
    acqr_country_code TEXT NOT NULL,
    pos_entry_mode INTEGER NOT NULL,
    merchant_id TEXT NOT NULL,
    merchant_name TEXT NOT NULL,
    merchant_city TEXT NOT NULL,
    merchant_state TEXT NOT NULL,
    merchant_zip TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    match_status TEXT NOT NULL,
    auth_fraud TEXT NOT NULL,
    fraud_rpt_date TEXT NOT NULL,
    PRIMARY KEY (acct_id, auth_date_9c, auth_time_9c),
    FOREIGN KEY (acct_id) REFERENCES ims_pending_auth_summary(acct_id) ON DELETE CASCADE
);

-- 14. DB2 CARDDEMO.AUTHFRDS (AUTHFRDS.ddl - Fraud Alert Reporting Table)
CREATE TABLE IF NOT EXISTS db2_auth_fraud (
    card_num TEXT NOT NULL,
    auth_ts TEXT NOT NULL,
    auth_type TEXT NOT NULL,
    card_expiry_date TEXT NOT NULL,
    message_type TEXT NOT NULL,
    message_source TEXT NOT NULL,
    auth_id_code TEXT NOT NULL,
    auth_resp_code TEXT NOT NULL,
    auth_resp_reason TEXT NOT NULL,
    processing_code TEXT NOT NULL,
    transaction_amt TEXT NOT NULL,
    approved_amt TEXT NOT NULL,
    merchant_category_code TEXT NOT NULL,
    acqr_country_code TEXT NOT NULL,
    pos_entry_mode INTEGER NOT NULL,
    merchant_id TEXT NOT NULL,
    merchant_name TEXT NOT NULL,
    merchant_city TEXT NOT NULL,
    merchant_state TEXT NOT NULL,
    merchant_zip TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    match_status TEXT NOT NULL,
    auth_fraud TEXT NOT NULL,
    fraud_rpt_date TEXT NOT NULL,
    acct_id TEXT NOT NULL,
    cust_id TEXT NOT NULL,
    PRIMARY KEY (card_num, auth_ts)
);

-- 15. JCL Batch Run Audit Log
CREATE TABLE IF NOT EXISTS batch_job_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_name TEXT NOT NULL,
    started_at TEXT NOT NULL,
    duration_ms REAL NOT NULL,
    legacy_baseline_ms REAL NOT NULL,
    speedup_factor REAL NOT NULL,
    tx_processed INTEGER NOT NULL,
    tx_posted INTEGER NOT NULL,
    tx_rejected INTEGER NOT NULL,
    interest_tx_generated INTEGER NOT NULL,
    total_interest_charged TEXT NOT NULL,
    total_final_balance TEXT NOT NULL,
    parity_pct REAL NOT NULL,
    max_cent_drift TEXT NOT NULL
);
