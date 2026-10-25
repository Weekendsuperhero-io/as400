import snapshot from './worker-snapshot.json';

// Deep clone mutable state per Worker isolate
let state = JSON.parse(JSON.stringify(snapshot));

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
        const acct = state.accounts.find((a) => a.acct_id === acctId);
        if (acct) acct.credit_limit = lim;
        if (state.details[acctId]) {
          state.details[acctId].account.credit_limit = lim;
        }
        return jsonResponse({
          acct_id: acctId,
          credit_limit: lim,
          active_status: body.active_status || 'Y',
          message: `CHANGES TO ACCOUNT ${acctId} SAVED (COACTUPC)`,
        });
      }

      if (subAction === 'bill-pay' && request.method === 'POST') {
        const acct = state.accounts.find((a) => a.acct_id === acctId);
        const prev = acct ? acct.curr_bal : '0.00';
        if (acct) {
          acct.curr_bal = '0.00';
          acct.curr_bal_overpunch = '00000000000{';
        }
        if (state.details[acctId]) {
          state.details[acctId].account.curr_bal = '0.00';
        }
        return jsonResponse({
          acct_id: acctId,
          previous_balance: prev,
          new_balance: '0.00',
          tran_id: `BP${Date.now().toString().slice(-14)}`,
          message: `BILL PAYMENT OF $${prev} PROCESSED FOR ACCOUNT ${acctId}`,
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
        state.accounts.find((a) => a.card_num === body.card_num) || state.accounts[0];
      const newDetail = {
        acct_id: acct.acct_id,
        auth_date_9c: 74060,
        auth_time_9c: 87400000,
        card_num: body.card_num,
        auth_resp_code: '00',
        transaction_amt: parseFloat(body.amount || '0').toFixed(2),
        merchant_name: body.merchant_name || 'MERCHANT',
        merchant_city: body.merchant_city || 'SAN FRANCISCO',
        auth_fraud: 'N',
      };
      state.ims.details.unshift(newDetail);
      return jsonResponse({
        acct_id: acct.acct_id,
        resp_code: '00',
        message: `APPROVED ($${newDetail.transaction_amt}) — Inserted IMS PAUTDTL1 segment w/ 9s-complement key`,
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
        target.auth_fraud = body.mark_fraud ? 'F' : 'N';
      }
      return jsonResponse({
        status: 'OK',
        message: `IMS PAUTDTL1 segment & DB2 AUTHFRDS synchronized (${body.mark_fraud ? 'FRAUD' : 'CLEAR'})`,
      });
    }

    if (pathname === '/api/batch/run-nightly' && request.method === 'POST') {
      state = JSON.parse(JSON.stringify(snapshot));
      return jsonResponse(state.overview.latest_parity_report);
    }

    if (pathname === '/api/cics/terminal' && request.method === 'POST') {
      const body = await request.json();
      const tran = (body.tran_id || 'CAVW').toUpperCase();
      const screen = state.screens[tran] || state.screens['CAVW'];
      return jsonResponse(screen);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
