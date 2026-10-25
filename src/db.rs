use crate::vsam_codec::{
    fmt_money, parse_overpunch, AccountRecord, CardRecord, CardXrefRecord, CustomerRecord,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use ts_rs::TS;
use typeshare::typeshare;
use utoipa::ToSchema;

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct SqliteWalTelemetryDto {
    pub journal_mode: String,
    pub synchronous: i32,
    pub foreign_keys: bool,
    pub wal_autocheckpoint: i32,
    pub page_size: i32,
    pub wal_verified: bool,
}

pub fn query_sqlite_wal_status(conn: &Connection) -> Result<SqliteWalTelemetryDto, String> {
    let journal_mode: String = conn
        .query_row("PRAGMA journal_mode;", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let synchronous: i32 = conn
        .query_row("PRAGMA synchronous;", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let fk_int: i32 = conn
        .query_row("PRAGMA foreign_keys;", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let wal_autocheckpoint: i32 = conn
        .query_row("PRAGMA wal_autocheckpoint;", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let page_size: i32 = conn
        .query_row("PRAGMA page_size;", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let wal_verified = journal_mode.eq_ignore_ascii_case("wal") && fk_int == 1;
    Ok(SqliteWalTelemetryDto {
        journal_mode,
        synchronous,
        foreign_keys: fk_int == 1,
        wal_autocheckpoint,
        page_size,
        wal_verified,
    })
}

pub fn init_db(db_path: &Path, schema_sql_path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|e| format!("SQLite open error: {}", e))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;
         PRAGMA wal_autocheckpoint = 1000;",
    )
    .map_err(|e| format!("Failed configuring SQLite WAL pragmas: {}", e))?;
    let schema = fs::read_to_string(schema_sql_path)
        .map_err(|e| format!("Failed reading schema {:?}: {}", schema_sql_path, e))?;
    conn.execute_batch(&schema)
        .map_err(|e| format!("Failed executing schema migration: {}", e))?;
    let wal = query_sqlite_wal_status(&conn)?;
    if !wal.wal_verified {
        return Err(format!("SQLite WAL verification failed: {:?}", wal));
    }
    Ok(conn)
}

/// Resets and seeds the unified SQLite database directly from the raw AWS CardDemo ASCII datasets.
pub fn reset_and_seed_from_carddemo(conn: &mut Connection, ascii_dir: &Path) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute_batch(
        "DELETE FROM db2_auth_fraud;
         DELETE FROM ims_pending_auth_details;
         DELETE FROM ims_pending_auth_summary;
         DELETE FROM daily_rejects;
         DELETE FROM transactions;
         DELETE FROM tran_cat_balances;
         DELETE FROM disclosure_groups;
         DELETE FROM db2_transaction_type_category;
         DELETE FROM db2_transaction_type;
         DELETE FROM card_xref;
         DELETE FROM cards;
         DELETE FROM accounts;
         DELETE FROM customers;
         DELETE FROM sec_users;",
    )
    .map_err(|e| format!("Failed clearing tables: {}", e))?;

    // 1. Seed CICS USRSEC users (from DUSRSECJ.jcl)
    let default_users = [
        ("ADMIN001", "MARGARET", "GOLD", "PASSWORD", "A"),
        ("ADMIN002", "RUSSELL", "RUSSELL", "PASSWORD", "A"),
        ("ADMIN003", "RAYMOND", "WHITMORE", "PASSWORD", "A"),
        ("ADMIN004", "EMMANUEL", "CASGRAIN", "PASSWORD", "A"),
        ("ADMIN005", "GRANVILLE", "LACHAPELLE", "PASSWORD", "A"),
        ("USER0001", "LAWRENCE", "THOMAS", "PASSWORD", "U"),
        ("USER0002", "AJITH", "KUMAR", "PASSWORD", "U"),
        ("USER0003", "LAURITZ", "ALME", "PASSWORD", "U"),
        ("USER0004", "AVERARDO", "MAZZI", "PASSWORD", "U"),
        ("USER0005", "LEE", "TING", "PASSWORD", "U"),
    ];
    for (id, fname, lname, pwd, utype) in default_users {
        tx.execute(
            "INSERT INTO sec_users (usr_id, first_name, last_name, password, usr_type) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, fname, lname, pwd, utype],
        )
        .map_err(|e| e.to_string())?;
    }

    // 2. Seed Customers (custdata.txt)
    let cust_raw = fs::read_to_string(ascii_dir.join("custdata.txt"))
        .map_err(|e| format!("Failed reading custdata.txt: {}", e))?;
    for line in cust_raw.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let c = CustomerRecord::from_fixed_width(line);
        tx.execute(
            "INSERT INTO customers (
                cust_id, first_name, middle_name, last_name,
                addr_line_1, addr_line_2, addr_line_3, state_cd, country_cd, zip,
                phone_1, phone_2, ssn, govt_id, dob, eft_account_id, pri_cardholder_ind, fico_score
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![
                c.cust_id, c.first_name, c.middle_name, c.last_name,
                c.addr_line_1, c.addr_line_2, c.addr_line_3, c.state_cd, c.country_cd, c.zip,
                c.phone_1, c.phone_2, c.ssn, c.govt_id, c.dob, c.eft_account_id, c.pri_cardholder_ind, c.fico_score
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // 3. Seed Accounts (acctdata.txt)
    let acct_raw = fs::read_to_string(ascii_dir.join("acctdata.txt"))
        .map_err(|e| format!("Failed reading acctdata.txt: {}", e))?;
    for line in acct_raw.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let a = AccountRecord::from_fixed_width(line)?;
        tx.execute(
            "INSERT INTO accounts (
                acct_id, active_status, initial_bal, curr_bal, credit_limit, cash_credit_limit,
                open_date, expiration_date, reissue_date, curr_cyc_credit, curr_cyc_debit, addr_zip, group_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                a.acct_id,
                a.active_status,
                fmt_money(a.initial_bal),
                fmt_money(a.curr_bal),
                fmt_money(a.credit_limit),
                fmt_money(a.cash_credit_limit),
                a.open_date,
                a.expiration_date,
                a.reissue_date,
                fmt_money(a.curr_cyc_credit),
                fmt_money(a.curr_cyc_debit),
                a.addr_zip,
                a.group_id,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // 4. Seed Cards (carddata.txt)
    let card_raw = fs::read_to_string(ascii_dir.join("carddata.txt"))
        .map_err(|e| format!("Failed reading carddata.txt: {}", e))?;
    for line in card_raw.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let c = CardRecord::from_fixed_width(line);
        tx.execute(
            "INSERT INTO cards (card_num, acct_id, cvv_cd, embossed_name, expiration_date, active_status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![c.card_num, c.acct_id, c.cvv_cd, c.embossed_name, c.expiration_date, c.active_status],
        )
        .map_err(|e| e.to_string())?;
    }

    // 5. Seed Card Xref (cardxref.txt)
    let xref_raw = fs::read_to_string(ascii_dir.join("cardxref.txt"))
        .map_err(|e| format!("Failed reading cardxref.txt: {}", e))?;
    for line in xref_raw.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let x = CardXrefRecord::from_fixed_width(line);
        tx.execute(
            "INSERT INTO card_xref (card_num, cust_id, acct_id) VALUES (?1, ?2, ?3)",
            params![x.card_num, x.cust_id, x.acct_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // 6. Seed Disclosure Groups (discgrp.txt)
    let disc_raw = fs::read_to_string(ascii_dir.join("discgrp.txt"))
        .map_err(|e| format!("Failed reading discgrp.txt: {}", e))?;
    for line in disc_raw.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let padded = format!("{:<50}", line.trim_end_matches(&['\r', '\n'][..]));
        let grp_raw = padded[0..10].trim();
        let grp = if grp_raw.is_empty() { "DEFAULT" } else { grp_raw };
        let type_cd = &padded[10..12];
        let cat_cd = &padded[12..16];
        let rate = parse_overpunch(&padded[16..22], 2)?;
        tx.execute(
            "INSERT INTO disclosure_groups (acct_group_id, tran_type_cd, tran_cat_cd, int_rate)
             VALUES (?1, ?2, ?3, ?4)",
            params![grp, type_cd, cat_cd, fmt_money(rate)],
        )
        .map_err(|e| e.to_string())?;
    }

    // 7. Seed Initial Transaction Category Balances (tcatbal.txt)
    let tcat_raw = fs::read_to_string(ascii_dir.join("tcatbal.txt"))
        .map_err(|e| format!("Failed reading tcatbal.txt: {}", e))?;
    for line in tcat_raw.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let padded = format!("{:<50}", line.trim_end_matches(&['\r', '\n'][..]));
        let acct_id = &padded[0..11];
        let type_cd = &padded[11..13];
        let cat_cd = &padded[13..17];
        let bal = parse_overpunch(&padded[17..28], 2)?;
        tx.execute(
            "INSERT INTO tran_cat_balances (acct_id, tran_type_cd, tran_cat_cd, tran_cat_bal)
             VALUES (?1, ?2, ?3, ?4)",
            params![acct_id, type_cd, cat_cd, fmt_money(bal)],
        )
        .map_err(|e| e.to_string())?;
    }

    // 8. Seed DB2 Transaction Types (trantype.txt -> CARDDEMO.TRANSACTION_TYPE)
    let trtype_raw = fs::read_to_string(ascii_dir.join("trantype.txt"))
        .map_err(|e| format!("Failed reading trantype.txt: {}", e))?;
    for line in trtype_raw.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let padded = format!("{:<60}", line.trim_end_matches(&['\r', '\n'][..]));
        let tr_type = &padded[0..2];
        let tr_desc = padded[2..52].trim();
        tx.execute(
            "INSERT INTO db2_transaction_type (tr_type, tr_description) VALUES (?1, ?2)",
            params![tr_type, tr_desc],
        )
        .map_err(|e| e.to_string())?;
    }

    // 9. Seed DB2 Transaction Categories (trancatg.txt -> CARDDEMO.TRANSACTION_TYPE_CATEGORY)
    let trcat_raw = fs::read_to_string(ascii_dir.join("trancatg.txt"))
        .map_err(|e| format!("Failed reading trancatg.txt: {}", e))?;
    for line in trcat_raw.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let padded = format!("{:<60}", line.trim_end_matches(&['\r', '\n'][..]));
        let type_cd = &padded[0..2];
        let cat_cd = &padded[2..6];
        let cat_desc = padded[6..56].trim();
        tx.execute(
            "INSERT INTO db2_transaction_type_category (trc_type_code, trc_type_category, trc_cat_data)
             VALUES (?1, ?2, ?3)",
            params![type_cd, cat_cd, cat_desc],
        )
        .map_err(|e| e.to_string())?;
    }

    // 10. Seed Initial IMS Pending Authorization Segments (PAUTSUM0 + PAUTDTL1) for Accounts 1, 2, and 3
    let ims_seeds = [
        (
            "00000000001",
            "000000001",
            "4859452612877065",
            "2020.00",
            "1020.00",
            "428.50",
            "149.99",
            "APPLE STORE #R012",
            "SAN FRANCISCO",
            "CA",
            "94108",
            "00",
            "0000",
            "P",
            "N",
            73701,
            857249000,
            "26045",
            "142751",
            "AUTH01",
            "TX9000000000001",
        ),
        (
            "00000000002",
            "000000002",
            "0923877193247330",
            "6130.00",
            "5448.00",
            "1240.00",
            "890.00",
            "DELTA AIR LINES",
            "ATLANTA",
            "GA",
            "30320",
            "00",
            "0000",
            "P",
            "N",
            73702,
            881100000,
            "26297",
            "114820",
            "AUTH02",
            "TX9000000000002",
        ),
        (
            "00000000003",
            "000000003",
            "8040580410348680",
            "4909.00",
            "538.00",
            "147.00",
            "4850.00",
            "LUXURY WATCHES INTL",
            "MIAMI",
            "FL",
            "33131",
            "05",
            "FRAU",
            "D",
            "F",
            73702,
            875000000,
            "26297",
            "124959",
            "AUTH03",
            "TX9000000000003",
        ),
    ];

    for (
        acct_id,
        cust_id,
        card_num,
        cred_lim,
        cash_lim,
        cred_bal,
        tx_amt,
        merch_name,
        merch_city,
        merch_state,
        merch_zip,
        resp_code,
        resp_reason,
        match_status,
        fraud_flag,
        date_9c,
        time_9c,
        orig_date,
        orig_time,
        auth_id,
        tx_id,
    ) in ims_seeds
    {
        let is_approved = resp_code == "00";
        tx.execute(
            "INSERT INTO ims_pending_auth_summary (
                acct_id, cust_id, auth_status, account_status, credit_limit, cash_limit,
                credit_balance, cash_balance, approved_auth_cnt, declined_auth_cnt,
                approved_auth_amt, declined_auth_amt
            ) VALUES (?1, ?2, ?3, '0000000000', ?4, ?5, ?6, '0.00', ?7, ?8, ?9, ?10)",
            params![
                acct_id,
                cust_id,
                if is_approved { "A" } else { "D" },
                cred_lim,
                cash_lim,
                cred_bal,
                if is_approved { 1 } else { 0 },
                if is_approved { 0 } else { 1 },
                if is_approved { tx_amt } else { "0.00" },
                if is_approved { "0.00" } else { tx_amt },
            ],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            "INSERT INTO ims_pending_auth_details (
                acct_id, auth_date_9c, auth_time_9c, auth_orig_date, auth_orig_time,
                card_num, auth_type, card_expiry_date, message_type, message_source,
                auth_id_code, auth_resp_code, auth_resp_reason, processing_code,
                transaction_amt, approved_amt, merchant_category_code, acqr_country_code,
                pos_entry_mode, merchant_id, merchant_name, merchant_city, merchant_state,
                merchant_zip, transaction_id, match_status, auth_fraud, fraud_rpt_date
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, 'SALE', '2505', '0100', 'MQPOS',
                ?7, ?8, ?9, '000000', ?10, ?11, '5732', '840',
                5, 'M900000000001', ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19
            )",
            params![
                acct_id,
                date_9c,
                time_9c,
                orig_date,
                orig_time,
                card_num,
                auth_id,
                resp_code,
                resp_reason,
                tx_amt,
                if is_approved { tx_amt } else { "0.00" },
                merch_name,
                merch_city,
                merch_state,
                merch_zip,
                tx_id,
                match_status,
                fraud_flag,
                if fraud_flag == "F" { "20261025" } else { "" }
            ],
        )
        .map_err(|e| e.to_string())?;

        if fraud_flag == "F" {
            tx.execute(
                "INSERT INTO db2_auth_fraud (
                    card_num, auth_ts, auth_type, card_expiry_date, message_type, message_source,
                    auth_id_code, auth_resp_code, auth_resp_reason, processing_code,
                    transaction_amt, approved_amt, merchant_category_code, acqr_country_code,
                    pos_entry_mode, merchant_id, merchant_name, merchant_city, merchant_state,
                    merchant_zip, transaction_id, match_status, auth_fraud, fraud_rpt_date,
                    acct_id, cust_id
                ) VALUES (
                    ?1, '2026-10-25-12.49.59.000000', 'SALE', '2505', '0100', 'MQPOS',
                    ?2, ?3, ?4, '000000', ?5, '0.00', '5732', '840',
                    5, 'M900000000001', ?6, ?7, ?8, ?9, ?10, ?11, 'F', '2026-10-25', ?12, ?13
                )",
                params![
                    card_num, auth_id, resp_code, resp_reason, tx_amt,
                    merch_name, merch_city, merch_state, merch_zip, tx_id, match_status,
                    acct_id, cust_id
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
