use crate::vsam_codec::{fmt_money, parse_money};
use chrono::Utc;
use rusqlite::{params, Connection};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use ts_rs::TS;
use typeshare::typeshare;
use utoipa::ToSchema;

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct BmsField {
    pub id: String,
    pub label: String,
    pub row: u8,
    pub col: u8,
    pub length: u8,
    pub value: String,
    pub editable: bool,
    pub color: String, // "green", "turquoise", "yellow", "red", "white", "blue"
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct TerminalScreenResponse {
    pub tran_id: String,
    pub program_name: String,
    pub mapset_name: String,
    pub map_name: String,
    pub title_line_1: String,
    pub title_line_2: String,
    pub lines: Vec<String>, // 24x80 rendered character lines for instant terminal view
    pub fields: Vec<BmsField>,
    pub status_message: String,
    pub sqlcode: Option<i32>,
    pub pf_keys: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct TerminalCommandRequest {
    pub tran_id: String,
    pub aid_key: String, // "ENTER", "PF3", "PF4", "PF5", "PF7", "PF8", "CLEAR"
    pub inputs: HashMap<String, String>,
}

pub fn execute_cics_terminal(
    conn: &mut Connection,
    req: &TerminalCommandRequest,
) -> Result<TerminalScreenResponse, String> {
    let tran = req.tran_id.trim().to_uppercase();
    let aid = req.aid_key.trim().to_uppercase();

    if aid == "PF3" && tran != "CC00" && tran != "CM00" {
        return render_main_menu(conn, "RETURNED TO MAIN MENU VIA PF3");
    }
    if aid == "CLEAR" {
        return render_signon_screen("SESSION CLEARED - SIGN ON AGAIN");
    }

    match tran.as_str() {
        "CC00" => {
            let user = req
                .inputs
                .get("USERID")
                .map(|s| s.trim().to_uppercase())
                .unwrap_or_default();
            let pass = req
                .inputs
                .get("PASSWD")
                .map(|s| s.trim().to_uppercase())
                .unwrap_or_default();
            if user.is_empty() {
                return render_signon_screen("PLEASE ENTER USER ID AND PASSWORD");
            }
            let found: Option<(String, String)> = conn
                .query_row(
                    "SELECT password, usr_type FROM sec_users WHERE usr_id = ?1",
                    params![user],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .ok();
            match found {
                Some((db_pass, utype)) if db_pass == pass => {
                    if utype == "A" {
                        render_admin_menu(&format!("SIGNED ON AS ADMIN {}", user))
                    } else {
                        render_main_menu(conn, &format!("WELCOME TO CARDDEMO, {}", user))
                    }
                }
                Some(_) => render_signon_screen("WRONG PASSWORD. TRY AGAIN (DEFAULT: PASSWORD)"),
                None => render_signon_screen("USER NOT FOUND. TRY USER0001 OR ADMIN001"),
            }
        }
        "CM00" => {
            if let Some(opt) = req.inputs.get("OPTION").map(|s| s.trim()) {
                match opt {
                    "1" | "01" => render_account_view(conn, req, "ENTER OR VERIFY ACCOUNT ID"),
                    "2" | "02" => render_account_update(conn, req),
                    "3" | "03" => render_card_list(conn, req),
                    "4" | "04" => render_card_update(conn, req),
                    "5" | "05" => render_transaction_list(conn, req),
                    "6" | "06" => render_transaction_add(conn, req),
                    "7" | "07" => render_transaction_reports(conn, req),
                    "8" | "08" => render_bill_payment(conn, req),
                    "9" | "09" => render_ims_auth_screen(conn, req),
                    "10" => render_db2_tx_types(conn, req),
                    "11" => render_user_security(conn, req),
                    _ => render_main_menu(conn, "SELECT AN OPTION (01-11) OR ENTER TRAN ID"),
                }
            } else {
                render_main_menu(conn, "SELECT AN OPTION (01-11) OR ENTER TRAN ID")
            }
        }
        "CADM" => render_admin_menu("CARDDEMO ADMIN MENU (COADM01C)"),
        "CAVW" => render_account_view(conn, req, ""),
        "CAUP" => render_account_update(conn, req),
        "CCLI" => render_card_list(conn, req),
        "CCDL" | "CCUP" => render_card_update(conn, req),
        "CT00" | "CT01" => render_transaction_list(conn, req),
        "CT02" => render_transaction_add(conn, req),
        "CR00" => render_transaction_reports(conn, req),
        "CBIL" => render_bill_payment(conn, req),
        "CTLI" | "CTTU" => render_db2_tx_types(conn, req),
        "CPVS" | "CPVD" | "CP00" => render_ims_auth_screen(conn, req),
        "CU00" | "CU01" | "CU02" | "CU03" => render_user_security(conn, req),
        _ => render_main_menu(
            conn,
            &format!("UNKNOWN CICS TRANSACTION '{}'. SHOWING CM00.", tran),
        ),
    }
}

fn render_signon_screen(msg: &str) -> Result<TerminalScreenResponse, String> {
    let lines = vec![
        "TRAN: CC00      AWS MAINFRAME MODERNIZATION - CARDDEMO        DATE: 10/25/26".to_string(),
        "PROG: COSGN00C              CICS SIGNON SCREEN                TIME: 11:45:00".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
        "                                                                                ".to_string(),
        "                 * * *   NATIONAL RESERVE CREDIT CARD   * * *                   ".to_string(),
        "                       IBM CICS / VSAM / DB2 / IMS SYSTEM                       ".to_string(),
        "                                                                                ".to_string(),
        "          PLEASE ENTER YOUR CREDENTIALS TO ACCESS ONLINE TRANSACTIONS:          ".to_string(),
        "                                                                                ".to_string(),
        "                        USER ID   : [USER0001]   (8 CHARS)                      ".to_string(),
        "                        PASSWORD  : [PASSWORD]   (8 CHARS)                      ".to_string(),
        "                                                                                ".to_string(),
        "          DEFAULT USERS : USER0001 / PASSWORD  (REGULAR)                        ".to_string(),
        "                          ADMIN001 / PASSWORD  (SECURITY / DB2 ADMIN)           ".to_string(),
        "                                                                                ".to_string(),
        format!("{:<80}", format!("MESSAGE: {}", msg)),
        "PF3=EXIT   ENTER=SIGN ON   CLEAR=RESET".to_string(),
    ];
    let fields = vec![
        BmsField {
            id: "USERID".to_string(),
            label: "User ID".to_string(),
            row: 10,
            col: 37,
            length: 8,
            value: "USER0001".to_string(),
            editable: true,
            color: "green".to_string(),
        },
        BmsField {
            id: "PASSWD".to_string(),
            label: "Password".to_string(),
            row: 11,
            col: 37,
            length: 8,
            value: "PASSWORD".to_string(),
            editable: true,
            color: "green".to_string(),
        },
    ];
    Ok(TerminalScreenResponse {
        tran_id: "CC00".to_string(),
        program_name: "COSGN00C".to_string(),
        mapset_name: "COSGN00".to_string(),
        map_name: "COSGN0A".to_string(),
        title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
        title_line_2: "CICS SIGNON SCREEN (COSGN00)".to_string(),
        lines,
        fields,
        status_message: msg.to_string(),
        sqlcode: None,
        pf_keys: "ENTER=Sign-on  PF3=Exit".to_string(),
    })
}

fn render_main_menu(_conn: &Connection, msg: &str) -> Result<TerminalScreenResponse, String> {
    let lines = vec![
        "TRAN: CM00      AWS MAINFRAME MODERNIZATION - CARDDEMO        DATE: 10/25/26".to_string(),
        "PROG: COMEN01C                MAIN MENU                       MAP : COMEN01 ".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
        "    01. ACCOUNT VIEW               (CAVW / COACTVWC - VSAM ACCTDATA + CUSTDATA) ".to_string(),
        "    02. ACCOUNT UPDATE             (CAUP / COACTUPC - VSAM ACCTDATA + CUSTDATA) ".to_string(),
        "    03. CREDIT CARD LIST           (CCLI / COCRDLIC - VSAM CARDDATA + CARDAIX)  ".to_string(),
        "    04. CREDIT CARD VIEW / UPDATE  (CCUP / COCRDUPC - VSAM CARDDATA REWRITE)    ".to_string(),
        "    05. TRANSACTION LIST & VIEW    (CT00 / COTRN00C - VSAM TRANSACT KSDS)       ".to_string(),
        "    06. TRANSACTION ADD            (CT02 / COTRN02C - POST MANUAL TRANSACTION)  ".to_string(),
        "    07. TRANSACTION REPORTS        (CR00 / CORPT00C - MONTHLY/YEARLY/CUSTOM)    ".to_string(),
        "    08. ONLINE BILL PAYMENT        (CBIL / COBIL00C - FULL BALANCE SETTLEMENT)  ".to_string(),
        "    09. PENDING AUTHORIZATIONS     (CPVS / COPAUS0C - IMS PAUTSUM0 + AUTHFRDS)  ".to_string(),
        "    10. DB2 TRANSACTION TYPES      (CTLI / COTRTLIC - DB2 CURSOR + SQLCODE)     ".to_string(),
        "    11. USER SECURITY ADMIN        (CU00 / COUSR00C - USRSEC VSAM KSDS)         ".to_string(),
        "        PLEASE SELECT AN OPTION : [01]                                          ".to_string(),
        format!("{:<80}", format!("MESSAGE: {}", msg)),
        "ENTER=CONTINUE   PF3=SIGN OFF".to_string(),
    ];
    let fields = vec![BmsField {
        id: "OPTION".to_string(),
        label: "Menu Option (01-11)".to_string(),
        row: 15,
        col: 35,
        length: 2,
        value: "01".to_string(),
        editable: true,
        color: "green".to_string(),
    }];
    Ok(TerminalScreenResponse {
        tran_id: "CM00".to_string(),
        program_name: "COMEN01C".to_string(),
        mapset_name: "COMEN01".to_string(),
        map_name: "COMEN1A".to_string(),
        title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
        title_line_2: "MAIN MENU (COMEN01)".to_string(),
        lines,
        fields,
        status_message: msg.to_string(),
        sqlcode: None,
        pf_keys: "ENTER=Select  PF3=Sign-off".to_string(),
    })
}

fn render_admin_menu(msg: &str) -> Result<TerminalScreenResponse, String> {
    let lines = vec![
        "TRAN: CADM      AWS MAINFRAME MODERNIZATION - CARDDEMO        DATE: 10/25/26".to_string(),
        "PROG: COADM01C              ADMINISTRATION MENU               MAP : COADM01 ".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
        "    01. USER SECURITY LIST   (CU00 / COUSR00C - USRSEC VSAM KSDS)               ".to_string(),
        "    02. USER SECURITY ADD    (CU01 / COUSR01C - ADD OPERATOR/ADMIN)             ".to_string(),
        "    03. USER SECURITY UPDATE (CU02 / COUSR02C - UPDATE PASSWORD/ROLE)           ".to_string(),
        "    04. USER SECURITY DELETE (CU03 / COUSR03C - DELETE USER RECORD)             ".to_string(),
        "    05. DB2 TRAN TYPE MAINT  (CTLI / COTRTLIC - CARDDEMO.TRANSACTION_TYPE)      ".to_string(),
        "    06. DB2 TRAN TYPE UPDATE (CTTU / COTRTUPC - SQLCODE -803 / -532 / +100)     ".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
        format!("{:<80}", format!("MESSAGE: {}", msg)),
        "ENTER=SELECT   PF3=SIGN OFF".to_string(),
    ];
    let fields = vec![BmsField {
        id: "OPTION".to_string(),
        label: "Admin Option (01-06)".to_string(),
        row: 10,
        col: 35,
        length: 2,
        value: "01".to_string(),
        editable: true,
        color: "turquoise".to_string(),
    }];
    Ok(TerminalScreenResponse {
        tran_id: "CADM".to_string(),
        program_name: "COADM01C".to_string(),
        mapset_name: "COADM01".to_string(),
        map_name: "COADM1A".to_string(),
        title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
        title_line_2: "ADMINISTRATION MENU (COADM01)".to_string(),
        lines,
        fields,
        status_message: msg.to_string(),
        sqlcode: None,
        pf_keys: "ENTER=Select  PF3=Return".to_string(),
    })
}

fn render_account_view(
    conn: &Connection,
    req: &TerminalCommandRequest,
    override_msg: &str,
) -> Result<TerminalScreenResponse, String> {
    let acct_id = req
        .inputs
        .get("ACCTID")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "00000000001".to_string());

    let row = conn.query_row(
        "SELECT a.acct_id, a.active_status, a.curr_bal, a.credit_limit, a.cash_credit_limit,
                a.open_date, a.expiration_date, a.reissue_date, a.curr_cyc_credit, a.curr_cyc_debit,
                a.group_id, c.cust_id, c.first_name, c.middle_name, c.last_name, c.ssn,
                c.fico_score, c.addr_line_1, c.addr_line_3, c.state_cd, c.zip, c.phone_1, x.card_num
         FROM accounts a
         LEFT JOIN card_xref x ON x.acct_id = a.acct_id
         LEFT JOIN customers c ON c.cust_id = x.cust_id
         WHERE a.acct_id = ?1",
        params![acct_id],
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, String>(7)?,
                r.get::<_, String>(8)?,
                r.get::<_, String>(9)?,
                r.get::<_, String>(10)?,
                r.get::<_, Option<String>>(11)?.unwrap_or_default(),
                r.get::<_, Option<String>>(12)?.unwrap_or_default(),
                r.get::<_, Option<String>>(13)?.unwrap_or_default(),
                r.get::<_, Option<String>>(14)?.unwrap_or_default(),
                r.get::<_, Option<String>>(15)?.unwrap_or_default(),
                r.get::<_, Option<i32>>(16)?.unwrap_or(0),
                r.get::<_, Option<String>>(17)?.unwrap_or_default(),
                r.get::<_, Option<String>>(18)?.unwrap_or_default(),
                r.get::<_, Option<String>>(19)?.unwrap_or_default(),
                r.get::<_, Option<String>>(20)?.unwrap_or_default(),
                r.get::<_, Option<String>>(21)?.unwrap_or_default(),
                r.get::<_, Option<String>>(22)?.unwrap_or_default(),
            ))
        },
    );

    match row {
        Ok(d) => {
            let status_msg = if override_msg.is_empty() {
                format!("DISPLAYING ACCOUNT {} AND CUSTOMER {}", d.0, d.11)
            } else {
                override_msg.to_string()
            };
            let grp = if d.10.is_empty() {
                "DEFAULT (FALLBACK)"
            } else {
                &d.10
            };
            let lines = vec![
                "TRAN: CAVW      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COACTVW ".to_string(),
                "PROG: COACTVWC                 VIEW ACCOUNT                   CICS: ENABLED ".to_string(),
                "--------------------------------------------------------------------------------".to_string(),
                format!("  ACCOUNT NUMBER : [{}]     ACTIVE STATUS : {}     GROUP: {}", d.0, d.1, grp),
                format!("  OPENED DATE    : {:<12}      EXPIRY DATE   : {:<12}", d.5, d.6),
                format!("  REISSUE DATE   : {:<12}      PRIMARY CARD  : {:<16}", d.7, d.22),
                format!("  CREDIT LIMIT   : {:>12}      CASH LIMIT    : {:>12}", d.3, d.4),
                format!("  CURRENT BAL    : {:>12}      CYCLE CREDIT  : {:>12}", d.2, d.8),
                format!("  CYCLE DEBIT    : {:>12}", d.9),
                "--------------------------------------------------------------------------------".to_string(),
                format!("  CUSTOMER ID    : {:<12}      SSN           : {}    FICO : {}", d.11, d.15, d.16),
                format!("  NAME           : {} {} {}", d.12, d.13, d.14),
                format!("  ADDRESS        : {}, {}, {} {}", d.17, d.18, d.19, d.20),
                format!("  PHONE 1        : {}", d.21),
                "--------------------------------------------------------------------------------".to_string(),
                format!("{:<80}", format!("MESSAGE: {}", status_msg)),
                "ENTER=FETCH ACCOUNT   PF3=MAIN MENU".to_string(),
            ];
            let fields = vec![BmsField {
                id: "ACCTID".to_string(),
                label: "Account Number (11 digits)".to_string(),
                row: 4,
                col: 20,
                length: 11,
                value: d.0,
                editable: true,
                color: "green".to_string(),
            }];
            Ok(TerminalScreenResponse {
                tran_id: "CAVW".to_string(),
                program_name: "COACTVWC".to_string(),
                mapset_name: "COACTVW".to_string(),
                map_name: "CACTVWA".to_string(),
                title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
                title_line_2: "VIEW ACCOUNT (COACTVW)".to_string(),
                lines,
                fields,
                status_message: status_msg,
                sqlcode: None,
                pf_keys: "ENTER=Lookup Account  PF3=Main Menu".to_string(),
            })
        }
        Err(_) => {
            let msg = format!("ACCOUNT {} NOT FOUND IN ACCTDATA VSAM KSDS", acct_id);
            let lines = vec![
                "TRAN: CAVW      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COACTVW ".to_string(),
                "PROG: COACTVWC                 VIEW ACCOUNT                   CICS: ENABLED ".to_string(),
                "--------------------------------------------------------------------------------".to_string(),
                format!("  ACCOUNT NUMBER : [{}]", acct_id),
                "                                                                                ".to_string(),
                format!("{:<80}", format!("MESSAGE: {}", msg)),
            ];
            let fields = vec![BmsField {
                id: "ACCTID".to_string(),
                label: "Account Number (11 digits)".to_string(),
                row: 4,
                col: 20,
                length: 11,
                value: acct_id,
                editable: true,
                color: "red".to_string(),
            }];
            Ok(TerminalScreenResponse {
                tran_id: "CAVW".to_string(),
                program_name: "COACTVWC".to_string(),
                mapset_name: "COACTVW".to_string(),
                map_name: "CACTVWA".to_string(),
                title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
                title_line_2: "VIEW ACCOUNT (COACTVW)".to_string(),
                lines,
                fields,
                status_message: msg,
                sqlcode: None,
                pf_keys: "ENTER=Lookup Account  PF3=Main Menu".to_string(),
            })
        }
    }
}

fn render_account_update(
    conn: &mut Connection,
    req: &TerminalCommandRequest,
) -> Result<TerminalScreenResponse, String> {
    let acct_id = req
        .inputs
        .get("ACCTID")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "00000000001".to_string());

    let mut msg = format!("READY TO UPDATE ACCOUNT {} (PRESS PF5 TO SAVE)", acct_id);
    if req.aid_key.eq_ignore_ascii_case("PF5") {
        if let Some(new_limit) = req.inputs.get("CREDLIM") {
            let lim = fmt_money(parse_money(new_limit));
            let active = req
                .inputs
                .get("ACTSTAT")
                .map(|s| s.trim().to_uppercase())
                .unwrap_or_else(|| "Y".to_string());
            conn.execute(
                "UPDATE accounts SET credit_limit = ?1, active_status = ?2 WHERE acct_id = ?3",
                params![lim, active, acct_id],
            )
            .map_err(|e| e.to_string())?;
            msg = format!(
                "CHANGES TO ACCOUNT {} SAVED TO VSAM ACCTDATA (LIMIT=${})",
                acct_id, lim
            );
        }
    }

    let (curr_bal, cred_lim, cash_lim, active_status): (String, String, String, String) = conn
        .query_row(
            "SELECT curr_bal, credit_limit, cash_credit_limit, active_status FROM accounts WHERE acct_id = ?1",
            params![acct_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap_or_else(|_| {
            (
                "0.00".to_string(),
                "0.00".to_string(),
                "0.00".to_string(),
                "Y".to_string(),
            )
        });

    let lines = vec![
        "TRAN: CAUP      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COACTUP ".to_string(),
        "PROG: COACTUPC                UPDATE ACCOUNT                  CICS: ENABLED ".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
        format!("  ACCOUNT ID     : [{}]     ACTIVE STATUS : [{}]", acct_id, active_status),
        format!("  CURRENT BAL    : {:>12}", curr_bal),
        format!("  CREDIT LIMIT   : [{}]    CASH LIMIT    : {:>12}", cred_lim, cash_lim),
        "--------------------------------------------------------------------------------".to_string(),
        format!("{:<80}", format!("MESSAGE: {}", msg)),
        "ENTER=READ ACCOUNT   PF5=SAVE CHANGES   PF3=MAIN MENU".to_string(),
    ];
    let fields = vec![
        BmsField {
            id: "ACCTID".to_string(),
            label: "Account ID".to_string(),
            row: 4,
            col: 20,
            length: 11,
            value: acct_id,
            editable: true,
            color: "green".to_string(),
        },
        BmsField {
            id: "ACTSTAT".to_string(),
            label: "Active Status (Y/N)".to_string(),
            row: 4,
            col: 53,
            length: 1,
            value: active_status,
            editable: true,
            color: "turquoise".to_string(),
        },
        BmsField {
            id: "CREDLIM".to_string(),
            label: "Credit Limit".to_string(),
            row: 6,
            col: 20,
            length: 12,
            value: cred_lim,
            editable: true,
            color: "turquoise".to_string(),
        },
    ];
    Ok(TerminalScreenResponse {
        tran_id: "CAUP".to_string(),
        program_name: "COACTUPC".to_string(),
        mapset_name: "COACTUP".to_string(),
        map_name: "CACTUPA".to_string(),
        title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
        title_line_2: "UPDATE ACCOUNT (COACTUP)".to_string(),
        lines,
        fields,
        status_message: msg,
        sqlcode: None,
        pf_keys: "ENTER=Fetch  PF5=Commit Update  PF3=Main Menu".to_string(),
    })
}

fn render_card_list(
    conn: &Connection,
    req: &TerminalCommandRequest,
) -> Result<TerminalScreenResponse, String> {
    let filter_acct = req
        .inputs
        .get("ACCTID")
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    let mut stmt = if filter_acct.is_empty() {
        conn.prepare(
            "SELECT card_num, acct_id, embossed_name, expiration_date, active_status
             FROM cards ORDER BY acct_id LIMIT 10",
        )
        .map_err(|e| e.to_string())?
    } else {
        conn.prepare(
            "SELECT card_num, acct_id, embossed_name, expiration_date, active_status
             FROM cards WHERE acct_id = ?1 ORDER BY card_num LIMIT 10",
        )
        .map_err(|e| e.to_string())?
    };

    let mut card_rows = Vec::new();
    if filter_acct.is_empty() {
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            card_rows.push(r.map_err(|e| e.to_string())?);
        }
    } else {
        let rows = stmt
            .query_map(params![filter_acct], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            card_rows.push(r.map_err(|e| e.to_string())?);
        }
    }

    let mut lines = vec![
        "TRAN: CCLI      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COCRDLI ".to_string(),
        "PROG: COCRDLIC               CREDIT CARD LIST                 AIX : CARDAIX ".to_string(),
        format!(
            "  FILTER BY ACCOUNT ID (CARDAIX): [{:<11}]",
            filter_acct
        ),
        "--------------------------------------------------------------------------------".to_string(),
        "  ACCOUNT ID    CARD NUMBER        EMBOSSED NAME            EXPIRY      STATUS  ".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
    ];
    for c in &card_rows {
        lines.push(format!(
            "  {:<11}   {:<16}   {:<22}   {:<10}    {}",
            c.1, c.0, c.2, c.3, c.4
        ));
    }
    lines.push("--------------------------------------------------------------------------------".to_string());
    let msg = format!(
        "DISPLAYING {} CARDS VIA VSAM KSDS / CARDAIX ALTERNATE INDEX",
        card_rows.len()
    );
    lines.push(format!("{:<80}", format!("MESSAGE: {}", msg)));
    lines.push("ENTER=FILTER BY ACCT   PF3=MAIN MENU   PF7=PREV   PF8=NEXT".to_string());

    let fields = vec![BmsField {
        id: "ACCTID".to_string(),
        label: "Filter by Account ID (optional)".to_string(),
        row: 3,
        col: 36,
        length: 11,
        value: filter_acct,
        editable: true,
        color: "green".to_string(),
    }];

    Ok(TerminalScreenResponse {
        tran_id: "CCLI".to_string(),
        program_name: "COCRDLIC".to_string(),
        mapset_name: "COCRDLI".to_string(),
        map_name: "CCRDLIA".to_string(),
        title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
        title_line_2: "CREDIT CARD LIST (COCRDLI)".to_string(),
        lines,
        fields,
        status_message: msg,
        sqlcode: None,
        pf_keys: "ENTER=Filter  PF3=Main Menu  PF7/PF8=Page".to_string(),
    })
}

fn render_card_update(
    conn: &mut Connection,
    req: &TerminalCommandRequest,
) -> Result<TerminalScreenResponse, String> {
    let acct_id = req
        .inputs
        .get("ACCTID")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "00000000001".to_string());

    let (card_num, embossed, exp_date, active): (String, String, String, String) = conn
        .query_row(
            "SELECT card_num, embossed_name, expiration_date, active_status FROM cards WHERE acct_id = ?1 LIMIT 1",
            params![acct_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap_or_else(|_| {
            (
                "0000000000000000".to_string(),
                "UNKNOWN CARDHOLDER".to_string(),
                "2028-12-31".to_string(),
                "Y".to_string(),
            )
        });

    let mut msg = format!("CARD {} LOADED (COCRDSL / COCRDUP) — PF5 TO UPDATE", card_num);
    if req.aid_key.eq_ignore_ascii_case("PF5") {
        let new_name = req.inputs.get("CRDNAME").cloned().unwrap_or(embossed.clone());
        let new_stat = req
            .inputs
            .get("CRDSTCD")
            .map(|s| s.trim().to_uppercase())
            .unwrap_or(active.clone());
        conn.execute(
            "UPDATE cards SET embossed_name = ?1, active_status = ?2 WHERE card_num = ?3",
            params![new_name.trim(), new_stat, card_num],
        )
        .ok();
        msg = format!("CARD {} UPDATED IN VSAM CARDDATA (COCRDUPC)", card_num);
    }

    let lines = vec![
        "TRAN: CCUP      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COCRDUP ".to_string(),
        "PROG: COCRDUPC           CREDIT CARD DETAIL / UPDATE          VSAM: CARDDATA".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
        format!("  ACCOUNT ID      : [{}]     CARD NUMBER : {}", acct_id, card_num),
        format!("  EMBOSSED NAME   : [{:<30}]", embossed),
        format!("  CARD STATUS Y/N : [{}]              EXPIRY DATE : {}", active, exp_date),
        "--------------------------------------------------------------------------------".to_string(),
        format!("{:<80}", format!("MESSAGE: {}", msg)),
        "ENTER=READ CARD   PF5=SAVE CARD CHANGES   PF3=MAIN MENU".to_string(),
    ];
    let fields = vec![
        BmsField {
            id: "ACCTID".to_string(),
            label: "Account ID".to_string(),
            row: 4,
            col: 21,
            length: 11,
            value: acct_id,
            editable: true,
            color: "green".to_string(),
        },
        BmsField {
            id: "CRDNAME".to_string(),
            label: "Embossed Name".to_string(),
            row: 5,
            col: 21,
            length: 30,
            value: embossed,
            editable: true,
            color: "turquoise".to_string(),
        },
        BmsField {
            id: "CRDSTCD".to_string(),
            label: "Card Active (Y/N)".to_string(),
            row: 6,
            col: 21,
            length: 1,
            value: active,
            editable: true,
            color: "yellow".to_string(),
        },
    ];
    Ok(TerminalScreenResponse {
        tran_id: "CCUP".to_string(),
        program_name: "COCRDUPC".to_string(),
        mapset_name: "COCRDUP".to_string(),
        map_name: "CCRDUPA".to_string(),
        title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
        title_line_2: "CREDIT CARD VIEW / UPDATE (COCRDUP)".to_string(),
        lines,
        fields,
        status_message: msg,
        sqlcode: None,
        pf_keys: "ENTER=Lookup  PF5=Save Card  PF3=Main Menu".to_string(),
    })
}

fn render_transaction_list(
    conn: &Connection,
    req: &TerminalCommandRequest,
) -> Result<TerminalScreenResponse, String> {
    let filter_acct = req
        .inputs
        .get("ACCTID")
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    let mut stmt = if filter_acct.is_empty() {
        conn.prepare(
            "SELECT tran_id, acct_id, type_cd, cat_cd, amt, description, orig_ts
             FROM transactions ORDER BY tran_id DESC LIMIT 10",
        )
        .map_err(|e| e.to_string())?
    } else {
        conn.prepare(
            "SELECT tran_id, acct_id, type_cd, cat_cd, amt, description, orig_ts
             FROM transactions WHERE acct_id = ?1 ORDER BY tran_id DESC LIMIT 10",
        )
        .map_err(|e| e.to_string())?
    };

    let mut tx_rows = Vec::new();
    if filter_acct.is_empty() {
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, String>(6)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            tx_rows.push(r.map_err(|e| e.to_string())?);
        }
    } else {
        let rows = stmt
            .query_map(params![filter_acct], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, String>(6)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            tx_rows.push(r.map_err(|e| e.to_string())?);
        }
    }

    let mut lines = vec![
        "TRAN: CT00      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COTRN00 ".to_string(),
        "PROG: COTRN00C             LIST TRANSACTIONS                  VSAM: TRANSACT".to_string(),
        format!("  FILTER ACCOUNT : [{:<11}]", filter_acct),
        "--------------------------------------------------------------------------------".to_string(),
        "  TRANSACTION ID     ACCT ID       TP/CAT   AMOUNT        DESCRIPTION           ".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
    ];
    for t in &tx_rows {
        let short_desc: String = t.5.chars().take(22).collect();
        lines.push(format!(
            "  {:<16}   {:<11}   {}/{}   {:>10}   {:<22}",
            t.0, t.1, t.2, t.3, t.4, short_desc
        ));
    }
    lines.push("--------------------------------------------------------------------------------".to_string());
    let msg = format!(
        "SHOWING {} POSTED TRANSACTIONS FROM TRANSACT KSDS",
        tx_rows.len()
    );
    lines.push(format!("{:<80}", format!("MESSAGE: {}", msg)));

    let fields = vec![BmsField {
        id: "ACCTID".to_string(),
        label: "Filter Account ID".to_string(),
        row: 3,
        col: 20,
        length: 11,
        value: filter_acct,
        editable: true,
        color: "green".to_string(),
    }];

    Ok(TerminalScreenResponse {
        tran_id: "CT00".to_string(),
        program_name: "COTRN00C".to_string(),
        mapset_name: "COTRN00".to_string(),
        map_name: "COTRN0A".to_string(),
        title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
        title_line_2: "LIST TRANSACTIONS (COTRN00)".to_string(),
        lines,
        fields,
        status_message: msg,
        sqlcode: None,
        pf_keys: "ENTER=Filter  PF3=Main Menu  PF7/PF8=Scroll".to_string(),
    })
}

fn render_transaction_add(
    _conn: &mut Connection,
    req: &TerminalCommandRequest,
) -> Result<TerminalScreenResponse, String> {
    let acct_id = req
        .inputs
        .get("ACCTID")
        .cloned()
        .unwrap_or_else(|| "00000000001".to_string());
    let amt = req
        .inputs
        .get("TRNAMT")
        .cloned()
        .unwrap_or_else(|| "125.00".to_string());
    let desc = req
        .inputs
        .get("TDESC")
        .cloned()
        .unwrap_or_else(|| "MANUAL POS PURCHASE".to_string());
    let msg = format!("ENTER DETAILS TO ADD TRANSACTION TO ACCOUNT {} (COTRN02C)", acct_id);
    let lines = vec![
        "TRAN: CT02      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COTRN02 ".to_string(),
        "PROG: COTRN02C               ADD TRANSACTION                  VSAM: TRANSACT".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
        format!("  ACCOUNT ID     : [{}]     TYPE CD: [01]     CAT CD: [0001]", acct_id),
        format!("  SOURCE         : [POS TERM  ]     AMOUNT : [{}]", amt),
        format!("  DESCRIPTION    : [{:<35}]", desc),
        "  MERCHANT NAME  : [ACME MAINFRAME SUPPLY         ]  CITY: [NEW YORK   ]".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
        format!("{:<80}", format!("MESSAGE: {}", msg)),
        "ENTER=POST TRANSACTION   PF5=COPY LAST TRAN   PF3=MAIN MENU".to_string(),
    ];
    let fields = vec![
        BmsField {
            id: "ACCTID".to_string(),
            label: "Account ID".to_string(),
            row: 4,
            col: 20,
            length: 11,
            value: acct_id,
            editable: true,
            color: "green".to_string(),
        },
        BmsField {
            id: "TRNAMT".to_string(),
            label: "Transaction Amount".to_string(),
            row: 5,
            col: 46,
            length: 12,
            value: amt,
            editable: true,
            color: "yellow".to_string(),
        },
        BmsField {
            id: "TDESC".to_string(),
            label: "Description".to_string(),
            row: 6,
            col: 20,
            length: 35,
            value: desc,
            editable: true,
            color: "turquoise".to_string(),
        },
    ];
    Ok(TerminalScreenResponse {
        tran_id: "CT02".to_string(),
        program_name: "COTRN02C".to_string(),
        mapset_name: "COTRN02".to_string(),
        map_name: "COTRN2A".to_string(),
        title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
        title_line_2: "ADD TRANSACTION (COTRN02)".to_string(),
        lines,
        fields,
        status_message: msg,
        sqlcode: None,
        pf_keys: "ENTER=Add Tran  PF5=Copy Last  PF3=Main Menu".to_string(),
    })
}

fn render_transaction_reports(
    conn: &Connection,
    req: &TerminalCommandRequest,
) -> Result<TerminalScreenResponse, String> {
    let rpt_type = req
        .inputs
        .get("RPTTYPE")
        .cloned()
        .unwrap_or_else(|| "YEARLY".to_string());
    let (cnt, sum_str): (i32, String) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE( printf('%.2f', SUM(CAST(amt AS REAL))), '0.00') FROM transactions",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or((0, "0.00".to_string()));
    let msg = format!(
        "TRANREPT JOB SUBMITTED ({}) — {} TRANSACTIONS TOTALING ${}",
        rpt_type, cnt, sum_str
    );
    let lines = vec![
        "TRAN: CR00      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : CORPT00 ".to_string(),
        "PROG: CORPT00C             TRANSACTION REPORTS                JCL : TRANREPT".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
        format!("  REPORT MODE    : [{}]  (MONTHLY / YEARLY / CUSTOM)", rpt_type),
        "  CUSTOM RANGE   : START [2022-01-01]  TO  END [2026-12-31]".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
        format!("  TRANSACTIONS MATCHED : {:<8}     TOTAL VOLUME : ${}", cnt, sum_str),
        "--------------------------------------------------------------------------------".to_string(),
        format!("{:<80}", format!("MESSAGE: {}", msg)),
        "ENTER=GENERATE REPORT (CBTRN03C)   PF3=MAIN MENU".to_string(),
    ];
    let fields = vec![BmsField {
        id: "RPTTYPE".to_string(),
        label: "Report Mode (MONTHLY/YEARLY/CUSTOM)".to_string(),
        row: 4,
        col: 20,
        length: 10,
        value: rpt_type,
        editable: true,
        color: "green".to_string(),
    }];
    Ok(TerminalScreenResponse {
        tran_id: "CR00".to_string(),
        program_name: "CORPT00C".to_string(),
        mapset_name: "CORPT00".to_string(),
        map_name: "CORPT0A".to_string(),
        title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
        title_line_2: "TRANSACTION REPORTS (CORPT00)".to_string(),
        lines,
        fields,
        status_message: msg,
        sqlcode: None,
        pf_keys: "ENTER=Submit Report  PF3=Main Menu".to_string(),
    })
}

fn render_user_security(
    conn: &Connection,
    _req: &TerminalCommandRequest,
) -> Result<TerminalScreenResponse, String> {
    let mut stmt = conn
        .prepare("SELECT usr_id, first_name, last_name, usr_type FROM sec_users ORDER BY usr_id LIMIT 10")
        .map_err(|e| e.to_string())?;
    let users: Vec<(String, String, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    let mut lines = vec![
        "TRAN: CU00      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COUSR00 ".to_string(),
        "PROG: COUSR00C              USER SECURITY LIST                VSAM: USRSEC  ".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
        "  USER ID      FIRST NAME            LAST NAME             ROLE (A=ADMIN/U=USER)".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
    ];
    for u in &users {
        lines.push(format!(
            "  {:<10}   {:<18}    {:<18}    {}",
            u.0, u.1, u.2, u.3
        ));
    }
    let msg = format!("DISPLAYING {} OPERATORS FROM USRSEC VSAM KSDS", users.len());
    lines.push("--------------------------------------------------------------------------------".to_string());
    lines.push(format!("{:<80}", format!("MESSAGE: {}", msg)));
    lines.push("ENTER=REFRESH   PF3=ADMIN MENU".to_string());

    Ok(TerminalScreenResponse {
        tran_id: "CU00".to_string(),
        program_name: "COUSR00C".to_string(),
        mapset_name: "COUSR00".to_string(),
        map_name: "COUSR0A".to_string(),
        title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
        title_line_2: "USER SECURITY LIST (COUSR00)".to_string(),
        lines,
        fields: vec![],
        status_message: msg,
        sqlcode: None,
        pf_keys: "ENTER=Refresh  PF3=Admin Menu".to_string(),
    })
}

/// Executes COBIL00C (Online Bill Payment) following exact COBOL rules:
/// - Checks `IF ACCT-CURR-BAL <= ZEROS` -> `"You have nothing to pay..."`
/// - When `CONFIRM == "Y"`, creates transaction `TYPE='02'`, `CAT='0002'`, `SOURCE='POS TERM'`,
///   `DESC='BILL PAYMENT - ONLINE'`, `MERCHANT='BILL PAYMENT'`, and zeroes `ACCT-CURR-BAL`.
pub fn execute_bill_payment(
    conn: &mut Connection,
    acct_id: &str,
    confirm: &str,
) -> Result<(Decimal, Decimal, Option<String>, String), String> {
    let curr_bal_str: String = conn
        .query_row(
            "SELECT curr_bal FROM accounts WHERE acct_id = ?1",
            params![acct_id],
            |r| r.get(0),
        )
        .map_err(|_| format!("Account ID {} not found in ACCTDATA", acct_id))?;

    let curr_bal = parse_money(&curr_bal_str);
    if curr_bal <= Decimal::new(0, 2) {
        return Ok((
            curr_bal,
            curr_bal,
            None,
            "You have nothing to pay...".to_string(),
        ));
    }

    if !confirm.trim().eq_ignore_ascii_case("Y") {
        return Ok((
            curr_bal,
            curr_bal,
            None,
            "Confirm to make a bill payment...".to_string(),
        ));
    }

    let card_num: String = conn
        .query_row(
            "SELECT card_num FROM card_xref WHERE acct_id = ?1 LIMIT 1",
            params![acct_id],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "0000000000000000".to_string());

    let max_id_str: Option<String> = conn
        .query_row(
            "SELECT MAX(tran_id) FROM transactions WHERE tran_id GLOB '[0-9]*'",
            [],
            |r| r.get(0),
        )
        .ok()
        .flatten();
    let next_num = max_id_str
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(2022071800000100)
        + 1;
    let new_tran_id = format!("{:016}", next_num);
    let now_ts = Utc::now().format("%Y-%m-%d-%H.%M.%S.000000").to_string();
    let new_bal = Decimal::new(0, 2);

    conn.execute(
        "INSERT INTO transactions (
            tran_id, acct_id, type_cd, cat_cd, source, description, amt,
            merchant_id, merchant_name, merchant_city, merchant_zip,
            card_num, orig_ts, proc_ts
        ) VALUES (?1, ?2, '02', '0002', 'POS TERM', 'BILL PAYMENT - ONLINE', ?3,
                  '999999999', 'BILL PAYMENT', 'N/A', 'N/A', ?4, ?5, ?5)",
        params![new_tran_id, acct_id, fmt_money(curr_bal), card_num, now_ts],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE accounts SET curr_bal = ?1 WHERE acct_id = ?2",
        params![fmt_money(new_bal), acct_id],
    )
    .map_err(|e| e.to_string())?;

    Ok((
        curr_bal,
        new_bal,
        Some(new_tran_id.clone()),
        format!(
            "Payment successful. Transaction ID: {} (Paid ${})",
            new_tran_id,
            fmt_money(curr_bal)
        ),
    ))
}

fn render_bill_payment(
    conn: &mut Connection,
    req: &TerminalCommandRequest,
) -> Result<TerminalScreenResponse, String> {
    let acct_id = req
        .inputs
        .get("ACCTID")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "00000000001".to_string());
    let confirm = req
        .inputs
        .get("CONFIRM")
        .map(|s| s.trim().to_uppercase())
        .unwrap_or_else(|| "N".to_string());

    let (_before_bal, after_bal, tx_id, msg) = execute_bill_payment(conn, &acct_id, &confirm)?;

    let lines = vec![
        "TRAN: CBIL      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COBIL00 ".to_string(),
        "PROG: COBIL00C               ONLINE BILL PAYMENT              VSAM: CXACAIX ".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
        format!("  ENTER ACCOUNT ID : [{}]", acct_id),
        "--------------------------------------------------------------------------------".to_string(),
        format!("  YOUR CURRENT BALANCE IS : ${:>12}", fmt_money(after_bal)),
        "                                                                                ".to_string(),
        format!(
            "  DO YOU WANT TO PAY YOUR BALANCE NOW? [{}] (Y/N)",
            confirm
        ),
        format!(
            "  GENERATED PAYMENT TRAN ID : {}",
            tx_id.unwrap_or_else(|| "(NONE)".to_string())
        ),
        "--------------------------------------------------------------------------------".to_string(),
        format!("{:<80}", format!("MESSAGE: {}", msg)),
        "ENTER=PROCESS BILL PAY   PF3=MAIN MENU   PF4=CLEAR".to_string(),
    ];

    let fields = vec![
        BmsField {
            id: "ACCTID".to_string(),
            label: "Account ID (11 digits)".to_string(),
            row: 4,
            col: 22,
            length: 11,
            value: acct_id,
            editable: true,
            color: "green".to_string(),
        },
        BmsField {
            id: "CONFIRM".to_string(),
            label: "Confirm Full Balance Payment (Y/N)".to_string(),
            row: 8,
            col: 41,
            length: 1,
            value: "N".to_string(),
            editable: true,
            color: "yellow".to_string(),
        },
    ];

    Ok(TerminalScreenResponse {
        tran_id: "CBIL".to_string(),
        program_name: "COBIL00C".to_string(),
        mapset_name: "COBIL00".to_string(),
        map_name: "COBIL0A".to_string(),
        title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
        title_line_2: "ONLINE BILL PAYMENT (COBIL00)".to_string(),
        lines,
        fields,
        status_message: msg,
        sqlcode: None,
        pf_keys: "ENTER=Submit Payment  PF3=Main Menu".to_string(),
    })
}

fn render_db2_tx_types(
    conn: &mut Connection,
    req: &TerminalCommandRequest,
) -> Result<TerminalScreenResponse, String> {
    let mut sqlcode = 0i32;
    let mut msg = "DB2 CURSOR FETCH COMPLETE (SQLCODE = 0, PLAN = CARDDEMO)".to_string();

    if let Some(action) = req.inputs.get("ACTION").map(|s| s.trim().to_uppercase()) {
        let code = req
            .inputs
            .get("TRTYPE")
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        let desc = req
            .inputs
            .get("TRDESC")
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        if action == "A" && !code.is_empty() {
            match conn.execute(
                "INSERT INTO db2_transaction_type (tr_type, tr_description) VALUES (?1, ?2)",
                params![code, desc],
            ) {
                Ok(_) => {
                    sqlcode = 0;
                    msg = format!("DB2 INSERT SUCCESSFUL FOR TR_TYPE={} (SQLCODE = 0)", code);
                }
                Err(_) => {
                    sqlcode = -803;
                    msg = "RECORD ALREADY EXISTS IN CARDDEMO.TRANSACTION_TYPE (SQLCODE = -803)"
                        .to_string();
                }
            }
        } else if action == "U" && !code.is_empty() {
            let updated = conn
                .execute(
                    "UPDATE db2_transaction_type SET tr_description = ?1 WHERE tr_type = ?2",
                    params![desc, code],
                )
                .unwrap_or(0);
            if updated > 0 {
                sqlcode = 0;
                msg = format!("DB2 UPDATE COMMITTED FOR TR_TYPE={} (SQLCODE = 0)", code);
            } else {
                sqlcode = 100;
                msg = "RECORD NOT FOUND FOR UPDATE (SQLCODE = +100)".to_string();
            }
        } else if action == "D" && !code.is_empty() {
            match conn.execute(
                "DELETE FROM db2_transaction_type WHERE tr_type = ?1",
                params![code],
            ) {
                Ok(0) => {
                    sqlcode = 100;
                    msg = "RECORD NOT FOUND FOR DELETE (SQLCODE = +100)".to_string();
                }
                Ok(_) => {
                    sqlcode = 0;
                    msg = format!("DB2 DELETE COMMITTED FOR TR_TYPE={} (SQLCODE = 0)", code);
                }
                Err(_) => {
                    sqlcode = -532;
                    msg = "CANNOT DELETE: CHILD ROWS EXIST IN TRANSACTION_TYPE_CATEGORY (SQLCODE = -532)"
                        .to_string();
                }
            }
        }
    }

    let mut stmt = conn
        .prepare("SELECT tr_type, tr_description FROM db2_transaction_type ORDER BY tr_type")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    let mut lines = vec![
        "TRAN: CTLI      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COTRTLI ".to_string(),
        "PROG: COTRTLIC        DB2 TRANSACTION TYPE MAINTENANCE        DB2 : CARDDEMO".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
        "  TR_TYPE   TR_DESCRIPTION (CARDDEMO.TRANSACTION_TYPE)                          ".to_string(),
        "--------------------------------------------------------------------------------".to_string(),
    ];
    for r in rows {
        let (code, desc) = r.map_err(|e| e.to_string())?;
        lines.push(format!("    {:<2}      {:<50}", code, desc));
    }
    lines.push("--------------------------------------------------------------------------------".to_string());
    lines.push("  MAINT ACTION [ ] (A=ADD, U=UPDATE, D=DELETE)  CODE: [  ]  DESC: [            ]".to_string());
    lines.push(format!("{:<80}", format!("MESSAGE: {}", msg)));

    let fields = vec![
        BmsField {
            id: "ACTION".to_string(),
            label: "Action (A=Add, U=Update, D=Delete)".to_string(),
            row: 14,
            col: 16,
            length: 1,
            value: "".to_string(),
            editable: true,
            color: "yellow".to_string(),
        },
        BmsField {
            id: "TRTYPE".to_string(),
            label: "DB2 TR_TYPE (2 chars)".to_string(),
            row: 14,
            col: 55,
            length: 2,
            value: "08".to_string(),
            editable: true,
            color: "green".to_string(),
        },
        BmsField {
            id: "TRDESC".to_string(),
            label: "DB2 TR_DESCRIPTION".to_string(),
            row: 14,
            col: 67,
            length: 30,
            value: "Instant Wire Transfer".to_string(),
            editable: true,
            color: "green".to_string(),
        },
    ];

    Ok(TerminalScreenResponse {
        tran_id: "CTLI".to_string(),
        program_name: "COTRTLIC".to_string(),
        mapset_name: "COTRTLI".to_string(),
        map_name: "COTRTLA".to_string(),
        title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
        title_line_2: "DB2 TRANSACTION TYPE MAINT (COTRTLI)".to_string(),
        lines,
        fields,
        status_message: msg,
        sqlcode: Some(sqlcode),
        pf_keys: "ENTER=Execute SQL  PF3=Main Menu  PF7/PF8=Cursor Fetch".to_string(),
    })
}

fn render_ims_auth_screen(
    conn: &Connection,
    req: &TerminalCommandRequest,
) -> Result<TerminalScreenResponse, String> {
    let acct_id = req
        .inputs
        .get("ACCTID")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "00000000001".to_string());

    let summary = conn
        .query_row(
            "SELECT cust_id, auth_status, credit_limit, credit_balance,
                    approved_auth_cnt, declined_auth_cnt, approved_auth_amt, declined_auth_amt
             FROM ims_pending_auth_summary WHERE acct_id = ?1",
            params![acct_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, i32>(4)?,
                    r.get::<_, i32>(5)?,
                    r.get::<_, String>(6)?,
                    r.get::<_, String>(7)?,
                ))
            },
        )
        .ok();

    let mut stmt = conn
        .prepare(
            "SELECT auth_date_9c, auth_time_9c, card_num, transaction_amt,
                    auth_resp_code, merchant_name, match_status, auth_fraud
             FROM ims_pending_auth_details
             WHERE acct_id = ?1
             ORDER BY auth_date_9c ASC, auth_time_9c ASC",
        )
        .map_err(|e| e.to_string())?;
    let details: Vec<(i32, i32, String, String, String, String, String, String)> = stmt
        .query_map(params![acct_id], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
                r.get(7)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    let mut lines = vec![
        "TRAN: CPVS      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COPAU00 ".to_string(),
        "PROG: COPAUS0C       IMS PENDING AUTHORIZATION SUMMARY        DBD : DBPAUTP0".to_string(),
        format!("  ACCOUNT ID (PAUTSUM0 ROOT KEY) : [{}]", acct_id),
        "--------------------------------------------------------------------------------".to_string(),
    ];

    if let Some(s) = summary {
        lines.push(format!(
            "  CUST ID: {}   STATUS: {}   CREDIT LIMIT: ${}   AUTH BAL: ${}",
            s.0, s.1, s.2, s.3
        ));
        lines.push(format!(
            "  APPROVED AUTHS: {} (${})     DECLINED AUTHS: {} (${})",
            s.4, s.6, s.5, s.7
        ));
    } else {
        lines.push("  IMS DLI STATUS = 'GE' (NO PAUTSUM0 SEGMENT FOR THIS ACCOUNT)".to_string());
    }

    lines.push("--------------------------------------------------------------------------------".to_string());
    lines.push("  9C-DATE/TIME     CARD NUM           AMOUNT     RESP  MERCHANT            FRAUD".to_string());
    for d in &details {
        lines.push(format!(
            "  {}/{}  {}  {:>9}    {}   {:<18}   {}",
            d.0, d.1, d.2, d.3, d.4, d.5, d.7
        ));
    }
    let msg = format!(
        "IMS HIDAM GU/GN COMPLETE ({} CHILD SEGMENTS IN PAUTDTL1)",
        details.len()
    );
    lines.push("--------------------------------------------------------------------------------".to_string());
    lines.push(format!("{:<80}", format!("MESSAGE: {}", msg)));

    let fields = vec![BmsField {
        id: "ACCTID".to_string(),
        label: "IMS Root Segment Account ID".to_string(),
        row: 3,
        col: 36,
        length: 11,
        value: acct_id,
        editable: true,
        color: "green".to_string(),
    }];

    Ok(TerminalScreenResponse {
        tran_id: "CPVS".to_string(),
        program_name: "COPAUS0C".to_string(),
        mapset_name: "COPAU00".to_string(),
        map_name: "COPAU0A".to_string(),
        title_line_1: "AWS MAINFRAME MODERNIZATION - CARDDEMO".to_string(),
        title_line_2: "IMS PENDING AUTHORIZATIONS (COPAU00)".to_string(),
        lines,
        fields,
        status_message: msg,
        sqlcode: Some(0),
        pf_keys: "ENTER=IMS DLI GU  PF3=Main Menu  PF5=Flag Fraud to DB2 AUTHFRDS".to_string(),
    })
}
