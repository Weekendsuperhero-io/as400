// ============================================================================
// Typed Client Library consuming auto-generated Rust `#[typeshare]` + `ts-rs`
// DTO contracts (`@/types/api`)
// ============================================================================

import type {
  AccountDetailResponseDto,
  AccountSummary,
  BatchParityReport,
  BillPayRequest,
  BillPayResponseDto,
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
  SqliteWalTelemetryDto,
  TerminalCommandRequest,
  TerminalScreenResponse,
  TransactionRowDto,
  UpdateAccountRequest,
  UpdateAccountResponseDto,
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
  listTransactions: () => getJson<TransactionRowDto[]>('/api/transactions'),
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
} as const;
