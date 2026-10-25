import snapshot from './worker-snapshot.json';

// Deep clone mutable state per Worker isolate
let state = JSON.parse(JSON.stringify(snapshot));

const POS_OVERPUNCH = ['{', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const NEG_OVERPUNCH = ['}', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'];

function formatOverpunch(val, totalDigits = 12) {
  const num = Number.isFinite(Number(val)) ? Number(val) : 0;
  const cents = Math.round(Math.abs(num) * 100);
  const padded = String(cents).padStart(totalDigits, '0').slice(-totalDigits);
  const lastDigit = Number(padded[padded.length - 1]) || 0;
  const overChar = num < 0 ? NEG_OVERPUNCH[lastDigit] : POS_OVERPUNCH[lastDigit];
  return padded.slice(0, -1) + overChar;
}

function buildVsamPreview(a) {
  const id = String(a.acct_id || '00000000001').padEnd(11, ' ').slice(0, 11);
  const st = String(a.active_status || 'Y').slice(0, 1);
  const curr = formatOverpunch(a.curr_bal, 12);
  const lim = formatOverpunch(a.credit_limit, 12);
  const cash = formatOverpunch(a.cash_credit_limit, 12);
  const open = String(a.open_date || '2014-11-20').padEnd(10, ' ').slice(0, 10);
  const exp = String(a.expiration_date || '2025-05-20').padEnd(10, ' ').slice(0, 10);
  const reis = String(a.reissue_date || '2025-05-20').padEnd(10, ' ').slice(0, 10);
  const cycC = formatOverpunch(a.curr_cyc_credit || '0.00', 12);
  const cycD = formatOverpunch(a.curr_cyc_debit || '0.00', 12);
  const zip = String(a.addr_zip || 'A000000000').padEnd(10, ' ').slice(0, 10);
  const grp = String(a.group_id || '').trim();
  return `${id}${st}${curr}${lim}${cash}${open}${exp}${reis}${cycC}${cycD}${zip}${grp}`;
}

function executeBillPayState(acctId, confirm = 'Y') {
  const acct = state.accounts.find((a) => a.acct_id === acctId);
  const detail = state.details[acctId];
  if (!acct || !detail) {
    return {
      ok: false,
      prev: '0.00',
      next: '0.00',
      tranId: null,
      message: `Account ID ${acctId} not found in ACCTDATA`,
    };
  }
  const prevNum = parseFloat(acct.curr_bal || '0');
  const prev = prevNum.toFixed(2);
  if (prevNum <= 0) {
    return {
      ok: true,
      prev,
      next: prev,
      tranId: null,
      message: 'You have nothing to pay...',
    };
  }
  if (String(confirm).trim().toUpperCase() !== 'Y') {
    return {
      ok: true,
      prev,
      next: prev,
      tranId: null,
      message: 'Confirm to make a bill payment...',
    };
  }
  const tranId = `20261025${String(Date.now()).slice(-8)}`;
  const nowTs = new Date().toISOString().replace('T', '-').slice(0, 26);
  acct.curr_bal = '0.00';
  acct.curr_bal_overpunch = formatOverpunch(0, 12);
  detail.account.curr_bal = '0.00';
  detail.account.curr_bal_overpunch = acct.curr_bal_overpunch;
  detail.account.vsam_fixed_width_preview = buildVsamPreview(detail.account);
  detail.transactions.unshift({
    tran_id: tranId,
    type_cd: '02',
    cat_cd: '0002',
    source: 'POS TERM',
    description: 'BILL PAYMENT - ONLINE',
    amt: prev,
    merchant_name: 'BILL PAYMENT',
    orig_ts: nowTs,
  });
  return {
    ok: true,
    prev,
    next: '0.00',
    tranId,
    message: `Payment successful. Transaction ID: ${tranId} (Paid $${prev})`,
  };
}

function renderDynamicTerminal(reqBody) {
  let tran = String(reqBody.tran_id || 'CAVW').trim().toUpperCase();
  const aid = String(reqBody.aid_key || 'ENTER').trim().toUpperCase();
  const inputs = reqBody.inputs || {};

  if (aid === 'PF3' && tran !== 'CC00' && tran !== 'CM00') {
    tran = 'CM00';
  }
  if (aid === 'CLEAR') {
    tran = 'CC00';
  }

  if (tran === 'CM00') {
    const opt = String(inputs.OPTION || '').trim();
    if (aid === 'ENTER' && opt) {
      const mapOpt = {
        '1': 'CAVW', '01': 'CAVW',
        '2': 'CAUP', '02': 'CAUP',
        '3': 'CCLI', '03': 'CCLI',
        '4': 'CT00', '04': 'CT00',
        '5': 'CBIL', '05': 'CBIL',
        '6': 'CTLI', '06': 'CTLI',
        '7': 'CPVS', '07': 'CPVS',
      };
      if (mapOpt[opt]) {
        tran = mapOpt[opt];
      }
    }
  }

  if (tran === 'CC00') {
    return state.screens['CC00'];
  }

  if (tran === 'CM00') {
    const msg = aid === 'PF3' ? 'RETURNED TO MAIN MENU VIA PF3' : 'SELECT AN OPTION (01-07) OR ENTER TRAN ID';
    return {
      tran_id: 'CM00',
      program_name: 'COMEN01C',
      mapset_name: 'COMEN01',
      map_name: 'COMEN1A',
      title_line_1: 'AWS MAINFRAME MODERNIZATION - CARDDEMO',
      title_line_2: 'MAIN MENU (COMEN01)',
      lines: [
        'TRAN: CM00      AWS MAINFRAME MODERNIZATION - CARDDEMO        DATE: 10/25/26',
        'PROG: COMEN01C                MAIN MENU                       MAP : COMEN01 ',
        '--------------------------------------------------------------------------------',
        '                                                                                ',
        '    01. ACCOUNT VIEW               (CAVW / COACTVWC - VSAM ACCTDATA + CUSTDATA) ',
        '    02. ACCOUNT UPDATE             (CAUP / COACTUPC - VSAM ACCTDATA REWRITE)    ',
        '    03. CREDIT CARD LIST & DETAIL  (CCLI / COCRDLIC - VSAM CARDDATA + CARDAIX)  ',
        '    04. TRANSACTION LEDGER & ADD   (CT00 / COTRN00C - VSAM TRANSACT KSDS)       ',
        '    05. ONLINE BILL PAYMENT        (CBIL / COBIL00C - FULL BALANCE SETTLEMENT)  ',
        '    06. DB2 TRANSACTION TYPES      (CTLI / COTRTLIC - DB2 CURSOR + SQLCODE)     ',
        '    07. IMS PENDING AUTH & FRAUD   (CPVS / COPAUS0C - IMS PAUTSUM0 + AUTHFRDS)  ',
        '                                                                                ',
        '        PLEASE SELECT AN OPTION : [01]                                          ',
        '                                                                                ',
        `MESSAGE: ${msg}`.padEnd(80, ' '),
        'ENTER=CONTINUE   PF3=SIGN OFF',
      ],
      fields: [
        { id: 'OPTION', label: 'Menu Option (01-07)', row: 13, col: 35, length: 2, value: '01', editable: true, color: 'green' },
      ],
      status_message: msg,
      sqlcode: null,
      pf_keys: 'ENTER=Select  PF3=Sign-off',
    };
  }

  if (tran === 'CADM') {
    const msg = 'CARDDEMO ADMIN MENU (COADM01C)';
    return {
      tran_id: 'CADM',
      program_name: 'COADM01C',
      mapset_name: 'COADM01',
      map_name: 'COADM1A',
      title_line_1: 'AWS MAINFRAME MODERNIZATION - CARDDEMO',
      title_line_2: 'ADMINISTRATION MENU (COADM01)',
      lines: [
        'TRAN: CADM      AWS MAINFRAME MODERNIZATION - CARDDEMO        DATE: 10/25/26',
        'PROG: COADM01C              ADMINISTRATION MENU               MAP : COADM01 ',
        '--------------------------------------------------------------------------------',
        '    01. USER SECURITY LIST   (CU00 / COUSR00C - USRSEC VSAM KSDS)               ',
        '    02. DB2 TRAN TYPE MAINT  (CTLI / COTRTLIC - CARDDEMO.TRANSACTION_TYPE)      ',
        '    03. DB2 TRAN TYPE UPDATE (CTTU / COTRTUPC - SQLCODE -803 / -532 / +100)     ',
        '    04. IMS FRAUD SUMMARY    (CPVS / COPAUS0C - DBPAUTP0 + DB2 AUTHFRDS)        ',
        '                                                                                ',
        `MESSAGE: ${msg}`.padEnd(80, ' '),
        'ENTER=SELECT   PF3=SIGN OFF',
      ],
      fields: [
        { id: 'OPTION', label: 'Admin Option', row: 8, col: 35, length: 2, value: '02', editable: true, color: 'turquoise' },
      ],
      status_message: msg,
      sqlcode: null,
      pf_keys: 'ENTER=Select  PF3=Return',
    };
  }

  const acctId = String(inputs.ACCTID || '00000000001').trim() || '00000000001';
  const detail = state.details[acctId] || state.details['00000000001'];
  const a = detail.account;
  const c = a.customer || {};

  if (tran === 'CAUP') {
    let msg = `READY TO UPDATE ACCOUNT ${a.acct_id} (PRESS PF5 TO SAVE)`;
    if (aid === 'PF5' && inputs.CREDLIM) {
      const lim = (parseFloat(inputs.CREDLIM) || 0).toFixed(2);
      const actStat = String(inputs.ACTSTAT || a.active_status || 'Y').trim().toUpperCase();
      a.credit_limit = lim;
      a.active_status = actStat;
      a.vsam_fixed_width_preview = buildVsamPreview(a);
      const summary = state.accounts.find((x) => x.acct_id === a.acct_id);
      if (summary) {
        summary.credit_limit = lim;
        summary.active_status = actStat;
      }
      msg = `CHANGES TO ACCOUNT ${a.acct_id} SAVED TO VSAM ACCTDATA (LIMIT=$${lim})`;
    }
    return {
      tran_id: 'CAUP',
      program_name: 'COACTUPC',
      mapset_name: 'COACTUP',
      map_name: 'CACTUPA',
      title_line_1: 'AWS MAINFRAME MODERNIZATION - CARDDEMO',
      title_line_2: 'UPDATE ACCOUNT (COACTUP)',
      lines: [
        'TRAN: CAUP      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COACTUP ',
        'PROG: COACTUPC                UPDATE ACCOUNT                  CICS: ENABLED ',
        '--------------------------------------------------------------------------------',
        `  ACCOUNT ID     : [${a.acct_id}]     ACTIVE STATUS : [${a.active_status}]`,
        `  CURRENT BAL    : ${String(a.curr_bal).padStart(12, ' ')}`,
        `  CREDIT LIMIT   : [${a.credit_limit}]    CASH LIMIT    : ${String(a.cash_credit_limit).padStart(12, ' ')}`,
        '--------------------------------------------------------------------------------',
        `MESSAGE: ${msg}`.padEnd(80, ' '),
        'ENTER=READ ACCOUNT   PF5=SAVE CHANGES   PF3=MAIN MENU',
      ],
      fields: [
        { id: 'ACCTID', label: 'Account ID', row: 4, col: 20, length: 11, value: a.acct_id, editable: true, color: 'green' },
        { id: 'ACTSTAT', label: 'Active Status (Y/N)', row: 4, col: 53, length: 1, value: a.active_status, editable: true, color: 'turquoise' },
        { id: 'CREDLIM', label: 'Credit Limit', row: 6, col: 20, length: 12, value: a.credit_limit, editable: true, color: 'turquoise' },
      ],
      status_message: msg,
      sqlcode: null,
      pf_keys: 'ENTER=Fetch  PF5=Commit Update  PF3=Main Menu',
    };
  }

  if (tran === 'CCLI' || tran === 'CCDL' || tran === 'CCUP') {
    const filterAcct = String(inputs.ACCTID || '').trim();
    const list = filterAcct
      ? state.accounts.filter((x) => x.acct_id === filterAcct)
      : state.accounts.slice(0, 10);
    const lines = [
      'TRAN: CCLI      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COCRDLI ',
      'PROG: COCRDLIC               CREDIT CARD LIST                 AIX : CARDAIX ',
      `  FILTER BY ACCOUNT ID (CARDAIX): [${filterAcct.padEnd(11, ' ')}]`,
      '--------------------------------------------------------------------------------',
      '  ACCOUNT ID    CARD NUMBER        EMBOSSED NAME            EXPIRY      STATUS  ',
      '--------------------------------------------------------------------------------',
    ];
    for (const row of list) {
      lines.push(
        `  ${row.acct_id.padEnd(11, ' ')}   ${String(row.card_num).padEnd(16, ' ')}   ${String(row.customer_name).slice(0, 22).padEnd(22, ' ')}   ${String(row.expiration_date).padEnd(10, ' ')}    ${row.active_status}`
      );
    }
    const msg = `DISPLAYING ${list.length} CARDS VIA VSAM KSDS / CARDAIX ALTERNATE INDEX`;
    lines.push('--------------------------------------------------------------------------------');
    lines.push(`MESSAGE: ${msg}`.padEnd(80, ' '));
    lines.push('ENTER=FILTER BY ACCT   PF3=MAIN MENU   PF7=PREV   PF8=NEXT');
    return {
      tran_id: 'CCLI',
      program_name: 'COCRDLIC',
      mapset_name: 'COCRDLI',
      map_name: 'CCRDLIA',
      title_line_1: 'AWS MAINFRAME MODERNIZATION - CARDDEMO',
      title_line_2: 'CREDIT CARD LIST (COCRDLI)',
      lines,
      fields: [
        { id: 'ACCTID', label: 'Filter by Account ID (optional)', row: 3, col: 36, length: 11, value: filterAcct, editable: true, color: 'green' },
      ],
      status_message: msg,
      sqlcode: null,
      pf_keys: 'ENTER=Filter  PF3=Main Menu  PF7/PF8=Page',
    };
  }

  if (tran === 'CT00' || tran === 'CT01' || tran === 'CT02') {
    const txs = (detail.transactions || []).slice(0, 10);
    const lines = [
      'TRAN: CT00      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COTRN00 ',
      'PROG: COTRN00C             LIST TRANSACTIONS                  VSAM: TRANSACT',
      `  FILTER ACCOUNT : [${a.acct_id}]`,
      '--------------------------------------------------------------------------------',
      '  TRANSACTION ID     ACCT ID       TP/CAT   AMOUNT        DESCRIPTION           ',
      '--------------------------------------------------------------------------------',
    ];
    for (const t of txs) {
      lines.push(
        `  ${String(t.tran_id).padEnd(16, ' ')}   ${a.acct_id}   ${t.type_cd}/${t.cat_cd}   ${String(t.amt).padStart(10, ' ')}   ${String(t.description).slice(0, 22).padEnd(22, ' ')}`
      );
    }
    const msg = `SHOWING ${txs.length} POSTED TRANSACTIONS FROM TRANSACT KSDS`;
    lines.push('--------------------------------------------------------------------------------');
    lines.push(`MESSAGE: ${msg}`.padEnd(80, ' '));
    return {
      tran_id: 'CT00',
      program_name: 'COTRN00C',
      mapset_name: 'COTRN00',
      map_name: 'COTRN0A',
      title_line_1: 'AWS MAINFRAME MODERNIZATION - CARDDEMO',
      title_line_2: 'LIST TRANSACTIONS (COTRN00)',
      lines,
      fields: [
        { id: 'ACCTID', label: 'Filter Account ID', row: 3, col: 20, length: 11, value: a.acct_id, editable: true, color: 'green' },
      ],
      status_message: msg,
      sqlcode: null,
      pf_keys: 'ENTER=Filter  PF3=Main Menu  PF7/PF8=Scroll',
    };
  }

  if (tran === 'CBIL') {
    const confirm = String(inputs.CONFIRM || 'N').trim().toUpperCase();
    const res = executeBillPayState(a.acct_id, confirm);
    const lines = [
      'TRAN: CBIL      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COBIL00 ',
      'PROG: COBIL00C               ONLINE BILL PAYMENT              VSAM: CXACAIX ',
      '--------------------------------------------------------------------------------',
      `  ENTER ACCOUNT ID : [${a.acct_id}]`,
      '--------------------------------------------------------------------------------',
      `  YOUR CURRENT BALANCE IS : $${String(a.curr_bal).padStart(12, ' ')}`,
      '                                                                                ',
      `  DO YOU WANT TO PAY YOUR BALANCE NOW? [${confirm}] (Y/N)`,
      `  GENERATED PAYMENT TRAN ID : ${res.tranId || '(NONE)'}`,
      '--------------------------------------------------------------------------------',
      `MESSAGE: ${res.message}`.padEnd(80, ' '),
      'ENTER=PROCESS BILL PAY   PF3=MAIN MENU   PF4=CLEAR',
    ];
    return {
      tran_id: 'CBIL',
      program_name: 'COBIL00C',
      mapset_name: 'COBIL00',
      map_name: 'COBIL0A',
      title_line_1: 'AWS MAINFRAME MODERNIZATION - CARDDEMO',
      title_line_2: 'ONLINE BILL PAYMENT (COBIL00)',
      lines,
      fields: [
        { id: 'ACCTID', label: 'Account ID (11 digits)', row: 4, col: 22, length: 11, value: a.acct_id, editable: true, color: 'green' },
        { id: 'CONFIRM', label: 'Confirm Full Balance Payment (Y/N)', row: 8, col: 41, length: 1, value: 'N', editable: true, color: 'yellow' },
      ],
      status_message: res.message,
      sqlcode: null,
      pf_keys: 'ENTER=Submit Payment  PF3=Main Menu',
    };
  }

  if (tran === 'CTLI' || tran === 'CTTU') {
    let sqlcode = 0;
    let msg = 'DB2 CURSOR FETCH COMPLETE (SQLCODE = 0, PLAN = CARDDEMO)';
    const act = String(inputs.ACTION || '').trim().toUpperCase();
    const trType = String(inputs.TRTYPE || '').trim();
    const trDesc = String(inputs.TRDESC || '').trim();
    if (act === 'A' && trType) {
      if (state.db2.transaction_types.some((t) => t.tr_type === trType)) {
        sqlcode = -803;
        msg = 'RECORD ALREADY EXISTS IN CARDDEMO.TRANSACTION_TYPE (SQLCODE = -803)';
      } else {
        state.db2.transaction_types.push({ tr_type: trType, tr_description: trDesc });
        msg = `DB2 INSERT SUCCESSFUL FOR TR_TYPE=${trType} (SQLCODE = 0)`;
      }
    } else if (act === 'U' && trType) {
      const found = state.db2.transaction_types.find((t) => t.tr_type === trType);
      if (found) {
        found.tr_description = trDesc;
        msg = `DB2 UPDATE COMMITTED FOR TR_TYPE=${trType} (SQLCODE = 0)`;
      } else {
        sqlcode = 100;
        msg = 'RECORD NOT FOUND FOR UPDATE (SQLCODE = +100)';
      }
    } else if (act === 'D' && trType) {
      const hasChild = state.db2.transaction_categories.some((c) => c.trc_type_code === trType);
      if (hasChild) {
        sqlcode = -532;
        msg = 'CANNOT DELETE: CHILD ROWS EXIST IN TRANSACTION_TYPE_CATEGORY (SQLCODE = -532)';
      } else {
        state.db2.transaction_types = state.db2.transaction_types.filter((t) => t.tr_type !== trType);
        msg = `DB2 DELETE COMMITTED FOR TR_TYPE=${trType} (SQLCODE = 0)`;
      }
    }
    const lines = [
      'TRAN: CTLI      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COTRTLI ',
      'PROG: COTRTLIC        DB2 TRANSACTION TYPE MAINTENANCE        DB2 : CARDDEMO',
      '--------------------------------------------------------------------------------',
      '  TR_TYPE   TR_DESCRIPTION (CARDDEMO.TRANSACTION_TYPE)                          ',
      '--------------------------------------------------------------------------------',
      ...state.db2.transaction_types.map((t) => `    ${String(t.tr_type).padEnd(2, ' ')}      ${String(t.tr_description).padEnd(50, ' ')}`),
      '--------------------------------------------------------------------------------',
      '  MAINT ACTION [ ] (A=ADD, U=UPDATE, D=DELETE)  CODE: [  ]  DESC: [            ]',
      `MESSAGE: ${msg}`.padEnd(80, ' '),
    ];
    return {
      tran_id: 'CTLI',
      program_name: 'COTRTLIC',
      mapset_name: 'COTRTLI',
      map_name: 'COTRTLA',
      title_line_1: 'AWS MAINFRAME MODERNIZATION - CARDDEMO',
      title_line_2: 'DB2 TRANSACTION TYPE MAINT (COTRTLI)',
      lines,
      fields: [
        { id: 'ACTION', label: 'Action (A=Add, U=Update, D=Delete)', row: 14, col: 16, length: 1, value: '', editable: true, color: 'yellow' },
        { id: 'TRTYPE', label: 'DB2 TR_TYPE (2 chars)', row: 14, col: 55, length: 2, value: trType || '08', editable: true, color: 'green' },
        { id: 'TRDESC', label: 'DB2 TR_DESCRIPTION', row: 14, col: 67, length: 30, value: trDesc || 'Instant Wire Transfer', editable: true, color: 'green' },
      ],
      status_message: msg,
      sqlcode,
      pf_keys: 'ENTER=Execute SQL  PF3=Main Menu  PF7/PF8=Cursor Fetch',
    };
  }

  if (tran === 'CPVS' || tran === 'CPVD' || tran === 'CP00') {
    const details = state.ims.details.filter((d) => d.acct_id === a.acct_id);
    const lines = [
      'TRAN: CPVS      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COPAU00 ',
      'PROG: COPAUS0C       IMS PENDING AUTHORIZATION SUMMARY        DBD : DBPAUTP0',
      `  ACCOUNT ID (PAUTSUM0 ROOT KEY) : [${a.acct_id}]`,
      '--------------------------------------------------------------------------------',
      `  CUST ID: ${c.cust_id || '000000001'}   STATUS: A   CREDIT LIMIT: $${a.credit_limit}   AUTH BAL: $${a.curr_bal}`,
      '--------------------------------------------------------------------------------',
      '  9C-DATE/TIME     CARD NUM           AMOUNT     RESP  MERCHANT            FRAUD',
      ...details.map(
        (d) =>
          `  ${d.auth_date_9c}/${d.auth_time_9c}  ${d.card_num}  ${String(d.transaction_amt).padStart(9, ' ')}    ${d.auth_resp_code}   ${String(d.merchant_name).slice(0, 18).padEnd(18, ' ')}   ${d.auth_fraud}`
      ),
      '--------------------------------------------------------------------------------',
    ];
    const msg = `IMS HIDAM GU/GN COMPLETE (${details.length} CHILD SEGMENTS IN PAUTDTL1)`;
    lines.push(`MESSAGE: ${msg}`.padEnd(80, ' '));
    return {
      tran_id: 'CPVS',
      program_name: 'COPAUS0C',
      mapset_name: 'COPAU00',
      map_name: 'COPAU0A',
      title_line_1: 'AWS MAINFRAME MODERNIZATION - CARDDEMO',
      title_line_2: 'IMS PENDING AUTHORIZATIONS (COPAU00)',
      lines,
      fields: [
        { id: 'ACCTID', label: 'IMS Root Segment Account ID', row: 3, col: 36, length: 11, value: a.acct_id, editable: true, color: 'green' },
      ],
      status_message: msg,
      sqlcode: 0,
      pf_keys: 'ENTER=IMS DLI GU  PF3=Main Menu  PF5=Flag Fraud to DB2 AUTHFRDS',
    };
  }

  // Default: CAVW (COACTVWC)
  const grp = a.group_id ? a.group_id : 'DEFAULT (FALLBACK)';
  const statusMsg = `DISPLAYING ACCOUNT ${a.acct_id} AND CUSTOMER ${c.cust_id || '000000001'}`;
  return {
    tran_id: 'CAVW',
    program_name: 'COACTVWC',
    mapset_name: 'COACTVW',
    map_name: 'CACTVWA',
    title_line_1: 'AWS MAINFRAME MODERNIZATION - CARDDEMO',
    title_line_2: 'VIEW ACCOUNT (COACTVW)',
    lines: [
      'TRAN: CAVW      AWS MAINFRAME MODERNIZATION - CARDDEMO        MAP : COACTVW ',
      'PROG: COACTVWC                 VIEW ACCOUNT                   CICS: ENABLED ',
      '--------------------------------------------------------------------------------',
      `  ACCOUNT NUMBER : [${a.acct_id}]     ACTIVE STATUS : ${a.active_status}     GROUP: ${grp}`,
      `  OPENED DATE    : ${String(a.open_date).padEnd(12, ' ')}      EXPIRY DATE   : ${String(a.expiration_date).padEnd(12, ' ')}`,
      `  REISSUE DATE   : ${String(a.reissue_date).padEnd(12, ' ')}      PRIMARY CARD  : ${String(a.card_num).padEnd(16, ' ')}`,
      `  CREDIT LIMIT   : ${String(a.credit_limit).padStart(12, ' ')}      CASH LIMIT    : ${String(a.cash_credit_limit).padStart(12, ' ')}`,
      `  CURRENT BAL    : ${String(a.curr_bal).padStart(12, ' ')}      CYCLE CREDIT  : ${String(a.curr_cyc_credit).padStart(12, ' ')}`,
      `  CYCLE DEBIT    : ${String(a.curr_cyc_debit).padStart(12, ' ')}`,
      '--------------------------------------------------------------------------------',
      `  CUSTOMER ID    : ${String(c.cust_id || '').padEnd(12, ' ')}      SSN           : ${c.ssn || ''}    FICO : ${c.fico_score || 0}`,
      `  NAME           : ${c.first_name || ''} ${c.middle_name || ''} ${c.last_name || ''}`,
      `  ADDRESS        : ${c.address || ''}`,
      `  PHONE 1        : ${c.phone || ''}`,
      '--------------------------------------------------------------------------------',
      `MESSAGE: ${statusMsg}`.padEnd(80, ' '),
      'ENTER=FETCH ACCOUNT   PF3=MAIN MENU',
    ],
    fields: [
      { id: 'ACCTID', label: 'Account Number (11 digits)', row: 4, col: 20, length: 11, value: a.acct_id, editable: true, color: 'green' },
    ],
    status_message: statusMsg,
    sqlcode: null,
    pf_keys: 'ENTER=Lookup Account  PF3=Main Menu',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (pathname === '/api/overview' && request.method === 'GET') {
      return jsonResponse(state.overview);
    }

    if (pathname === '/api/accounts' && request.method === 'GET') {
      return jsonResponse(state.accounts);
    }

    if (pathname.startsWith('/api/accounts/')) {
      const parts = pathname.split('/').filter(Boolean);
      const acctId = parts[2];
      const subAction = parts[3];

      if (!subAction && request.method === 'GET') {
        const detail = state.details[acctId] || state.details['00000000001'];
        return jsonResponse(detail);
      }

      if (!subAction && request.method === 'PUT') {
        const body = await request.json();
        const lim = parseFloat(body.credit_limit || '0').toFixed(2);
        const active = String(body.active_status || 'Y').trim().toUpperCase();
        const acct = state.accounts.find((a) => a.acct_id === acctId);
        if (acct) {
          acct.credit_limit = lim;
          acct.active_status = active;
        }
        if (state.details[acctId]) {
          state.details[acctId].account.credit_limit = lim;
          state.details[acctId].account.active_status = active;
          state.details[acctId].account.vsam_fixed_width_preview = buildVsamPreview(
            state.details[acctId].account
          );
        }
        return jsonResponse({
          acct_id: acctId,
          credit_limit: lim,
          active_status: active,
          message: `CHANGES TO ACCOUNT ${acctId} SAVED (COACTUPC)`,
        });
      }

      if (subAction === 'bill-pay' && request.method === 'POST') {
        const body = await request.json().catch(() => ({ confirm: 'Y' }));
        const res = executeBillPayState(acctId, body.confirm || 'Y');
        return jsonResponse({
          acct_id: acctId,
          previous_balance: res.prev,
          new_balance: res.next,
          tran_id: res.tranId,
          message: res.message,
          execution_ms: 1.42,
          legacy_green_screen_seconds: 54.0,
        });
      }
    }

    if (pathname === '/api/rejects' && request.method === 'GET') {
      return jsonResponse(state.rejects);
    }

    if (pathname === '/api/db2/tx-types' && request.method === 'GET') {
      return jsonResponse(state.db2);
    }

    if (pathname === '/api/db2/tx-types' && request.method === 'POST') {
      const body = await request.json();
      const action = (body.action || '').toUpperCase();
      const code = (body.tr_type || '').trim();
      const desc = (body.tr_description || '').trim();

      if (action === 'ADD') {
        if (state.db2.transaction_types.some((t) => t.tr_type === code)) {
          return jsonResponse({
            sqlcode: -803,
            message: 'DUPLICATE KEY IN INDEX CARDDEMO.XTRAN_TYPE (SQLCODE = -803)',
          });
        }
        state.db2.transaction_types.push({ tr_type: code, tr_description: desc });
        return jsonResponse({
          sqlcode: 0,
          message: 'RECORD INSERTED INTO CARDDEMO.TRANSACTION_TYPE (SQLCODE = 0)',
        });
      }

      if (action === 'UPDATE') {
        const item = state.db2.transaction_types.find((t) => t.tr_type === code);
        if (!item) {
          return jsonResponse({ sqlcode: 100, message: 'NO ROW FOUND FOR UPDATE (SQLCODE = +100)' });
        }
        item.tr_description = desc;
        return jsonResponse({
          sqlcode: 0,
          message: `RECORD UPDATED FOR TR_TYPE=${code} (SQLCODE = 0)`,
        });
      }

      if (action === 'DELETE') {
        const hasChild = state.db2.transaction_categories.some((c) => c.trc_type_code === code);
        if (hasChild) {
          return jsonResponse({
            sqlcode: -532,
            message:
              'FOREIGN KEY RESTRICT VIOLATION ON TRANSACTION_TYPE_CATEGORY (SQLCODE = -532)',
          });
        }
        state.db2.transaction_types = state.db2.transaction_types.filter(
          (t) => t.tr_type !== code
        );
        return jsonResponse({ sqlcode: 0, message: `DELETED TR_TYPE=${code} (SQLCODE = 0)` });
      }
    }

    if (pathname === '/api/ims/authorizations' && request.method === 'GET') {
      return jsonResponse(state.ims);
    }

    if (pathname === '/api/mq/authorize' && request.method === 'POST') {
      const body = await request.json();
      const acct =
        state.accounts.find((a) => a.card_num === (body.card_num || '').trim()) || state.accounts[0];
      const amtNum = parseFloat(body.amount || '0') || 0;
      const balNum = parseFloat(acct.curr_bal || '0') || 0;
      const limNum = parseFloat(acct.credit_limit || '0') || 0;
      const approved = balNum + amtNum <= limNum;
      const respCode = approved ? '00' : '05';
      const respReason = approved ? '0000' : 'OVLM';

      const now = new Date();
      const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 0));
      const dayOfYear = Math.floor((now - startOfYear) / 86400000);
      const yyddd = Number(
        `${String(now.getUTCFullYear()).slice(-2)}${String(dayOfYear).padStart(3, '0')}`
      );
      const hhmmssMs = Number(
        `${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}${String(now.getUTCMilliseconds()).padStart(3, '0')}`
      );
      const authDate9c = 99999 - yyddd;
      const authTime9c = 999999999 - hhmmssMs;

      const newDetail = {
        acct_id: acct.acct_id,
        auth_date_9c: authDate9c,
        auth_time_9c: authTime9c,
        card_num: acct.card_num,
        auth_resp_code: respCode,
        auth_resp_reason: respReason,
        transaction_amt: amtNum.toFixed(2),
        approved_amt: approved ? amtNum.toFixed(2) : '0.00',
        merchant_name: body.merchant_name || 'MERCHANT',
        merchant_city: body.merchant_city || 'SAN FRANCISCO',
        merchant_state: body.merchant_state || 'CA',
        match_status: approved ? 'P' : 'D',
        auth_fraud: 'N',
      };
      state.ims.details.unshift(newDetail);
      return jsonResponse({
        acct_id: acct.acct_id,
        approved,
        auth_resp_code: respCode,
        auth_resp_reason: respReason,
        auth_date_9c: authDate9c,
        auth_time_9c: authTime9c,
        message: `MQ Authorization ${
          approved ? 'APPROVED (00)' : 'DECLINED - OVERLIMIT (05)'
        } (IMS 9C Key: ${authDate9c}/${authTime9c})`,
      });
    }

    if (pathname === '/api/ims/fraud' && request.method === 'POST') {
      const body = await request.json();
      const target = state.ims.details.find(
        (d) =>
          d.acct_id === body.acct_id &&
          d.auth_date_9c === body.auth_date_9c &&
          d.auth_time_9c === body.auth_time_9c
      );
      if (target) {
        target.auth_fraud = body.mark_fraud ? 'F' : 'R';
      }
      return jsonResponse({
        acct_id: body.acct_id,
        auth_fraud: body.mark_fraud ? 'F' : 'R',
        message: body.mark_fraud
          ? "IMS Segment Flagged as Fraud ('F') and Replicated to DB2 CARDDEMO.AUTHFRDS (COPAUS2C)"
          : "Fraud Flag Removed ('R') in IMS Segment",
      });
    }

    if (pathname === '/api/batch/run-nightly' && request.method === 'POST') {
      state = JSON.parse(JSON.stringify(snapshot));
      return jsonResponse(state.overview.latest_parity_report);
    }

    if (pathname === '/api/cics/terminal' && request.method === 'POST') {
      const body = await request.json();
      return jsonResponse(renderDynamicTerminal(body));
    }

    if (pathname === '/api/agent/security-gate' && request.method === 'POST') {
      const body = await request.json();
      const cmd = String(body.command || '').trim();
      const forbidden = [
        'rm -rf /',
        'DROP TABLE accounts',
        'DROP TABLE transactions',
        'TRUNCATE TABLE',
        'gh pr merge',
      ];
      for (const pattern of forbidden) {
        if (cmd.includes(pattern)) {
          return jsonResponse({
            decision: 'deny',
            matched_rule: pattern,
            hook: '.agents/hooks-scripts/gate.py',
            reason: `Blocked by CardDemo Financial Safety Policy: '${pattern}' requires explicit human sign-off.`,
          });
        }
      }
      return jsonResponse({
        decision: 'allow',
        matched_rule: null,
        hook: '.agents/hooks-scripts/gate.py',
        reason: 'Allowed by pre_tool_execution policy: read/verification or non-destructive operation.',
      });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
