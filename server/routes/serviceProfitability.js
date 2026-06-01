const router  = require('express').Router();
const pool    = require('../db/pool');
const svcAuth = require('../middleware/serviceAuth');

/* ─── Pricing helpers ─── */
function pickPricing(worker, ticket, pricingRows) {
  const serviceType = worker.role === 'wireman' ? 'wireman' : 'programmer';
  const location    = ticket.billing_location || 'within_ahmedabad';
  const seniority   = worker.seniority || 'junior';
  let row = pricingRows.find(p =>
    p.service_type === serviceType &&
    p.location === location &&
    (p.seniority === seniority || p.seniority === 'any')
  );
  if (!row) row = pricingRows.find(p => p.service_type === serviceType && p.location === location);
  return row || null;
}

function computeRevenue(ticket, pricing, hoursWorked) {
  if (ticket.override_rate) return Number(ticket.override_rate);
  if (!pricing) return 0;

  // Half-day explicitly requested
  if (ticket.billing_mode === 'half_day') return Number(pricing.half_day_rate || 0);

  // Grade-based pricing (only if explicitly set)
  if (ticket.billing_mode === 'grade_rate') {
    const grade = (ticket.customer_grade || 'B').toLowerCase();
    return Number(pricing[`grade_${grade}_rate`] || pricing.per_day_rate || 0);
  }

  // Default: per-day rate (ignores grades) — auto half-day if ≤4h
  if (hoursWorked > 0 && hoursWorked <= 4) {
    return Number(pricing.half_day_rate || (pricing.per_day_rate * 0.6) || 0);
  }
  return Number(pricing.per_day_rate || 0);
}

// function computeRevenue(ticket, pricing, hoursWorked) {
//   if (ticket.override_rate) return Number(ticket.override_rate);
//   if (!pricing) return 0;
//   if (ticket.billing_mode === 'grade_rate') {
//     const grade = (ticket.customer_grade || 'B').toLowerCase();
//     return Number(pricing[`grade_${grade}_rate`] || 0);
//   }
//   if (ticket.billing_mode === 'half_day') return Number(pricing.half_day_rate || 0);
//   if (hoursWorked > 0 && hoursWorked <= 4) return Number(pricing.half_day_rate || (pricing.per_day_rate * 0.6) || 0);
//   return Number(pricing.per_day_rate || 0);
// }

/* ─── Common session loader with all cost dimensions ─── */
/* ─── Common session loader with all cost dimensions + per-worker billing ─── */
async function loadSessionsWithCosts(fromDate, toDate) {
  const { rows: pricingRows } = await pool.query(`SELECT * FROM service_pricing WHERE active=TRUE`);

  // Pull all worker billings (we'll match per session row)
  const { rows: billingRows } = await pool.query(
    `SELECT ticket_id, worker_id, charged_amount, charged_note, charged_at, edited_by, edited_at
       FROM ticket_worker_billing`);
  const billingMap = {};
  for (const b of billingRows) {
    billingMap[`${b.ticket_id}:${b.worker_id}`] = b;
  }

  const { rows: sessions } = await pool.query(
    `SELECT
       ws.id AS session_id, ws.ticket_id, ws.worker_id,
       CASE WHEN ws.status='running'
            THEN ws.total_seconds + EXTRACT(EPOCH FROM (NOW() - ws.started_at))::int
            ELSE ws.total_seconds END AS total_seconds,
       ws.started_at, ws.status AS session_status,
       su.name AS worker_name, su.role AS worker_role, su.seniority AS worker_seniority,
       su.monthly_salary, su.working_days, su.daily_hours, su.irc_daily_rate,
       t.id AS t_id, t.ticket_id AS ticket_no, t.customer_name, t.address,
       t.customer_grade, t.billing_location, t.billing_mode, t.override_rate,
       t.sales_agent, t.status AS ticket_status,
       t.warranty_status,
       t.invoice_no, t.challan_no
     FROM work_sessions ws
     JOIN service_users    su ON su.id=ws.worker_id
     JOIN service_tickets   t ON t.id=ws.ticket_id
     WHERE ws.total_seconds > 0
       AND (ws.started_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2
     ORDER BY ws.started_at DESC`,
    [fromDate, toDate]
  );

  // Pre-aggregate per-worker-per-ticket hours so we don't double-count charged_amount
  // when a worker has multiple sessions on the same ticket within the period.
  const workerTicketHours = {};
  for (const s of sessions) {
    const k = `${s.ticket_id}:${s.worker_id}`;
    workerTicketHours[k] = (workerTicketHours[k] || 0) + (s.total_seconds || 0) / 3600;
  }
  // Track which sessions have already received the charged-amount allocation
  // (allocate to the first/earliest session in the period for this worker+ticket)
  const allocatedKeys = new Set();
   const expenseAllocatedKeys = new Set();

  return sessions.map(s => {
    const hours      = (s.total_seconds || 0) / 3600;
    const wd         = s.working_days || 26;
    const dh         = s.daily_hours || 8;

    const actualHourly = (Number(s.monthly_salary) || 0) / wd / dh;
    const actualCost   = actualHourly * hours;

    const ircHourly = (Number(s.irc_daily_rate) || 0) / dh;
    const ircCost   = ircHourly * hours;

    // What rate card SAYS we should charge for this worker's time on this ticket
    const pricing = pickPricing(
      { role: s.worker_role, seniority: s.worker_seniority },
      s,
      pricingRows
    );
    const standardRevenue = computeRevenue(s, pricing, hours);

    const isWarranty = s.warranty_status === 'in_warranty';

    // Look up this worker's billing entry for this ticket
    const bKey   = `${s.ticket_id}:${s.worker_id}`;
    const billing = billingMap[bKey];

    let revenue, foregoneRevenue, chargedAmount, chargedDiff, hasCharged;

    if (isWarranty) {
      // Warranty: no money collected. Track foregone for reporting.
      revenue         = 0;
      foregoneRevenue = standardRevenue;
      chargedAmount   = null;
      chargedDiff     = 0;
      hasCharged      = false;
    } else if (billing) {
      // Worker has submitted their charged amount.
      // Allocate the full amount to the first session this period only,
      // so aggregations don't double-count when there are multiple sessions.
      hasCharged    = true;
      chargedAmount = Number(billing.charged_amount);

      if (!allocatedKeys.has(bKey)) {
        revenue     = chargedAmount;
        chargedDiff = chargedAmount - standardRevenue;
        allocatedKeys.add(bKey);
      } else {
        // Subsequent sessions for the same worker+ticket — already counted above.
        revenue     = 0;
        chargedDiff = 0;
      }
      foregoneRevenue = 0;
    } else {
      // Not yet billed — treat rate-card as ESTIMATE for now, flag visually as unbilled
      revenue         = standardRevenue;
      foregoneRevenue = 0;
      chargedAmount   = null;
      chargedDiff     = 0;
      hasCharged      = false;
    }

    return {
      ...s,
      hours:            +hours.toFixed(2),
      actual_cost:      +actualCost.toFixed(2),
      irc_cost:         +ircCost.toFixed(2),
      revenue:          +revenue.toFixed(2),
      standard_revenue: +standardRevenue.toFixed(2),
      foregone_revenue: +foregoneRevenue.toFixed(2),
      // Billing-specific fields:
      charged_amount:   chargedAmount != null ? +chargedAmount.toFixed(2) : null,
      charged_diff:     +chargedDiff.toFixed(2),
      has_charged:      hasCharged,
      charged_note:     billing?.charged_note || null,
      charged_at:       billing?.charged_at || null,
      // Computed profits/margins
      is_warranty:      isWarranty,
      actual_profit:    +(revenue - actualCost).toFixed(2),
      irc_profit:       +(revenue - ircCost).toFixed(2),
      actual_margin:    revenue > 0 ? +(((revenue - actualCost)/revenue)*100).toFixed(1) : 0,
      irc_margin:       revenue > 0 ? +(((revenue - ircCost)/revenue)*100).toFixed(1) : 0,
    };
  });
}

/* ─── Buckets: build daily / monthly / yearly groupings ─── */
function bucketKey(dateStr, granularity) {
  const d = new Date(dateStr);
  if (granularity === 'daily')   return d.toISOString().slice(0,10);          // YYYY-MM-DD
  if (granularity === 'monthly') return d.toISOString().slice(0,7);           // YYYY-MM
  if (granularity === 'yearly')  return d.toISOString().slice(0,4);           // YYYY
  return d.toISOString().slice(0,10);
}

/* ════════════════════════════════════════════════════════════ */
/* 1. PROFITABILITY OVERVIEW                                    */
/* ════════════════════════════════════════════════════════════ */
router.get('/profitability', svcAuth(['superadmin']), async (req, res) => {
  const fromDate = req.query.from || new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const toDate   = req.query.to   || new Date().toISOString().slice(0,10);
  try {
    const sessions = await loadSessionsWithCosts(fromDate, toDate);

    const totalRevenue        = sessions.reduce((a,s)=>a+s.revenue, 0);
const totalForegoneRev    = sessions.reduce((a,s)=>a+s.foregone_revenue, 0);
const totalActualCost     = sessions.reduce((a,s)=>a+s.actual_cost, 0);
const totalIrcCost        = sessions.reduce((a,s)=>a+s.irc_cost, 0);
const totalExpense = sessions.reduce((a,s)=>a+(s.expense||0), 0);
// const totalActualProfit   = totalRevenue - totalActualCost;
// const totalIrcProfit      = totalRevenue - totalIrcCost;
const totalActualProfit = totalRevenue - totalActualCost - totalExpense;
const totalIrcProfit    = totalRevenue - totalIrcCost - totalExpense;
const warrantySessions    = sessions.filter(s => s.is_warranty).length;

// New: rate-card vs charged comparison
const billedSessions      = sessions.filter(s => s.has_charged);
const unbilledSessions    = sessions.filter(s => !s.has_charged && !s.is_warranty);
const totalCharged        = billedSessions.reduce((a,s)=>a+(s.charged_amount||0), 0)
                          - sessions.filter(s => s.has_charged && s.revenue===0).reduce((a,s)=>a+(s.charged_amount||0), 0);
// Easier: just sum revenue for billed (revenue=chargedAmount when billed)
const totalChargedClean   = sessions.filter(s => s.has_charged).reduce((a,s)=>a+s.revenue, 0);
const totalRateCardBilled = sessions.filter(s => s.has_charged).reduce((a,s)=>a+s.standard_revenue, 0);
const chargedDiff         = totalChargedClean - totalRateCardBilled;
const chargedDiffPct      = totalRateCardBilled > 0
                            ? +((chargedDiff / totalRateCardBilled) * 100).toFixed(1)
                            : 0;

res.json({
  summary: {
    totalRevenue:        +totalRevenue.toFixed(2),
    totalForegoneRev:    +totalForegoneRev.toFixed(2),
    totalActualCost:     +totalActualCost.toFixed(2),
    totalIrcCost:        +totalIrcCost.toFixed(2),
    totalExpense: +totalExpense.toFixed(2),
    totalActualProfit:   +totalActualProfit.toFixed(2),
    totalIrcProfit:      +totalIrcProfit.toFixed(2),
    actualMargin:        totalRevenue>0 ? +((totalActualProfit/totalRevenue)*100).toFixed(1) : 0,
    ircMargin:           totalRevenue>0 ? +((totalIrcProfit/totalRevenue)*100).toFixed(1) : 0,
    sessionCount:        sessions.length,
    warrantySessions,
    billableSessions:    sessions.length - warrantySessions,
    // New billing-comparison fields:
    billedSessionCount:    billedSessions.length,
    unbilledSessionCount:  unbilledSessions.length,
    totalCharged:          +totalChargedClean.toFixed(2),
    totalRateCardBilled:   +totalRateCardBilled.toFixed(2),
    chargedDiff:           +chargedDiff.toFixed(2),
    chargedDiffPct:        chargedDiffPct,
  },
  sessions,
});
  } catch(e) { console.error('Profitability error:', e); res.status(500).json({error:e.message}); }
});

/* ════════════════════════════════════════════════════════════ */
/* 2. USER-WISE REPORT (actual vs IRC vs customer rate)         */
/* ════════════════════════════════════════════════════════════ */
router.get('/profitability/user-wise', svcAuth(['superadmin']), async (req,res) => {
  const fromDate = req.query.from || new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const toDate   = req.query.to   || new Date().toISOString().slice(0,10);
  const granularity = req.query.granularity || 'monthly'; // daily|monthly|yearly

  try {
    const sessions = await loadSessionsWithCosts(fromDate, toDate);

    // Aggregate by worker
    const byUserMap = {};
    for (const s of sessions) {
      const k = s.worker_id;
      if (!byUserMap[k]) byUserMap[k] = {
        worker_id: s.worker_id, worker_name: s.worker_name, worker_role: s.worker_role,
        worker_seniority: s.worker_seniority,
        monthly_salary: Number(s.monthly_salary||0), irc_daily_rate: Number(s.irc_daily_rate||0),
        sessions: 0, hours: 0,
        actual_cost: 0, irc_cost: 0, revenue: 0,
        timeline: {}, // {bucket: {revenue, actual_cost, irc_cost}}
      };
      const u = byUserMap[k];
      u.sessions    += 1;
      u.hours       += s.hours;
      u.actual_cost += s.actual_cost;
      u.irc_cost    += s.irc_cost;
      u.revenue     += s.revenue;

      const bk = bucketKey(s.started_at, granularity);
      if (!u.timeline[bk]) u.timeline[bk] = { bucket: bk, revenue: 0, actual_cost: 0, irc_cost: 0, sessions: 0 };
      u.timeline[bk].revenue     += s.revenue;
      u.timeline[bk].actual_cost += s.actual_cost;
      u.timeline[bk].irc_cost    += s.irc_cost;
      u.timeline[bk].sessions    += 1;
    }

    const users = Object.values(byUserMap).map(u => ({
      ...u,
      hours:         +u.hours.toFixed(2),
      actual_cost:   +u.actual_cost.toFixed(2),
      irc_cost:      +u.irc_cost.toFixed(2),
      revenue:       +u.revenue.toFixed(2),
      actual_profit: +(u.revenue - u.actual_cost).toFixed(2),
      irc_profit:    +(u.revenue - u.irc_cost).toFixed(2),
      actual_margin: u.revenue>0 ? +(((u.revenue-u.actual_cost)/u.revenue)*100).toFixed(1) : 0,
      irc_margin:    u.revenue>0 ? +(((u.revenue-u.irc_cost)/u.revenue)*100).toFixed(1) : 0,
      timeline: Object.values(u.timeline).map(t => ({
        ...t,
        revenue: +t.revenue.toFixed(2),
        actual_cost: +t.actual_cost.toFixed(2),
        irc_cost: +t.irc_cost.toFixed(2),
        actual_profit: +(t.revenue - t.actual_cost).toFixed(2),
        irc_profit: +(t.revenue - t.irc_cost).toFixed(2),
      })).sort((a,b) => a.bucket.localeCompare(b.bucket)),
    })).sort((a,b) => b.irc_profit - a.irc_profit);

    res.json({ granularity, users });
  } catch(e) { console.error(e); res.status(500).json({error:e.message}); }
});

/* ════════════════════════════════════════════════════════════ */
/* 3. CUSTOMER-WISE REPORT                                      */
/* ════════════════════════════════════════════════════════════ */
router.get('/profitability/customer-wise', svcAuth(['superadmin']), async (req,res) => {
  const fromDate = req.query.from || new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const toDate   = req.query.to   || new Date().toISOString().slice(0,10);
  const granularity = req.query.granularity || 'monthly';

  try {
    const sessions = await loadSessionsWithCosts(fromDate, toDate);

    const byCustMap = {};
    for (const s of sessions) {
      const k = s.customer_name || 'Unknown';
      if (!byCustMap[k]) byCustMap[k] = {
        customer_name: k,
        worker_ids: new Set(),
        sessions: 0, hours: 0,
        actual_cost: 0, irc_cost: 0, revenue: 0, foregone_revenue: 0,
        warranty_sessions: 0, billable_sessions: 0,
        worker_breakdown: {},
        ticket_breakdown: {},  // ← NEW: per-ticket breakdown
        timeline: {},
      };
      const c = byCustMap[k];
      c.worker_ids.add(s.worker_id);
      c.sessions          += 1;
      c.hours             += s.hours;
      c.actual_cost       += s.actual_cost;
      c.irc_cost          += s.irc_cost;
      c.revenue           += s.revenue;
      c.foregone_revenue  += s.foregone_revenue;
      if (s.is_warranty) c.warranty_sessions += 1;
      else c.billable_sessions += 1;

      // Per-worker breakdown
      if (!c.worker_breakdown[s.worker_id]) c.worker_breakdown[s.worker_id] = {
        worker_id: s.worker_id, worker_name: s.worker_name, worker_role: s.worker_role,
        sessions: 0, hours: 0, actual_cost: 0, irc_cost: 0, revenue: 0, foregone_revenue: 0,
      };
      const wb = c.worker_breakdown[s.worker_id];
      wb.sessions         += 1;
      wb.hours            += s.hours;
      wb.actual_cost      += s.actual_cost;
      wb.irc_cost         += s.irc_cost;
      wb.revenue          += s.revenue;
      wb.foregone_revenue += s.foregone_revenue;

      // Per-ticket breakdown
if (!c.ticket_breakdown[s.ticket_id]) c.ticket_breakdown[s.ticket_id] = {
  ticket_id: s.ticket_id, ticket_no: s.ticket_no,
  warranty_status: s.warranty_status,
  invoice_no: s.invoice_no, challan_no: s.challan_no,
  sessions: 0, hours: 0, actual_cost: 0, irc_cost: 0, revenue: 0, foregone_revenue: 0,
  standard_revenue: 0, has_charged: false,   // ← NEW
  workers: new Set(),
};
const tb = c.ticket_breakdown[s.ticket_id];
tb.sessions          += 1;
tb.hours             += s.hours;
tb.actual_cost       += s.actual_cost;
tb.irc_cost          += s.irc_cost;
tb.revenue           += s.revenue;
tb.foregone_revenue  += s.foregone_revenue;
tb.standard_revenue  += s.standard_revenue;          // ← NEW: sum rate card across all sessions
if (s.has_charged) tb.has_charged = true;            // ← NEW: any worker billed = ticket is billed
tb.workers.add(s.worker_name);

      const bk = bucketKey(s.started_at, granularity);
      if (!c.timeline[bk]) c.timeline[bk] = { bucket: bk, revenue: 0, actual_cost: 0, irc_cost: 0, sessions: 0 };
      c.timeline[bk].revenue     += s.revenue;
      c.timeline[bk].actual_cost += s.actual_cost;
      c.timeline[bk].irc_cost    += s.irc_cost;
      c.timeline[bk].sessions    += 1;
    }

    const customers = Object.values(byCustMap).map(c => ({
      ...c,
      ticket_count: Object.keys(c.ticket_breakdown).length,
      worker_count: c.worker_ids.size,
      hours:            +c.hours.toFixed(2),
      actual_cost:      +c.actual_cost.toFixed(2),
      irc_cost:         +c.irc_cost.toFixed(2),
      revenue:          +c.revenue.toFixed(2),
      foregone_revenue: +c.foregone_revenue.toFixed(2),
      actual_profit:    +(c.revenue - c.actual_cost).toFixed(2),
      irc_profit:       +(c.revenue - c.irc_cost).toFixed(2),
      actual_margin:    c.revenue>0 ? +(((c.revenue-c.actual_cost)/c.revenue)*100).toFixed(1) : 0,
      irc_margin:       c.revenue>0 ? +(((c.revenue-c.irc_cost)/c.revenue)*100).toFixed(1) : 0,
      worker_breakdown: Object.values(c.worker_breakdown).map(w => ({
        ...w,
        hours: +w.hours.toFixed(2),
        actual_cost: +w.actual_cost.toFixed(2),
        irc_cost: +w.irc_cost.toFixed(2),
        revenue: +w.revenue.toFixed(2),
        foregone_revenue: +w.foregone_revenue.toFixed(2),
        actual_profit: +(w.revenue - w.actual_cost).toFixed(2),
        irc_profit: +(w.revenue - w.irc_cost).toFixed(2),
      })).sort((a,b)=>b.revenue-a.revenue),
      ticket_breakdown: Object.values(c.ticket_breakdown).map(t => ({
  ...t,
  hours: +t.hours.toFixed(2),
  actual_cost: +t.actual_cost.toFixed(2),
  irc_cost: +t.irc_cost.toFixed(2),
  revenue: +t.revenue.toFixed(2),
  foregone_revenue: +t.foregone_revenue.toFixed(2),
  standard_revenue: +t.standard_revenue.toFixed(2),                              // ← NEW
  charged_diff: t.has_charged ? +(t.revenue - t.standard_revenue).toFixed(2) : 0, // ← NEW
  actual_profit: +(t.revenue - t.actual_cost).toFixed(2),
  irc_profit: +(t.revenue - t.irc_cost).toFixed(2),
  workers: Array.from(t.workers),
})).sort((a,b)=>b.revenue-a.revenue),
      timeline: Object.values(c.timeline).map(t => ({
        ...t,
        revenue: +t.revenue.toFixed(2),
        actual_cost: +t.actual_cost.toFixed(2),
        irc_cost: +t.irc_cost.toFixed(2),
        actual_profit: +(t.revenue - t.actual_cost).toFixed(2),
        irc_profit: +(t.revenue - t.irc_cost).toFixed(2),
      })).sort((a,b) => a.bucket.localeCompare(b.bucket)),
      worker_ids: undefined,
    })).sort((a,b)=>b.revenue - a.revenue);

    res.json({ granularity, customers });
  } catch(e) { console.error(e); res.status(500).json({error:e.message}); }
});

/* ════════════════════════════════════════════════════════════ */
/* 4. SALES AGENT-WISE REPORT                                   */
/* ════════════════════════════════════════════════════════════ */
router.get('/profitability/agent-wise', svcAuth(['superadmin']), async (req,res) => {
  const fromDate = req.query.from || new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const toDate   = req.query.to   || new Date().toISOString().slice(0,10);
  const granularity = req.query.granularity || 'monthly';

  try {
    const sessions = await loadSessionsWithCosts(fromDate, toDate);

    const byAgentMap = {};
    for (const s of sessions) {
      const k = s.sales_agent || 'No Agent';
      if (!byAgentMap[k]) byAgentMap[k] = {
        sales_agent: k,
        ticket_ids: new Set(), worker_ids: new Set(),
        sessions: 0, hours: 0,
        actual_cost: 0, irc_cost: 0, revenue: 0, foregone_revenue: 0,
        warranty_sessions: 0, billable_sessions: 0,
        customer_breakdown: {},   // ← NEW: per-customer breakdown
        worker_breakdown: {},
        timeline: {},
      };
      const a = byAgentMap[k];
      a.ticket_ids.add(s.ticket_id);
      a.worker_ids.add(s.worker_id);
      a.sessions          += 1;
      a.hours             += s.hours;
      a.actual_cost       += s.actual_cost;
      a.irc_cost          += s.irc_cost;
      a.revenue           += s.revenue;
      a.foregone_revenue  += s.foregone_revenue;
      if (s.is_warranty) a.warranty_sessions += 1;
      else a.billable_sessions += 1;

      // Per-customer breakdown
      const cust = s.customer_name || 'Unknown';
      if (!a.customer_breakdown[cust]) a.customer_breakdown[cust] = {
        customer_name: cust,
        ticket_ids: new Set(),
        sessions: 0, hours: 0,
        actual_cost: 0, irc_cost: 0, revenue: 0, foregone_revenue: 0,
        warranty_sessions: 0, billable_sessions: 0,
        tickets: {},  // per-ticket inside customer
      };
      const cb = a.customer_breakdown[cust];
      cb.ticket_ids.add(s.ticket_id);
      cb.sessions         += 1;
      cb.hours            += s.hours;
      cb.actual_cost      += s.actual_cost;
      cb.irc_cost         += s.irc_cost;
      cb.revenue          += s.revenue;
      cb.foregone_revenue += s.foregone_revenue;
      if (s.is_warranty) cb.warranty_sessions += 1;
      else cb.billable_sessions += 1;

      // Ticket-level inside customer breakdown
if (!cb.tickets[s.ticket_id]) cb.tickets[s.ticket_id] = {
  ticket_id: s.ticket_id, ticket_no: s.ticket_no,
  warranty_status: s.warranty_status,
  invoice_no: s.invoice_no, challan_no: s.challan_no,
  sessions: 0, hours: 0,
  actual_cost: 0, irc_cost: 0, revenue: 0, foregone_revenue: 0,
  standard_revenue: 0, has_charged: false,   // ← NEW
  workers: new Set(),
};
const tt = cb.tickets[s.ticket_id];
tt.sessions          += 1;
tt.hours             += s.hours;
tt.actual_cost       += s.actual_cost;
tt.irc_cost          += s.irc_cost;
tt.revenue           += s.revenue;
tt.foregone_revenue  += s.foregone_revenue;
tt.standard_revenue  += s.standard_revenue;          // ← NEW
if (s.has_charged) tt.has_charged = true;            // ← NEW
tt.workers.add(s.worker_name);

      // Worker breakdown for agent
      if (!a.worker_breakdown[s.worker_id]) a.worker_breakdown[s.worker_id] = {
        worker_id: s.worker_id, worker_name: s.worker_name, worker_role: s.worker_role,
        sessions: 0, hours: 0, actual_cost: 0, irc_cost: 0, revenue: 0, foregone_revenue: 0,
      };
      const wb = a.worker_breakdown[s.worker_id];
      wb.sessions         += 1;
      wb.hours            += s.hours;
      wb.actual_cost      += s.actual_cost;
      wb.irc_cost         += s.irc_cost;
      wb.revenue          += s.revenue;
      wb.foregone_revenue += s.foregone_revenue;

      const bk = bucketKey(s.started_at, granularity);
      if (!a.timeline[bk]) a.timeline[bk] = { bucket: bk, revenue: 0, actual_cost: 0, irc_cost: 0, sessions: 0 };
      a.timeline[bk].revenue     += s.revenue;
      a.timeline[bk].actual_cost += s.actual_cost;
      a.timeline[bk].irc_cost    += s.irc_cost;
      a.timeline[bk].sessions    += 1;
    }

    const agents = Object.values(byAgentMap).map(a => ({
      ...a,
      ticket_count:   a.ticket_ids.size,
      customer_count: Object.keys(a.customer_breakdown).length,
      worker_count:   a.worker_ids.size,
      hours:            +a.hours.toFixed(2),
      actual_cost:      +a.actual_cost.toFixed(2),
      irc_cost:         +a.irc_cost.toFixed(2),
      revenue:          +a.revenue.toFixed(2),
      foregone_revenue: +a.foregone_revenue.toFixed(2),
      actual_profit:    +(a.revenue - a.actual_cost).toFixed(2),
      irc_profit:       +(a.revenue - a.irc_cost).toFixed(2),
      actual_margin:    a.revenue>0 ? +(((a.revenue-a.actual_cost)/a.revenue)*100).toFixed(1) : 0,
      irc_margin:       a.revenue>0 ? +(((a.revenue-a.irc_cost)/a.revenue)*100).toFixed(1) : 0,
      customer_breakdown: Object.values(a.customer_breakdown).map(c => ({
        ...c,
        ticket_count: c.ticket_ids.size,
        hours: +c.hours.toFixed(2),
        actual_cost: +c.actual_cost.toFixed(2),
        irc_cost: +c.irc_cost.toFixed(2),
        revenue: +c.revenue.toFixed(2),
        foregone_revenue: +c.foregone_revenue.toFixed(2),
        actual_profit: +(c.revenue - c.actual_cost).toFixed(2),
        irc_profit: +(c.revenue - c.irc_cost).toFixed(2),
        actual_margin: c.revenue>0 ? +(((c.revenue-c.actual_cost)/c.revenue)*100).toFixed(1) : 0,
        irc_margin: c.revenue>0 ? +(((c.revenue-c.irc_cost)/c.revenue)*100).toFixed(1) : 0,
        tickets: Object.values(c.tickets).map(t => ({
  ...t,
  hours: +t.hours.toFixed(2),
  actual_cost: +t.actual_cost.toFixed(2),
  irc_cost: +t.irc_cost.toFixed(2),
  revenue: +t.revenue.toFixed(2),
  foregone_revenue: +t.foregone_revenue.toFixed(2),
  standard_revenue: +t.standard_revenue.toFixed(2),                              // ← NEW
  charged_diff: t.has_charged ? +(t.revenue - t.standard_revenue).toFixed(2) : 0, // ← NEW
  actual_profit: +(t.revenue - t.actual_cost).toFixed(2),
  irc_profit: +(t.revenue - t.irc_cost).toFixed(2),
  workers: Array.from(t.workers),
})).sort((a,b)=>b.revenue-a.revenue),
        ticket_ids: undefined,
      })).sort((a,b)=>b.revenue-a.revenue),
      worker_breakdown: Object.values(a.worker_breakdown).map(w => ({
        ...w,
        hours: +w.hours.toFixed(2),
        actual_cost: +w.actual_cost.toFixed(2),
        irc_cost: +w.irc_cost.toFixed(2),
        revenue: +w.revenue.toFixed(2),
        foregone_revenue: +w.foregone_revenue.toFixed(2),
        actual_profit: +(w.revenue - w.actual_cost).toFixed(2),
        irc_profit: +(w.revenue - w.irc_cost).toFixed(2),
      })).sort((a,b)=>b.revenue-a.revenue),
      timeline: Object.values(a.timeline).map(t => ({
        ...t,
        revenue: +t.revenue.toFixed(2),
        actual_cost: +t.actual_cost.toFixed(2),
        irc_cost: +t.irc_cost.toFixed(2),
        actual_profit: +(t.revenue - t.actual_cost).toFixed(2),
        irc_profit: +(t.revenue - t.irc_cost).toFixed(2),
      })).sort((a,b) => a.bucket.localeCompare(b.bucket)),
      ticket_ids: undefined, worker_ids: undefined,
    })).sort((a,b)=>b.revenue - a.revenue);

    res.json({ granularity, agents });
  } catch(e) { console.error(e); res.status(500).json({error:e.message}); }
});

/* ════════════════════════════════════════════════════════════ */
/* 5. PRICING — list / edit                                     */
/* ════════════════════════════════════════════════════════════ */
router.get('/pricing', svcAuth(['superadmin']), async (_req,res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM service_pricing WHERE active=TRUE ORDER BY service_type, seniority, location`);
    res.json(rows);
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.patch('/pricing/:id', svcAuth(['superadmin']), async (req,res) => {
  const { per_day_rate, half_day_rate, grade_a_rate, grade_b_rate, grade_c_rate, notes } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE service_pricing SET
         per_day_rate  = COALESCE($1::numeric, per_day_rate),
         half_day_rate = COALESCE($2::numeric, half_day_rate),
         grade_a_rate  = COALESCE($3::numeric, grade_a_rate),
         grade_b_rate  = COALESCE($4::numeric, grade_b_rate),
         grade_c_rate  = COALESCE($5::numeric, grade_c_rate),
         notes         = COALESCE($6::text, notes),
         updated_at    = NOW()
       WHERE id = $7::uuid RETURNING *`,
      [per_day_rate, half_day_rate, grade_a_rate, grade_b_rate, grade_c_rate, notes, req.params.id]
    );
    res.json(rows[0]);
  } catch(e) { console.error(e); res.status(500).json({error:e.message}); }
});

/* ════════════════════════════════════════════════════════════ */
/* 6. WORKERS — list with salary/IRC, and edit                  */
/* ════════════════════════════════════════════════════════════ */
router.get('/workers/salaries', svcAuth(['superadmin']), async (_req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, phone, role, department, seniority, monthly_salary, working_days, daily_hours, irc_daily_rate, is_active
       FROM service_users
       WHERE role IN ('plc','wireman')
       ORDER BY role, name`);
    res.json(rows);
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.patch('/workers/:id/salary', svcAuth(['superadmin']), async (req,res) => {
  const { monthly_salary, working_days, daily_hours, seniority, irc_daily_rate } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE service_users SET
         monthly_salary = COALESCE($1::numeric, monthly_salary),
         working_days   = COALESCE($2::int, working_days),
         daily_hours    = COALESCE($3::int, daily_hours),
         seniority      = COALESCE($4::text, seniority),
         irc_daily_rate = COALESCE($5::numeric, irc_daily_rate)
       WHERE id = $6::uuid
       RETURNING id, name, role, seniority, monthly_salary, working_days, daily_hours, irc_daily_rate`,
      [monthly_salary, working_days, daily_hours, seniority, irc_daily_rate, req.params.id]
    );
    res.json(rows[0]);
  } catch(e) { console.error(e); res.status(500).json({error:e.message}); }
});


module.exports = router;
module.exports.pickPricing     = pickPricing;
module.exports.computeRevenue  = computeRevenue;