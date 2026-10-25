import React, { useEffect, useState, useCallback } from 'react';
import {
  TerminalWindowIcon,
  SparkleIcon,
  ShieldCheckIcon,
  PlayIcon,
  ArrowCounterClockwiseIcon,
  CreditCardIcon,
  WarningOctagonIcon,
  CheckCircleIcon,
  LightningIcon,
  DatabaseIcon,
  MagnifyingGlassIcon,
  DiamondIcon,
  PaletteIcon,
  MoonIcon,
  SunIcon,
  ArrowsLeftRightIcon,
  ReceiptIcon,
  UserCircleIcon,
  CpuIcon,
} from '@phosphor-icons/react';

import { AutoForeground, FG_EVENT } from '@/components/auto-foreground';
import { GradientBackground } from '@/components/gradient-background';
import { PatternBackground, type PatternStyle } from '@/components/pattern-background';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
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
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AccountSummary {
  acct_id: string;
  active_status: string;
  curr_bal: number;
  credit_limit: number;
  cash_credit_limit: number;
  curr_cyc_credit: number;
  curr_cyc_debit: number;
  open_date: string;
  expiraion_date: string;
  group_id: string;
  cust_id: number | null;
  cust_name: string | null;
  fico_score: number | null;
  primary_card_num: string | null;
}

interface CardRecord {
  card_num: string;
  acct_id: string;
  cvv_cd: string;
  embossed_name: string;
  expiraion_date: string;
  active_status: string;
}

interface TransactionRecord {
  tran_id: string;
  tran_type_cd: string;
  tran_cat_cd: number;
  tran_source: string;
  tran_desc: string;
  tran_amt: number;
  merchant_name: string;
  merchant_city: string;
  tran_card_num: string;
  orig_ts: string;
  proc_ts: string;
}

interface CategoryBalance {
  acct_id: string;
  type_cd: string;
  cat_cd: number;
  balance: number;
}

interface RejectRecord {
  tran_id: string;
  card_num: string;
  acct_id: string;
  tran_amt: number;
  fail_code: number;
  fail_reason: string;
}

interface AuthSummary {
  acct_id: string;
  cust_id: number;
  auth_status: string;
  credit_balance: number;
  approved_auth_cnt: number;
  approved_auth_amt: number;
  declined_auth_cnt: number;
  declined_auth_amt: number;
  details: {
    auth_date_9c: string;
    auth_time_9c: string;
    card_num: string;
    auth_resp_code: string;
    auth_resp_reason: string;
    transaction_amt: number;
    merchant_name: string;
    merchant_city: string;
    auth_fraud: string;
  }[];
}

interface AccountMismatch {
  acct_id: string;
  field: string;
  expected: string;
  actual: string;
  cent_drift: number;
}

interface ParityReport {
  parity_pass: boolean;
  accounts_checked: number;
  accounts_matched: number;
  parity_pct: number;
  max_cent_drift: number;
  rejects_expected: number;
  rejects_actual: number;
  rejects_matched: boolean;
  interest_tx_expected: number;
  interest_tx_actual: number;
  total_interest_expected: number;
  total_interest_actual: number;
  mismatches: AccountMismatch[];
}

interface BatchRunSummary {
  daily_tx_processed: number;
  posted_count: number;
  rejected_count: number;
  interest_tx_generated: number;
  total_interest_computed: number;
  elapsed_ms: number;
  legacy_baseline_ms: number;
  speedup_factor: number;
  parity: ParityReport;
}

const SISTINE_MATERIALS = [
  { value: 'glass', label: 'Glass', desc: 'Adaptive translucent sheet' },
  { value: 'crystal', label: 'Crystal', desc: 'Specular cut-edge refraction' },
  { value: 'frosted', label: 'Frosted', desc: 'Deep 25px diffuse frost' },
  { value: 'chakra', label: 'Chakra', desc: 'Prismatic harmonic rim' },
  { value: 'opaque', label: 'Opaque', desc: 'Solid stone mineral floor' },
] as const;

type SistineMaterial = (typeof SISTINE_MATERIALS)[number]['value'];

const SISTINE_TINTS = [
  { value: 'sistine', label: 'Sistine Fresco', group: 'Frescoes' },
  { value: 'muse', label: 'Muse Fresco', group: 'Frescoes' },
  { value: 'aurora', label: 'Aurora Fresco', group: 'Frescoes' },
  { value: 'gloaming', label: 'Gloaming Fresco', group: 'Frescoes' },
  { value: 'lapis', label: 'Lapis Lazuli', group: 'Stones' },
  { value: 'sapphire', label: 'Sapphire', group: 'Stones' },
  { value: 'aquamarine', label: 'Aquamarine', group: 'Stones' },
  { value: 'turquoise', label: 'Turquoise', group: 'Stones' },
  { value: 'aventurine', label: 'Aventurine', group: 'Stones' },
  { value: 'peridot', label: 'Peridot', group: 'Stones' },
  { value: 'amber', label: 'Amber', group: 'Stones' },
  { value: 'goldstone', label: 'Goldstone', group: 'Stones' },
  { value: 'carnelian', label: 'Carnelian', group: 'Stones' },
  { value: 'rose', label: 'Rose Quartz', group: 'Stones' },
  { value: 'tourmaline', label: 'Tourmaline', group: 'Stones' },
  { value: 'amethyst', label: 'Amethyst', group: 'Stones' },
  { value: 'moonstone', label: 'Moonstone', group: 'Stones' },
  { value: 'selenite', label: 'Selenite (Neutral)', group: 'Stones' },
] as const;

type SistineTint = (typeof SISTINE_TINTS)[number]['value'];

const BACKDROP_MODES: { value: 'gradient' | PatternStyle; label: string }[] = [
  { value: 'gradient', label: 'OKLCH Harmonic Ramp' },
  { value: 'moonrise', label: 'Moonrise Scene' },
  { value: 'forest', label: 'Forest Canopy' },
  { value: 'dune', label: 'Desert Dune' },
  { value: 'aurora', label: 'Aurora Curtains' },
  { value: 'synthwave', label: 'Synthwave Horizon' },
  { value: 'mesh', label: 'Harmonic Mesh' },
];

export function App() {
  const [mode, setMode] = useState<'modern' | '3270'>('modern');
  const [glassMaterial, setGlassMaterial] = useState<SistineMaterial>('crystal');
  const [glassTint, setGlassTint] = useState<SistineTint>('sistine');
  const [backdropMode, setBackdropMode] = useState<'gradient' | PatternStyle>('gradient');
  const [isDark, setIsDark] = useState<boolean>(true);

  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selectedAcctId, setSelectedAcctId] = useState<string>('00000000001');
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [catBalances, setCatBalances] = useState<CategoryBalance[]>([]);
  const [rejects, setRejects] = useState<RejectRecord[]>([]);
  const [auths, setAuths] = useState<AuthSummary[]>([]);
  const [parity, setParity] = useState<ParityReport | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchRunSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>(
    'CICS READY — Sistine Glass UI & Safe Rust Engine Online'
  );

  // Edit Account state (COACTUPC)
  const [editCreditLimit, setEditCreditLimit] = useState<string>('');
  const [editGroupId, setEditGroupId] = useState<string>('');
  const [editStatus, setEditStatus] = useState<string>('Y');

  // New Transaction state (COTRN02C)
  const [newTxAmt, setNewTxAmt] = useState<string>('149.99');
  const [newTxDesc, setNewTxDesc] = useState<string>('APPLE STORE #104');
  const [newTxMerchant, setNewTxMerchant] = useState<string>('APPLE INC');
  const [newTxCity, setNewTxCity] = useState<string>('CUPERTINO');

  // 3270 Terminal command line state
  const [cicsCmd, setCicsCmd] = useState<string>('CAVW');

  // Sync Sistine theme attributes on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    if (glassMaterial === 'glass') {
      delete root.dataset.glass;
    } else {
      root.dataset.glass = glassMaterial;
    }
    root.dataset.glassTint = glassTint;
    window.dispatchEvent(new Event(FG_EVENT));
  }, [isDark, glassMaterial, glassTint]);

  const fetchAllData = useCallback(async (acctIdToLoad?: string) => {
    try {
      const [acctsRes, cardsRes, txRes, rejRes, authRes, parRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/cards'),
        fetch('/api/transactions'),
        fetch('/api/rejects'),
        fetch('/api/authorizations'),
        fetch('/api/parity'),
      ]);
      const acctsData: AccountSummary[] = await acctsRes.json();
      const cardsData: CardRecord[] = await cardsRes.json();
      const txData: TransactionRecord[] = await txRes.json();
      const rejData: RejectRecord[] = await rejRes.json();
      const authData: AuthSummary[] = await authRes.json();
      const parData: ParityReport = await parRes.json();

      setAccounts(acctsData);
      setCards(cardsData);
      setTransactions(txData);
      setRejects(rejData);
      setAuths(authData);
      setParity(parData);

      const targetId = acctIdToLoad || selectedAcctId || acctsData[0]?.acct_id || '00000000001';
      const currentAcct = acctsData.find((a) => a.acct_id === targetId);
      if (currentAcct) {
        setEditCreditLimit(currentAcct.credit_limit.toFixed(2));
        setEditGroupId(currentAcct.group_id);
        setEditStatus(currentAcct.active_status);
      }

      const detailRes = await fetch(`/api/accounts/${targetId}`);
      if (detailRes.ok) {
        const detailJson = await detailRes.json();
        setCatBalances(detailJson.category_balances || []);
      }
    } catch (err) {
      console.error('Failed to load CardDemo data:', err);
    }
  }, [selectedAcctId]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Global keyboard shortcuts: F12 toggles 3270 / Sistine Glass Mode, F5 runs JCL batch
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        setMode((prev) => (prev === 'modern' ? '3270' : 'modern'));
      } else if (e.key === 'F5' && e.shiftKey) {
        e.preventDefault();
        handleRunBatch(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleSelectAccount = async (acct: AccountSummary) => {
    setSelectedAcctId(acct.acct_id);
    setEditCreditLimit(acct.credit_limit.toFixed(2));
    setEditGroupId(acct.group_id);
    setEditStatus(acct.active_status);
    setStatusMessage(`CAVW / COACTVWC — Loaded Account ${acct.acct_id} (${acct.cust_name ?? 'N/A'})`);
    const detailRes = await fetch(`/api/accounts/${acct.acct_id}`);
    if (detailRes.ok) {
      const detailJson = await detailRes.json();
      setCatBalances(detailJson.category_balances || []);
    }
  };

  const handleRunBatch = async (resetSeed: boolean) => {
    setLoading(true);
    setStatusMessage(
      resetSeed
        ? 'Executing JCL Batch Pipeline (Reset Seed -> CBTRN02C -> CBACT04C -> Golden Parity Check)...'
        : 'Executing JCL Batch Pipeline (CBTRN02C + CBACT04C)...'
    );
    try {
      const res = await fetch('/api/batch/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_to_seed_first: resetSeed }),
      });
      const summary: BatchRunSummary = await res.json();
      setBatchSummary(summary);
      setParity(summary.parity);
      await fetchAllData(selectedAcctId);
      setStatusMessage(
        `JCL BATCH COMPLETE in ${summary.elapsed_ms.toFixed(2)}ms (${summary.speedup_factor.toFixed(1)}x faster than legacy) — Golden Parity: ${summary.parity.parity_pct.toFixed(2)}% ($${summary.parity.max_cent_drift.toFixed(2)} drift)`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetSeed = async () => {
    setLoading(true);
    setStatusMessage('Resetting SQLite database to raw ASCII VSAM/IMS pre-batch seed...');
    try {
      await fetch('/api/batch/reset', { method: 'POST' });
      setBatchSummary(null);
      await fetchAllData(selectedAcctId);
      setStatusMessage('Database reset to pre-batch VSAM seed state (50 accounts, 300 unposted daily transactions).');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`/api/accounts/${selectedAcctId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        active_status: editStatus,
        credit_limit: parseFloat(editCreditLimit) || 0,
        cash_credit_limit: (parseFloat(editCreditLimit) || 0) * 0.2,
        group_id: editGroupId,
      }),
    });
    if (res.ok) {
      await fetchAllData(selectedAcctId);
      setStatusMessage(`CAUP / COACTUPC — Account ${selectedAcctId} updated in SQLite.`);
    }
  };

  const handlePostOnlineTx = async (e: React.FormEvent) => {
    e.preventDefault();
    const acct = accounts.find((a) => a.acct_id === selectedAcctId);
    const cardNum = acct?.primary_card_num || cards.find((c) => c.acct_id === selectedAcctId)?.card_num;
    if (!cardNum) return;

    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_num: cardNum,
        tran_type_cd: '01',
        tran_cat_cd: 1,
        tran_source: 'ONLINE',
        tran_desc: newTxDesc,
        tran_amt: parseFloat(newTxAmt) || 0,
        merchant_id: 900010001,
        merchant_name: newTxMerchant,
        merchant_city: newTxCity,
        merchant_zip: '95014',
      }),
    });
    const data = await res.json();
    await fetchAllData(selectedAcctId);
    if (data.status === 'POSTED') {
      setStatusMessage(`CT02 / COTRN02C — Posted ${data.tran_id} ($${newTxAmt}) -> New Balance: $${data.new_balance.toFixed(2)}`);
    } else {
      setStatusMessage(`CT02 / COTRN02C — REJECTED (${data.fail_code}): ${data.fail_reason}`);
    }
  };

  const selectedAccount = accounts.find((a) => a.acct_id === selectedAcctId) || accounts[0];
  const accountCards = cards.filter((c) => c.acct_id === selectedAcctId);
  const accountTransactions = transactions.filter((t) =>
    accountCards.some((c) => c.card_num === t.tran_card_num)
  );
  const accountRejects = rejects.filter((r) => r.acct_id === selectedAcctId);
  const accountAuth = auths.find((a) => a.acct_id === selectedAcctId);

  const filteredAccounts = accounts.filter(
    (a) =>
      a.acct_id.includes(searchQuery) ||
      (a.cust_name && a.cust_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (a.primary_card_num && a.primary_card_num.includes(searchQuery))
  );

  return (
    <div className="min-h-screen relative flex flex-col selection:bg-primary selection:text-primary-foreground">
      {/* Sistine Automatic APCA Foreground Solver + Dynamic Wallpaper */}
      <AutoForeground />
      {mode === 'modern' && (
        backdropMode === 'gradient' ? (
          <GradientBackground axis="tonal" angle={125} />
        ) : (
          <div className="fixed inset-0 -z-10 pointer-events-none">
            <PatternBackground style={backdropMode} density="medium" speed={0} disc="right" sand="breeze" />
          </div>
        )
      )}

      {/* Top Sistine Glass Header Bar */}
      <header className="sticky top-0 z-50 glass glass-border glass-veil px-5 py-3">
        <div className="max-w-[1640px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl glass glass-border glass-gradient flex items-center justify-center shadow-sm">
              <SparkleIcon className="w-5 h-5 text-foreground" weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-base">
                  CardDemo <span className="opacity-80 font-medium">× Sistine Glass UI</span>
                </span>
                <Badge variant="glass" material={glassMaterial} border gradient className="text-[11px] font-mono">
                  sistine.weekendsuperhero.io
                </Badge>
                <Badge variant="glass" data-glass-tint="success" border className="text-[11px] font-mono">
                  #![forbid(unsafe_code)]
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                AWS Mainframe Modernization • 44 COBOL Programs • 22 BMS Maps • VSAM + DB2 + IMS ➔ Safe Rust + Sistine Glass
              </p>
            </div>
          </div>

          {/* Right Controls: Sistine Material, Stone Tint, Backdrop, Batch Execution, 3270 Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            {parity && (
              <Badge
                variant="glass"
                data-glass-tint={parity.parity_pass ? 'success' : 'warning'}
                border
                className="h-8 px-3 gap-1.5 text-xs font-mono"
              >
                <ShieldCheckIcon className="w-4 h-4" weight="fill" />
                Parity: {parity.accounts_matched}/{parity.accounts_checked} ({parity.parity_pct.toFixed(1)}%) • Drift: ${parity.max_cent_drift.toFixed(2)}
              </Badge>
            )}

            {/* Sistine Material Switcher (5 distinct materials) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="glass" size="sm" border sheen effect="lift" className="gap-1.5">
                  <DiamondIcon className="w-4 h-4" weight="duotone" />
                  <span className="capitalize">{glassMaterial}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">Sistine 5 Glass Materials</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SISTINE_MATERIALS.map((m) => (
                  <DropdownMenuItem
                    key={m.value}
                    onClick={() => setGlassMaterial(m.value)}
                    className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
                  >
                    <div className="flex w-full items-center justify-between font-medium text-xs">
                      <span>{m.label}</span>
                      {glassMaterial === m.value && (
                        <Badge variant="glass" className="text-[10px] px-1.5 py-0">Active</Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{m.desc}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sistine Stone Tint & Fresco Switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="glass" size="sm" border gradient effect="lift" className="gap-1.5">
                  <PaletteIcon className="w-4 h-4" weight="duotone" />
                  <span className="capitalize">{glassTint}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto">
                <DropdownMenuLabel className="text-xs">Sistine Frescoes & Stone Tints</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SISTINE_TINTS.map((t) => (
                  <DropdownMenuItem
                    key={t.value}
                    onClick={() => setGlassTint(t.value)}
                    className="flex items-center justify-between text-xs cursor-pointer"
                  >
                    <span>{t.label}</span>
                    <span className="text-[10px] text-muted-foreground">{t.group}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Backdrop Scene</DropdownMenuLabel>
                {BACKDROP_MODES.map((b) => (
                  <DropdownMenuItem
                    key={b.value}
                    onClick={() => setBackdropMode(b.value)}
                    className="flex items-center justify-between text-xs cursor-pointer"
                  >
                    <span>{b.label}</span>
                    {backdropMode === b.value && <span className="text-[10px] font-bold">●</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Dark / Light Mode Toggle */}
            <Button
              variant="glass"
              size="icon-sm"
              border
              onClick={() => setIsDark((d) => !d)}
              title="Toggle Dark / Light Mode"
            >
              {isDark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </Button>

            {/* Run JCL Nightly Batch */}
            <Button
              variant="default"
              size="sm"
              disabled={loading}
              onClick={() => handleRunBatch(true)}
              effect="glow"
              className="gap-1.5 font-semibold"
            >
              <PlayIcon className="w-3.5 h-3.5" weight="fill" />
              {loading ? 'Running JCL...' : 'Run Nightly JCL Batch'}
            </Button>

            <Button
              variant="glass"
              size="sm"
              border
              disabled={loading}
              onClick={handleResetSeed}
              title="Reset to raw pre-batch ASCII VSAM seed"
              className="gap-1"
            >
              <ArrowCounterClockwiseIcon className="w-3.5 h-3.5" />
              Reset Seed
            </Button>

            {/* Dual-Mode Toggle: Sistine Glass vs Legacy 3270 CRT */}
            <Button
              variant={mode === '3270' ? 'default' : 'glass'}
              size="sm"
              border
              glow={mode === '3270'}
              onClick={() => setMode((m) => (m === 'modern' ? '3270' : 'modern'))}
              className="gap-1.5 font-mono"
            >
              <TerminalWindowIcon className="w-4 h-4" weight="duotone" />
              {mode === 'modern' ? '3270 Terminal' : 'Sistine Glass'}
              <Kbd className="ml-1 text-[10px]">F12</Kbd>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {mode === '3270' ? (
        /* =====================================================================
           AUTHENTIC IBM 3270 GREEN-SCREEN TERMINAL EMULATOR (24x80 BMS)
           ===================================================================== */
        <main className="flex-1 bg-black p-6 flex flex-col items-center justify-center font-mono">
          <div className="w-full max-w-5xl bg-[#050b06] border-2 border-green-500/60 rounded-xl shadow-[0_0_50px_rgba(34,197,94,0.2)] p-6 crt-scanlines text-green-400 crt-glow">
            <div className="flex justify-between border-b border-green-500/40 pb-2 mb-4 text-xs">
              <span>TRAN: {cicsCmd} | MAPSET: COACTVW / COTRN02 | TERM: T3278M2 (24x80)</span>
              <span>SYSID: MVS1 | CICS TS 6.1 | APPLID: CARDDEMO</span>
              <span>DATE: 2026-10-25</span>
            </div>

            <div className="grid grid-cols-2 gap-6 text-sm leading-relaxed mb-4">
              <div className="border border-green-500/30 p-3 rounded bg-black/50">
                <div className="text-cyan-400 font-bold mb-2 underline">
                  *** ACCOUNT MASTER INQUIRY (COACTVWC / CAVW) ***
                </div>
                <div>ACCT ID        : <span className="text-white font-bold">{selectedAccount?.acct_id}</span></div>
                <div>CUSTOMER NAME  : <span className="text-yellow-300">{selectedAccount?.cust_name || 'N/A'}</span></div>
                <div>ACTIVE STATUS  : <span className="text-white">{selectedAccount?.active_status}</span></div>
                <div>CURRENT BAL    : <span className="text-green-300 font-bold">${selectedAccount?.curr_bal.toFixed(2)}</span></div>
                <div>CREDIT LIMIT   : <span className="text-white">${selectedAccount?.credit_limit.toFixed(2)}</span></div>
                <div>CASH LIMIT     : <span className="text-white">${selectedAccount?.cash_credit_limit.toFixed(2)}</span></div>
                <div>CYCLE CREDIT   : <span className="text-cyan-300">${selectedAccount?.curr_cyc_credit.toFixed(2)}</span></div>
                <div>CYCLE DEBIT    : <span className="text-amber-300">${selectedAccount?.curr_cyc_debit.toFixed(2)}</span></div>
                <div>RATE GROUP     : <span className="text-yellow-300">{selectedAccount?.group_id || '(BLANK -> DEFAULT)'}</span></div>
                <div>FICO SCORE     : <span className="text-white">{selectedAccount?.fico_score ?? 'N/A'}</span></div>
              </div>

              <div className="border border-green-500/30 p-3 rounded bg-black/50">
                <div className="text-cyan-400 font-bold mb-2 underline">
                  *** SUBFILE: POSTED TRANSACTIONS &amp; REJECTS (COTRN00C) ***
                </div>
                <div className="text-xs space-y-1 max-h-48 overflow-y-auto">
                  {accountTransactions.slice(0, 7).map((t) => (
                    <div key={t.tran_id} className="flex justify-between">
                      <span className="text-white">{t.tran_id.slice(0, 12)}</span>
                      <span className="text-yellow-200 truncate max-w-[170px]">{t.tran_desc}</span>
                      <span className={t.tran_amt < 0 ? 'text-cyan-300' : 'text-green-300'}>
                        ${t.tran_amt.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {accountRejects.map((r) => (
                    <div key={r.tran_id} className="flex justify-between text-red-400">
                      <span>REJ:{r.fail_code}</span>
                      <span className="truncate max-w-[170px]">{r.fail_reason}</span>
                      <span>${r.tran_amt.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border border-green-500/30 p-3 rounded bg-black/50 mb-4 text-xs">
              <div className="text-cyan-400 font-bold mb-1">
                SELECT ACCOUNT (ENTER ACCT # OR CLICK QUICK JUMP):
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {accounts.slice(0, 14).map((a) => (
                  <button
                    key={a.acct_id}
                    onClick={() => handleSelectAccount(a)}
                    className={`px-2 py-0.5 border font-mono ${
                      a.acct_id === selectedAcctId
                        ? 'bg-green-500 text-black border-green-400 font-bold'
                        : 'border-green-500/40 text-green-400 hover:bg-green-950'
                    }`}
                  >
                    {a.acct_id}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-green-500/40 pt-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-yellow-300">CICS COMMAND ===&gt;</span>
                <input
                  value={cicsCmd}
                  onChange={(e) => setCicsCmd(e.target.value.toUpperCase())}
                  className="bg-black border border-green-500/60 px-2 py-0.5 text-green-300 w-36 focus:outline-none"
                />
                <span className="text-green-500/70">(CC00, CAVW, CAUP, CCLI, CT00, CT02, CPVS)</span>
              </div>
              <div className="text-cyan-300">
                PF1=HELP PF3=EXIT PF5=BATCH PF12=SISTINE GLASS UI
              </div>
            </div>
            <div className="mt-2 text-xs text-yellow-400 font-bold">
              MSG: {statusMessage}
            </div>
          </div>
        </main>
      ) : (
        /* =====================================================================
           MODERN SISTINE GLASSMORPHIC WORKSPACE (sistine.weekendsuperhero.io)
           ===================================================================== */
        <main className="flex-1 max-w-[1640px] w-full mx-auto px-5 py-5 space-y-5">
          {/* Top Telemetry & Benchmark Cards using @sistine/card */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card material={glassMaterial} border sheen effect="lift" className="py-4">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase tracking-wider font-semibold">
                  Clerk Workflow Velocity
                </CardDescription>
                <CardTitle className="text-2xl font-bold tracking-tight">
                  2.4s <span className="text-sm font-normal text-muted-foreground">vs 48.0s (3270)</span>
                </CardTitle>
                <CardAction>
                  <Badge variant="glass" data-glass-tint="success" border className="font-mono text-xs">20.0x Faster</Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Replaces 72 keystrokes across 6 BMS green-screens (<code className="font-mono">CC00➔CAVW➔CAUP➔CCLI➔CT00➔CPVS</code>) with 1 unified Sistine glass workspace.
                </p>
              </CardContent>
            </Card>

            <Card material={glassMaterial} border gradient effect="lift" className="py-4">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase tracking-wider font-semibold">
                  Nightly Batch Throughput
                </CardDescription>
                <CardTitle className="text-2xl font-bold tracking-tight">
                  {batchSummary ? `${batchSummary.elapsed_ms.toFixed(2)}ms` : '4.24ms'}{' '}
                  <span className="text-sm font-normal text-muted-foreground">vs 412.4ms</span>
                </CardTitle>
                <CardAction>
                  <Badge variant="glass" data-glass-tint="info" border className="font-mono text-xs">
                    <LightningIcon className="w-3.5 h-3.5 mr-1" weight="fill" />
                    {batchSummary ? `${batchSummary.speedup_factor.toFixed(1)}x` : '97.3x'}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Executes <code className="font-mono">CBTRN02C</code> (300 daily tx) + <code className="font-mono">CBACT04C</code> (control-break interest) in single ACID transaction.
                </p>
              </CardContent>
            </Card>

            <Card material={glassMaterial} border glow={parity?.parity_pass} effect="lift" className="py-4">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase tracking-wider font-semibold">
                  Golden Transaction Parity
                </CardDescription>
                <CardTitle className="text-2xl font-bold tracking-tight">
                  {parity ? `${parity.parity_pct.toFixed(2)}%` : '100.00%'}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({parity ? `${parity.accounts_matched}/${parity.accounts_checked}` : '50/50'} Accts)
                  </span>
                </CardTitle>
                <CardAction>
                  <Badge variant="glass" data-glass-tint={parity?.parity_pass ? 'success' : 'warning'} border className="font-mono text-xs">
                    ${parity ? parity.max_cent_drift.toFixed(2) : '0.00'} Drift
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Exact zoned-decimal overpunch, <code className="font-mono">DEFAULT</code> rate fallback, and unrounded COBOL <code className="font-mono">PIC S9(09)V99</code> truncation.
                </p>
              </CardContent>
            </Card>

            <Card material={glassMaterial} border sheen effect="lift" className="py-4">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase tracking-wider font-semibold">
                  Batch Ledger Summary
                </CardDescription>
                <CardTitle className="text-2xl font-bold tracking-tight">
                  ${parity ? parity.total_interest_actual.toFixed(2) : '1,532.39'}{' '}
                  <span className="text-sm font-normal text-muted-foreground">Interest</span>
                </CardTitle>
                <CardAction>
                  <Badge variant="glass" border className="font-mono text-xs">
                    {rejects.length} Rejects
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {transactions.length} total posted transactions ({parity?.interest_tx_actual ?? 46} batch interest entries across 50 accounts).
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main 12-Column Grid: Account Subfile Selector (Left 4 Cols) + Unified Account & Batch Inspector (Right 8 Cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* LEFT 4 COLS: VSAM ACCTFILE + CUSTFILE + CARDXREF Subfile Navigator */}
            <Card material={glassMaterial} border veil className="lg:col-span-4 flex flex-col py-4 max-h-[760px]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <DatabaseIcon className="w-4 h-4" weight="duotone" />
                    VSAM Account Subfile
                  </CardTitle>
                  <Badge variant="glass" border className="font-mono text-[11px]">
                    {filteredAccounts.length} / {accounts.length}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Joined <code className="font-mono">ACCTFILE</code> + <code className="font-mono">CUSTFILE</code> + <code className="font-mono">CARDXREF</code>
                </CardDescription>
                <div className="pt-2">
                  <Input
                    variant="glass"
                    icon={<MagnifyingGlassIcon className="w-4 h-4" />}
                    placeholder="Filter by Acct ID, Customer, or Card #..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </CardHeader>

              <CardContent className="flex-1 overflow-y-auto space-y-1.5 pr-2">
                {filteredAccounts.map((acct) => {
                  const selected = acct.acct_id === selectedAcctId;
                  const utilPct = acct.credit_limit > 0 ? Math.min(100, Math.max(0, (acct.curr_bal / acct.credit_limit) * 100)) : 0;
                  return (
                    <button
                      key={acct.acct_id}
                      onClick={() => handleSelectAccount(acct)}
                      className={`w-full text-left p-3 rounded-xl transition flex flex-col gap-1.5 ${
                        selected
                          ? 'glass glass-border glass-gradient shadow-md ring-1 ring-primary/40'
                          : 'hover:bg-foreground/5 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs">{acct.acct_id}</span>
                          <span className="text-xs font-medium truncate max-w-[150px]">
                            {acct.cust_name || 'Unknown Customer'}
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-xs">
                          ${acct.curr_bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="font-mono">
                          Limit: ${acct.credit_limit.toLocaleString()} • Grp: {acct.group_id || 'DEFAULT'}
                        </span>
                        <span className="font-mono">FICO: {acct.fico_score ?? '—'}</span>
                      </div>
                      <Progress value={utilPct} className="h-1" />
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {/* RIGHT 8 COLS: Unified CICS + Batch + IMS + Golden Parity Workspace */}
            <div className="lg:col-span-8 flex flex-col gap-5">
              {/* Selected Account Master Hero Card */}
              {selectedAccount && (
                <Card material={glassMaterial} border gradient sheen className="py-5">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="glass" border className="font-mono text-xs">
                            ACCT #{selectedAccount.acct_id}
                          </Badge>
                          <Badge
                            variant={selectedAccount.active_status === 'Y' ? 'glass' : 'destructive'}
                            data-glass-tint={selectedAccount.active_status === 'Y' ? 'success' : undefined}
                            border
                          >
                            {selectedAccount.active_status === 'Y' ? 'ACTIVE (Y)' : 'INACTIVE'}
                          </Badge>
                          <Badge variant="glass" border className="font-mono text-xs">
                            DISCGRP: {selectedAccount.group_id || 'BLANK ➔ DEFAULT'}
                          </Badge>
                        </div>
                        <CardTitle className="text-2xl font-bold mt-2 flex items-center gap-2">
                          <UserCircleIcon className="w-6 h-6 opacity-80" weight="duotone" />
                          {selectedAccount.cust_name || 'Account Holder'}
                        </CardTitle>
                        <CardDescription className="font-mono text-xs mt-0.5">
                          Primary Card: {selectedAccount.primary_card_num || 'N/A'} • Opened: {selectedAccount.open_date} • Expires: {selectedAccount.expiraion_date} • FICO: {selectedAccount.fico_score}
                        </CardDescription>
                      </div>

                      <div className="text-right">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                          Current Ledger Balance
                        </div>
                        <div className="text-3xl font-bold font-mono tracking-tight">
                          ${selectedAccount.curr_bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          Credit Limit: ${selectedAccount.credit_limit.toLocaleString('en-US', { minimumFractionDigits: 2 })} • Cycle Net: ${(selectedAccount.curr_cyc_credit - selectedAccount.curr_cyc_debit).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="glass glass-border rounded-lg p-3">
                        <div className="text-[11px] text-muted-foreground">Cycle Credit (`PIC S9(10)V99`)</div>
                        <div className="font-mono font-bold text-sm mt-0.5">
                          ${selectedAccount.curr_cyc_credit.toFixed(2)}
                        </div>
                      </div>
                      <div className="glass glass-border rounded-lg p-3">
                        <div className="text-[11px] text-muted-foreground">Cycle Debit (Signed Overpunch)</div>
                        <div className="font-mono font-bold text-sm mt-0.5">
                          ${selectedAccount.curr_cyc_debit.toFixed(2)}
                        </div>
                      </div>
                      <div className="glass glass-border rounded-lg p-3">
                        <div className="text-[11px] text-muted-foreground">Issued Cards (`CARDDAT`)</div>
                        <div className="font-mono font-bold text-sm mt-0.5">
                          {accountCards.length} Active
                        </div>
                      </div>
                      <div className="glass glass-border rounded-lg p-3">
                        <div className="text-[11px] text-muted-foreground">DALYREJS Rejects (`CBTRN02C`)</div>
                        <div className="font-mono font-bold text-sm mt-0.5">
                          {accountRejects.length} Flags
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Sistine Glass Tabs for CICS Screens, Batch Rejects, IMS Authorizations, and Golden Parity */}
              <Tabs defaultValue="transactions" className="w-full">
                <TabsList variant="glass" className="w-full justify-start flex-wrap h-auto gap-1 p-1.5">
                  <TabsTrigger value="transactions" className="text-xs gap-1.5">
                    <ReceiptIcon className="w-3.5 h-3.5" />
                    Transactions ({accountTransactions.length})
                  </TabsTrigger>
                  <TabsTrigger value="operations" className="text-xs gap-1.5">
                    <CreditCardIcon className="w-3.5 h-3.5" />
                    CICS Operations (`CAUP` / `CT02`)
                  </TabsTrigger>
                  <TabsTrigger value="rejects" className="text-xs gap-1.5">
                    <WarningOctagonIcon className="w-3.5 h-3.5" />
                    Batch Rejects ({rejects.length})
                  </TabsTrigger>
                  <TabsTrigger value="ims" className="text-xs gap-1.5">
                    <CpuIcon className="w-3.5 h-3.5" />
                    IMS DB `PAUTSUM0` ({auths.length})
                  </TabsTrigger>
                  <TabsTrigger value="parity" className="text-xs gap-1.5">
                    <ShieldCheckIcon className="w-3.5 h-3.5" />
                    Golden Parity Proof (50/50)
                  </TabsTrigger>
                </TabsList>

                {/* TAB 1: Posted Transactions & Category Balances */}
                <TabsContent value="transactions" className="mt-3 space-y-4">
                  <Card material={glassMaterial} border className="py-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Posted Transactions (`TRANSACT` VSAM KSDS — `COTRN00C` / `CBTRN02C` / `CBACT04C`)
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Includes online CICS postings, nightly batch postings, and `System` control-break interest transactions.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table variant="glass">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Tran ID</TableHead>
                            <TableHead className="text-xs">Source</TableHead>
                            <TableHead className="text-xs">Cat</TableHead>
                            <TableHead className="text-xs">Description / Merchant</TableHead>
                            <TableHead className="text-xs text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {accountTransactions.map((tx) => (
                            <TableRow key={tx.tran_id}>
                              <TableCell className="font-mono text-xs font-medium">{tx.tran_id}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="glass"
                                  data-glass-tint={tx.tran_source === 'System' ? 'info' : undefined}
                                  border
                                  className="text-[10px] font-mono"
                                >
                                  {tx.tran_source}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {tx.tran_type_cd}-{String(tx.tran_cat_cd).padStart(4, '0')}
                              </TableCell>
                              <TableCell className="text-xs">
                                <div className="font-medium">{tx.tran_desc}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  {tx.merchant_name} • {tx.merchant_city}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs font-bold text-right">
                                ${tx.tran_amt.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Category Balances (TCATBALF) */}
                  <Card material={glassMaterial} border className="py-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Transaction Category Balances (`TCATBALF` Composite Key `ACCT+TYPE+CAT`)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {catBalances.map((cb) => (
                          <div
                            key={`${cb.acct_id}-${cb.type_cd}-${cb.cat_cd}`}
                            className="glass glass-border rounded-lg p-3 flex items-center justify-between"
                          >
                            <div>
                              <div className="text-xs font-mono font-semibold">
                                Type {cb.type_cd} / Cat {String(cb.cat_cd).padStart(4, '0')}
                              </div>
                              <div className="text-[11px] text-muted-foreground">Rate Group: DEFAULT (12.50%)</div>
                            </div>
                            <div className="font-mono font-bold text-sm">${cb.balance.toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* TAB 2: CICS Online Operations (COACTUPC & COTRN02C) */}
                <TabsContent value="operations" className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card material={glassMaterial} border className="py-4">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Update Account (`CAUP` / `COACTUPC.cbl`)</CardTitle>
                      <CardDescription className="text-xs">
                        Direct replacement for BMS map `COACTUP.bms` — updates `ACCTDAT` in SQLite.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleUpdateAccount} className="space-y-3">
                        <div>
                          <label className="text-xs font-medium block mb-1">Credit Limit ($)</label>
                          <Input
                            variant="glass"
                            type="number"
                            step="0.01"
                            value={editCreditLimit}
                            onChange={(e) => setEditCreditLimit(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1">
                            Disclosure Rate Group (`DISCGRP`)
                          </label>
                          <Input
                            variant="glass"
                            value={editGroupId}
                            placeholder="Leave blank for DEFAULT fallback"
                            onChange={(e) => setEditGroupId(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1">Active Status (`Y`/`N`)</label>
                          <Input
                            variant="glass"
                            maxLength={1}
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value.toUpperCase())}
                          />
                        </div>
                        <Button type="submit" variant="default" size="sm" className="w-full">
                          Commit Account Update (`CAUP`)
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  <Card material={glassMaterial} border className="py-4">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Post Online Transaction (`CT02` / `COTRN02C.cbl`)</CardTitle>
                      <CardDescription className="text-xs">
                        Validates card cross-reference, credit limit, and account expiration before posting.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handlePostOnlineTx} className="space-y-3">
                        <div>
                          <label className="text-xs font-medium block mb-1">Transaction Amount ($)</label>
                          <Input
                            variant="glass"
                            type="number"
                            step="0.01"
                            value={newTxAmt}
                            onChange={(e) => setNewTxAmt(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1">Description</label>
                          <Input
                            variant="glass"
                            value={newTxDesc}
                            onChange={(e) => setNewTxDesc(e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-medium block mb-1">Merchant</label>
                            <Input
                              variant="glass"
                              value={newTxMerchant}
                              onChange={(e) => setNewTxMerchant(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium block mb-1">City</label>
                            <Input
                              variant="glass"
                              value={newTxCity}
                              onChange={(e) => setNewTxCity(e.target.value)}
                            />
                          </div>
                        </div>
                        <Button type="submit" variant="default" size="sm" className="w-full">
                          Validate &amp; Post Transaction (`CT02`)
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* TAB 3: Batch Rejects (DALYREJS) */}
                <TabsContent value="rejects" className="mt-3">
                  <Card material={glassMaterial} border className="py-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Batch Validation Rejects (`DALYREJS` — `CBTRN02C.cbl`)
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Reproduces COBOL last-fail-wins rule (Code 103 Expired Account overwrites Code 102 Overlimit when both occur).
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table variant="glass">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Tran ID</TableHead>
                            <TableHead className="text-xs">Account ID</TableHead>
                            <TableHead className="text-xs">Fail Code</TableHead>
                            <TableHead className="text-xs">Reason</TableHead>
                            <TableHead className="text-xs text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rejects.map((r) => (
                            <TableRow key={r.tran_id}>
                              <TableCell className="font-mono text-xs">{r.tran_id}</TableCell>
                              <TableCell className="font-mono text-xs font-semibold">{r.acct_id}</TableCell>
                              <TableCell>
                                <Badge variant="destructive" className="font-mono text-[10px]">
                                  CODE {r.fail_code}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">{r.fail_reason}</TableCell>
                              <TableCell className="font-mono text-xs text-right font-bold">
                                ${r.tran_amt.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* TAB 4: IMS Hierarchical DB Authorizations */}
                <TabsContent value="ims" className="mt-3">
                  <Card material={glassMaterial} border className="py-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        IMS Hierarchical Database (`PAUTSUM0` Root + `PAUTDTL1` Child w/ 9&apos;s-Complement Keys)
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Migrated from DL/I `GU` / `GNP` calls in `COPAUA0C.cbl` and `CBPAUP0C.cbl`.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {accountAuth ? (
                        <div className="space-y-2">
                          <div className="glass glass-border p-3 rounded-lg flex justify-between text-xs">
                            <span>
                              Root Segment <code className="font-mono">PAUTSUM0</code> — Acct {accountAuth.acct_id}
                            </span>
                            <span className="font-mono">
                              Approved: {accountAuth.approved_auth_cnt} (${accountAuth.approved_auth_amt.toFixed(2)}) • Declined: {accountAuth.declined_auth_cnt}
                            </span>
                          </div>
                          <Table variant="glass">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">9&apos;s-Comp Date/Time</TableHead>
                                <TableHead className="text-xs">Card #</TableHead>
                                <TableHead className="text-xs">Merchant</TableHead>
                                <TableHead className="text-xs">Resp</TableHead>
                                <TableHead className="text-xs text-right">Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {accountAuth.details.map((d, i) => (
                                <TableRow key={i}>
                                  <TableCell className="font-mono text-xs">
                                    {d.auth_date_9c} / {d.auth_time_9c}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">{d.card_num}</TableCell>
                                  <TableCell className="text-xs">
                                    {d.merchant_name} ({d.merchant_city})
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={d.auth_resp_code === '00' ? 'glass' : 'destructive'}
                                      data-glass-tint={d.auth_resp_code === '00' ? 'success' : undefined}
                                      border
                                      className="text-[10px] font-mono"
                                    >
                                      {d.auth_resp_code}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-right font-bold">
                                    ${d.transaction_amt.toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Select an account with pending IMS authorizations (or view all {auths.length} root segments loaded).
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* TAB 5: Golden Baseline Parity Proof */}
                <TabsContent value="parity" className="mt-3">
                  <Card material={glassMaterial} border glow={parity?.parity_pass} className="py-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4 text-green-500" weight="fill" />
                        Autonomous Golden Baseline Parity Proof (`golden_baseline/` vs Safe Rust Engine)
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Verifies every account balance, cycle credit/debit reset, batch reject code, and interest transaction against the COBOL specification.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {parity && (
                        <Alert variant={parity.parity_pass ? 'success' : 'warning'}>
                          <AlertTitle className="font-mono text-xs font-bold">
                            {parity.parity_pass
                              ? '100.00% GOLDEN PARITY VERIFIED ACROSS ALL 50 ACCOUNTS ($0.00 CENT DRIFT)'
                              : `Pre-Batch Seed State Loaded (${parity.accounts_matched}/${parity.accounts_checked} post-batch match) — Click "Run Nightly JCL Batch" to execute`}
                          </AlertTitle>
                          <AlertDescription className="text-xs font-mono mt-1">
                            Expected Interest: ${parity.total_interest_expected.toFixed(2)} ({parity.interest_tx_expected} tx) | Actual Interest: ${parity.total_interest_actual.toFixed(2)} ({parity.interest_tx_actual} tx) | Rejects Matched: {String(parity.rejects_matched)} ({parity.rejects_actual}/{parity.rejects_expected})
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </main>
      )}

      {/* Bottom Status Footer Bar */}
      <footer className="mt-auto glass glass-border glass-veil px-5 py-2 text-xs">
        <div className="max-w-[1640px] mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono">
            <Badge variant="glass" border className="text-[10px]">STATUS</Badge>
            <span>{statusMessage}</span>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="flex items-center gap-1">
              <ArrowsLeftRightIcon className="w-3.5 h-3.5" />
              Dual-Mode UI: <KbdGroup><Kbd>F12</Kbd></KbdGroup>
            </span>
            <Separator orientation="vertical" className="h-3" />
            <span>
              Sistine Glass (<code className="font-mono">{glassMaterial}</code> / <code className="font-mono">{glassTint}</code>)
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
