#![forbid(unsafe_code)]

mod batch_engine;
mod cics_engine;
mod db;
mod vsam_codec;

use axum::{
    extract::{Path as AxumPath, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use batch_engine::{run_nightly_batch_and_verify, BatchParityReport};
use chrono::Utc;
use cics_engine::{
    execute_bill_payment, execute_cics_terminal, TerminalCommandRequest, TerminalScreenResponse,
};
use db::init_db;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    env,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Instant,
};
use tower_http::{cors::CorsLayer, services::ServeDir};
use vsam_codec::{fmt_money, format_overpunch, parse_money, AccountRecord};

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Connection>>,
    ascii_dir: PathBuf,
    golden_dir: PathBuf,
    report_path: PathBuf,
    latest_report: Arc<Mutex<BatchParityReport>>,
}

#[derive(Serialize)]
struct AccountSummaryDto {
    acct_id: String,
    active_status: String,
    initial_bal: String,
    curr_bal: String,
    curr_bal_overpunch: String,
    credit_limit: String,
    cash_credit_limit: String,
    open_date: String,
    expiration_date: String,
    addr_zip: String,
    group_id: String,
    cust_id: String,
    customer_name: String,
    fico_score: i32,
    card_num: String,
}

#[derive(Deserialize)]
struct BillPayRequest {
    confirm: String,
}

#[derive(Deserialize)]
struct UpdateAccountRequest {
    credit_limit: String,
    active_status: String,
}

#[derive(Deserialize)]
struct Db2ActionRequest {
    action: String, // "ADD", "UPDATE", "DELETE"
    tr_type: String,
    tr_description: String,
}

#[derive(Deserialize)]
struct MqAuthorizeRequest {
    card_num: String,
    amount: String,
    merchant_name: String,
    merchant_city: String,
    merchant_state: String,
}

#[derive(Deserialize)]
struct FraudToggleRequest {
    acct_id: String,
    auth_date_9c: i32,
    auth_time_9c: i32,
    mark_fraud: bool,
}

#[tokio::main]
async fn main() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();
    let workspace_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let local_ascii = workspace_dir.join("data/ASCII");
    let ascii_dir = if local_ascii.exists() {
        local_ascii
    } else {
        workspace_dir
            .parent()
            .unwrap_or(&workspace_dir)
            .join("aws-mainframe-modernization-carddemo/app/data/ASCII")
    };
    let golden_dir = workspace_dir.join("golden_baseline");
    let schema_path = workspace_dir.join("migrations/001_schema.sql");
    let db_path = workspace_dir.join("carddemo.db");
    let report_path = workspace_dir.join("MEASURED_IMPROVEMENT_REPORT.json");

    let mut conn = init_db(&db_path, &schema_path)?;
    let initial_report =
        run_nightly_batch_and_verify(&mut conn, &ascii_dir, &golden_dir, &report_path)?;

    if args.iter().any(|a| a == "verify-parity") {
        println!(
            "✅ Nightly Batch & Golden Parity Verification Complete in {:.2}ms (vs {:.1}ms baseline -> {:.1}x speedup)",
            initial_report.rust_execution_ms,
            initial_report.legacy_baseline_ms,
            initial_report.speedup_vs_legacy
        );
        println!(
            "✅ Accounts Verified: {}/{} ({:.2}% Parity | Max Cent Drift: ${})",
            initial_report.accounts_matched,
            initial_report.accounts_verified,
            initial_report.parity_pct,
            initial_report.max_cent_drift
        );
        println!(
            "✅ Checksums: Initial=${} | Post-Tx=${} | Interest=${} | Final=${}",
            initial_report.total_initial_balance,
            initial_report.total_post_tran_balance,
            initial_report.total_interest_charged,
            initial_report.total_final_balance
        );
        return Ok(());
    }

    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
        ascii_dir,
        golden_dir,
        report_path,
        latest_report: Arc::new(Mutex::new(initial_report)),
    };

    let web_dist = workspace_dir.join("carddemo-web/dist");
    let app = Router::new()
        .route("/api/overview", get(get_overview))
        .route("/api/accounts", get(list_accounts))
        .route("/api/accounts/:id", get(get_account_detail).put(update_account))
        .route("/api/accounts/:id/bill-pay", post(post_bill_pay))
        .route("/api/transactions", get(list_transactions))
        .route("/api/rejects", get(list_rejects))
        .route("/api/db2/tx-types", get(list_db2_tx_types).post(mutate_db2_tx_types))
        .route("/api/ims/authorizations", get(list_ims_authorizations))
        .route("/api/mq/authorize", post(post_mq_authorize))
        .route("/api/ims/fraud", post(post_ims_fraud))
        .route("/api/batch/run-nightly", post(post_run_nightly_batch))
        .route("/api/cics/terminal", post(post_cics_terminal))
        .fallback_service(ServeDir::new(web_dist))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = "0.0.0.0:8080";
    println!("🚀 CardDemo Modern Rust Core + React 19 Workbench listening on http://localhost:8080");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| e.to_string())?;
    axum::serve(listener, app).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn get_overview(State(state): State<AppState>) -> Json<Value> {
    let report = state.latest_report.lock().unwrap().clone();
    let conn = state.db.lock().unwrap();
    let tx_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0))
        .unwrap_or(0);
    let db2_types: i64 = conn
        .query_row("SELECT COUNT(*) FROM db2_transaction_type", [], |r| r.get(0))
        .unwrap_or(0);
    let db2_cats: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM db2_transaction_type_category",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let ims_auths: i64 = conn
        .query_row("SELECT COUNT(*) FROM ims_pending_auth_details", [], |r| r.get(0))
        .unwrap_or(0);
    let fraud_alerts: i64 = conn
        .query_row("SELECT COUNT(*) FROM db2_auth_fraud", [], |r| r.get(0))
        .unwrap_or(0);

    Json(json!({
        "status": "ONLINE",
        "engine": "Safe Rust (#![forbid(unsafe_code)]) + SQLite + rust_decimal",
        "managed_agent": {
            "agent": "antigravity-preview-09-2026",
            "model": "gemini-4-argon",
            "context_window": "1,000,000 tokens",
            "files_ingested": 122,
            "artifact_families": 8
        },
        "counts": {
            "transactions_in_db": tx_count,
            "db2_transaction_types": db2_types,
            "db2_transaction_categories": db2_cats,
            "ims_pending_authorizations": ims_auths,
            "db2_fraud_alerts": fraud_alerts
        },
        "latest_parity_report": report
    }))
}

async fn list_accounts(State(state): State<AppState>) -> Result<Json<Vec<AccountSummaryDto>>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT a.acct_id, a.active_status, a.initial_bal, a.curr_bal, a.credit_limit,
                    a.cash_credit_limit, a.open_date, a.expiration_date, a.addr_zip, a.group_id,
                    COALESCE(c.cust_id, ''),
                    COALESCE(c.first_name || ' ' || c.middle_name || ' ' || c.last_name, 'UNKNOWN'),
                    COALESCE(c.fico_score, 0),
                    COALESCE(x.card_num, '')
             FROM accounts a
             LEFT JOIN card_xref x ON x.acct_id = a.acct_id
             LEFT JOIN customers c ON c.cust_id = x.cust_id
             ORDER BY a.acct_id",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let list: Vec<AccountSummaryDto> = stmt
        .query_map([], |r| {
            let curr_s: String = r.get(3)?;
            let curr_dec = parse_money(&curr_s);
            Ok(AccountSummaryDto {
                acct_id: r.get(0)?,
                active_status: r.get(1)?,
                initial_bal: r.get(2)?,
                curr_bal: curr_s,
                curr_bal_overpunch: format_overpunch(curr_dec, 12, 2),
                credit_limit: r.get(4)?,
                cash_credit_limit: r.get(5)?,
                open_date: r.get(6)?,
                expiration_date: r.get(7)?,
                addr_zip: r.get(8)?,
                group_id: r.get(9)?,
                cust_id: r.get(10)?,
                customer_name: r.get(11)?,
                fico_score: r.get(12)?,
                card_num: r.get(13)?,
            })
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();

    Ok(Json(list))
}

async fn get_account_detail(
    State(state): State<AppState>,
    AxumPath(acct_id): AxumPath<String>,
) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let acct = conn
        .query_row(
            "SELECT a.acct_id, a.active_status, a.initial_bal, a.curr_bal, a.credit_limit,
                    a.cash_credit_limit, a.open_date, a.expiration_date, a.reissue_date,
                    a.curr_cyc_credit, a.curr_cyc_debit, a.addr_zip, a.group_id,
                    COALESCE(c.cust_id, ''), COALESCE(c.first_name, ''), COALESCE(c.middle_name, ''),
                    COALESCE(c.last_name, ''), COALESCE(c.addr_line_1, ''), COALESCE(c.addr_line_3, ''),
                    COALESCE(c.state_cd, ''), COALESCE(c.zip, ''), COALESCE(c.phone_1, ''),
                    COALESCE(c.ssn, ''), COALESCE(c.dob, ''), COALESCE(c.fico_score, 0),
                    COALESCE(x.card_num, '')
             FROM accounts a
             LEFT JOIN card_xref x ON x.acct_id = a.acct_id
             LEFT JOIN customers c ON c.cust_id = x.cust_id
             WHERE a.acct_id = ?1",
            params![acct_id],
            |r| {
                let id_s: String = r.get(0)?;
                let active_s: String = r.get(1)?;
                let init_s: String = r.get(2)?;
                let curr_s: String = r.get(3)?;
                let cred_s: String = r.get(4)?;
                let cash_s: String = r.get(5)?;
                let open_s: String = r.get(6)?;
                let exp_s: String = r.get(7)?;
                let reis_s: String = r.get(8)?;
                let cyc_c_s: String = r.get(9)?;
                let cyc_d_s: String = r.get(10)?;
                let zip_s: String = r.get(11)?;
                let grp_s: String = r.get(12)?;
                let curr_dec = parse_money(&curr_s);
                let rec = AccountRecord {
                    acct_id: id_s.clone(),
                    active_status: active_s.clone(),
                    initial_bal: parse_money(&init_s),
                    curr_bal: curr_dec,
                    credit_limit: parse_money(&cred_s),
                    cash_credit_limit: parse_money(&cash_s),
                    open_date: open_s.clone(),
                    expiration_date: exp_s.clone(),
                    reissue_date: reis_s.clone(),
                    curr_cyc_credit: parse_money(&cyc_c_s),
                    curr_cyc_debit: parse_money(&cyc_d_s),
                    addr_zip: zip_s.clone(),
                    group_id: grp_s.clone(),
                };
                let vsam_300b = rec.to_fixed_width().trim_end().to_string();
                Ok(json!({
                    "acct_id": id_s,
                    "active_status": active_s,
                    "initial_bal": init_s,
                    "curr_bal": curr_s,
                    "curr_bal_overpunch": format_overpunch(curr_dec, 12, 2),
                    "vsam_fixed_width_preview": vsam_300b,
                    "credit_limit": cred_s,
                    "cash_credit_limit": cash_s,
                    "open_date": open_s,
                    "expiration_date": exp_s,
                    "reissue_date": reis_s,
                    "curr_cyc_credit": cyc_c_s,
                    "curr_cyc_debit": cyc_d_s,
                    "addr_zip": zip_s,
                    "group_id": grp_s,
                    "customer": {
                        "cust_id": r.get::<_, String>(13)?,
                        "first_name": r.get::<_, String>(14)?,
                        "middle_name": r.get::<_, String>(15)?,
                        "last_name": r.get::<_, String>(16)?,
                        "address": format!("{}, {}, {} {}", r.get::<_, String>(17)?, r.get::<_, String>(18)?, r.get::<_, String>(19)?, r.get::<_, String>(20)?),
                        "phone": r.get::<_, String>(21)?,
                        "ssn": r.get::<_, String>(22)?,
                        "dob": r.get::<_, String>(23)?,
                        "fico_score": r.get::<_, i32>(24)?
                    },
                    "card_num": r.get::<_, String>(25)?
                }))
            },
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let mut tx_stmt = conn
        .prepare(
            "SELECT tran_id, type_cd, cat_cd, source, description, amt, merchant_name, orig_ts
             FROM transactions WHERE acct_id = ?1 ORDER BY tran_id DESC",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let txs: Vec<Value> = tx_stmt
        .query_map(params![acct_id], |r| {
            Ok(json!({
                "tran_id": r.get::<_, String>(0)?,
                "type_cd": r.get::<_, String>(1)?,
                "cat_cd": r.get::<_, String>(2)?,
                "source": r.get::<_, String>(3)?,
                "description": r.get::<_, String>(4)?,
                "amt": r.get::<_, String>(5)?,
                "merchant_name": r.get::<_, String>(6)?,
                "orig_ts": r.get::<_, String>(7)?
            }))
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();

    let mut cat_stmt = conn
        .prepare(
            "SELECT tran_type_cd, tran_cat_cd, tran_cat_bal
             FROM tran_cat_balances WHERE acct_id = ?1 ORDER BY tran_type_cd, tran_cat_cd",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let cat_bals: Vec<Value> = cat_stmt
        .query_map(params![acct_id], |r| {
            Ok(json!({
                "tran_type_cd": r.get::<_, String>(0)?,
                "tran_cat_cd": r.get::<_, String>(1)?,
                "tran_cat_bal": r.get::<_, String>(2)?
            }))
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();

    Ok(Json(json!({
        "account": acct,
        "transactions": txs,
        "category_balances": cat_bals
    })))
}

async fn post_bill_pay(
    State(state): State<AppState>,
    AxumPath(acct_id): AxumPath<String>,
    Json(req): Json<BillPayRequest>,
) -> Result<Json<Value>, StatusCode> {
    let t0 = Instant::now();
    let mut conn = state.db.lock().unwrap();
    let (prev_bal, new_bal, tran_id, message) =
        execute_bill_payment(&mut conn, &acct_id, &req.confirm)
            .map_err(|_| StatusCode::BAD_REQUEST)?;
    let latency_ms = (t0.elapsed().as_secs_f64() * 1000.0 * 100.0).round() / 100.0;

    Ok(Json(json!({
        "acct_id": acct_id,
        "previous_balance": fmt_money(prev_bal),
        "new_balance": fmt_money(new_bal),
        "tran_id": tran_id,
        "message": message,
        "execution_ms": latency_ms,
        "legacy_green_screen_seconds": 54.0
    })))
}

async fn update_account(
    State(state): State<AppState>,
    AxumPath(acct_id): AxumPath<String>,
    Json(req): Json<UpdateAccountRequest>,
) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let lim = fmt_money(parse_money(&req.credit_limit));
    conn.execute(
        "UPDATE accounts SET credit_limit = ?1, active_status = ?2 WHERE acct_id = ?3",
        params![lim, req.active_status.trim().to_uppercase(), acct_id],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "acct_id": acct_id,
        "credit_limit": lim,
        "active_status": req.active_status.trim().to_uppercase(),
        "message": format!("CHANGES TO ACCOUNT {} SAVED (COACTUPC)", acct_id)
    })))
}

async fn list_transactions(State(state): State<AppState>) -> Result<Json<Vec<Value>>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT tran_id, acct_id, type_cd, cat_cd, source, description, amt,
                    merchant_name, merchant_city, card_num, orig_ts
             FROM transactions ORDER BY tran_id DESC LIMIT 120",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let rows: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "tran_id": r.get::<_, String>(0)?,
                "acct_id": r.get::<_, String>(1)?,
                "type_cd": r.get::<_, String>(2)?,
                "cat_cd": r.get::<_, String>(3)?,
                "source": r.get::<_, String>(4)?,
                "description": r.get::<_, String>(5)?,
                "amt": r.get::<_, String>(6)?,
                "merchant_name": r.get::<_, String>(7)?,
                "merchant_city": r.get::<_, String>(8)?,
                "card_num": r.get::<_, String>(9)?,
                "orig_ts": r.get::<_, String>(10)?
            }))
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();
    Ok(Json(rows))
}

async fn list_rejects(State(state): State<AppState>) -> Result<Json<Vec<Value>>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT tran_id, card_num, COALESCE(acct_id, 'N/A'), amt, orig_ts, fail_reason, fail_desc
             FROM daily_rejects ORDER BY tran_id",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let rows: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "tran_id": r.get::<_, String>(0)?,
                "card_num": r.get::<_, String>(1)?,
                "acct_id": r.get::<_, String>(2)?,
                "amt": r.get::<_, String>(3)?,
                "orig_ts": r.get::<_, String>(4)?,
                "fail_reason": r.get::<_, i32>(5)?,
                "fail_desc": r.get::<_, String>(6)?
            }))
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();
    Ok(Json(rows))
}

async fn list_db2_tx_types(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut stmt1 = conn
        .prepare("SELECT tr_type, tr_description FROM db2_transaction_type ORDER BY tr_type")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let types: Vec<Value> = stmt1
        .query_map([], |r| {
            Ok(json!({
                "tr_type": r.get::<_, String>(0)?,
                "tr_description": r.get::<_, String>(1)?
            }))
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();

    let mut stmt2 = conn
        .prepare(
            "SELECT trc_type_code, trc_type_category, trc_cat_data
             FROM db2_transaction_type_category ORDER BY trc_type_code, trc_type_category",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let categories: Vec<Value> = stmt2
        .query_map([], |r| {
            Ok(json!({
                "trc_type_code": r.get::<_, String>(0)?,
                "trc_type_category": r.get::<_, String>(1)?,
                "trc_cat_data": r.get::<_, String>(2)?
            }))
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();

    Ok(Json(json!({
        "sqlcode": 0,
        "transaction_types": types,
        "transaction_categories": categories
    })))
}

async fn mutate_db2_tx_types(
    State(state): State<AppState>,
    Json(req): Json<Db2ActionRequest>,
) -> Json<Value> {
    let conn = state.db.lock().unwrap();
    let code = req.tr_type.trim().to_string();
    let desc = req.tr_description.trim().to_string();
    let action = req.action.trim().to_uppercase();

    let (sqlcode, message) = match action.as_str() {
        "ADD" => match conn.execute(
            "INSERT INTO db2_transaction_type (tr_type, tr_description) VALUES (?1, ?2)",
            params![code, desc],
        ) {
            Ok(_) => (
                0,
                "RECORD INSERTED INTO CARDDEMO.TRANSACTION_TYPE (SQLCODE = 0)".to_string(),
            ),
            Err(_) => (
                -803,
                "DUPLICATE KEY IN INDEX CARDDEMO.XTRAN_TYPE (SQLCODE = -803)".to_string(),
            ),
        },
        "UPDATE" => {
            let n = conn
                .execute(
                    "UPDATE db2_transaction_type SET tr_description = ?1 WHERE tr_type = ?2",
                    params![desc, code],
                )
                .unwrap_or(0);
            if n > 0 {
                (0, format!("RECORD UPDATED FOR TR_TYPE={} (SQLCODE = 0)", code))
            } else {
                (100, "NO ROW FOUND FOR UPDATE (SQLCODE = +100)".to_string())
            }
        }
        "DELETE" => match conn.execute(
            "DELETE FROM db2_transaction_type WHERE tr_type = ?1",
            params![code],
        ) {
            Ok(0) => (100, "NO ROW FOUND FOR DELETE (SQLCODE = +100)".to_string()),
            Ok(_) => (0, format!("DELETED TR_TYPE={} (SQLCODE = 0)", code)),
            Err(_) => (
                -532,
                "FOREIGN KEY RESTRICT VIOLATION ON TRANSACTION_TYPE_CATEGORY (SQLCODE = -532)"
                    .to_string(),
            ),
        },
        _ => (-104, "INVALID DB2 OPERATION".to_string()),
    };

    Json(json!({
        "sqlcode": sqlcode,
        "message": message
    }))
}

async fn list_ims_authorizations(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut s_stmt = conn
        .prepare(
            "SELECT acct_id, cust_id, auth_status, credit_limit, cash_limit, credit_balance,
                    approved_auth_cnt, declined_auth_cnt, approved_auth_amt, declined_auth_amt
             FROM ims_pending_auth_summary ORDER BY acct_id",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let summaries: Vec<Value> = s_stmt
        .query_map([], |r| {
            Ok(json!({
                "acct_id": r.get::<_, String>(0)?,
                "cust_id": r.get::<_, String>(1)?,
                "auth_status": r.get::<_, String>(2)?,
                "credit_limit": r.get::<_, String>(3)?,
                "cash_limit": r.get::<_, String>(4)?,
                "credit_balance": r.get::<_, String>(5)?,
                "approved_auth_cnt": r.get::<_, i32>(6)?,
                "declined_auth_cnt": r.get::<_, i32>(7)?,
                "approved_auth_amt": r.get::<_, String>(8)?,
                "declined_auth_amt": r.get::<_, String>(9)?
            }))
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();

    let mut d_stmt = conn
        .prepare(
            "SELECT acct_id, auth_date_9c, auth_time_9c, auth_orig_date, auth_orig_time,
                    card_num, transaction_amt, approved_amt, auth_resp_code, auth_resp_reason,
                    merchant_name, merchant_city, merchant_state, match_status, auth_fraud, fraud_rpt_date
             FROM ims_pending_auth_details
             ORDER BY acct_id ASC, auth_date_9c ASC, auth_time_9c ASC",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let details: Vec<Value> = d_stmt
        .query_map([], |r| {
            Ok(json!({
                "acct_id": r.get::<_, String>(0)?,
                "auth_date_9c": r.get::<_, i32>(1)?,
                "auth_time_9c": r.get::<_, i32>(2)?,
                "auth_orig_date": r.get::<_, String>(3)?,
                "auth_orig_time": r.get::<_, String>(4)?,
                "card_num": r.get::<_, String>(5)?,
                "transaction_amt": r.get::<_, String>(6)?,
                "approved_amt": r.get::<_, String>(7)?,
                "auth_resp_code": r.get::<_, String>(8)?,
                "auth_resp_reason": r.get::<_, String>(9)?,
                "merchant_name": r.get::<_, String>(10)?,
                "merchant_city": r.get::<_, String>(11)?,
                "merchant_state": r.get::<_, String>(12)?,
                "match_status": r.get::<_, String>(13)?,
                "auth_fraud": r.get::<_, String>(14)?,
                "fraud_rpt_date": r.get::<_, String>(15)?
            }))
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();

    let mut f_stmt = conn
        .prepare(
            "SELECT card_num, auth_ts, acct_id, cust_id, transaction_amt, merchant_name, auth_fraud, fraud_rpt_date
             FROM db2_auth_fraud ORDER BY auth_ts DESC",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let frauds: Vec<Value> = f_stmt
        .query_map([], |r| {
            Ok(json!({
                "card_num": r.get::<_, String>(0)?,
                "auth_ts": r.get::<_, String>(1)?,
                "acct_id": r.get::<_, String>(2)?,
                "cust_id": r.get::<_, String>(3)?,
                "transaction_amt": r.get::<_, String>(4)?,
                "merchant_name": r.get::<_, String>(5)?,
                "auth_fraud": r.get::<_, String>(6)?,
                "fraud_rpt_date": r.get::<_, String>(7)?
            }))
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();

    Ok(Json(json!({
        "summaries": summaries,
        "details": details,
        "db2_fraud_table": frauds
    })))
}

async fn post_mq_authorize(
    State(state): State<AppState>,
    Json(req): Json<MqAuthorizeRequest>,
) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let amt = parse_money(&req.amount);

    let lookup: Option<(String, String, String, String)> = conn
        .query_row(
            "SELECT x.acct_id, x.cust_id, a.credit_limit, a.curr_bal
             FROM card_xref x
             JOIN accounts a ON a.acct_id = x.acct_id
             WHERE x.card_num = ?1",
            params![req.card_num.trim()],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .ok();

    let (acct_id, cust_id, lim_s, bal_s) = lookup.ok_or(StatusCode::BAD_REQUEST)?;
    let lim = parse_money(&lim_s);
    let bal = parse_money(&bal_s);

    let approved = (bal + amt) <= lim;
    let resp_code = if approved { "00" } else { "05" };
    let resp_reason = if approved { "0000" } else { "OVLM" };
    let match_status = if approved { "P" } else { "D" };

    let now = Utc::now();
    let yyddd: i32 = format!("{:02}{:03}", now.format("%y"), now.format("%j"))
        .parse()
        .unwrap_or(26298);
    let hhmmss_ms: i32 = format!(
        "{}{:03}",
        now.format("%H%M%S"),
        now.timestamp_subsec_millis()
    )
    .parse()
    .unwrap_or(120000000);

    let auth_date_9c = 99999 - yyddd;
    let auth_time_9c = 999999999 - hhmmss_ms;

    conn.execute(
        "INSERT OR IGNORE INTO ims_pending_auth_summary (
            acct_id, cust_id, auth_status, account_status, credit_limit, cash_limit,
            credit_balance, cash_balance, approved_auth_cnt, declined_auth_cnt,
            approved_auth_amt, declined_auth_amt
        ) VALUES (?1, ?2, 'A', '0000000000', ?3, '1000.00', ?4, '0.00', 0, 0, '0.00', '0.00')",
        params![acct_id, cust_id, lim_s, bal_s],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if approved {
        conn.execute(
            "UPDATE ims_pending_auth_summary
             SET approved_auth_cnt = approved_auth_cnt + 1
             WHERE acct_id = ?1",
            params![acct_id],
        )
        .ok();
    } else {
        conn.execute(
            "UPDATE ims_pending_auth_summary
             SET declined_auth_cnt = declined_auth_cnt + 1
             WHERE acct_id = ?1",
            params![acct_id],
        )
        .ok();
    }

    conn.execute(
        "INSERT INTO ims_pending_auth_details (
            acct_id, auth_date_9c, auth_time_9c, auth_orig_date, auth_orig_time,
            card_num, auth_type, card_expiry_date, message_type, message_source,
            auth_id_code, auth_resp_code, auth_resp_reason, processing_code,
            transaction_amt, approved_amt, merchant_category_code, acqr_country_code,
            pos_entry_mode, merchant_id, merchant_name, merchant_city, merchant_state,
            merchant_zip, transaction_id, match_status, auth_fraud, fraud_rpt_date
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, 'SALE', '2505', '0100', 'MQPOS',
            'AUTH99', ?7, ?8, '000000', ?9, ?10, '5411', '840',
            5, 'M999999999', ?11, ?12, ?13, '94105', 'TXMQ99999', ?14, 'N', ''
        )",
        params![
            acct_id,
            auth_date_9c,
            auth_time_9c,
            format!("{:05}", yyddd),
            now.format("%H%M%S").to_string(),
            req.card_num.trim(),
            resp_code,
            resp_reason,
            fmt_money(amt),
            if approved {
                fmt_money(amt)
            } else {
                "0.00".to_string()
            },
            req.merchant_name.trim(),
            req.merchant_city.trim(),
            req.merchant_state.trim(),
            match_status
        ],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "acct_id": acct_id,
        "approved": approved,
        "auth_resp_code": resp_code,
        "auth_resp_reason": resp_reason,
        "auth_date_9c": auth_date_9c,
        "auth_time_9c": auth_time_9c,
        "message": format!(
            "MQ Authorization {} (IMS 9C Key: {}/{})",
            if approved { "APPROVED (00)" } else { "DECLINED - OVERLIMIT (05)" },
            auth_date_9c,
            auth_time_9c
        )
    })))
}

async fn post_ims_fraud(
    State(state): State<AppState>,
    Json(req): Json<FraudToggleRequest>,
) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let flag = if req.mark_fraud { "F" } else { "R" };
    let rpt_date = Utc::now().format("%Y%m%d").to_string();

    conn.execute(
        "UPDATE ims_pending_auth_details
         SET auth_fraud = ?1, fraud_rpt_date = ?2
         WHERE acct_id = ?3 AND auth_date_9c = ?4 AND auth_time_9c = ?5",
        params![flag, rpt_date, req.acct_id, req.auth_date_9c, req.auth_time_9c],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if req.mark_fraud {
        if let Ok((card_num, tx_amt, merch_name, merch_city, merch_state)) = conn.query_row(
            "SELECT card_num, transaction_amt, merchant_name, merchant_city, merchant_state
             FROM ims_pending_auth_details
             WHERE acct_id = ?1 AND auth_date_9c = ?2 AND auth_time_9c = ?3",
            params![req.acct_id, req.auth_date_9c, req.auth_time_9c],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            },
        ) {
            let cust_id: String = conn
                .query_row(
                    "SELECT cust_id FROM card_xref WHERE acct_id = ?1 LIMIT 1",
                    params![req.acct_id],
                    |r| r.get(0),
                )
                .unwrap_or_else(|_| "000000001".to_string());
            let auth_ts = format!(
                "{}-{}-{}",
                Utc::now().format("%Y-%m-%d-%H.%M.%S"),
                req.auth_date_9c,
                req.auth_time_9c
            );
            conn.execute(
                "INSERT OR REPLACE INTO db2_auth_fraud (
                    card_num, auth_ts, auth_type, card_expiry_date, message_type, message_source,
                    auth_id_code, auth_resp_code, auth_resp_reason, processing_code,
                    transaction_amt, approved_amt, merchant_category_code, acqr_country_code,
                    pos_entry_mode, merchant_id, merchant_name, merchant_city, merchant_state,
                    merchant_zip, transaction_id, match_status, auth_fraud, fraud_rpt_date,
                    acct_id, cust_id
                ) VALUES (
                    ?1, ?2, 'SALE', '2505', '0100', 'COPAUS2C',
                    'FRAUD1', '05', 'FRAU', '000000', ?3, '0.00', '5411', '840',
                    5, 'M999999999', ?4, ?5, ?6, '94105', 'TXFRAUD', 'D', 'F', ?7, ?8, ?9
                )",
                params![
                    card_num,
                    auth_ts,
                    tx_amt,
                    merch_name,
                    merch_city,
                    merch_state,
                    rpt_date,
                    req.acct_id,
                    cust_id
                ],
            )
            .ok();
        }
    }

    Ok(Json(json!({
        "acct_id": req.acct_id,
        "auth_fraud": flag,
        "message": if req.mark_fraud {
            "IMS Segment Flagged as Fraud ('F') and Replicated to DB2 CARDDEMO.AUTHFRDS (COPAUS2C)"
        } else {
            "Fraud Flag Removed ('R') in IMS Segment"
        }
    })))
}

async fn post_run_nightly_batch(
    State(state): State<AppState>,
) -> Result<Json<BatchParityReport>, StatusCode> {
    let mut conn = state.db.lock().unwrap();
    let report = run_nightly_batch_and_verify(
        &mut conn,
        &state.ascii_dir,
        &state.golden_dir,
        &state.report_path,
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    *state.latest_report.lock().unwrap() = report.clone();
    Ok(Json(report))
}

async fn post_cics_terminal(
    State(state): State<AppState>,
    Json(req): Json<TerminalCommandRequest>,
) -> Result<Json<TerminalScreenResponse>, StatusCode> {
    let mut conn = state.db.lock().unwrap();
    let resp =
        execute_cics_terminal(&mut conn, &req).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(resp))
}
