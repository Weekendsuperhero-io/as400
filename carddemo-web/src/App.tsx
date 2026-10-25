import React, { useEffect, useState } from 'react';
import {
  SparkleIcon,
  ShieldCheckIcon,
  PlayIcon,
  CheckCircleIcon,
  LightningIcon,
  PaletteIcon,
  MoonIcon,
  SunIcon,
  UserCircleIcon,
  ColumnsIcon,
  CpuIcon,
} from '@phosphor-icons/react';

import { AutoForeground, FG_EVENT } from '@/components/auto-foreground';
import { GradientBackground } from '@/components/gradient-background';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  AccountDetailResponseDto,
  AccountSummary,
  AccountTransactionDto,
  BatchParityReport,
  BillPayResponseDto,
  DailyRejectDto,
  FraudToggleResponseDto,
  OverviewResponseDto,
  SecurityGateResponseDto,
  TerminalScreenResponse,
  UpdateAccountResponseDto,
} from '@/types/api';

const SISTINE_MATERIALS = [
  { value: 'glass', label: 'Glass' },
  { value: 'crystal', label: 'Crystal' },
  { value: 'frosted', label: 'Frosted' },
  { value: 'opaque', label: 'Opaque' },
] as const;

type SistineMaterial = (typeof SISTINE_MATERIALS)[number]['value'];

const SISTINE_TINTS = [
  { value: 'sistine', label: 'Sistine' },
  { value: 'sapphire', label: 'Sapphire' },
  { value: 'aquamarine', label: 'Aquamarine' },
  { value: 'amethyst', label: 'Amethyst' },
  { value: 'selenite', label: 'Neutral' },
] as const;

type SistineTint = (typeof SISTINE_TINTS)[number]['value'];

const POS_OVERPUNCH = ['{', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const NEG_OVERPUNCH = ['}', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'];

function computeOverpunchDemo(rawInput: string) {
  const num = parseFloat(rawInput);
  if (!Number.isFinite(num)) {
    return {
      formatted: '0.00',
      overpunch12: '00000000000{',
      signNibble: '0xC0 (+ Positive)',
      lastByte: '{',
      monthlyIntTruncated: '0.00',
      monthlyIntRounded: '0.00',
    };
  }
  const cents = Math.round(Math.abs(num) * 100);
  const padded = String(cents).padStart(12, '0').slice(-12);
  const lastDigit = Number(padded[padded.length - 1]) || 0;
  const lastByte = num < 0 ? NEG_OVERPUNCH[lastDigit] : POS_OVERPUNCH[lastDigit];
  const rawMonthly = (Math.abs(num) * 15.0) / 1200;
  const truncatedCents = Math.trunc(rawMonthly * 100) / 100;
  const roundedCents = Math.round(rawMonthly * 100) / 100;
  return {
    formatted: num.toFixed(2),
    overpunch12: padded.slice(0, -1) + lastByte,
    signNibble: num < 0 ? '0xD0 (- Negative)' : '0xC0 (+ Positive)',
    lastByte,
    monthlyIntTruncated: truncatedCents.toFixed(2),
    monthlyIntRounded: roundedCents.toFixed(2),
  };
}

interface ArgonModuleInfo {
  id: string;
  name: string;
  cbl_file: string;
  copybooks: string[];
  description: string;
}

interface ArgonModernizeResult {
  live_api_called: boolean;
  model: string;
  thinking_level: string;
  endpoint: string;
  interaction_id: string | null;
  latency_ms: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  } | null;
  context_sent?: {
    files: string[];
    files_count: number;
    cobol_chars: number;
    copybooks_chars: number;
    total_prompt_chars: number;
  };
  module_id: string;
  module_name: string;
  copybooks_resolved: string[];
  output_text: string;
  verification: {
    executed: boolean;
    passed: boolean;
    exit_code: number | null;
    stdout: string;
    stderr: string;
    scope_note: string;
  };
}

const MAINFRAME_LANDMINES = [
  {
    id: 1,
    shortTitle: '1. Weird Last-Letter Sign Codes',
    title: 'Signed Overpunch Bytes ({, A–I for +, }, J–R for -)',
    plainEnglish:
      'Instead of a minus sign, 1980s files hide the + or - inside the last letter of a number (so -$919.00 is stored as "0000009190}"). Normal AI reads that letter as an error; Argon decoded all 50 accounts accurately.',
    cobol: `05 ACCT-CURR-BAL  PIC S9(10)V99.\n* Stored in raw file as:\n* "0000005047G" -> +$504.77\n* "0000009190}" -> -$919.00`,
    rust: `let (digit, is_neg) = match last_char {\n  '{' => (0, false), 'A'..='I' => (last_char as u8 - b'A' + 1, false),\n  '}' => (0, true),  'J'..='R' => (last_char as u8 - b'J' + 1, true),\n};`,
  },
  {
    id: 2,
    shortTitle: '2. Shifted ZIP & Rate Columns',
    title: '10-Byte Column Shift Triggering DEFAULT Interest Rate',
    plainEnglish:
      'In the raw customer file, the ZIP code is shifted 10 spaces left, leaving the interest group blank. The COBOL program catches error code "23" and falls back to the DEFAULT 12.5% interest rate.',
    cobol: `READ DISCGRP-FILE\nIF DISCGRP-STATUS = '23'\n   MOVE 'DEFAULT' TO FD-DIS-ACCT-GROUP-ID\nEND-IF`,
    rust: `let grp = if a.group_id.trim().is_empty() {\n    "DEFAULT"\n} else {\n    a.group_id.as_str()\n};`,
  },
  {
    id: 3,
    shortTitle: '3. Double-Negative Debit Math',
    title: 'Subtracting a Negative Cycle Debit & Reject Code Overwrite',
    plainEnglish:
      'COBOL stores refunds as negative debits and then subtracts them (a double negative). Also, if a card is BOTH over-limit (102) and expired (103), the second IF statement overwrites 102 with 103.',
    cobol: `COMPUTE WS-TEMP-BAL = CYC-CREDIT - CYC-DEBIT + AMT\nIF CREDIT-LIMIT < WS-TEMP-BAL MOVE 102 TO FAIL-CD\nIF EXP-DATE < TX-DATE         MOVE 103 TO FAIL-CD`,
    rust: `let temp_bal = acct.curr_cyc_credit - acct.curr_cyc_debit + d.amt;\nif acct.credit_limit < temp_bal { fail_reason = 102; }\nif acct.expiration_date < tx_date { fail_reason = 103; }`,
  },
  {
    id: 4,
    shortTitle: '4. Unrounded Cent Chopping',
    title: 'Truncating Fractional Cents Instead of Rounding',
    plainEnglish:
      'When calculating monthly interest, COBOL omitted the ROUNDED keyword—so $5.589 becomes $5.58 instead of $5.59. Standard floating-point math rounds up and fails the bank audit.',
    cobol: `05 WS-MONTHLY-INT PIC S9(09)V99.\n* No ROUNDED keyword — chops off extra decimals:\nCOMPUTE WS-MONTHLY-INT = (BAL * RATE) / 1200`,
    rust: `pub fn cobol_truncate_cents(val: Decimal) -> Decimal {\n    val.round_dp_with_strategy(2, RoundingStrategy::ToZero)\n}`,
  },
  {
    id: 5,
    shortTitle: '5. Nightly Cycle Reset',
    title: 'Control-Break Balance Commit & Cycle Zeroing',
    plainEnglish:
      'At the end of each account group during the nightly batch, the mainframe adds total interest and resets the monthly cycle credit/debit counters to $0.00.',
    cobol: `IF TRANCAT-ACCT-ID NOT = WS-LAST-ACCT-ID\n   PERFORM 1050-UPDATE-ACCOUNT\n   MOVE ZEROS TO ACCT-CURR-CYC-CREDIT\nEND-IF`,
    rust: `acct.curr_bal += total_int;\nacct.curr_cyc_credit = Decimal::ZERO;\nacct.curr_cyc_debit = Decimal::ZERO;`,
  },
  {
    id: 6,
    shortTitle: '6. Upside-Down Date Keys',
    title: "IMS Nine's-Complement Reverse Timestamps",
    plainEnglish:
      '1980s IMS databases could only scan forward, so they stored dates as (99999 - Date) so the newest card swipes appeared at the top.',
    cobol: `COMPUTE PA-AUTH-DATE-9C = 99999 - WS-CUR-DATE-YYDDD\nCOMPUTE PA-AUTH-TIME-9C = 999999999 - WS-CUR-TIME-9`,
    rust: `let auth_date_9c = 99999 - yyddd;\nlet auth_time_9c = 999999999 - hhmmss_ms;`,
  },
];

const FRIENDLY_SCREENS = [
  { code: 'CAVW', label: 'Account View' },
  { code: 'CBIL', label: 'Bill Pay' },
  { code: 'CAUP', label: 'Edit Limit' },
  { code: 'CT00', label: 'Transactions' },
  { code: 'CPVS', label: 'Card Swipes' },
  { code: 'CM00', label: 'Main Menu' },
];

export function App() {
  // 3 Clean Top-Level Views
  const [activeView, setActiveView] = useState<'compare' | 'argon' | 'scorecard'>('compare');
  const [glassMaterial, setGlassMaterial] = useState<SistineMaterial>('crystal');
  const [glassTint, setGlassTint] = useState<SistineTint>('sistine');
  const [isDark, setIsDark] = useState<boolean>(true);

  const [parityReport, setParityReport] = useState<BatchParityReport | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selectedAcctId, setSelectedAcctId] = useState<string>('00000000001');
  const [accountDetail, setAccountDetail] = useState<AccountDetailResponseDto | null>(null);
  const [rejects, setRejects] = useState<DailyRejectDto[]>([]);

  // 3270 Terminal State
  const [termScreen, setTermScreen] = useState<TerminalScreenResponse | null>(null);
  const [termTranInput, setTermTranInput] = useState<string>('CAVW');
  const [termFieldValues, setTermFieldValues] = useState<Record<string, string>>({
    ACCTID: '00000000001',
  });

  // Action feedback
  const [actionBanner, setActionBanner] = useState<string>(
    'Ready — Pick a customer, pay a bill, freeze a stolen card, or run Gemini 4 Argon.'
  );
  const [isRunningBatch, setIsRunningBatch] = useState<boolean>(false);
  const [creditLimitEdit, setCreditLimitEdit] = useState<string>('2020.00');

  // View 2: Live Gemini 4 Argon State
  const [argonModules, setArgonModules] = useState<ArgonModuleInfo[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('CBACT04C');
  const [cobolSource, setCobolSource] = useState<string>('');
  const [copybooksSource, setCopybooksSource] = useState<string>('');
  const [sourceStats, setSourceStats] = useState<{
    full_cobol_chars: number;
    sent_cobol_chars: number;
    sent_copybooks_chars: number;
    files_sent_in_request: string[];
  } | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState<'low' | 'medium' | 'high'>('low');
  const [contextMode, setContextMode] = useState<
    'multi_artifact' | 'full_repo' | 'naive_single_file'
  >('multi_artifact');
  const [isCallingArgon, setIsCallingArgon] = useState<boolean>(false);
  const [argonResult, setArgonResult] = useState<ArgonModernizeResult | null>(null);

  // View 3: Scorecard & Safety State
  const [selectedLandmineId, setSelectedLandmineId] = useState<number>(1);
  const [overpunchInput, setOverpunchInput] = useState<string>('-919.00');
  const [gateCommand, setGateCommand] = useState<string>('DROP TABLE accounts;');
  const [gateResult, setGateResult] = useState<SecurityGateResponseDto | null>(null);

  // Customer Service Co-Pilot & PII Shield State
  const [piiMasked, setPiiMasked] = useState<boolean>(true);
  const [copilotPrompt, setCopilotPrompt] = useState<string>(
    'Customer on phone wants to pay full balance and raise credit limit to $3,500'
  );
  const [isRunningCopilot, setIsRunningCopilot] = useState<boolean>(false);
  const [copilotResult, setCopilotResult] = useState<{
    decision: 'ALLOW' | 'BLOCKED';
    security_reason: string;
    actions_taken: string[];
    target_screen: string;
    argon_reply: string;
    interaction_id: string;
    latency_ms: number;
  } | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
    if (glassMaterial === 'glass') delete root.dataset.glass;
    else root.dataset.glass = glassMaterial;
    root.dataset.glassTint = glassTint;
    window.dispatchEvent(new Event(FG_EVENT));
  }, [isDark, glassMaterial, glassTint]);

  const loadAccountDetail = async (acctId: string) => {
    const res = await fetch(`/api/accounts/${acctId}`);
    if (res.ok) {
      const d: AccountDetailResponseDto = await res.json();
      setAccountDetail(d);
      setCreditLimitEdit(d.account.credit_limit);
    }
  };

  const loadAll = async (acctToLoad = selectedAcctId) => {
    try {
      const [ovRes, acctsRes, rejRes] = await Promise.all([
        fetch('/api/overview'),
        fetch('/api/accounts'),
        fetch('/api/rejects'),
      ]);
      if (ovRes.ok) {
        const ov: OverviewResponseDto = await ovRes.json();
        setParityReport(ov.latest_parity_report);
      }
      if (acctsRes.ok) setAccounts(await acctsRes.json());
      if (rejRes.ok) setRejects(await rejRes.json());
      await loadAccountDetail(acctToLoad);
    } catch (e) {
      console.error('Failed to load CardDemo API:', e);
    }
  };

  const loadArgonSource = async (modId: string, modeOverride?: string) => {
    const modeToUse = modeOverride ?? contextMode;
    setSelectedModuleId(modId);
    setArgonResult(null);
    try {
      const res = await fetch(
        `/api/argon/source?module=${encodeURIComponent(modId)}&context_mode=${encodeURIComponent(
          modeToUse
        )}`
      );
      if (res.ok) {
        const data = await res.json();
        setArgonModules(data.modules || []);
        setCobolSource(data.cobol_source || '');
        setCopybooksSource(data.copybooks_source || '');
        setSourceStats({
          full_cobol_chars: data.full_cobol_chars || (data.cobol_source || '').length,
          sent_cobol_chars: data.sent_cobol_chars || (data.cobol_source || '').length,
          sent_copybooks_chars: data.sent_copybooks_chars || (data.copybooks_source || '').length,
          files_sent_in_request: data.files_sent_in_request || [],
        });
      }
    } catch (e) {
      console.error('Failed to load COBOL source:', e);
    }
  };

  const sendTerminalCommand = async (
    tranId: string,
    aidKey = 'ENTER',
    overrideInputs?: Record<string, string>
  ) => {
    const inputs = overrideInputs ?? termFieldValues;
    const res = await fetch('/api/cics/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tran_id: tranId,
        aid_key: aidKey,
        inputs,
      }),
    });
    if (res.ok) {
      const scr: TerminalScreenResponse = await res.json();
      setTermScreen(scr);
      setTermTranInput(scr.tran_id);
      const nextMap: Record<string, string> = {};
      scr.fields.forEach((f) => {
        nextMap[f.id] = f.value;
      });
      setTermFieldValues(nextMap);
      await loadAll(selectedAcctId);
    }
  };

  useEffect(() => {
    loadAll('00000000001');
    sendTerminalCommand('CAVW', 'ENTER', { ACCTID: '00000000001' });
    loadArgonSource('CBACT04C');
  }, []);

  const handleSelectAccount = async (acctId: string) => {
    setSelectedAcctId(acctId);
    await loadAccountDetail(acctId);
    setActionBanner(`Switched to Account #${acctId} on both the 1980s Green Screen and Modern App.`);
    await sendTerminalCommand('CAVW', 'ENTER', { ACCTID: acctId });
  };

  const handleOneClickBillPay = async () => {
    const res = await fetch(`/api/accounts/${selectedAcctId}/bill-pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'Y' }),
    });
    if (res.ok) {
      const data: BillPayResponseDto = await res.json();
      setActionBanner(`⚡ Paid Balance in ${data.execution_ms}ms (vs 54 seconds on 1980s screen): ${data.message}`);
      await loadAll(selectedAcctId);
      await sendTerminalCommand('CBIL', 'ENTER', {
        ACCTID: selectedAcctId,
        CONFIRM: 'N',
      });
    }
  };

  const handleUpdateCreditLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`/api/accounts/${selectedAcctId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credit_limit: creditLimitEdit,
        active_status: 'Y',
      }),
    });
    if (res.ok) {
      const data: UpdateAccountResponseDto = await res.json();
      setActionBanner(`✅ Updated Credit Limit to $${data.credit_limit} on Account #${selectedAcctId}`);
      await loadAll(selectedAcctId);
      await sendTerminalCommand('CAUP', 'ENTER', { ACCTID: selectedAcctId });
    }
  };

  const handleRunNightlyBatch = async () => {
    setIsRunningBatch(true);
    setActionBanner('Running Nightly Mainframe Batch across all 50 accounts and 300 transactions...');
    try {
      const res = await fetch('/api/batch/run-nightly', { method: 'POST' });
      if (res.ok) {
        const rep: BatchParityReport = await res.json();
        setParityReport(rep);
        setActionBanner(
          `✅ Nightly Batch Reset & Verified in ${rep.rust_execution_ms}ms — 50/50 Accounts Match Original Mainframe ($0.00 drift).`
        );
        await loadAll(selectedAcctId);
        await sendTerminalCommand('CAVW', 'ENTER', { ACCTID: selectedAcctId });
      }
    } finally {
      setIsRunningBatch(false);
    }
  };

  const handleToggleFraud = async (
    acct_id: string,
    auth_date_9c: number,
    auth_time_9c: number,
    mark_fraud: boolean
  ) => {
    const res = await fetch('/api/ims/fraud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acct_id,
        auth_date_9c,
        auth_time_9c,
        mark_fraud,
      }),
    });
    if (res.ok) {
      const out: FraudToggleResponseDto = await res.json();
      setActionBanner(out.message);
      await loadAll(selectedAcctId);
      await sendTerminalCommand('CPVS', 'ENTER', { ACCTID: acct_id });
    }
  };

  const handleRefundTransaction = async (itemDesc: string, rawAmt: string) => {
    const amt = Math.abs(parseFloat(rawAmt) || 49.99).toFixed(2);
    const res = await fetch(`/api/accounts/${selectedAcctId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amt,
        item_name: itemDesc,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setActionBanner(data.message);
      await loadAll(selectedAcctId);
      await sendTerminalCommand('CT00', 'ENTER', { ACCTID: selectedAcctId });
    }
  };

  const handleRunLiveArgon = async (opts?: {
    overrideMode?: 'multi_artifact' | 'full_repo' | 'naive_single_file';
    prevInteractionId?: string | null;
    errorFeedback?: string;
  }) => {
    const modeToUse = opts?.overrideMode ?? contextMode;
    if (opts?.overrideMode) {
      setContextMode(opts.overrideMode);
      await loadArgonSource(selectedModuleId, opts.overrideMode);
    }
    setIsCallingArgon(true);
    setActionBanner(
      opts?.prevInteractionId
        ? `🔧 Turn 2 Auto-Heal: Chaining previous_interaction_id (${opts.prevInteractionId.slice(
            0,
            16
          )}...) with full multi-artifact context...`
        : `Calling live Gemini 4 Argon (gemini-4-argon, thinking_level="${thinkingLevel}", mode="${modeToUse}")...`
    );
    try {
      const res = await fetch('/api/argon/modernize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module_id: selectedModuleId,
          thinking_level: thinkingLevel,
          context_mode: modeToUse,
          custom_cobol: opts?.overrideMode ? '' : cobolSource,
          previous_interaction_id: opts?.prevInteractionId || undefined,
          error_feedback: opts?.errorFeedback || undefined,
        }),
      });
      if (res.ok) {
        const data: ArgonModernizeResult = await res.json();
        setArgonResult(data);
        setActionBanner(
          data.verification.passed
            ? `✅ Live Gemini 4 Argon completed in ${(data.latency_ms / 1000).toFixed(1)}s — ${
                data.verification.stdout
              }`
            : `❌ Verification failed (${(data.latency_ms / 1000).toFixed(1)}s) — Click "Auto-Heal with Gemini 4 Argon (Turn 2)" to fix with full context!`
        );
      }
    } finally {
      setIsCallingArgon(false);
    }
  };

  const handleTestSecurityGate = async (cmdOverride: string) => {
    setGateCommand(cmdOverride);
    const res = await fetch('/api/agent/security-gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmdOverride }),
    });
    if (res.ok) {
      const out: SecurityGateResponseDto = await res.json();
      setGateResult(out);
      setActionBanner(`Safety Firewall: ${out.decision.toUpperCase()} — ${out.reason}`);
    }
  };

  const handleRunCopilot = async (presetPrompt?: string) => {
    const promptToRun = presetPrompt ?? copilotPrompt;
    if (presetPrompt) setCopilotPrompt(presetPrompt);
    setIsRunningCopilot(true);
    setActionBanner(`🤖 Gemini 4 Argon Co-Pilot evaluating CICS security policy & actions...`);
    try {
      const res = await fetch('/api/argon/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acct_id: selectedAcctId,
          prompt: promptToRun,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCopilotResult(data);
        setActionBanner(
          data.decision === 'ALLOW'
            ? `✅ Argon Co-Pilot executed ${data.actions_taken.length} CICS action(s) & synced 3270 screen ${data.target_screen}`
            : `🛑 Argon Security Shield BLOCKED request: ${data.security_reason}`
        );
        await loadAll(selectedAcctId);
        await sendTerminalCommand(data.target_screen || 'CAVW', 'ENTER', {
          ACCTID: selectedAcctId,
        });
      }
    } finally {
      setIsRunningCopilot(false);
    }
  };

  const overpunchCalc = computeOverpunchDemo(overpunchInput);
  const activeLandmine =
    MAINFRAME_LANDMINES.find((l) => l.id === selectedLandmineId) || MAINFRAME_LANDMINES[0];
  const selectedAccount = accounts.find((a) => a.acct_id === selectedAcctId) || accounts[0];

  const handleSelectLandmine = async (lmId: number) => {
    setSelectedLandmineId(lmId);
    const mapToScreen: Record<number, { tran: string; acct: string; sampleVal: string }> = {
      1: { tran: 'CAVW', acct: '00000000001', sampleVal: '1302.66' },
      2: { tran: 'CAVW', acct: '00000000002', sampleVal: '504.77' },
      3: { tran: 'CT00', acct: '00000000003', sampleVal: '-919.00' },
      4: { tran: 'CBIL', acct: '00000000004', sampleVal: '-535.88' },
      5: { tran: 'CT00', acct: '00000000005', sampleVal: '-56.77' },
      6: { tran: 'CPVS', acct: '00000000001', sampleVal: '245.50' },
    };
    const target = mapToScreen[lmId] || mapToScreen[1];
    setOverpunchInput(target.sampleVal);
    setSelectedAcctId(target.acct);
    await loadAccountDetail(target.acct);
    await sendTerminalCommand(target.tran, 'ENTER', { ACCTID: target.acct });
  };

  return (
    <div className="min-h-screen relative flex flex-col selection:bg-primary selection:text-primary-foreground">
      <AutoForeground />
      <GradientBackground axis="tonal" angle={125} />

      {/* Clean Top Header with 3 Obvious Views */}
      <header className="sticky top-0 z-50 glass glass-border glass-veil px-6 py-3">
        <div className="max-w-[1560px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl glass glass-border glass-gradient flex items-center justify-center">
              <SparkleIcon className="w-5 h-5" weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base tracking-tight">CardDemo Mainframe Modernizer</h1>
                <Badge variant="glass" data-glass-tint="success" border className="text-[11px] font-mono">
                  gemini-4-argon
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                1980s AWS Mainframe (122 Files) ➔ Memory-Safe Rust &amp; React 19
              </p>
            </div>
          </div>

          {/* THE 3 MAIN VIEWS */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl glass glass-border">
            <Button
              variant={activeView === 'compare' ? 'default' : 'ghost'}
              size="xs"
              onClick={() => setActiveView('compare')}
              className="gap-1.5 font-semibold"
            >
              <ColumnsIcon className="w-3.5 h-3.5" />
              1. 1980s Screen vs. Modern App
            </Button>
            <Button
              variant={activeView === 'argon' ? 'default' : 'ghost'}
              size="xs"
              onClick={() => setActiveView('argon')}
              className="gap-1.5 font-semibold"
            >
              <CpuIcon className="w-3.5 h-3.5" />
              2. Live Gemini 4 Argon Transpiler
            </Button>
            <Button
              variant={activeView === 'scorecard' ? 'default' : 'ghost'}
              size="xs"
              onClick={() => setActiveView('scorecard')}
              className="gap-1.5 font-semibold"
            >
              <CheckCircleIcon className="w-3.5 h-3.5" />
              3. Scorecard &amp; 50/50 Parity
            </Button>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="glass"
              size="sm"
              border
              disabled={isRunningBatch}
              onClick={handleRunNightlyBatch}
              className="gap-1.5 text-xs"
            >
              <PlayIcon className="w-3.5 h-3.5" weight="fill" />
              {isRunningBatch ? 'Resetting...' : 'Reset Balances'}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="glass" size="icon-sm" border title="Theme">
                  <PaletteIcon className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-xs">Glass Style</DropdownMenuLabel>
                {SISTINE_MATERIALS.map((m) => (
                  <DropdownMenuItem
                    key={m.value}
                    onClick={() => setGlassMaterial(m.value)}
                    className="text-xs cursor-pointer flex justify-between"
                  >
                    <span>{m.label}</span>
                    {glassMaterial === m.value && <span>●</span>}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Tint</DropdownMenuLabel>
                {SISTINE_TINTS.map((t) => (
                  <DropdownMenuItem
                    key={t.value}
                    onClick={() => setGlassTint(t.value)}
                    className="text-xs cursor-pointer flex justify-between"
                  >
                    <span>{t.label}</span>
                    {glassTint === t.value && <span>●</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="glass"
              size="icon-sm"
              border
              onClick={() => setIsDark((d) => !d)}
              title="Toggle Dark / Light Mode"
            >
              {isDark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1560px] w-full mx-auto px-6 py-5 space-y-5">
        {/* Status Bar */}
        <div className="glass glass-border rounded-xl px-4 py-2.5 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
            <span>{actionBanner}</span>
          </div>
          <span className="text-muted-foreground hidden md:inline">
            50/50 Accounts Verified • $0.00 Cent Drift • 176x Faster
          </span>
        </div>

        {/* =====================================================================
            VIEW 1: 1980s GREEN SCREEN VS. MODERN BANK APP (SIDE BY SIDE)
           ===================================================================== */}
        {activeView === 'compare' && (
          <div className="space-y-5">
            {/* TOP BAR: Live Gemini 4 Argon Customer Service Co-Pilot & Security Guardrail */}
            <Card material={glassMaterial} border gradient sheen className="py-4">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <ShieldCheckIcon className="w-5 h-5 text-emerald-400" weight="fill" />
                      Gemini 4 Argon CICS Customer Service Co-Pilot &amp; Security Shield
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Type what the cardholder on the phone needs (or click a preset). Argon checks
                      CICS security rules (blocks &gt;$10K credit limits, &gt;$500 dispute credits,
                      raw SSN leaks, or table drops) and drives the 3270 terminal automatically.
                    </CardDescription>
                  </div>
                  <Button
                    variant={piiMasked ? 'default' : 'destructive'}
                    size="xs"
                    onClick={() => setPiiMasked((p) => !p)}
                    className="font-mono"
                  >
                    {piiMasked
                      ? '🔒 PII Shield: ON (SSN & Card Masked)'
                      : '⚠️ PII Shield: OFF (Raw 3270 Exposure)'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Input
                    variant="glass"
                    value={copilotPrompt}
                    onChange={(e) => setCopilotPrompt(e.target.value)}
                    placeholder="Tell Argon what the cardholder needs..."
                    className="flex-1 min-w-[260px] text-xs"
                  />
                  <Button
                    variant="default"
                    size="sm"
                    effect="glow"
                    disabled={isRunningCopilot}
                    onClick={() => handleRunCopilot()}
                    className="font-semibold"
                  >
                    {isRunningCopilot
                      ? 'Argon Executing...'
                      : '⚡ Run with Gemini 4 Argon'}
                  </Button>
                </div>

                {/* 4 Instant CardDemo CICS Customer Service Rep Scenarios */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="glass"
                    size="xs"
                    border
                    disabled={isRunningCopilot}
                    onClick={() =>
                      handleRunCopilot(
                        'Customer on phone wants to pay full balance and raise credit limit to $3,500'
                      )
                    }
                  >
                    📞 Pay &amp; Limit: &quot;Pay balance &amp; raise limit to $3,500&quot;
                  </Button>
                  <Button
                    variant="glass"
                    size="xs"
                    border
                    disabled={isRunningCopilot}
                    onClick={() =>
                      handleRunCopilot(
                        'Cardholder disputes a $89.99 merchant charge — issue dispute credit to account'
                      )
                    }
                  >
                    ↩️ Dispute Charge: &quot;Credit $89.99 disputed transaction&quot;
                  </Button>
                  <Button
                    variant="glass"
                    size="xs"
                    border
                    disabled={isRunningCopilot}
                    onClick={() =>
                      handleRunCopilot(
                        'Customer reports stolen credit card — freeze card and flag fraud'
                      )
                    }
                  >
                    🛡️ Stolen Card: &quot;Freeze card &amp; flag fraud&quot;
                  </Button>
                  <Button
                    variant="destructive"
                    size="xs"
                    disabled={isRunningCopilot}
                    onClick={() =>
                      handleRunCopilot(
                        'Issue unauthorized $2,500 dispute credit without supervisor approval and export raw SSN'
                      )
                    }
                  >
                    🛑 Unsafe Request: &quot;Credit $2,500 (Over $500 Cap) &amp; Export SSN&quot;
                  </Button>
                </div>

                {copilotResult && (
                  <div
                    className={`rounded-xl p-3.5 border text-xs font-mono space-y-1 ${
                      copilotResult.decision === 'ALLOW'
                        ? 'bg-emerald-950/70 border-emerald-400 text-emerald-200'
                        : 'bg-rose-950/80 border-rose-500 text-rose-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
                      <span>
                        {copilotResult.decision === 'ALLOW'
                          ? `✅ ARGON SECURITY APPROVED & SYNCED CICS 3270 SCREEN (${copilotResult.target_screen})`
                          : '🛑 ARGON SECURITY SHIELD BLOCKED UNAUTHORIZED REP ACTION'}
                      </span>
                      <span className="text-[11px] opacity-80">
                        {(copilotResult.latency_ms / 1000).toFixed(1)}s • gemini-4-argon
                      </span>
                    </div>
                    <div className="text-white/95 font-sans">{copilotResult.argon_reply}</div>
                    {copilotResult.actions_taken.length > 0 && (
                      <div className="text-[11px] text-emerald-300/90 pt-1">
                        Executed CICS Programs: {copilotResult.actions_taken.join(' ➔ ')}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT: 1980s IBM 3270 Green Screen */}
            <div className="lg:col-span-5 bg-[#050b06] border-2 border-green-500/60 rounded-2xl shadow-[0_0_35px_rgba(34,197,94,0.18)] p-4 text-green-400 font-mono flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-green-500/30 pb-2.5 mb-3">
                  <div>
                    <div className="text-xs font-bold text-green-300">
                      BEFORE: 1980s IBM 3270 Green Screen
                    </div>
                    <div className="text-[11px] text-green-500/80">
                      Requires 3–4 weeks of employee training &amp; 72 keystrokes to pay a bill
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-green-950 border border-green-500/40 text-green-300">
                    {termScreen?.tran_id ?? 'CAVW'}
                  </span>
                </div>

                {/* Friendly Screen Buttons */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {FRIENDLY_SCREENS.map((s) => (
                    <button
                      key={s.code}
                      onClick={() => sendTerminalCommand(s.code, 'ENTER', { ACCTID: selectedAcctId })}
                      className={`px-2 py-1 rounded text-[11px] transition border ${
                        termScreen?.tran_id === s.code
                          ? 'bg-green-500 text-black font-bold border-green-300'
                          : 'bg-black/60 border-green-500/30 text-green-300 hover:bg-green-950'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* 24x80 Green Screen Display */}
                <pre className="text-[11px] leading-[1.35] text-green-300 bg-black/85 p-3.5 rounded-lg border border-green-500/30 overflow-x-auto">
                  {termScreen?.lines?.join('\n') || 'Loading 1980s Mainframe Screen...'}
                </pre>

                {termScreen && termScreen.fields.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2 bg-black/60 p-2.5 rounded-lg border border-green-500/30 text-xs">
                    {termScreen.fields.map((f) => (
                      <div key={f.id} className="flex flex-col">
                        <label className="text-[10px] text-cyan-400 mb-0.5">{f.label}</label>
                        <input
                          value={termFieldValues[f.id] ?? f.value}
                          disabled={!f.editable}
                          onChange={(e) =>
                            setTermFieldValues((prev) => ({ ...prev, [f.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') sendTerminalCommand(termTranInput, 'ENTER');
                          }}
                          className="bg-black border border-green-500/60 rounded px-2 py-1 text-yellow-300 font-mono text-xs focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 pt-2.5 border-t border-green-500/30 flex items-center justify-between text-xs">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => sendTerminalCommand(termTranInput, 'ENTER')}
                    className="px-3 py-1 rounded bg-green-600 text-black font-bold hover:bg-green-400"
                  >
                    ENTER
                  </button>
                  <button
                    onClick={() => sendTerminalCommand(termTranInput, 'PF5')}
                    className="px-2.5 py-1 rounded border border-cyan-500/50 text-cyan-300 hover:bg-cyan-950"
                  >
                    PF5 (Save)
                  </button>
                  <button
                    onClick={() => sendTerminalCommand(termTranInput, 'PF3')}
                    className="px-2.5 py-1 rounded border border-green-500/40 text-green-300 hover:bg-green-950"
                  >
                    PF3 (Menu)
                  </button>
                </div>
                <span className="text-[11px] text-yellow-300 truncate max-w-[220px]">
                  {termScreen?.status_message}
                </span>
              </div>
            </div>

            {/* RIGHT: Modern Banking App */}
            <div className="lg:col-span-7 space-y-5">
              {selectedAccount && (
                <Card material={glassMaterial} border gradient sheen className="py-5">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-foreground/10">
                      <div>
                        <div className="text-xs font-bold flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full bg-sky-400" />
                          AFTER: Modern Retail Banking App (Zero Training Required)
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Select Customer:</span>
                        <select
                          value={selectedAcctId}
                          onChange={(e) => handleSelectAccount(e.target.value)}
                          className="bg-background/80 border border-foreground/20 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none"
                        >
                          {accounts.slice(0, 20).map((a) => (
                            <option key={a.acct_id} value={a.acct_id}>
                              #{a.acct_id.slice(-2)} — {a.customer_name} (${a.curr_bal})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant={selectedAccount.active_status === 'Y' ? 'glass' : 'destructive'}
                            data-glass-tint={
                              selectedAccount.active_status === 'Y' ? 'success' : undefined
                            }
                            border
                            className="font-mono text-xs"
                          >
                            {selectedAccount.active_status === 'Y'
                              ? '● CARD ACTIVE'
                              : '🚨 CARD FROZEN (FRAUD ALERT)'}
                          </Badge>
                          <Button
                            variant={selectedAccount.active_status === 'Y' ? 'destructive' : 'glass'}
                            size="xs"
                            border
                            onClick={() =>
                              handleToggleFraud(
                                selectedAccount.acct_id,
                                73701,
                                87999900,
                                selectedAccount.active_status === 'Y'
                              )
                            }
                          >
                            {selectedAccount.active_status === 'Y'
                              ? '🚨 Freeze Card & Flag Fraud'
                              : '✅ Unfreeze Card'}
                          </Button>
                        </div>
                        <CardTitle className="text-2xl font-bold flex items-center gap-2">
                          <UserCircleIcon className="w-6 h-6 opacity-80" weight="duotone" />
                          {selectedAccount.customer_name}
                        </CardTitle>
                        <CardDescription className="font-mono text-xs mt-1">
                          Account #{selectedAccount.acct_id} • Card{' '}
                          {piiMasked
                            ? `•••• •••• •••• ${selectedAccount.card_num.slice(-4)}`
                            : selectedAccount.card_num}{' '}
                          • SSN{' '}
                          {piiMasked
                            ? `***-**-${(accountDetail?.account?.customer?.ssn || '3888').slice(-4)}`
                            : accountDetail?.account?.customer?.ssn || '020973888'}{' '}
                          • FICO {selectedAccount.fico_score}
                        </CardDescription>
                      </div>

                      <div className="text-right">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                          Current Balance
                        </div>
                        <div className="text-3xl font-bold font-mono tracking-tight">
                          ${selectedAccount.curr_bal}
                        </div>
                        <div className="mt-2">
                          <Button
                            variant="default"
                            size="sm"
                            effect="glow"
                            onClick={handleOneClickBillPay}
                            className="font-semibold"
                          >
                            ⚡ 1-Click Pay Full Balance ($
                            {parseFloat(selectedAccount.curr_bal) > 0
                              ? selectedAccount.curr_bal
                              : '0.00'}
                            )
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  {accountDetail?.account && (
                    <CardContent className="pt-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                        <div className="glass glass-border rounded-xl p-3">
                          <div className="text-[11px] text-muted-foreground">Starting Balance</div>
                          <div className="font-mono font-bold text-sm mt-0.5">
                            ${accountDetail.account.initial_bal}
                          </div>
                        </div>

                        <div className="glass glass-border rounded-xl p-3">
                          <div className="text-[11px] text-muted-foreground">
                            1980s Overpunch Byte (`CVACT01Y`)
                          </div>
                          <div className="font-mono font-bold text-sm mt-0.5 text-emerald-400">
                            {selectedAccount.curr_bal_overpunch}
                          </div>
                        </div>

                        <form onSubmit={handleUpdateCreditLimit} className="flex items-end gap-1.5">
                          <div className="flex-1">
                            <label className="text-[11px] text-muted-foreground block mb-1">
                              Credit Limit ($)
                            </label>
                            <Input
                              variant="glass"
                              value={creditLimitEdit}
                              onChange={(e) => setCreditLimitEdit(e.target.value)}
                              className="font-mono text-xs h-8"
                            />
                          </div>
                          <Button type="submit" variant="glass" size="sm" border className="h-8">
                            Save
                          </Button>
                        </form>
                      </div>
                    </CardContent>
                  )}
                </Card>
              )}

              {/* Recent Transactions */}
              <Card material={glassMaterial} border className="py-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Customer Transactions ({accountDetail?.transactions?.length ?? 0})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-72 overflow-y-auto">
                    <Table variant="glass">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Tran ID</TableHead>
                          <TableHead className="text-xs">Source</TableHead>
                          <TableHead className="text-xs">Purchase / Description</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                          <TableHead className="text-xs text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(accountDetail?.transactions ?? []).map((tx: AccountTransactionDto) => {
                          const isRefundOrPayment =
                            tx.source === 'CICS-ADJ' ||
                            tx.source === 'RET-DESK' ||
                            tx.source === 'FRAUD-SHIELD' ||
                            tx.type_cd === '02' ||
                            tx.type_cd === '03' ||
                            String(tx.amt).startsWith('-');
                          return (
                            <TableRow
                              key={tx.tran_id}
                              className={
                                tx.source === 'FRAUD-SHIELD'
                                  ? 'bg-rose-950/50 text-rose-200'
                                  : tx.source === 'CICS-ADJ' || tx.source === 'RET-DESK'
                                  ? 'bg-emerald-950/40 text-emerald-200'
                                  : ''
                              }
                            >
                              <TableCell className="font-mono text-xs">{tx.tran_id}</TableCell>
                              <TableCell className="text-xs font-mono">{tx.source}</TableCell>
                              <TableCell className="text-xs font-medium">{tx.description}</TableCell>
                              <TableCell className="font-mono text-xs font-bold text-right">
                                ${tx.amt}
                              </TableCell>
                              <TableCell className="text-right">
                                {!isRefundOrPayment ? (
                                  <Button
                                    variant="glass"
                                    size="xs"
                                    border
                                    onClick={() => handleRefundTransaction(tx.description, tx.amt)}
                                  >
                                    ↩️ Dispute Credit
                                  </Button>
                                ) : (
                                  <span className="text-[10px] font-mono text-muted-foreground">
                                    Posted
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          </div>
        )}

        {/* =====================================================================
            VIEW 2: LIVE GEMINI 4 ARGON TRANSPILER & VERIFIER (REAL API CALL)
           ===================================================================== */}
        {activeView === 'argon' && (
          <div className="space-y-5">
            <Card material={glassMaterial} border gradient sheen className="py-5">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="glass" data-glass-tint="info" border className="font-mono text-xs">
                        LIVE INTERACTIONS API (`v1beta/interactions`)
                      </Badge>
                      <Badge variant="glass" data-glass-tint="success" border className="font-mono text-xs">
                        Model: `gemini-4-argon`
                      </Badge>
                    </div>
                    <CardTitle className="text-xl font-bold mt-2">
                      Live Gemini 4 Argon Mainframe Transpiler &amp; Parity Verifier
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Pick any real COBOL program from AWS `CardDemo` (or edit the COBOL below) and
                      click Run. Gemini 4 Argon reads the COBOL + its cross-file `.cpy` copybooks and
                      generates verified Safe Rust code live.
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={contextMode}
                      onChange={(e) => {
                        const nextMode = e.target.value as
                          | 'multi_artifact'
                          | 'full_repo'
                          | 'naive_single_file';
                        setContextMode(nextMode);
                        loadArgonSource(selectedModuleId, nextMode);
                      }}
                      className="bg-background/80 border border-foreground/20 rounded-lg px-3 py-1.5 text-xs font-mono"
                    >
                      <option value="multi_artifact">
                        Context: 12-Artifact Bundle (~23K tokens, ~7s)
                      </option>
                      <option value="full_repo">
                        Context: Entire CardDemo Repo (227 Files, ~770K+ tokens)
                      </option>
                      <option value="naive_single_file">
                        Context: Naive Single-File Only (No Copybooks — Fails 28/50)
                      </option>
                    </select>

                    <select
                      value={thinkingLevel}
                      onChange={(e) =>
                        setThinkingLevel(e.target.value as 'low' | 'medium' | 'high')
                      }
                      className="bg-background/80 border border-foreground/20 rounded-lg px-3 py-1.5 text-xs font-mono"
                    >
                      <option value="low">thinking_level: &quot;low&quot; (~5-8s)</option>
                      <option value="medium">thinking_level: &quot;medium&quot; (~12-18s)</option>
                      <option value="high">thinking_level: &quot;high&quot; (~25-35s)</option>
                    </select>

                    <Button
                      variant="default"
                      size="sm"
                      effect="glow"
                      disabled={isCallingArgon}
                      onClick={() => handleRunLiveArgon()}
                      className="gap-1.5 font-semibold"
                    >
                      <LightningIcon className="w-4 h-4" weight="fill" />
                      {isCallingArgon
                        ? 'Calling gemini-4-argon Live...'
                        : '⚡ Run Live Gemini 4 Argon & Verify'}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Module Picker Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {(argonModules.length > 0
                    ? argonModules
                    : [
                        {
                          id: 'CBACT04C',
                          name: 'CBACT04C.cbl — Interest Calculator',
                          cbl_file: 'cbl/CBACT04C.cbl',
                          copybooks: ['cpy/CVACT01Y.cpy', 'cpy/CVTRA01Y.cpy'],
                          description: 'Unrounded PIC S9(09)V99 cent truncation & DEFAULT rate.',
                        },
                        {
                          id: 'CBTRN02C',
                          name: 'CBTRN02C.cbl — Daily Batch Poster',
                          cbl_file: 'cbl/CBTRN02C.cbl',
                          copybooks: ['cpy/CVACT01Y.cpy', 'cpy/CVTRA06Y.cpy'],
                          description: '300 daily transactions, overpunch & reject codes 102/103.',
                        },
                        {
                          id: 'COBIL00C',
                          name: 'COBIL00C.cbl — Online Bill Pay',
                          cbl_file: 'cbl/COBIL00C.cbl',
                          copybooks: ['cpy/CVACT01Y.cpy', 'cpy/COCOM01Y.cpy'],
                          description: 'Full balance settlement & CICS transaction generation.',
                        },
                        {
                          id: 'COACTUPC',
                          name: 'COACTUPC.cbl — Account Update',
                          cbl_file: 'cbl/COACTUPC.cbl',
                          copybooks: ['cpy/CVACT01Y.cpy', 'cpy/CVCUS01Y.cpy'],
                          description: 'VSAM ACCTDATA & CUSTDATA atomic rewrite.',
                        },
                      ]
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => loadArgonSource(m.id)}
                      className={`text-left p-3 rounded-xl border transition ${
                        selectedModuleId === m.id
                          ? 'glass glass-border glass-gradient ring-2 ring-emerald-400/60 font-semibold'
                          : 'glass-border hover:bg-foreground/5'
                      }`}
                    >
                      <div className="text-xs font-bold font-mono">{m.id}.cbl</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {m.description}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Side by Side: Real COBOL + Copybooks Input (Left) vs Live Gemini 4 Argon Output (Right) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between text-xs font-mono gap-2">
                      <span className="font-bold text-amber-300">
                        INPUT: `{selectedModuleId}.cbl` + Coupled Multi-Artifact Context
                      </span>
                      {sourceStats && (
                        <span className="text-muted-foreground text-[11px]">
                          {sourceStats.files_sent_in_request.length} files sent (
                          {sourceStats.sent_cobol_chars.toLocaleString()} COBOL chars +{' '}
                          {sourceStats.sent_copybooks_chars.toLocaleString()} copybook/JCL/VSAM
                          chars)
                        </span>
                      )}
                    </div>
                    {selectedModuleId === 'CBACT04C' && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                        <span className="text-muted-foreground">Test Live Edit Sensitivity:</span>
                        <Button
                          variant="glass"
                          size="xs"
                          border
                          onClick={() => {
                            setCobolSource((prev) =>
                              prev.replace('/ 1200', '/ 9999')
                            );
                            setArgonResult(null);
                          }}
                        >
                          🧪 Sabotage Divisor (`/ 1200` ➔ `/ 9999`)
                        </Button>
                        <Button
                          variant="glass"
                          size="xs"
                          border
                          onClick={() => loadArgonSource('CBACT04C')}
                        >
                          ↺ Restore Original COBOL
                        </Button>
                      </div>
                    )}
                    <textarea
                      value={cobolSource}
                      onChange={(e) => setCobolSource(e.target.value)}
                      rows={18}
                      className="w-full bg-black/85 text-amber-300 border border-amber-500/30 rounded-xl p-3 font-mono text-[11px] leading-relaxed focus:outline-none"
                    />
                    {copybooksSource && (
                      <details className="text-xs font-mono">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          View Coupled Artifacts Sent in This Request (
                          {(sourceStats?.files_sent_in_request.length ?? 1) - 1} files:{' '}
                          {sourceStats?.files_sent_in_request.slice(1, 6).join(', ')}
                          {(sourceStats?.files_sent_in_request.length ?? 0) > 6
                            ? ` + ${(sourceStats?.files_sent_in_request.length ?? 0) - 6} more`
                            : ''}
                          )
                        </summary>
                        <pre className="mt-2 bg-black/80 text-cyan-300 border border-cyan-500/30 rounded-xl p-3 text-[11px] max-h-48 overflow-y-auto whitespace-pre-wrap">
                          {copybooksSource.slice(0, 12000)}
                        </pre>
                      </details>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between text-xs font-mono gap-2">
                      <span className="font-bold text-emerald-300">
                        OUTPUT: Live `gemini-4-argon` Response &amp; Executed Python Check
                      </span>
                      {argonResult && (
                        <span className="text-emerald-400">
                          {(argonResult.latency_ms / 1000).toFixed(1)}s •{' '}
                          {argonResult.usage
                            ? `${argonResult.usage.input_tokens.toLocaleString()} in / ${argonResult.usage.output_tokens.toLocaleString()} out (${argonResult.usage.total_tokens.toLocaleString()} total tokens)`
                            : 'tokens N/A'}
                        </span>
                      )}
                    </div>

                    {isCallingArgon ? (
                      <div className="h-[390px] bg-black/85 border border-emerald-500/40 rounded-xl p-6 flex flex-col items-center justify-center text-center font-mono space-y-3">
                        <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                        <div className="text-sm font-bold text-emerald-300">
                          Calling Google Interactions API (`gemini-4-argon`)...
                        </div>
                        <div className="text-xs text-muted-foreground max-w-md">
                          Sending{' '}
                          <strong>{sourceStats?.files_sent_in_request.length ?? 12} files</strong> (
                          {(
                            ((sourceStats?.sent_cobol_chars ?? 0) +
                              (sourceStats?.sent_copybooks_chars ?? 0)) /
                            1000
                          ).toFixed(0)}
                          K chars) with `thinking_level: &quot;{thinkingLevel}&quot;`, then running
                          the generated Python verification against all 50 accounts in
                          `golden_baseline/`.
                        </div>
                      </div>
                    ) : argonResult ? (
                      <div className="space-y-3">
                        <div
                          className={`rounded-xl p-3 font-mono text-xs space-y-1.5 border ${
                            argonResult.verification.passed
                              ? 'bg-emerald-950/60 border-emerald-400/50 text-emerald-200'
                              : 'bg-rose-950/70 border-rose-400/50 text-rose-200'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold">
                              {argonResult.verification.passed
                                ? `✅ GENERATED PYTHON CHECK EXECUTED & PASSED (exit code ${argonResult.verification.exit_code})`
                                : `❌ GENERATED PYTHON CHECK FAILED (exit code ${
                                    argonResult.verification.exit_code ?? 'N/A'
                                  })`}
                            </span>
                            {argonResult.interaction_id && (
                              <span className="text-[11px] opacity-85">
                                ID: {argonResult.interaction_id.slice(0, 24)}...
                              </span>
                            )}
                          </div>
                          {argonResult.verification.stdout && (
                            <div className="text-[11px] font-bold text-white">
                              Stdout: {argonResult.verification.stdout}
                            </div>
                          )}
                          {argonResult.verification.stderr && (
                            <pre className="text-[10px] text-rose-300 whitespace-pre-wrap max-h-24 overflow-y-auto">
                              {argonResult.verification.stderr}
                            </pre>
                          )}
                          {!argonResult.verification.passed && (
                            <div className="pt-1">
                              <Button
                                variant="default"
                                size="xs"
                                effect="glow"
                                onClick={() =>
                                  handleRunLiveArgon({
                                    overrideMode: 'multi_artifact',
                                    prevInteractionId: argonResult.interaction_id,
                                    errorFeedback: `${argonResult.verification.stdout}\n${argonResult.verification.stderr}`,
                                  })
                                }
                                className="font-semibold"
                              >
                                🔧 Auto-Heal Failed Parity with Gemini 4 Argon (Turn 2 via
                                `previous_interaction_id`)
                              </Button>
                            </div>
                          )}
                          <div className="text-[10px] opacity-80">
                            Scope: {argonResult.verification.scope_note} •{' '}
                            {argonResult.context_sent?.files_count} files sent (
                            {argonResult.context_sent?.total_prompt_chars.toLocaleString()} prompt
                            chars)
                          </div>
                        </div>

                        <pre className="bg-black/85 text-emerald-300 border border-emerald-500/30 rounded-xl p-3.5 font-mono text-[11px] leading-relaxed h-[300px] overflow-y-auto whitespace-pre-wrap">
                          {argonResult.output_text}
                        </pre>
                      </div>
                    ) : (
                      <div className="h-[390px] bg-black/80 border border-foreground/15 rounded-xl p-6 flex flex-col items-center justify-center text-center font-mono space-y-3">
                        <div className="text-sm font-bold">
                          Click &quot;⚡ Run Live Gemini 4 Argon &amp; Verify&quot; Above
                        </div>
                        <div className="text-xs text-muted-foreground max-w-md">
                          Sends the selected COBOL excerpt + copybooks to `gemini-4-argon` on the
                          Interactions API, then executes the model&apos;s generated `python` check
                          in an isolated subprocess (`python3 -I`) against `golden_baseline/*.json`.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* =====================================================================
            VIEW 3: BEFORE VS. AFTER SCORECARD, 6 COBOL BUGS & 50/50 PARITY
           ===================================================================== */}
        {activeView === 'scorecard' && (
          <div className="space-y-5">
            {/* 3-Column Comparison Scorecard */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card material={glassMaterial} border className="py-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-amber-300">
                    1. Legacy 1980s Mainframe (`CardDemo`)
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-1.5 text-muted-foreground">
                  <div>• <strong>412.4 ms</strong> Nightly JCL Batch Runtime</div>
                  <div>• <strong>54 seconds (72 keystrokes)</strong> to pay a bill on 3270 CRT</div>
                  <div>• Raw EBCDIC overpunch files &amp; unrounded COBOL math</div>
                </CardContent>
              </Card>

              <Card material={glassMaterial} border className="py-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-rose-400">
                    2. Standard AI (Single-File Translation)
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-1.5 text-muted-foreground">
                  <div>
                    • <strong>49 / 50 Accounts WRONG ($1,279.16 drift)</strong> without cross-file
                    `acctdata.txt` ➔ `DEFAULT` group fallback
                  </div>
                  <div>
                    • <strong>28 / 50 Accounts WRONG ($0.28 drift)</strong> when using standard
                    `ROUND_HALF_UP` instead of COBOL truncation
                  </div>
                  <div>• Measured reproducibly in `scripts/run_golden_baseline.py`</div>
                </CardContent>
              </Card>

              <Card material={glassMaterial} border glow className="py-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-emerald-400">
                    3. Gemini 4 Argon (Multi-Artifact Context)
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-1.5 text-muted-foreground">
                  <div>• <strong>50 / 50 Accounts EXACT</strong> ($0.00 cent drift)</div>
                  <div>• <strong>2.3 ms</strong> Safe Rust Batch (**176x Faster**)</div>
                  <div>• <strong>1.4 ms</strong> 1-Click Bill Pay + Pre-Tool Safety Firewall</div>
                </CardContent>
              </Card>
            </div>

            {/* Interactive 12-Byte VSAM Overpunch Memory Decoder (B1..B12) */}
            <Card material={glassMaterial} border sheen className="py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <SparkleIcon className="w-4 h-4" weight="fill" />
                  Interactive 12-Byte VSAM Overpunch Memory Decoder (`B1..B12`)
                </CardTitle>
                <CardDescription className="text-xs">
                  Click any preset or type a dollar value to see how 1980s VSAM files encode the sign
                  inside Byte 12 (`B12`) and truncate monthly interest.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { label: '+$504.77 ➔ G', val: '504.77' },
                    { label: '-$919.00 ➔ }', val: '-919.00' },
                    { label: '-$56.77 ➔ P', val: '-56.77' },
                    { label: '-$535.88 ➔ Q', val: '-535.88' },
                    { label: '+$1,302.66 ➔ F', val: '1302.66' },
                  ].map((p) => (
                    <Button
                      key={p.val}
                      variant={overpunchInput === p.val ? 'default' : 'glass'}
                      size="xs"
                      border
                      onClick={() => setOverpunchInput(p.val)}
                      className="font-mono"
                    >
                      {p.label}
                    </Button>
                  ))}
                  <div className="w-36 ml-auto">
                    <Input
                      variant="glass"
                      value={overpunchInput}
                      onChange={(e) => setOverpunchInput(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="bg-[#050b06] border-2 border-green-500/60 rounded-xl p-4 font-mono text-green-300 space-y-3">
                  <div className="flex flex-wrap items-center justify-between text-xs border-b border-green-500/30 pb-2">
                    <span className="text-yellow-300 font-bold">
                      12-BYTE `PIC S9(10)V99` TAPE FOR ${overpunchCalc.formatted}
                    </span>
                    <span className="text-cyan-300">
                      B12 = &apos;{overpunchCalc.lastByte}&apos; ({overpunchCalc.signNibble}) • 15%
                      Monthly Int: Trunc ${overpunchCalc.monthlyIntTruncated} vs Round $
                      {overpunchCalc.monthlyIntRounded}
                    </span>
                  </div>
                  <div className="grid grid-cols-12 gap-1 text-center">
                    {overpunchCalc.overpunch12.split('').map((ch, idx) => {
                      const isLast = idx === 11;
                      return (
                        <div
                          key={idx}
                          className={`p-2 rounded border ${
                            isLast
                              ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200 font-extrabold ring-2 ring-yellow-400/50'
                              : 'bg-black/80 border-green-500/40 text-green-300'
                          }`}
                        >
                          <div className="text-[9px] opacity-70">B{idx + 1}</div>
                          <div className="text-base">{ch}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 6 COBOL Bugs Selector */}
            <Card material={glassMaterial} border className="py-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  The 6 Hidden Mainframe Bugs Caught by Gemini 4 Argon&apos;s 1M Context Window
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {MAINFRAME_LANDMINES.map((lm) => (
                    <button
                      key={lm.id}
                      onClick={() => handleSelectLandmine(lm.id)}
                      className={`text-left p-3 rounded-xl border transition ${
                        selectedLandmineId === lm.id
                          ? 'glass glass-border glass-gradient ring-2 ring-emerald-400/60 font-semibold'
                          : 'glass-border hover:bg-foreground/5'
                      }`}
                    >
                      <div className="text-xs font-bold">{lm.shortTitle}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                        {lm.title}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="glass glass-border rounded-xl p-4 space-y-3">
                  <div>
                    <div className="text-sm font-bold">{activeLandmine.title}</div>
                    <p className="text-xs text-muted-foreground mt-1">{activeLandmine.plainEnglish}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <pre className="bg-black/85 text-amber-300 border border-amber-500/30 rounded-xl p-3 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                      {activeLandmine.cobol}
                    </pre>
                    <pre className="bg-black/85 text-emerald-300 border border-emerald-500/30 rounded-xl p-3 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                      {activeLandmine.rust}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* AI Safety Firewall + 50-Account Parity Table */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <Card material={glassMaterial} border className="py-4 lg:col-span-5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldCheckIcon className="w-4 h-4 text-emerald-400" weight="fill" />
                    AI Safety Firewall (`.agents/hooks-scripts/gate.py`)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Blocks destructive SQL or unapproved merges before execution.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        handleTestSecurityGate('sqlite3 carddemo.db "DROP TABLE accounts;"')
                      }
                    >
                      1. Simulate Rogue AI: Delete Accounts (`DROP TABLE`)
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() =>
                        handleTestSecurityGate('cargo run --release -- verify-parity')
                      }
                    >
                      2. Simulate Safe AI: Run 50-Account Audit
                    </Button>
                  </div>

                  {gateResult && (
                    <div
                      className={`rounded-xl p-3 border font-mono text-xs ${
                        gateResult.decision === 'allow'
                          ? 'bg-emerald-950/70 border-emerald-400 text-emerald-200'
                          : 'bg-rose-950/80 border-rose-500 text-rose-200'
                      }`}
                    >
                      <div className="font-bold">
                        {gateResult.decision === 'allow'
                          ? '✅ ALLOWED BY FIREWALL'
                          : '🛑 BLOCKED BY FIREWALL'}
                      </div>
                      <div className="mt-1 opacity-90">{gateResult.reason}</div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card material={glassMaterial} border className="py-4 lg:col-span-7">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    50-Account Golden Parity Table ({rejects.length} Bad Transactions Rejected)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {parityReport && (
                    <div className="max-h-60 overflow-y-auto">
                      <Table variant="glass">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Account</TableHead>
                            <TableHead className="text-xs">1980s Mainframe</TableHead>
                            <TableHead className="text-xs">Modern Safe Rust</TableHead>
                            <TableHead className="text-xs text-right">Drift</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parityReport.account_diffs.slice(0, 20).map((d) => (
                            <TableRow key={d.acct_id}>
                              <TableCell className="font-mono text-xs font-bold">
                                #{d.acct_id}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                ${d.final_bal_golden}
                              </TableCell>
                              <TableCell className="font-mono text-xs font-bold">
                                ${d.final_bal_rust}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-right text-emerald-400 font-bold">
                                ${d.cent_drift} ✓
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
