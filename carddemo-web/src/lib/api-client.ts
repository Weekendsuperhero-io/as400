// ============================================================================
// Typed Client Library consuming auto-generated Rust `#[typeshare]` + `ts-rs`
// DTO contracts (`@/types/api`)
// ============================================================================

import type {
  AccountDetailResponseDto,
  AccountSummary,
  AddTransactionRequest,
  AddTransactionResponseDto,
  BatchParityReport,
  BillPayRequest,
  BillPayResponseDto,
  CardRecordDto,
  DailyRejectDto,
  Db2ActionRequest,
  Db2CatalogResponseDto,
  Db2MutationResponseDto,
  FraudToggleRequest,
  FraudToggleResponseDto,
  ImsAuthorizationsResponseDto,
  MqAuthorizeRequest,
  MqAuthorizeResponseDto,
  OverviewResponseDto,
  SecUserDto,
  SecurityGateRequest,
  SecurityGateResponseDto,
  SqliteWalTelemetryDto,
  TerminalCommandRequest,
  TerminalScreenResponse,
  TransactionReportRequest,
  TransactionReportResponseDto,
  TransactionRowDto,
  UpdateAccountRequest,
  UpdateAccountResponseDto,
  UpdateCardRequest,
  UpdateCardResponseDto,
  UserSecurityActionRequest,
  UserSecurityActionResponseDto,
} from '@/types/api';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on GET ${url}`);
  }
  return (await res.json()) as T;
}

async function sendJson<TReq, TRes>(
  method: 'POST' | 'PUT',
  url: string,
  body?: TReq
): Promise<TRes> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${method} ${url}`);
  }
  return (await res.json()) as TRes;
}

export const cardDemoClient = {
  getOverview: () => getJson<OverviewResponseDto>('/api/overview'),
  getSqliteWal: () => getJson<SqliteWalTelemetryDto>('/api/sqlite/wal'),
  listAccounts: () => getJson<AccountSummary[]>('/api/accounts'),
  getAccountDetail: (acctId: string) =>
    getJson<AccountDetailResponseDto>(`/api/accounts/${encodeURIComponent(acctId)}`),
  updateAccount: (acctId: string, req: UpdateAccountRequest) =>
    sendJson<UpdateAccountRequest, UpdateAccountResponseDto>(
      'PUT',
      `/api/accounts/${encodeURIComponent(acctId)}`,
      req
    ),
  payBill: (acctId: string, req: BillPayRequest = { confirm: 'Y' }) =>
    sendJson<BillPayRequest, BillPayResponseDto>(
      'POST',
      `/api/accounts/${encodeURIComponent(acctId)}/bill-pay`,
      req
    ),
  listCards: () => getJson<CardRecordDto[]>('/api/cards'),
  updateCard: (cardNum: string, req: UpdateCardRequest) =>
    sendJson<UpdateCardRequest, UpdateCardResponseDto>(
      'PUT',
      `/api/cards/${encodeURIComponent(cardNum)}`,
      req
    ),
  listTransactions: () => getJson<TransactionRowDto[]>('/api/transactions'),
  addTransaction: (req: AddTransactionRequest) =>
    sendJson<AddTransactionRequest, AddTransactionResponseDto>('POST', '/api/transactions', req),
  generateTransactionReport: (req: TransactionReportRequest) =>
    sendJson<TransactionReportRequest, TransactionReportResponseDto>(
      'POST',
      '/api/reports/transactions',
      req
    ),
  listUsers: () => getJson<SecUserDto[]>('/api/users'),
  mutateUser: (req: UserSecurityActionRequest) =>
    sendJson<UserSecurityActionRequest, UserSecurityActionResponseDto>('POST', '/api/users', req),
  listRejects: () => getJson<DailyRejectDto[]>('/api/rejects'),
  listDb2TxTypes: () => getJson<Db2CatalogResponseDto>('/api/db2/tx-types'),
  mutateDb2TxTypes: (req: Db2ActionRequest) =>
    sendJson<Db2ActionRequest, Db2MutationResponseDto>('POST', '/api/db2/tx-types', req),
  listImsAuthorizations: () =>
    getJson<ImsAuthorizationsResponseDto>('/api/ims/authorizations'),
  authorizeMq: (req: MqAuthorizeRequest) =>
    sendJson<MqAuthorizeRequest, MqAuthorizeResponseDto>('POST', '/api/mq/authorize', req),
  toggleImsFraud: (req: FraudToggleRequest) =>
    sendJson<FraudToggleRequest, FraudToggleResponseDto>('POST', '/api/ims/fraud', req),
  runNightlyBatch: () =>
    sendJson<undefined, BatchParityReport>('POST', '/api/batch/run-nightly'),
  sendCicsTerminal: (req: TerminalCommandRequest) =>
    sendJson<TerminalCommandRequest, TerminalScreenResponse>('POST', '/api/cics/terminal', req),
  checkSecurityGate: (req: SecurityGateRequest) =>
    sendJson<SecurityGateRequest, SecurityGateResponseDto>(
      'POST',
      '/api/agent/security-gate',
      req
    ),
} as const;
