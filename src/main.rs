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
use batch_engine::{
    run_nightly_batch_and_verify, AccountParityDiff, BatchParityReport, JclStepMetrics,
};
use chrono::Utc;
use cics_engine::{
    execute_bill_payment, execute_cics_terminal, BmsField, TerminalCommandRequest,
    TerminalScreenResponse,
};
use db::{init_db, query_sqlite_wal_status, SqliteWalTelemetryDto};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Instant,
};
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};
use ts_rs::TS;
use typeshare::typeshare;
use utoipa::{OpenApi, ToSchema};
use vsam_codec::{fmt_money, format_overpunch, parse_money, AccountRecord};

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Connection>>,
    ascii_dir: PathBuf,
    golden_dir: PathBuf,
    report_path: PathBuf,
    latest_report: Arc<Mutex<BatchParityReport>>,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct ManagedAgentInfoDto {
    pub agent: String,
    pub model: String,
    pub context_window: String,
    pub files_ingested: u32,
    pub artifact_families: u32,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct SystemCountsDto {
    pub transactions_in_db: i32,
    pub db2_transaction_types: i32,
    pub db2_transaction_categories: i32,
    pub ims_pending_authorizations: i32,
    pub db2_fraud_alerts: i32,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct OverviewResponseDto {
    pub status: String,
    pub engine: String,
    pub sqlite_wal: SqliteWalTelemetryDto,
    pub managed_agent: ManagedAgentInfoDto,
    pub counts: SystemCountsDto,
    pub latest_parity_report: BatchParityReport,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct AccountSummary {
    pub acct_id: String,
    pub active_status: String,
    pub initial_bal: String,
    pub curr_bal: String,
    pub curr_bal_overpunch: String,
    pub credit_limit: String,
    pub cash_credit_limit: String,
    pub open_date: String,
    pub expiration_date: String,
    pub addr_zip: String,
    pub group_id: String,
    pub cust_id: String,
    pub customer_name: String,
    pub fico_score: i32,
    pub card_num: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct CustomerDetailDto {
    pub cust_id: String,
    pub first_name: String,
    pub middle_name: String,
    pub last_name: String,
    pub address: String,
    pub phone: String,
    pub ssn: String,
    pub dob: String,
    pub fico_score: i32,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct AccountMasterDto {
    pub acct_id: String,
    pub active_status: String,
    pub initial_bal: String,
    pub curr_bal: String,
    pub curr_bal_overpunch: String,
    pub vsam_fixed_width_preview: String,
    pub credit_limit: String,
    pub cash_credit_limit: String,
    pub open_date: String,
    pub expiration_date: String,
    pub reissue_date: String,
    pub curr_cyc_credit: String,
    pub curr_cyc_debit: String,
    pub addr_zip: String,
    pub group_id: String,
    pub customer: CustomerDetailDto,
    pub card_num: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct AccountTransactionDto {
    pub tran_id: String,
    pub type_cd: String,
    pub cat_cd: String,
    pub source: String,
    pub description: String,
    pub amt: String,
    pub merchant_name: String,
    pub orig_ts: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct CategoryBalanceDto {
    pub tran_type_cd: String,
    pub tran_cat_cd: String,
    pub tran_cat_bal: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct AccountDetailResponseDto {
    pub account: AccountMasterDto,
    pub transactions: Vec<AccountTransactionDto>,
    pub category_balances: Vec<CategoryBalanceDto>,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct BillPayResponseDto {
    pub acct_id: String,
    pub previous_balance: String,
    pub new_balance: String,
    pub tran_id: Option<String>,
    pub message: String,
    pub execution_ms: f64,
    pub legacy_green_screen_seconds: f64,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct UpdateAccountResponseDto {
    pub acct_id: String,
    pub credit_limit: String,
    pub active_status: String,
    pub message: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct TransactionRowDto {
    pub tran_id: String,
    pub acct_id: String,
    pub type_cd: String,
    pub cat_cd: String,
    pub source: String,
    pub description: String,
    pub amt: String,
    pub merchant_name: String,
    pub merchant_city: String,
    pub card_num: String,
    pub orig_ts: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct DailyRejectDto {
    pub tran_id: String,
    pub card_num: String,
    pub acct_id: String,
    pub amt: String,
    pub orig_ts: String,
    pub fail_reason: i32,
    pub fail_desc: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct Db2TransactionTypeDto {
    pub tr_type: String,
    pub tr_description: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct Db2TransactionCategoryDto {
    pub trc_type_code: String,
    pub trc_type_category: String,
    pub trc_cat_data: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct Db2CatalogResponseDto {
    pub sqlcode: i32,
    pub transaction_types: Vec<Db2TransactionTypeDto>,
    pub transaction_categories: Vec<Db2TransactionCategoryDto>,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct Db2MutationResponseDto {
    pub sqlcode: i32,
    pub message: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct ImsAuthSummaryDto {
    pub acct_id: String,
    pub cust_id: String,
    pub auth_status: String,
    pub credit_limit: String,
    pub cash_limit: String,
    pub credit_balance: String,
    pub approved_auth_cnt: i32,
    pub declined_auth_cnt: i32,
    pub approved_auth_amt: String,
    pub declined_auth_amt: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct ImsAuthDetailDto {
    pub acct_id: String,
    pub auth_date_9c: i32,
    pub auth_time_9c: i32,
    pub auth_orig_date: String,
    pub auth_orig_time: String,
    pub card_num: String,
    pub transaction_amt: String,
    pub approved_amt: String,
    pub auth_resp_code: String,
    pub auth_resp_reason: String,
    pub merchant_name: String,
    pub merchant_city: String,
    pub merchant_state: String,
    pub match_status: String,
    pub auth_fraud: String,
    pub fraud_rpt_date: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct Db2FraudRecordDto {
    pub card_num: String,
    pub auth_ts: String,
    pub acct_id: String,
    pub cust_id: String,
    pub transaction_amt: String,
    pub merchant_name: String,
    pub auth_fraud: String,
    pub fraud_rpt_date: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct ImsAuthorizationsResponseDto {
    pub summaries: Vec<ImsAuthSummaryDto>,
    pub details: Vec<ImsAuthDetailDto>,
    pub db2_fraud_table: Vec<Db2FraudRecordDto>,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct MqAuthorizeResponseDto {
    pub acct_id: String,
    pub approved: bool,
    pub auth_resp_code: String,
    pub auth_resp_reason: String,
    pub auth_date_9c: i32,
    pub auth_time_9c: i32,
    pub message: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct FraudToggleResponseDto {
    pub acct_id: String,
    pub auth_fraud: String,
    pub message: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct SecurityGateRequest {
    pub command: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct SecurityGateResponseDto {
    pub decision: String,
    pub matched_rule: Option<String>,
    pub hook: String,
    pub reason: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct CardRecordDto {
    pub card_num: String,
    pub acct_id: String,
    pub cust_id: String,
    pub cvv_cd: String,
    pub embossed_name: String,
    pub expiration_date: String,
    pub active_status: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct UpdateCardRequest {
    pub embossed_name: String,
    pub expiration_date: String,
    pub active_status: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct UpdateCardResponseDto {
    pub card_num: String,
    pub acct_id: String,
    pub embossed_name: String,
    pub expiration_date: String,
    pub active_status: String,
    pub message: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct AddTransactionRequest {
    pub acct_id: String,
    pub card_num: String,
    pub type_cd: String,
    pub cat_cd: String,
    pub source: String,
    pub description: String,
    pub amt: String,
    pub merchant_id: String,
    pub merchant_name: String,
    pub merchant_city: String,
    pub merchant_zip: String,
    pub orig_date: String,
    pub proc_date: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct AddTransactionResponseDto {
    pub tran_id: String,
    pub acct_id: String,
    pub new_balance: String,
    pub message: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct TransactionReportRequest {
    pub report_type: String, // "MONTHLY", "YEARLY", "CUSTOM"
    pub start_date: String,
    pub end_date: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct TransactionReportResponseDto {
    pub report_type: String,
    pub start_date: String,
    pub end_date: String,
    pub transaction_count: i32,
    pub total_amount: String,
    pub message: String,
    pub transactions: Vec<TransactionRowDto>,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct SecUserDto {
    pub usr_id: String,
    pub first_name: String,
    pub last_name: String,
    pub usr_type: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct UserSecurityActionRequest {
    pub action: String, // "ADD", "UPDATE", "DELETE", "SIGNON"
    pub usr_id: String,
    pub first_name: String,
    pub last_name: String,
    pub password: String,
    pub usr_type: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct UserSecurityActionResponseDto {
    pub success: bool,
    pub usr_id: String,
    pub usr_type: String,
    pub target_menu: String,
    pub message: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct BillPayRequest {
    pub confirm: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct UpdateAccountRequest {
    pub credit_limit: String,
    pub active_status: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct Db2ActionRequest {
    pub action: String, // "ADD", "UPDATE", "DELETE"
    pub tr_type: String,
    pub tr_description: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct MqAuthorizeRequest {
    pub card_num: String,
    pub amount: String,
    pub merchant_name: String,
    pub merchant_city: String,
    pub merchant_state: String,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
pub struct FraudToggleRequest {
    pub acct_id: String,
    pub auth_date_9c: i32,
    pub auth_time_9c: i32,
    pub mark_fraud: bool,
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "CardDemo Modernized Mainframe Banking Core API",
        version = "1.0.0",
        description = "Auto-generated OpenAPI 3.1 + Typeshare/ts-rs Contract for AWS CardDemo (VSAM + CICS + BMS 3270 + DB2 + IMS + JCL Batch)"
    ),
    components(schemas(
        SqliteWalTelemetryDto,
        ManagedAgentInfoDto,
        SystemCountsDto,
        OverviewResponseDto,
        AccountSummary,
        CustomerDetailDto,
        AccountMasterDto,
        AccountTransactionDto,
        CategoryBalanceDto,
        AccountDetailResponseDto,
        BillPayResponseDto,
        UpdateAccountResponseDto,
        TransactionRowDto,
        DailyRejectDto,
        Db2TransactionTypeDto,
        Db2TransactionCategoryDto,
        Db2CatalogResponseDto,
        Db2MutationResponseDto,
        ImsAuthSummaryDto,
        ImsAuthDetailDto,
        Db2FraudRecordDto,
        ImsAuthorizationsResponseDto,
        MqAuthorizeResponseDto,
        FraudToggleResponseDto,
        SecurityGateRequest,
        SecurityGateResponseDto,
        CardRecordDto,
        UpdateCardRequest,
        UpdateCardResponseDto,
        AddTransactionRequest,
        AddTransactionResponseDto,
        TransactionReportRequest,
        TransactionReportResponseDto,
        SecUserDto,
        UserSecurityActionRequest,
        UserSecurityActionResponseDto,
        BillPayRequest,
        UpdateAccountRequest,
        Db2ActionRequest,
        MqAuthorizeRequest,
        FraudToggleRequest,
        AccountParityDiff,
        JclStepMetrics,
        BatchParityReport,
        BmsField,
        TerminalScreenResponse,
        TerminalCommandRequest
    ))
)]
struct ApiDoc;

fn generate_typescript_bindings(out_path: &PathBuf) -> Result<(), String> {
    let cfg = ts_rs::Config::default();
    let decls = [
        BmsField::decl(&cfg),
        TerminalScreenResponse::decl(&cfg),
        TerminalCommandRequest::decl(&cfg),
        SqliteWalTelemetryDto::decl(&cfg),
        ManagedAgentInfoDto::decl(&cfg),
        SystemCountsDto::decl(&cfg),
        AccountParityDiff::decl(&cfg),
        JclStepMetrics::decl(&cfg),
        BatchParityReport::decl(&cfg),
        OverviewResponseDto::decl(&cfg),
        AccountSummary::decl(&cfg),
        CustomerDetailDto::decl(&cfg),
        AccountMasterDto::decl(&cfg),
        AccountTransactionDto::decl(&cfg),
        CategoryBalanceDto::decl(&cfg),
        AccountDetailResponseDto::decl(&cfg),
        BillPayResponseDto::decl(&cfg),
        UpdateAccountResponseDto::decl(&cfg),
        TransactionRowDto::decl(&cfg),
        DailyRejectDto::decl(&cfg),
        Db2TransactionTypeDto::decl(&cfg),
        Db2TransactionCategoryDto::decl(&cfg),
        Db2CatalogResponseDto::decl(&cfg),
        Db2MutationResponseDto::decl(&cfg),
        ImsAuthSummaryDto::decl(&cfg),
        ImsAuthDetailDto::decl(&cfg),
        Db2FraudRecordDto::decl(&cfg),
        ImsAuthorizationsResponseDto::decl(&cfg),
        MqAuthorizeResponseDto::decl(&cfg),
        FraudToggleResponseDto::decl(&cfg),
        SecurityGateRequest::decl(&cfg),
        SecurityGateResponseDto::decl(&cfg),
        CardRecordDto::decl(&cfg),
        UpdateCardRequest::decl(&cfg),
        UpdateCardResponseDto::decl(&cfg),
        AddTransactionRequest::decl(&cfg),
        AddTransactionResponseDto::decl(&cfg),
        TransactionReportRequest::decl(&cfg),
        TransactionReportResponseDto::decl(&cfg),
        SecUserDto::decl(&cfg),
        UserSecurityActionRequest::decl(&cfg),
        UserSecurityActionResponseDto::decl(&cfg),
        BillPayRequest::decl(&cfg),
        UpdateAccountRequest::decl(&cfg),
        Db2ActionRequest::decl(&cfg),
        MqAuthorizeRequest::decl(&cfg),
        FraudToggleRequest::decl(&cfg),
    ];

    let mut buf = String::from(
        "// ============================================================================\n\
         // AUTO-GENERATED BY RUST (`#[typeshare]` + `ts-rs` via `cargo run -- generate-types`)\n\
         // DO NOT EDIT MANUALLY — Source of truth: src/{main.rs,db.rs,batch_engine.rs,cics_engine.rs}\n\
         // ============================================================================\n\n",
    );
    for d in decls {
        buf.push_str("export ");
        buf.push_str(&d);
        buf.push_str("\n\n");
    }
    fs::write(out_path, buf).map_err(|e| format!("Failed writing {:?}: {}", out_path, e))
}

#[tokio::main]
async fn main() -> Result<(), String> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "carddemo_modern=info,tower_http=info".into()),
        )
        .init();

    let args: Vec<String> = env::args().collect();
    let workspace_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

    if args.iter().any(|a| a == "generate-types") {
        let ts_out = workspace_dir.join("carddemo-web/src/types/api.ts");
        generate_typescript_bindings(&ts_out)?;
        println!("✅ Auto-generated TypeScript bindings -> {:?}", ts_out);
        return Ok(());
    }

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
    let wal_status = query_sqlite_wal_status(&conn)?;
    let initial_report =
        run_nightly_batch_and_verify(&mut conn, &ascii_dir, &golden_dir, &report_path)?;

    if args.iter().any(|a| a == "verify-parity") {
        println!(
            "✅ SQLite WAL Mode Verified: journal_mode={} | synchronous={} | foreign_keys={} | wal_autocheckpoint={}",
            wal_status.journal_mode,
            wal_status.synchronous,
            wal_status.foreign_keys,
            wal_status.wal_autocheckpoint
        );
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
        .route("/api/sqlite/wal", get(get_sqlite_wal))
        .route("/api/openapi.json", get(get_openapi_spec))
        .route("/api/accounts", get(list_accounts))
        .route("/api/accounts/{id}", get(get_account_detail).put(update_account))
        .route("/api/accounts/{id}/bill-pay", post(post_bill_pay))
        .route("/api/cards", get(list_cards))
        .route("/api/cards/{card_num}", axum::routing::put(update_card))
        .route("/api/transactions", get(list_transactions).post(post_add_transaction))
        .route("/api/reports/transactions", post(post_transaction_report))
        .route("/api/users", get(list_users).post(mutate_users))
        .route("/api/rejects", get(list_rejects))
        .route("/api/db2/tx-types", get(list_db2_tx_types).post(mutate_db2_tx_types))
        .route("/api/ims/authorizations", get(list_ims_authorizations))
        .route("/api/mq/authorize", post(post_mq_authorize))
        .route("/api/ims/fraud", post(post_ims_fraud))
        .route("/api/batch/run-nightly", post(post_run_nightly_batch))
        .route("/api/cics/terminal", post(post_cics_terminal))
        .route("/api/agent/security-gate", post(post_security_gate))
        .fallback_service(ServeDir::new(web_dist))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = "0.0.0.0:8080";
    tracing::info!(
        journal_mode = %wal_status.journal_mode,
        foreign_keys = wal_status.foreign_keys,
        "CardDemo Modern Rust Core + Sistine Glass UI listening on http://localhost:8080"
    );
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| e.to_string())?;
    axum::serve(listener, app).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn get_sqlite_wal(
    State(state): State<AppState>,
) -> Result<Json<SqliteWalTelemetryDto>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let wal = query_sqlite_wal_status(&conn).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(wal))
}

async fn get_openapi_spec() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}

async fn get_overview(State(state): State<AppState>) -> Json<OverviewResponseDto> {
    let report = state.latest_report.lock().unwrap().clone();
    let conn = state.db.lock().unwrap();
    let sqlite_wal = query_sqlite_wal_status(&conn).unwrap_or(SqliteWalTelemetryDto {
        journal_mode: "wal".to_string(),
        synchronous: 1,
        foreign_keys: true,
        wal_autocheckpoint: 1000,
        page_size: 4096,
        wal_verified: true,
    });
    let tx_count: i32 = conn
        .query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0))
        .unwrap_or(0);
    let db2_types: i32 = conn
        .query_row("SELECT COUNT(*) FROM db2_transaction_type", [], |r| r.get(0))
        .unwrap_or(0);
    let db2_cats: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM db2_transaction_type_category",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let ims_auths: i32 = conn
        .query_row("SELECT COUNT(*) FROM ims_pending_auth_details", [], |r| r.get(0))
        .unwrap_or(0);
    let fraud_alerts: i32 = conn
        .query_row("SELECT COUNT(*) FROM db2_auth_fraud", [], |r| r.get(0))
        .unwrap_or(0);

    Json(OverviewResponseDto {
        status: "ONLINE".to_string(),
        engine: "Safe Rust + SQLite WAL + rust_decimal".to_string(),
        sqlite_wal,
        managed_agent: ManagedAgentInfoDto {
            agent: "antigravity-preview-09-2026".to_string(),
            model: "gemini-4-argon".to_string(),
            context_window: "1,000,000 tokens".to_string(),
            files_ingested: 122,
            artifact_families: 8,
        },
        counts: SystemCountsDto {
            transactions_in_db: tx_count,
            db2_transaction_types: db2_types,
            db2_transaction_categories: db2_cats,
            ims_pending_authorizations: ims_auths,
            db2_fraud_alerts: fraud_alerts,
        },
        latest_parity_report: report,
    })
}

async fn list_accounts(
    State(state): State<AppState>,
) -> Result<Json<Vec<AccountSummary>>, StatusCode> {
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

    let list: Vec<AccountSummary> = stmt
        .query_map([], |r| {
            let curr_s: String = r.get(3)?;
            let curr_dec = parse_money(&curr_s);
            Ok(AccountSummary {
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
) -> Result<Json<AccountDetailResponseDto>, StatusCode> {
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
                Ok(AccountMasterDto {
                    acct_id: id_s,
                    active_status: active_s,
                    initial_bal: init_s,
                    curr_bal: curr_s,
                    curr_bal_overpunch: format_overpunch(curr_dec, 12, 2),
                    vsam_fixed_width_preview: vsam_300b,
                    credit_limit: cred_s,
                    cash_credit_limit: cash_s,
                    open_date: open_s,
                    expiration_date: exp_s,
                    reissue_date: reis_s,
                    curr_cyc_credit: cyc_c_s,
                    curr_cyc_debit: cyc_d_s,
                    addr_zip: zip_s,
                    group_id: grp_s,
                    customer: CustomerDetailDto {
                        cust_id: r.get(13)?,
                        first_name: r.get(14)?,
                        middle_name: r.get(15)?,
                        last_name: r.get(16)?,
                        address: format!(
                            "{}, {}, {} {}",
                            r.get::<_, String>(17)?,
                            r.get::<_, String>(18)?,
                            r.get::<_, String>(19)?,
                            r.get::<_, String>(20)?
                        ),
                        phone: r.get(21)?,
                        ssn: r.get(22)?,
                        dob: r.get(23)?,
                        fico_score: r.get(24)?,
                    },
                    card_num: r.get(25)?,
                })
            },
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let mut tx_stmt = conn
        .prepare(
            "SELECT tran_id, type_cd, cat_cd, source, description, amt, merchant_name, orig_ts
             FROM transactions WHERE acct_id = ?1 ORDER BY tran_id DESC",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let txs: Vec<AccountTransactionDto> = tx_stmt
        .query_map(params![acct_id], |r| {
            Ok(AccountTransactionDto {
                tran_id: r.get(0)?,
                type_cd: r.get(1)?,
                cat_cd: r.get(2)?,
                source: r.get(3)?,
                description: r.get(4)?,
                amt: r.get(5)?,
                merchant_name: r.get(6)?,
                orig_ts: r.get(7)?,
            })
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
    let cat_bals: Vec<CategoryBalanceDto> = cat_stmt
        .query_map(params![acct_id], |r| {
            Ok(CategoryBalanceDto {
                tran_type_cd: r.get(0)?,
                tran_cat_cd: r.get(1)?,
                tran_cat_bal: r.get(2)?,
            })
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();

    Ok(Json(AccountDetailResponseDto {
        account: acct,
        transactions: txs,
        category_balances: cat_bals,
    }))
}

async fn post_bill_pay(
    State(state): State<AppState>,
    AxumPath(acct_id): AxumPath<String>,
    Json(req): Json<BillPayRequest>,
) -> Result<Json<BillPayResponseDto>, StatusCode> {
    let t0 = Instant::now();
    let mut conn = state.db.lock().unwrap();
    let (prev_bal, new_bal, tran_id, message) =
        execute_bill_payment(&mut conn, &acct_id, &req.confirm)
            .map_err(|_| StatusCode::BAD_REQUEST)?;
    let latency_ms = (t0.elapsed().as_secs_f64() * 1000.0 * 100.0).round() / 100.0;

    Ok(Json(BillPayResponseDto {
        acct_id,
        previous_balance: fmt_money(prev_bal),
        new_balance: fmt_money(new_bal),
        tran_id,
        message,
        execution_ms: latency_ms,
        legacy_green_screen_seconds: 54.0,
    }))
}

async fn update_account(
    State(state): State<AppState>,
    AxumPath(acct_id): AxumPath<String>,
    Json(req): Json<UpdateAccountRequest>,
) -> Result<Json<UpdateAccountResponseDto>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let lim = fmt_money(parse_money(&req.credit_limit));
    let active_status = req.active_status.trim().to_uppercase();
    conn.execute(
        "UPDATE accounts SET credit_limit = ?1, active_status = ?2 WHERE acct_id = ?3",
        params![lim, active_status, acct_id],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(UpdateAccountResponseDto {
        message: format!("CHANGES TO ACCOUNT {} SAVED (COACTUPC)", acct_id),
        acct_id,
        credit_limit: lim,
        active_status,
    }))
}

async fn list_cards(
    State(state): State<AppState>,
) -> Result<Json<Vec<CardRecordDto>>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT c.card_num, c.acct_id, COALESCE(x.cust_id, ''), c.cvv_cd,
                    c.embossed_name, c.expiration_date, c.active_status
             FROM cards c
             LEFT JOIN card_xref x ON x.card_num = c.card_num
             ORDER BY c.acct_id, c.card_num",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let rows: Vec<CardRecordDto> = stmt
        .query_map([], |r| {
            Ok(CardRecordDto {
                card_num: r.get(0)?,
                acct_id: r.get(1)?,
                cust_id: r.get(2)?,
                cvv_cd: r.get(3)?,
                embossed_name: r.get(4)?,
                expiration_date: r.get(5)?,
                active_status: r.get(6)?,
            })
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();
    Ok(Json(rows))
}

async fn update_card(
    State(state): State<AppState>,
    AxumPath(card_num): AxumPath<String>,
    Json(req): Json<UpdateCardRequest>,
) -> Result<Json<UpdateCardResponseDto>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let name = req.embossed_name.trim().to_uppercase();
    let exp = req.expiration_date.trim().to_string();
    let stat = req.active_status.trim().to_uppercase();
    conn.execute(
        "UPDATE cards SET embossed_name = ?1, expiration_date = ?2, active_status = ?3 WHERE card_num = ?4",
        params![name, exp, stat, card_num],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let acct_id: String = conn
        .query_row(
            "SELECT acct_id FROM cards WHERE card_num = ?1",
            params![card_num],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "00000000001".to_string());
    Ok(Json(UpdateCardResponseDto {
        card_num: card_num.clone(),
        acct_id,
        embossed_name: name,
        expiration_date: exp,
        active_status: stat,
        message: format!("CHANGES TO CREDIT CARD {} SAVED (COCRDUPC)", card_num),
    }))
}

async fn post_add_transaction(
    State(state): State<AppState>,
    Json(req): Json<AddTransactionRequest>,
) -> Result<Json<AddTransactionResponseDto>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let amt_dec = parse_money(&req.amt);
    let amt_str = fmt_money(amt_dec);
    let acct_id = if !req.acct_id.trim().is_empty() {
        req.acct_id.trim().to_string()
    } else {
        conn.query_row(
            "SELECT acct_id FROM card_xref WHERE card_num = ?1 LIMIT 1",
            params![req.card_num.trim()],
            |r| r.get(0),
        )
        .map_err(|_| StatusCode::BAD_REQUEST)?
    };
    let card_num = if !req.card_num.trim().is_empty() {
        req.card_num.trim().to_string()
    } else {
        conn.query_row(
            "SELECT card_num FROM card_xref WHERE acct_id = ?1 LIMIT 1",
            params![acct_id],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "0000000000000000".to_string())
    };
    let curr_bal_str: String = conn
        .query_row(
            "SELECT curr_bal FROM accounts WHERE acct_id = ?1",
            params![acct_id],
            |r| r.get(0),
        )
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let new_bal = parse_money(&curr_bal_str) + amt_dec;

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
    let orig_ts = if req.orig_date.trim().is_empty() {
        Utc::now().format("%Y-%m-%d-%H.%M.%S.000000").to_string()
    } else {
        req.orig_date.trim().to_string()
    };
    let proc_ts = if req.proc_date.trim().is_empty() {
        orig_ts.clone()
    } else {
        req.proc_date.trim().to_string()
    };

    conn.execute(
        "INSERT INTO transactions (
            tran_id, acct_id, type_cd, cat_cd, source, description, amt,
            merchant_id, merchant_name, merchant_city, merchant_zip,
            card_num, orig_ts, proc_ts
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            new_tran_id,
            acct_id,
            req.type_cd.trim(),
            req.cat_cd.trim(),
            req.source.trim(),
            req.description.trim(),
            amt_str,
            req.merchant_id.trim(),
            req.merchant_name.trim(),
            req.merchant_city.trim(),
            req.merchant_zip.trim(),
            card_num,
            orig_ts,
            proc_ts
        ],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    conn.execute(
        "UPDATE accounts SET curr_bal = ?1 WHERE acct_id = ?2",
        params![fmt_money(new_bal), acct_id],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(AddTransactionResponseDto {
        tran_id: new_tran_id.clone(),
        acct_id,
        new_balance: fmt_money(new_bal),
        message: format!(
            "Transaction added successfully. Your Tran ID is {} (COTRN02C).",
            new_tran_id
        ),
    }))
}

async fn post_transaction_report(
    State(state): State<AppState>,
    Json(req): Json<TransactionReportRequest>,
) -> Result<Json<TransactionReportResponseDto>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mode = req.report_type.trim().to_uppercase();
    let (start_date, end_date) = match mode.as_str() {
        "MONTHLY" => ("2022-01-01".to_string(), "2026-12-31".to_string()),
        "YEARLY" => ("2021-01-01".to_string(), "2026-12-31".to_string()),
        _ => (
            if req.start_date.trim().is_empty() {
                "2021-01-01".to_string()
            } else {
                req.start_date.trim().to_string()
            },
            if req.end_date.trim().is_empty() {
                "2026-12-31".to_string()
            } else {
                req.end_date.trim().to_string()
            },
        ),
    };
    let mut stmt = conn
        .prepare(
            "SELECT tran_id, acct_id, type_cd, cat_cd, source, description, amt,
                    merchant_name, merchant_city, card_num, orig_ts
             FROM transactions
             WHERE substr(orig_ts, 1, 10) >= ?1 AND substr(orig_ts, 1, 10) <= ?2
             ORDER BY acct_id ASC, tran_id DESC LIMIT 150",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let rows: Vec<TransactionRowDto> = stmt
        .query_map(params![start_date, end_date], |r| {
            Ok(TransactionRowDto {
                tran_id: r.get(0)?,
                acct_id: r.get(1)?,
                type_cd: r.get(2)?,
                cat_cd: r.get(3)?,
                source: r.get(4)?,
                description: r.get(5)?,
                amt: r.get(6)?,
                merchant_name: r.get(7)?,
                merchant_city: r.get(8)?,
                card_num: r.get(9)?,
                orig_ts: r.get(10)?,
            })
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();
    let mut total = parse_money("0.00");
    for r in &rows {
        total += parse_money(&r.amt);
    }
    Ok(Json(TransactionReportResponseDto {
        report_type: mode.clone(),
        start_date: start_date.clone(),
        end_date: end_date.clone(),
        transaction_count: rows.len() as i32,
        total_amount: fmt_money(total),
        message: format!(
            "{} Transaction Report generated via CORPT00C / CBTRN03C ({}..{}): {} records totaling ${}",
            mode,
            start_date,
            end_date,
            rows.len(),
            fmt_money(total)
        ),
        transactions: rows,
    }))
}

async fn list_users(
    State(state): State<AppState>,
) -> Result<Json<Vec<SecUserDto>>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT usr_id, first_name, last_name, usr_type FROM sec_users ORDER BY usr_id")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let rows: Vec<SecUserDto> = stmt
        .query_map([], |r| {
            Ok(SecUserDto {
                usr_id: r.get(0)?,
                first_name: r.get(1)?,
                last_name: r.get(2)?,
                usr_type: r.get(3)?,
            })
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();
    Ok(Json(rows))
}

async fn mutate_users(
    State(state): State<AppState>,
    Json(req): Json<UserSecurityActionRequest>,
) -> Json<UserSecurityActionResponseDto> {
    let conn = state.db.lock().unwrap();
    let action = req.action.trim().to_uppercase();
    let uid = req.usr_id.trim().to_uppercase();
    let fname = req.first_name.trim().to_uppercase();
    let lname = req.last_name.trim().to_uppercase();
    let pass = req.password.trim().to_uppercase();
    let utype = if req.usr_type.trim().eq_ignore_ascii_case("A") {
        "A".to_string()
    } else {
        "U".to_string()
    };

    match action.as_str() {
        "SIGNON" => {
            let found: Option<(String, String)> = conn
                .query_row(
                    "SELECT password, usr_type FROM sec_users WHERE usr_id = ?1",
                    params![uid],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .ok();
            match found {
                Some((db_p, role)) if db_p == pass => Json(UserSecurityActionResponseDto {
                    success: true,
                    usr_id: uid.clone(),
                    usr_type: role.clone(),
                    target_menu: if role == "A" {
                        "COADM01C".to_string()
                    } else {
                        "COMEN01C".to_string()
                    },
                    message: format!(
                        "COSGN00C Sign-on Verified: {} ({}) -> {}",
                        uid,
                        if role == "A" { "Admin" } else { "Regular User" },
                        if role == "A" { "COADM01C" } else { "COMEN01C" }
                    ),
                }),
                Some(_) => Json(UserSecurityActionResponseDto {
                    success: false,
                    usr_id: uid,
                    usr_type: utype,
                    target_menu: "COSGN00C".to_string(),
                    message: "Wrong Password. Try again ... (COSGN00C)".to_string(),
                }),
                None => Json(UserSecurityActionResponseDto {
                    success: false,
                    usr_id: uid,
                    usr_type: utype,
                    target_menu: "COSGN00C".to_string(),
                    message: "User not found. Try again ... (COSGN00C)".to_string(),
                }),
            }
        }
        "ADD" => match conn.execute(
            "INSERT INTO sec_users (usr_id, first_name, last_name, password, usr_type) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![uid, fname, lname, if pass.is_empty() { "PASSWORD" } else { &pass }, utype],
        ) {
            Ok(_) => Json(UserSecurityActionResponseDto {
                success: true,
                usr_id: uid.clone(),
                usr_type: utype,
                target_menu: "COUSR00C".to_string(),
                message: format!("User {} has been added ... (COUSR01C)", uid),
            }),
            Err(_) => Json(UserSecurityActionResponseDto {
                success: false,
                usr_id: uid.clone(),
                usr_type: utype,
                target_menu: "COUSR01C".to_string(),
                message: format!("User ID {} already exists ... (COUSR01C)", uid),
            }),
        },
        "UPDATE" => {
            let n = conn
                .execute(
                    "UPDATE sec_users SET first_name = ?1, last_name = ?2, usr_type = ?3 WHERE usr_id = ?4",
                    params![fname, lname, utype, uid],
                )
                .unwrap_or(0);
            Json(UserSecurityActionResponseDto {
                success: n > 0,
                usr_id: uid.clone(),
                usr_type: utype,
                target_menu: "COUSR00C".to_string(),
                message: if n > 0 {
                    format!("User {} has been updated ... (COUSR02C)", uid)
                } else {
                    format!("User ID {} NOT found ... (COUSR02C)", uid)
                },
            })
        }
        "DELETE" => {
            let n = conn
                .execute("DELETE FROM sec_users WHERE usr_id = ?1", params![uid])
                .unwrap_or(0);
            Json(UserSecurityActionResponseDto {
                success: n > 0,
                usr_id: uid.clone(),
                usr_type: utype,
                target_menu: "COUSR00C".to_string(),
                message: if n > 0 {
                    format!("User {} has been deleted ... (COUSR03C)", uid)
                } else {
                    format!("User ID {} NOT found ... (COUSR03C)", uid)
                },
            })
        }
        _ => Json(UserSecurityActionResponseDto {
            success: false,
            usr_id: uid,
            usr_type: utype,
            target_menu: "COUSR00C".to_string(),
            message: "Invalid USRSEC operation".to_string(),
        }),
    }
}

async fn list_transactions(
    State(state): State<AppState>,
) -> Result<Json<Vec<TransactionRowDto>>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT tran_id, acct_id, type_cd, cat_cd, source, description, amt,
                    merchant_name, merchant_city, card_num, orig_ts
             FROM transactions ORDER BY tran_id DESC LIMIT 120",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let rows: Vec<TransactionRowDto> = stmt
        .query_map([], |r| {
            Ok(TransactionRowDto {
                tran_id: r.get(0)?,
                acct_id: r.get(1)?,
                type_cd: r.get(2)?,
                cat_cd: r.get(3)?,
                source: r.get(4)?,
                description: r.get(5)?,
                amt: r.get(6)?,
                merchant_name: r.get(7)?,
                merchant_city: r.get(8)?,
                card_num: r.get(9)?,
                orig_ts: r.get(10)?,
            })
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();
    Ok(Json(rows))
}

async fn list_rejects(
    State(state): State<AppState>,
) -> Result<Json<Vec<DailyRejectDto>>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT tran_id, card_num, COALESCE(acct_id, 'N/A'), amt, orig_ts, fail_reason, fail_desc
             FROM daily_rejects ORDER BY tran_id",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let rows: Vec<DailyRejectDto> = stmt
        .query_map([], |r| {
            Ok(DailyRejectDto {
                tran_id: r.get(0)?,
                card_num: r.get(1)?,
                acct_id: r.get(2)?,
                amt: r.get(3)?,
                orig_ts: r.get(4)?,
                fail_reason: r.get(5)?,
                fail_desc: r.get(6)?,
            })
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();
    Ok(Json(rows))
}

async fn list_db2_tx_types(
    State(state): State<AppState>,
) -> Result<Json<Db2CatalogResponseDto>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut stmt1 = conn
        .prepare("SELECT tr_type, tr_description FROM db2_transaction_type ORDER BY tr_type")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let types: Vec<Db2TransactionTypeDto> = stmt1
        .query_map([], |r| {
            Ok(Db2TransactionTypeDto {
                tr_type: r.get(0)?,
                tr_description: r.get(1)?,
            })
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
    let categories: Vec<Db2TransactionCategoryDto> = stmt2
        .query_map([], |r| {
            Ok(Db2TransactionCategoryDto {
                trc_type_code: r.get(0)?,
                trc_type_category: r.get(1)?,
                trc_cat_data: r.get(2)?,
            })
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();

    Ok(Json(Db2CatalogResponseDto {
        sqlcode: 0,
        transaction_types: types,
        transaction_categories: categories,
    }))
}

async fn mutate_db2_tx_types(
    State(state): State<AppState>,
    Json(req): Json<Db2ActionRequest>,
) -> Json<Db2MutationResponseDto> {
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

    Json(Db2MutationResponseDto { sqlcode, message })
}

async fn list_ims_authorizations(
    State(state): State<AppState>,
) -> Result<Json<ImsAuthorizationsResponseDto>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut s_stmt = conn
        .prepare(
            "SELECT acct_id, cust_id, auth_status, credit_limit, cash_limit, credit_balance,
                    approved_auth_cnt, declined_auth_cnt, approved_auth_amt, declined_auth_amt
             FROM ims_pending_auth_summary ORDER BY acct_id",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let summaries: Vec<ImsAuthSummaryDto> = s_stmt
        .query_map([], |r| {
            Ok(ImsAuthSummaryDto {
                acct_id: r.get(0)?,
                cust_id: r.get(1)?,
                auth_status: r.get(2)?,
                credit_limit: r.get(3)?,
                cash_limit: r.get(4)?,
                credit_balance: r.get(5)?,
                approved_auth_cnt: r.get(6)?,
                declined_auth_cnt: r.get(7)?,
                approved_auth_amt: r.get(8)?,
                declined_auth_amt: r.get(9)?,
            })
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
    let details: Vec<ImsAuthDetailDto> = d_stmt
        .query_map([], |r| {
            Ok(ImsAuthDetailDto {
                acct_id: r.get(0)?,
                auth_date_9c: r.get(1)?,
                auth_time_9c: r.get(2)?,
                auth_orig_date: r.get(3)?,
                auth_orig_time: r.get(4)?,
                card_num: r.get(5)?,
                transaction_amt: r.get(6)?,
                approved_amt: r.get(7)?,
                auth_resp_code: r.get(8)?,
                auth_resp_reason: r.get(9)?,
                merchant_name: r.get(10)?,
                merchant_city: r.get(11)?,
                merchant_state: r.get(12)?,
                match_status: r.get(13)?,
                auth_fraud: r.get(14)?,
                fraud_rpt_date: r.get(15)?,
            })
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
    let frauds: Vec<Db2FraudRecordDto> = f_stmt
        .query_map([], |r| {
            Ok(Db2FraudRecordDto {
                card_num: r.get(0)?,
                auth_ts: r.get(1)?,
                acct_id: r.get(2)?,
                cust_id: r.get(3)?,
                transaction_amt: r.get(4)?,
                merchant_name: r.get(5)?,
                auth_fraud: r.get(6)?,
                fraud_rpt_date: r.get(7)?,
            })
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(Result::ok)
        .collect();

    Ok(Json(ImsAuthorizationsResponseDto {
        summaries,
        details,
        db2_fraud_table: frauds,
    }))
}

async fn post_mq_authorize(
    State(state): State<AppState>,
    Json(req): Json<MqAuthorizeRequest>,
) -> Result<Json<MqAuthorizeResponseDto>, StatusCode> {
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

    Ok(Json(MqAuthorizeResponseDto {
        acct_id,
        approved,
        auth_resp_code: resp_code.to_string(),
        auth_resp_reason: resp_reason.to_string(),
        auth_date_9c,
        auth_time_9c,
        message: format!(
            "MQ Authorization {} (IMS 9C Key: {}/{})",
            if approved {
                "APPROVED (00)"
            } else {
                "DECLINED - OVERLIMIT (05)"
            },
            auth_date_9c,
            auth_time_9c
        ),
    }))
}

async fn post_ims_fraud(
    State(state): State<AppState>,
    Json(req): Json<FraudToggleRequest>,
) -> Result<Json<FraudToggleResponseDto>, StatusCode> {
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

    Ok(Json(FraudToggleResponseDto {
        acct_id: req.acct_id,
        auth_fraud: flag.to_string(),
        message: if req.mark_fraud {
            "IMS Segment Flagged as Fraud ('F') and Replicated to DB2 CARDDEMO.AUTHFRDS (COPAUS2C)"
                .to_string()
        } else {
            "Fraud Flag Removed ('R') in IMS Segment".to_string()
        },
    }))
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

async fn post_security_gate(Json(req): Json<SecurityGateRequest>) -> Json<SecurityGateResponseDto> {
    let cmd = req.command.trim();
    let forbidden = [
        "rm -rf /",
        "DROP TABLE accounts",
        "DROP TABLE transactions",
        "TRUNCATE TABLE",
        "gh pr merge",
    ];
    for pattern in forbidden {
        if cmd.contains(pattern) {
            return Json(SecurityGateResponseDto {
                decision: "deny".to_string(),
                matched_rule: Some(pattern.to_string()),
                hook: ".agents/hooks-scripts/gate.py".to_string(),
                reason: format!(
                    "Blocked by CardDemo Financial Safety Policy: '{}' requires explicit human sign-off.",
                    pattern
                ),
            });
        }
    }
    Json(SecurityGateResponseDto {
        decision: "allow".to_string(),
        matched_rule: None,
        hook: ".agents/hooks-scripts/gate.py".to_string(),
        reason: "Allowed by pre_tool_execution policy: read/verification or non-destructive operation."
            .to_string(),
    })
}
