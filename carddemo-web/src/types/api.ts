export interface BmsField {
  id: string;
  label: string;
  row: number;
  col: number;
  length: number;
  value: string;
  editable: boolean;
  color: string;
}

export interface TerminalScreenResponse {
  tran_id: string;
  program_name: string;
  mapset_name: string;
  map_name: string;
  title_line_1: string;
  title_line_2: string;
  lines: string[];
  fields: BmsField[];
  status_message: string;
  sqlcode: number | null;
  pf_keys: string;
}

export interface AccountSummary {
  acct_id: string;
  active_status: string;
  initial_bal: string;
  curr_bal: string;
  curr_bal_overpunch: string;
  credit_limit: string;
  cash_credit_limit: string;
  open_date: string;
  expiration_date: string;
  addr_zip: string;
  group_id: string;
  cust_id: string;
  customer_name: string;
  fico_score: number;
  card_num: string;
}

export interface CustomerDetailDto {
  cust_id: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  address: string;
  phone: string;
  ssn: string;
  dob: string;
  fico_score: number;
}

export interface AccountMasterDto {
  acct_id: string;
  active_status: string;
  initial_bal: string;
  curr_bal: string;
  curr_bal_overpunch: string;
  vsam_fixed_width_preview: string;
  credit_limit: string;
  cash_credit_limit: string;
  open_date: string;
  expiration_date: string;
  reissue_date: string;
  curr_cyc_credit: string;
  curr_cyc_debit: string;
  addr_zip: string;
  group_id: string;
  customer: CustomerDetailDto;
  card_num: string;
}

export interface AccountTransactionDto {
  tran_id: string;
  type_cd: string;
  cat_cd: string;
  source: string;
  description: string;
  amt: string;
  merchant_name: string;
  orig_ts: string;
}

export interface CategoryBalanceDto {
  tran_type_cd: string;
  tran_cat_cd: string;
  tran_cat_bal: string;
}

export interface AccountDetailResponseDto {
  account: AccountMasterDto;
  transactions: AccountTransactionDto[];
  category_balances: CategoryBalanceDto[];
}

export interface DailyRejectDto {
  tran_id: string;
  card_num: string;
  acct_id: string;
  amt: string;
  orig_ts: string;
  fail_reason: number;
  fail_desc: string;
}

export interface Db2TransactionTypeDto {
  tr_type: string;
  tr_description: string;
}

export interface Db2TransactionCategoryDto {
  trc_type_code: string;
  trc_type_category: string;
  trc_cat_data: string;
}

export interface Db2CatalogResponseDto {
  sqlcode: number;
  transaction_types: Db2TransactionTypeDto[];
  transaction_categories: Db2TransactionCategoryDto[];
}

export interface Db2MutationResponseDto {
  sqlcode: number;
  message: string;
}

export interface ImsAuthSummaryDto {
  acct_id: string;
  cust_id: string;
  auth_status: string;
  credit_limit: string;
  cash_limit: string;
  credit_balance: string;
  approved_auth_cnt: number;
  declined_auth_cnt: number;
  approved_auth_amt: string;
  declined_auth_amt: string;
}

export interface ImsAuthDetailDto {
  acct_id: string;
  auth_date_9c: number;
  auth_time_9c: number;
  auth_orig_date: string;
  auth_orig_time: string;
  card_num: string;
  transaction_amt: string;
  approved_amt: string;
  auth_resp_code: string;
  auth_resp_reason: string;
  merchant_name: string;
  merchant_city: string;
  merchant_state: string;
  match_status: string;
  auth_fraud: string;
  fraud_rpt_date: string;
}

export interface Db2FraudRecordDto {
  card_num: string;
  auth_ts: string;
  acct_id: string;
  cust_id: string;
  transaction_amt: string;
  merchant_name: string;
  auth_fraud: string;
  fraud_rpt_date: string;
}

export interface ImsAuthorizationsResponseDto {
  summaries: ImsAuthSummaryDto[];
  details: ImsAuthDetailDto[];
  db2_fraud_table: Db2FraudRecordDto[];
}

export interface BillPayResponseDto {
  acct_id: string;
  previous_balance: string;
  new_balance: string;
  tran_id: string | null;
  message: string;
  execution_ms: number;
  legacy_green_screen_seconds: number;
}

export interface UpdateAccountResponseDto {
  acct_id: string;
  credit_limit: string;
  active_status: string;
  message: string;
}

export interface MqAuthorizeResponseDto {
  acct_id: string;
  approved: boolean;
  auth_resp_code: string;
  auth_resp_reason: string;
  auth_date_9c: number;
  auth_time_9c: number;
  message: string;
}

export interface FraudToggleResponseDto {
  acct_id: string;
  auth_fraud: string;
  message: string;
}

export interface AccountParityDiff {
  acct_id: string;
  initial_bal: string;
  post_tran_bal_rust: string;
  post_tran_bal_golden: string;
  interest_charged_rust: string;
  interest_charged_golden: string;
  final_bal_rust: string;
  final_bal_golden: string;
  overpunch_rust: string;
  overpunch_golden: string;
  cent_drift: string;
  parity_match: boolean;
}

export interface JclStepMetrics {
  step_name: string;
  program: string;
  jcl_file: string;
  return_code: number;
  records_in: number;
  records_out: number;
  duration_ms: number;
  status: string;
}

export interface BatchParityReport {
  job_name: string;
  executed_at: string;
  rust_execution_ms: number;
  legacy_baseline_ms: number;
  python_reference_ms: number;
  speedup_vs_legacy: number;
  accounts_verified: number;
  accounts_matched: number;
  parity_pct: number;
  max_cent_drift: string;
  total_initial_balance: string;
  total_post_tran_balance: string;
  total_interest_charged: string;
  total_final_balance: string;
  daily_tx_processed: number;
  daily_tx_posted: number;
  daily_tx_rejected: number;
  interest_tx_generated: number;
  jcl_steps: JclStepMetrics[];
  account_diffs: AccountParityDiff[];
}

export interface OverviewResponseDto {
  status: string;
  engine: string;
  managed_agent: {
    agent: string;
    model: string;
    context_window: string;
    files_ingested: number;
    artifact_families: number;
  };
  counts: {
    transactions_in_db: number;
    db2_transaction_types: number;
    db2_transaction_categories: number;
    ims_pending_authorizations: number;
    db2_fraud_alerts: number;
  };
  latest_parity_report: BatchParityReport;
}
