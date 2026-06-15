import React, { useState } from 'react';
import jsPDF from 'jspdf';
import svcApi from '../../serviceApi';

const inr = n => `Rs.${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fmtTime = d => d ? new Date(d).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '-';
const fmtSecs = s => { const m=Math.floor((s||0)/60); return m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m}m`; };
const cleanName = s => (s||'').replace(/[\u00e2\u0080\u00af\u00a0]/g,' ').replace(/\s+/g,' ').trim();
const toTitleCase = s => (s||'').replace(/_/g,' ').split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');

const getFileUrl = path => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const origin = window.location.port === '3000'
    ? `${window.location.protocol}//${window.location.hostname}:5001`
    : window.location.origin;
  return `${origin}${path.startsWith('/')?'':'/'}${path}`;
};

const CHECKS = [
  { key:'details',  label:'Ticket details' },
  { key:'workers',  label:'Assigned workers' },
  { key:'sessions', label:'Session log' },
  { key:'billing',  label:'Billing summary' },
  { key:'profit',   label:'Cost & profit' },
  { key:'challans', label:'Challans' },
  { key:'media',    label:'Inquiry attachments' },
  { key:'report',   label:'Worker report files' },
  { key:'expense',  label:'Expense proof' },
  { key:'worklogs', label:'Work log' },
  { key:'notes',    label:'Internal notes' },
];

async function toBase64(url) {
  if (!url) return null;
  try {
    const backendOrigin = window.location.port === '3000'
      ? `${window.location.protocol}//${window.location.hostname}:5001`
      : window.location.origin;
    // Fix any localhost references to use correct origin
    let fetchUrl = url;
    if (url.includes('localhost:3000') || url.includes('localhost:5001')) {
      fetchUrl = url.replace(/https?:\/\/localhost:\d+/, backendOrigin);
    } else if (url.startsWith('/')) {
      fetchUrl = `${backendOrigin}${url}`;
    }
    const res = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${localStorage.getItem('svc_token')}` } });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

function isImage(name) { return /\.(jpg|jpeg|png|gif|webp)$/i.test(name||''); }
function isPdf(name)   { return /\.pdf$/i.test(name||''); }

async function buildPdf(data, sel) {
  const { ticket, assignments=[], sessions=[], billing=[], challans=[], notes=[], media=[], documents=[], worklogs=[] } = data;
  const doc = new jsPDF({ orientation:'portrait', unit:'pt', format:'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 36, MR = 36, MT = 36;
  const CW = W - ML - MR;

  const DARK   = [15, 23, 42];
  const BLUE   = [37, 99, 235];
  const GREEN  = [5, 150, 105];
  const RED    = [220, 38, 38];
  const AMBER  = [217, 119, 6];
  const SLATE  = [100, 116, 139];
  const BORDER = [226, 232, 240];
  const WHITE  = [255, 255, 255];
  const LIGHT  = [248, 250, 252];

  let y = 0;

  function newPage() { doc.addPage(); y = MT + 10; }
  function checkPage(needed) { if (y + needed > H - 40) newPage(); }

  function setFont(size, weight='normal', color=DARK) {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont('helvetica', weight);
  }

  function drawRect(x, ry, w, h, color, radius=4) {
    doc.setFillColor(...color);
    doc.roundedRect(x, ry, w, h, radius, radius, 'F');
  }

  function drawLine(x1, ry, x2, color=BORDER) {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.5);
    doc.line(x1, ry, x2, ry);
  }

  function badge(x, ry, text, bg, fg, fontSize=7) {
    setFont(fontSize, 'bold', fg);
    const tw = doc.getTextWidth(text);
    const bw = tw + 10, bh = 13;
    drawRect(x, ry-10, bw, bh, bg, 6);
    doc.text(text, x+5, ry);
    return bw;
  }

  // ── Style D Section Header — bold title + full-width rule ──
  function sectionHeader(title) {
    checkPage(30);
    y += 10;
    setFont(7, 'bold', DARK);
    doc.text(title.toUpperCase(), ML, y+1);
    doc.setDrawColor(...DARK); doc.setLineWidth(0.8);
    doc.line(ML, y+4, W-MR, y+4);
    y += 12;
  }

  // ── Style D Field Grid — label/value pairs, bottom border only ──
  function fieldGrid(fields, cols=3) {
    const colW = CW / cols;
    let col = 0, rowY = y;
    for (const [label, value] of fields) {
      const x = ML + col * colW;
      // Label
      setFont(6.5, 'normal', SLATE);
      doc.text(label.toUpperCase(), x, rowY+7);
      // Value — more space below label
      setFont(9, 'bold', DARK);
      const val = String(value||'-');
      doc.text(val.length>22?val.slice(0,22)+'\u2026':val, x, rowY+20);
      // Bottom separator
      doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
      doc.line(ML, rowY+32, ML+CW, rowY+32);
      col++;
      if (col >= cols) { col=0; rowY+=40; }
    }
    if (col > 0) rowY += 40;
    y = rowY + 8;
  }

  // ── Style D Table Header — light grey bg ──
  function tableHeader(headers, colWidths) {
    checkPage(20);
    doc.setFillColor(248,249,250);
    doc.rect(ML, y, CW, 16, 'F');
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
    doc.line(ML, y+16, ML+CW, y+16);
    let x = ML+4;
    setFont(6.5, 'bold', SLATE);
    for (let i=0; i<headers.length; i++) {
      doc.text(headers[i].toUpperCase(), x, y+10.5);
      x += colWidths[i];
    }
    y += 16;
  }

  // ── Style D Table Row — bottom border only ──
  function tableRow(cells, colWidths, colors=[]) {
    checkPage(20);
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
    doc.line(ML, y+18, ML+CW, y+18);
    let x = ML+4;
    for (let i=0; i<cells.length; i++) {
      const color = colors[i] || DARK;
      setFont(8, i===0?'bold':'normal', color);
      const val = String(cells[i]||'-');
      doc.text(val.length>24?val.slice(0,24)+'\u2026':val, x, y+12);
      x += colWidths[i];
    }
    y += 18;
  }

  // ══════════════════════════════════════════════════════════════
  // HEADER — Style D: Clean Invoice
  // ══════════════════════════════════════════════════════════════
  doc.setFillColor(255,255,255);
  doc.rect(0, 0, W, 122, 'F');

  // Load CESS logo
  let logoLoaded = false;
  try {
    const logoUrls = [
      window.location.origin + '/CESSGroup.png',
      (window.location.port==='3000'
        ? window.location.protocol+'//'+window.location.hostname+':5001'
        : window.location.origin) + '/CESSGroup.png',
    ];
    let logoB64 = null;
    for (const url of logoUrls) {
      try {
        const res = await fetch(url, {headers:{Authorization:`Bearer ${localStorage.getItem('svc_token')}`}});
        if (res.ok) {
          const blob = await res.blob();
          logoB64 = await new Promise(r=>{ const fr=new FileReader(); fr.onloadend=()=>r(fr.result); fr.readAsDataURL(blob); });
          if (logoB64) break;
        }
      } catch(e2) {}
    }
    if (logoB64) {
      const imgProps = doc.getImageProperties(logoB64);
      const imgW = 120;
      const imgH = imgW * imgProps.height / imgProps.width;
      doc.addImage(logoB64, 'PNG', ML, (86 - imgH) / 2, imgW, imgH);
      logoLoaded = true;
    }
  } catch(e) {}

  if (!logoLoaded) {
    setFont(22,'bold',DARK); doc.text('CESS', ML, 50);
    setFont(8,'normal',SLATE); doc.text('Solutions Simplified', ML, 62);
  }

  // Right side — label, big ticket ID, date
  setFont(7,'bold',SLATE);
  doc.text('SERVICE TICKET REPORT', W-MR, 22, {align:'right'});
  setFont(22,'bold',DARK);
  doc.text(ticket.ticket_id||'', W-MR, 46, {align:'right'});
  setFont(8,'normal',SLATE);
  doc.text(fmtDate(new Date()), W-MR, 58, {align:'right'});

  // Status + Priority badges
  const STA_COLORS = {
    'Open':[99,102,241],'Assigned':[59,130,246],'In Progress':[245,158,11],
    'Report Submitted':[249,115,22],'Completed':[16,185,129],'Closed':[100,116,139]
  };
  const PRI_COLORS = { High:[239,68,68], Medium:[245,158,11], Low:[16,185,129] };
  let bx = W-MR;
  setFont(7,'bold',WHITE);
  const priW = doc.getTextWidth(ticket.priority||'')+12;
  bx -= priW;
  doc.setFillColor(...(PRI_COLORS[ticket.priority]||SLATE));
  doc.roundedRect(bx, 66, priW, 11, 2, 2, 'F');
  doc.text(ticket.priority||'', bx+6, 73.5);
  bx -= 5;
  const staW = doc.getTextWidth(ticket.status||'')+12;
  bx -= staW;
  doc.setFillColor(...(STA_COLORS[ticket.status]||SLATE));
  doc.roundedRect(bx, 66, staW, 11, 2, 2, 'F');
  doc.text(ticket.status||'', bx+6, 73.5);

  // Thick horizontal rule
  doc.setDrawColor(...DARK); doc.setLineWidth(1.5);
  doc.line(ML, 82, W-MR, 82);

  // Meta row: Customer / Service / Sales Agent / Created
  const metaItems = [
    ['Customer',    cleanName(ticket.customer_name||'-')],
    ['Service',     toTitleCase(ticket.service_type)||'-'],
    ['Sales Agent', cleanName(ticket.sales_agent||'-')],
    ['Created',     fmtDate(ticket.created_at)||'-'],
  ];
  const metaW = CW / metaItems.length;
  metaItems.forEach(([k,v], i) => {
    const mx = ML + i * metaW;
    setFont(6.5,'bold',SLATE);
    doc.text(k.toUpperCase(), mx, 95);
    setFont(9.5,'bold',DARK);
    doc.text(v.length>18?v.slice(0,18)+'\u2026':v, mx, 110);
  });

  // Light bottom rule
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.5);
  doc.line(0, 118, W, 118);

  y = 130;

  // ══════════════════════════════════════════════════════════════
  // TICKET DETAILS
  // ══════════════════════════════════════════════════════════════
  if (sel.details) {
    sectionHeader('Ticket Details');
    fieldGrid([
      ['Ticket ID',    ticket.ticket_id],
      ['Customer',     ticket.customer_name],
      ['Ref No',       ticket.job_no||'-'],
      ['Service Type', toTitleCase(ticket.service_type)],
      ['PLC Type',     ticket.plc_type||'-'],
      ['Warranty',     ticket.warranty_status==='in_warranty'?'In Warranty':'Billable'],
      ['Sales Agent',  ticket.sales_agent||'-'],
      ['Created',      fmtDate(ticket.created_at)],
      ['Deadline',     fmtDate(ticket.deadline_date)],
      ['Address',      ticket.address||'-'],
      ['Contact',      ticket.contact_name||'-'],
      ['Phone',        ticket.contact_phone||'-'],
    ]);
  }

  // ══════════════════════════════════════════════════════════════
  // ASSIGNED WORKERS
  // ══════════════════════════════════════════════════════════════
  if (sel.workers && assignments.length>0) {
    sectionHeader('Assigned Workers');
    const cw = [140,60,60,60,80,63];
    tableHeader(['Worker','Role','Sessions','Hours','Charged','Expense'], cw);
    for (const a of assignments) {
      const b = billing.find(x=>x.worker_id===a.worker_id)||{};
      const wSecs = sessions.filter(s=>s.worker_id===a.worker_id).reduce((acc,s)=>acc+(Number(s.total_seconds)||0),0);
      const wHrs = (wSecs/3600).toFixed(2)+'h';
      const wSessCount = sessions.filter(s=>s.worker_id===a.worker_id).length;
      tableRow(
        [a.worker_name, (a.role||'').toUpperCase(), wSessCount||'-', wHrs,
         b.charged_amount?inr(b.charged_amount):'Not billed',
         b.expense_amount?inr(b.expense_amount):'-'],
        cw,
        [DARK, BLUE, DARK, DARK, b.charged_amount?GREEN:AMBER, RED]
      );
    }
    y += 6;
  }

  // ══════════════════════════════════════════════════════════════
  // SESSION LOG
  // ══════════════════════════════════════════════════════════════
  if (sel.sessions && sessions.length>0) {
    const totalSecs = sessions.reduce((a,s)=>a+(Number(s.total_seconds)||0),0);
    sectionHeader(`Session Log  \u00b7  Total: ${fmtSecs(totalSecs)}`);
    const cw = [120,70,70,70,70,60];
    tableHeader(['Worker','Date','Start','End','Duration','Status'], cw);
    for (const s of sessions) {
      tableRow(
        [s.worker_name, fmtDate(s.started_at), fmtTime(s.started_at),
         s.ended_at?fmtTime(s.ended_at):'-', fmtSecs(s.total_seconds), s.status],
        cw, [DARK,DARK,DARK,DARK,DARK, s.status==='completed'?GREEN:AMBER]
      );
    }
    y += 6;
  }

  // ══════════════════════════════════════════════════════════════
  // BILLING SUMMARY
  // ══════════════════════════════════════════════════════════════
  if (sel.billing) {
    const totalCharged = billing.reduce((a,b)=>a+(Number(b.charged_amount)||0),0);
    const totalExpense = billing.reduce((a,b)=>a+(Number(b.expense_amount)||0),0);
    const totalSecs    = sessions.reduce((a,s)=>a+(Number(s.total_seconds)||0),0);
    sectionHeader('Billing Summary');
    checkPage(60);
    const billingRows = [
      ['Total charged to customer', inr(totalCharged), totalCharged>0?GREEN:RED],
      ['Total worker expense',       inr(totalExpense), RED],
      ['Total work hours',           `${(totalSecs/3600).toFixed(2)}h`, DARK],
    ];
    for (const [label,val,color] of billingRows) {
      checkPage(18);
      doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
      doc.line(ML, y+16, ML+CW, y+16);
      setFont(8, 'normal', SLATE);
      doc.text(label, ML, y+11);
      setFont(9, 'bold', color);
      doc.text(val, W-MR, y+11, {align:'right'});
      y += 16;
    }
    y += 6;
  }

  // ══════════════════════════════════════════════════════════════
  // COST & PROFIT
  // ══════════════════════════════════════════════════════════════
  if (sel.profit && billing.length>0) {
    sectionHeader('Cost & Profit');
    const cw = [140,80,80,80,80];
    tableHeader(['Worker','Charged','Expense','Profit','Margin'], cw);
    for (const b of billing) {
      const charged = Number(b.charged_amount||0);
      const expense = Number(b.expense_amount||0);
      const profit  = charged - expense;
      const margin  = charged>0?((profit/charged)*100).toFixed(1)+'%':'0%';
      tableRow(
        [b.worker_name, charged?inr(charged):'Not billed', expense?inr(expense):'-',
         (profit>=0?'+':'')+inr(profit), margin],
        cw, [DARK, GREEN, RED, profit>=0?GREEN:RED, profit>=0?GREEN:RED]
      );
    }
    y += 6;
  }

  // ══════════════════════════════════════════════════════════════
  // CHALLANS
  // ══════════════════════════════════════════════════════════════
  if (sel.challans && challans.length>0) {
    sectionHeader(`Challans (${challans.length})`);
    for (const ch of challans) {
      checkPage(28);
      doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
      doc.line(ML, y+24, ML+CW, y+24);
      setFont(9, 'bold', DARK);
      doc.text(cleanName(ch.challan_no||'No number'), ML, y+14);
      setFont(7.5, 'normal', SLATE);
      const sub = `Added by ${ch.added_by_name||'-'}  \u00b7  ${fmtDate(ch.created_at)}${ch.note?'  \u00b7  '+cleanName(ch.note):''}`;
      doc.text(sub, ML, y+22);
      if (ch.file_path) {
        const challanUrl = getFileUrl(ch.file_path);
        doc.setTextColor(...BLUE); doc.setFontSize(8); doc.setFont('helvetica','bold');
        doc.textWithLink('[ View File ]', W-MR, y+14, { url: challanUrl, align:'right' });
        doc.setTextColor(...DARK);
      }
      y += 28;
    }
    y += 4;
  }

  // ══════════════════════════════════════════════════════════════
  // FILE ROW HELPER
  // ══════════════════════════════════════════════════════════════
  async function drawFileRow(url, name, workerName, extra='') {
    checkPage(50);
    const cleanN = cleanName(name);
    const isImg  = isImage(cleanN);
    const fullUrl = getFileUrl(url);

    if (isImg && url) {
      const b64 = await toBase64(url);
      if (b64) {
        doc.setFillColor(248,249,250); doc.rect(ML, y, 48, 40, 'F');
        doc.setDrawColor(...BORDER); doc.setLineWidth(0.3); doc.rect(ML, y, 48, 40);
        try { doc.addImage(b64,'PNG',ML+1,y+1,46,38); } catch(e) {}
        setFont(8.5, 'bold', DARK);
        doc.text(cleanN.length>40?cleanN.slice(0,40)+'\u2026':cleanN, ML+56, y+14);
        setFont(7.5, 'normal', SLATE);
        doc.text(workerName+(extra?'  \u00b7  '+extra:''), ML+56, y+26);
        doc.setTextColor(...BLUE); doc.setFontSize(8); doc.setFont('helvetica','bold');
        doc.textWithLink('[ View File ]', ML+56, y+36, { url: fullUrl });
        doc.setTextColor(...DARK);
        y += 44;
        return;
      }
    }
    const icon = isPdf(cleanN)?'PDF':'FILE';
    drawRect(ML, y, 48, 36, [239,246,255], 4);
    setFont(8, 'bold', BLUE); doc.text(icon, ML+14, y+22);
    setFont(8.5, 'bold', DARK);
    doc.text(cleanN.length>42?cleanN.slice(0,42)+'\u2026':cleanN, ML+56, y+13);
    setFont(7.5, 'normal', SLATE);
    doc.text(workerName+(extra?'  \u00b7  '+extra:''), ML+56, y+25);
    doc.setTextColor(...BLUE); doc.setFontSize(8); doc.setFont('helvetica','bold');
    doc.textWithLink('[ View File ]', ML+56, y+35, { url: fullUrl });
    doc.setTextColor(...DARK);
    y += 42;
  }

  // ══════════════════════════════════════════════════════════════
  // INQUIRY ATTACHMENTS
  // ══════════════════════════════════════════════════════════════
  if (sel.media && (media.length>0||documents.length>0)) {
    sectionHeader(`Inquiry Attachments (${media.length+documents.length})`);
    const allFiles = [...media,...documents];
    const imgs = allFiles.filter(f=>isImage(cleanName(f.original_name||f.file_name||f.name||'')));
    const rest = allFiles.filter(f=>!isImage(cleanName(f.original_name||f.file_name||f.name||'')));
    if (imgs.length>0) {
      const gridW = (CW-9)/4;
      let col=0; let rowY=y;
      for (const f of imgs) {
        const url = f.file_path||f.url;
        const absUrl = getFileUrl(url);
        const b64 = absUrl?await toBase64(absUrl):null;
        const x = ML + col*(gridW+3);
        drawRect(x, rowY, gridW, gridW*0.75, LIGHT, 4);
        if (b64) {
          try { doc.addImage(b64,'PNG',x+2,rowY+2,gridW-4,gridW*0.75-4); } catch(e){}
        }
        setFont(6.5,'normal',SLATE);
        const nm = cleanName(f.original_name||f.file_name||'');
        doc.text(nm.length>16?nm.slice(0,16)+'\u2026':nm, x+2, rowY+gridW*0.75+8);
        col++;
        if (col>=4) { col=0; rowY+=gridW*0.75+16; checkPage(gridW*0.75+16); }
      }
      if (col>0) rowY+=gridW*0.75+16;
      y=rowY;
    }
    for (const f of rest) {
      const url = f.file_path||f.url;
      const absUrl = url?.startsWith('http')?url:`${window.location.origin}${url}`;
      await drawFileRow(absUrl, f.original_name||f.file_name||'File', 'Inquiry attachment');
    }
    y += 4;
  }

  // ══════════════════════════════════════════════════════════════
  // WORKER REPORT FILES
  // ══════════════════════════════════════════════════════════════
  if (sel.report && billing.some(b=>b.all_report_files?.length>0)) {
    sectionHeader('Worker Report Files');
    for (const b of billing) {
      for (const f of (b.all_report_files||[])) {
        await drawFileRow(getFileUrl(f.url), f.name||'Report', b.worker_name);
      }
    }
    y += 4;
  }

  // ══════════════════════════════════════════════════════════════
  // EXPENSE PROOF
  // ══════════════════════════════════════════════════════════════
  if (sel.expense && billing.some(b=>b.all_expense_files?.length>0)) {
    sectionHeader('Expense Proof');
    for (const b of billing) {
      for (const f of (b.all_expense_files||[])) {
        const extra = f.amount?inr(f.amount):'';
        await drawFileRow(getFileUrl(f.url), f.name||'Expense', b.worker_name, extra);
      }
    }
    y += 4;
  }

  // ══════════════════════════════════════════════════════════════
  // WORK LOG
  // ══════════════════════════════════════════════════════════════
  if (sel.worklogs && worklogs.length>0) {
    sectionHeader(`Work Log  \u00b7  ${worklogs.length} entr${worklogs.length!==1?'ies':'y'}`);
    const wlCw = [55, 95, CW-150];
    // Table header
    doc.setFillColor(248,249,250);
    doc.rect(ML, y, CW, 14, 'F');
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
    doc.line(ML, y+14, ML+CW, y+14);
    setFont(6.5, 'bold', SLATE);
    let wx = ML+3;
    ['Time','Worker','Work Done'].forEach((h,i)=>{ doc.text(h.toUpperCase(), wx, y+9.5); wx+=wlCw[i]; });
    y += 15;

    const wlByDate = {};
    for (const wl of worklogs) {
      const d = wl.log_date?.slice(0,10)||'';
      if (!wlByDate[d]) wlByDate[d]=[];
      wlByDate[d].push(wl);
    }
    let rowIdx = 0;
    for (const [date, entries] of Object.entries(wlByDate).sort()) {
      checkPage(12);
      doc.setFillColor(241,245,249);
      doc.rect(ML, y, CW, 11, 'F');
      setFont(7, 'bold', SLATE);
      doc.text(
        new Date(date+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'}),
        ML+4, y+7.5
      );
      y += 12;
      for (const wl of entries) {
        const timeStr   = (wl.log_time||'').slice(0,5);
        const workerStr = cleanName(wl.worker_name||'');
        const descLines = doc.splitTextToSize(cleanName(wl.description||''), wlCw[2]-6);
        const rowH      = Math.max(14, descLines.length*5+8);
        checkPage(rowH+2);
        if (rowIdx%2===0) { doc.setFillColor(255,255,255); } else { doc.setFillColor(250,250,251); }
        doc.rect(ML, y, CW, rowH, 'F');
        doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
        doc.line(ML, y+rowH, ML+CW, y+rowH);
        setFont(8, 'normal', SLATE);
        doc.text(timeStr, ML+3, y+rowH/2+2);
        setFont(8, 'bold', DARK);
        doc.text(workerStr, ML+wlCw[0]+3, y+rowH/2+2);
        setFont(8, 'normal', DARK);
        descLines.forEach((line,li)=> doc.text(line, ML+wlCw[0]+wlCw[1]+3, y+6+li*5));
        y += rowH+1;
        rowIdx++;
      }
    }
    y += 6;
  }

  // ══════════════════════════════════════════════════════════════
  // INTERNAL NOTES
  // ══════════════════════════════════════════════════════════════
  if (sel.notes && notes.length>0) {
    sectionHeader(`Internal Notes (${notes.length})`);
    for (const n of notes.filter(n=>!n.is_unsent)) {
      let rawBody = (n.body||n.content||'')
        .replace(/@\[([^\]]+)\]\([^)]+\)/g,'@$1')
        .replace(/@everyone|@me/g,'')
        .trim();
      if (/[^\x00-\x7F]/.test(rawBody)) {
        rawBody = '[Note written in regional language — please view in the app]';
      }
      const lines = doc.splitTextToSize(cleanName(rawBody), CW-16);
      const boxH = Math.max(30, lines.length*11+16);
      checkPage(boxH+6);
      doc.setFillColor(249,250,251);
      doc.rect(ML, y, CW, boxH, 'F');
      doc.setDrawColor(...BORDER); doc.setLineWidth(0.5);
      doc.rect(ML, y, CW, boxH);
      setFont(8,'bold',DARK);
      doc.text(cleanName(n.author_name||'-'), ML+8, y+11);
      setFont(7,'normal',SLATE);
      doc.text(`${fmtDate(n.created_at)}  ${fmtTime(n.created_at)}`, W-MR-8, y+11, {align:'right'});
      setFont(8,'normal',DARK);
      doc.text(lines, ML+8, y+22);
      y += boxH+6;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // FOOTER — on every page
  // ══════════════════════════════════════════════════════════════
  const totalPages = doc.internal.getNumberOfPages();
  for (let i=1; i<=totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(248,250,252);
    doc.rect(0, H-26, W, 26, 'F');
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.5);
    doc.line(0, H-26, W, H-26);
    doc.setFillColor(...BLUE);
    doc.rect(0, H-26, 4, 26, 'F');
    setFont(7,'bold',BLUE);
    doc.text('CESS Group', ML+6, H-13);
    setFont(7,'normal',SLATE);
    doc.text('  \u00b7  service.cessgroup.in', ML+42, H-13);
    setFont(7,'normal',[148,163,184]);
    doc.text(`${ticket.ticket_id}  \u00b7  Confidential`, W/2, H-13, {align:'center'});
    setFont(7,'bold',SLATE);
    doc.text(`Page ${i} of ${totalPages}`, W-MR, H-13, {align:'right'});
  }

  doc.save(`${ticket.ticket_id}_report.pdf`);
}

export default function TicketPdfReport({ data, onClose }) {
  const [sel, setSel] = useState({
    details:true, workers:true, sessions:true, billing:true,
    profit:true, challans:true, media:true, report:true, expense:true, worklogs:true, notes:true,
  });
  const [generating, setGenerating] = useState(false);
  const toggle = k => setSel(p=>({...p,[k]:!p[k]}));

  const generate = async () => {
    setGenerating(true);
    try { await buildPdf(data, sel); }
    catch(e){ console.error(e); alert('PDF failed: '+e.message); }
    finally { setGenerating(false); }
  };

  const ticket   = data?.ticket || {};
  const worklogs = data?.worklogs || [];
  const notes    = data?.notes || [];
  const billing  = data?.billing || [];
  const sessions = data?.sessions || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-black text-slate-900">Ticket Report</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{ticket.ticket_id} · {ticket.customer_name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-sm font-bold">✕</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* LEFT — Section toggles */}
          <div className="w-48 flex-shrink-0 border-r border-slate-100 p-4 overflow-y-auto">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Sections</p>
            <div className="flex flex-col gap-1.5">
              {CHECKS.map(ch=>(
                <button key={ch.key} onClick={()=>toggle(ch.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all text-left ${
                    sel[ch.key]?'bg-blue-50 border-blue-200 text-blue-700':'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}>
                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${sel[ch.key]?'border-blue-500 bg-blue-500':'border-slate-300'}`}>
                    {sel[ch.key]&&<svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                  </span>
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT — Preview */}
          <div className="flex-1 overflow-y-auto p-5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Preview</p>

            {sel.details && (
              <div className="mb-4 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Ticket Info</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[['Ticket',ticket.ticket_id],['Customer',ticket.customer_name],['Service',ticket.service_type?.replace(/_/g,' ')],['Status',ticket.status],['Priority',ticket.priority],['Ref No',ticket.job_no||'—']].map(([k,v])=>(
                    <div key={k}><span className="text-[9px] font-bold text-slate-400 uppercase">{k}: </span><span className="text-[11px] font-semibold text-slate-700">{v||'—'}</span></div>
                  ))}
                </div>
              </div>
            )}

            {sel.workers && billing.length > 0 && (
              <div className="mb-4 p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-2">Workers · {billing.length}</p>
                {billing.map(b=>(
                  <div key={b.worker_id} className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-bold text-slate-700">{b.worker_name}</span>
                    <span className="text-slate-500">{(b.role||'').toUpperCase()} · {Math.round((b.total_seconds||0)/3600*10)/10}h</span>
                  </div>
                ))}
              </div>
            )}

            {sel.sessions && sessions.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">Session Log · {sessions.length} sessions</p>
                {sessions.slice(0,3).map((s,i)=>(
                  <div key={i} className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-bold text-slate-700">{s.worker_name||'Worker'}</span>
                    <span className="text-slate-500">{s.started_at?.slice(0,10)} · {Math.round((s.total_seconds||0)/60)}m</span>
                  </div>
                ))}
              </div>
            )}

            {sel.billing && billing.length > 0 && (
              <div className="mb-4 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Billing Summary</p>
                {billing.map(b=>(
                  <div key={b.worker_id} className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-bold text-slate-700">{b.worker_name}</span>
                    <span className="text-slate-500">Charged: ₹{b.charged_amount||0} · Exp: ₹{b.expense_amount||0}</span>
                  </div>
                ))}
                <div className="mt-1 pt-1 border-t border-slate-200 flex justify-between text-[11px] font-bold">
                  <span>Total</span><span>₹{billing.reduce((a,b)=>a+(Number(b.charged_amount)||0),0)}</span>
                </div>
              </div>
            )}

            {sel.profit && billing.length > 0 && (
              <div className="mb-4 p-3 bg-green-50 rounded-2xl border border-green-100">
                <p className="text-[10px] font-bold text-green-500 uppercase tracking-wider mb-2">Cost & Profit</p>
                {billing.map(b=>{ const c=Number(b.charged_amount||0),e=Number(b.expense_amount||0),p=c-e; return (
                  <div key={b.worker_id} className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-bold text-slate-700">{b.worker_name}</span>
                    <span className={`font-bold ${p>=0?'text-emerald-600':'text-red-500'}`}>{p>=0?'+':''}{p.toLocaleString('en-IN')}</span>
                  </div>
                );})}
              </div>
            )}

            {sel.challans && data?.challans?.length > 0 && (
              <div className="mb-4 p-3 bg-orange-50 rounded-2xl border border-orange-100">
                <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wider mb-2">Challans · {data.challans.length}</p>
                {data.challans.map((ch,i)=>(
                  <div key={i} className="text-[11px] mb-1 font-bold text-slate-700">{ch.challan_no||'No number'}{ch.note&&<span className="font-normal text-slate-500 ml-2">{ch.note}</span>}</div>
                ))}
              </div>
            )}

            {sel.report && billing.some(b=>b.all_report_files?.length>0) && (
              <div className="mb-4 p-3 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">Worker Report Files</p>
                {billing.map(b=>(b.all_report_files||[]).map((f,i)=>(
                  <div key={i} className="flex items-center gap-2 text-[11px] mb-1">
                    <svg className="w-3 h-3 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span className="text-blue-600 font-medium">{f.name||`Report ${i+1}`}</span>
                    <span className="text-slate-400">· {b.worker_name}</span>
                  </div>
                )))}
              </div>
            )}

            {sel.expense && billing.some(b=>b.all_expense_files?.length>0) && (
              <div className="mb-4 p-3 bg-amber-50 rounded-2xl border border-amber-100">
                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2">Expense Proof Files</p>
                {billing.map(b=>(b.all_expense_files||[]).map((f,i)=>(
                  <div key={i} className="flex items-center gap-2 text-[11px] mb-1">
                    <svg className="w-3 h-3 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span className="text-amber-600 font-medium">{f.name||`Expense ${i+1}`}</span>
                    <span className="text-slate-400">· {b.worker_name}</span>
                  </div>
                )))}
              </div>
            )}

            {sel.worklogs && worklogs.length > 0 && (
              <div className="mb-4 p-3 bg-violet-50 rounded-2xl border border-violet-100">
                <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-2">Work Log · {worklogs.length} entr{worklogs.length!==1?'ies':'y'}</p>
                {worklogs.slice(0,4).map(wl=>(
                  <div key={wl.id} className="flex gap-2 mb-1">
                    <span className="text-[10px] font-bold text-violet-400 flex-shrink-0 w-28">{wl.log_date?.slice(0,10)} {wl.log_time?.slice(0,5)}</span>
                    <div><span className="text-[10px] font-bold text-slate-700">{wl.worker_name} </span><span className="text-[11px] text-slate-600">{wl.description}</span></div>
                  </div>
                ))}
                {worklogs.length>4 && <p className="text-[10px] text-slate-400 italic">+{worklogs.length-4} more in PDF</p>}
              </div>
            )}

            {sel.notes && notes.length > 0 && (
              <div className="mb-4 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Notes · {notes.filter(n=>!n.is_unsent).length}</p>
                {notes.filter(n=>!n.is_unsent).slice(0,3).map(n=>(
                  <div key={n.id} className="text-[11px] text-slate-600 mb-1">
                    <span className="font-bold text-slate-700">{n.author_name}: </span>{n.body?.slice(0,80)}{n.body?.length>80?'…':''}
                  </div>
                ))}
              </div>
            )}

            {!Object.values(sel).some(Boolean) && (
              <div className="text-center py-8 text-slate-400 text-sm">No sections selected</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <span className="text-[11px] text-slate-400">{Object.values(sel).filter(Boolean).length} of {CHECKS.length} sections selected</span>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium">Cancel</button>
            <button onClick={generate} disabled={generating}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-2xl disabled:opacity-60">
              {generating
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block"/> Generating...</>
                : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download PDF</>
              }
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}