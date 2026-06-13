import React, { useState } from 'react';
import jsPDF from 'jspdf';
import svcApi from '../../serviceApi';

const inr = n => `Rs.${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fmtTime = d => d ? new Date(d).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '-';
const fmtSecs = s => { const m=Math.floor((s||0)/60); return m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m}m`; };
const cleanName = s => (s||'').replace(/[\u00e2\u0080\u00af\u00a0]/g,' ').replace(/\s+/g,' ').trim();

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
  { key:'notes',    label:'Internal notes' },
];

async function toBase64(url) {
  if (!url) return null;
  try {
    // Always fetch from backend origin (port 5000 in dev, same origin in prod)
    const backendOrigin = window.location.port === '3000'
      ? `${window.location.protocol}//${window.location.hostname}:5000`
      : window.location.origin;
    // Replace origin in url if it points to port 3000
    const fetchUrl = url.includes('localhost:3000')
      ? url.replace('localhost:3000', `${window.location.hostname}:5000`)
      : url.startsWith('/') ? `${backendOrigin}${url}` : url;
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
  const { ticket, assignments=[], sessions=[], billing=[], challans=[], notes=[], media=[], documents=[] } = data;
  const doc = new jsPDF({ orientation:'portrait', unit:'pt', format:'a4' });
  const W = doc.internal.pageSize.getWidth();   // 595
  const H = doc.internal.pageSize.getHeight();  // 842
  const ML = 36, MR = 36, MT = 36;
  const CW = W - ML - MR;

  // Colors
  const DARK   = [15, 23, 42];
  const BLUE   = [37, 99, 235];
  const GREEN  = [5, 150, 105];
  const AMBER  = [217, 119, 6];
  const RED    = [220, 38, 38];
  const SLATE  = [100, 116, 139];
  const LIGHT  = [248, 250, 252];
  const BORDER = [226, 232, 240];
  const WHITE  = [255, 255, 255];

  let y = 0;

  function newPage() {
    doc.addPage();
    y = MT;
  }

  function checkPage(needed) {
    if (y + needed > H - 40) newPage();
  }

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

  function sectionHeader(title) {
    checkPage(30);
    y += 14;
    setFont(7.5, 'bold', SLATE);
    doc.text(title.toUpperCase(), ML, y);
    y += 4;
    drawLine(ML, y, W-MR, BORDER);
    y += 10;
  }

  function fieldGrid(fields, cols=3) {
    const colW = CW / cols;
    const cellH = 32;
    let col = 0, rowY = y;
    for (const [label, value] of fields) {
      const x = ML + col * colW;
      drawRect(x+1, rowY, colW-3, cellH, LIGHT, 4);
      setFont(7, 'normal', SLATE);
      doc.text(label, x+6, rowY+10);
      setFont(9, 'bold', DARK);
      const val = String(value||'-');
      doc.text(val.length>22?val.slice(0,22)+'…':val, x+6, rowY+22);
      col++;
      if (col >= cols) { col=0; rowY+=cellH+3; }
    }
    if (col > 0) rowY += cellH+3;
    y = rowY;
  }

  function tableHeader(headers, colWidths) {
    checkPage(20);
    drawRect(ML, y, CW, 18, LIGHT, 3);
    let x = ML+4;
    setFont(7, 'bold', SLATE);
    for (let i=0; i<headers.length; i++) {
      doc.text(headers[i].toUpperCase(), x, y+12);
      x += colWidths[i];
    }
    y += 18;
  }

  function tableRow(cells, colWidths, colors=[]) {
    checkPage(22);
    drawLine(ML, y, W-MR);
    let x = ML+4;
    for (let i=0; i<cells.length; i++) {
      const color = colors[i] || DARK;
      setFont(8, i===0?'bold':'normal', color);
      const val = String(cells[i]||'-');
      doc.text(val.length>24?val.slice(0,24)+'…':val, x, y+14);
      x += colWidths[i];
    }
    y += 22;
  }

  // ── HEADER ──────────────────────────────────────────────────────
  drawRect(0, 0, W, 70, DARK, 0);
  // Logo box
  drawRect(ML, 15, 42, 42, WHITE, 6);
  setFont(10, 'bold', DARK);
  doc.text('CESS', ML+7, 41);
  // Company name
  setFont(13, 'bold', WHITE);
  doc.text('CESS Group \u2014 Service Report', ML+52, 34);
  setFont(8, 'normal', [148,163,184]);
  doc.text('Cess Automation India LLP  \u00b7  service.cessgroup.in', ML+52, 48);
  // Ticket ID
  setFont(22, 'bold', WHITE);
  doc.text(ticket.ticket_id, W-MR, 36, {align:'right'});
  setFont(8, 'normal', [148,163,184]);
  doc.text(`Generated: ${fmtDate(new Date())}  ${fmtTime(new Date())}`, W-MR, 50, {align:'right'});
  // Status badges
  const STA_COLORS = {
    'Open':[99,102,241],'Assigned':[59,130,246],'In Progress':[245,158,11],
    'Report Submitted':[249,115,22],'Completed':[16,185,129],'Closed':[100,116,139]
  };
  const PRI_COLORS = { High:[239,68,68], Medium:[245,158,11], Low:[16,185,129] };
  let bx = W-MR;
  const priBadgeColor = PRI_COLORS[ticket.priority]||SLATE;
  const staBadgeColor = STA_COLORS[ticket.status]||SLATE;
  setFont(7, 'bold', WHITE);
  const priW = doc.getTextWidth(ticket.priority||'')+10;
  bx -= priW;
  drawRect(bx, 55, priW, 12, priBadgeColor, 5);
  doc.text(ticket.priority||'', bx+5, 64);
  bx -= 4;
  const staW = doc.getTextWidth(ticket.status||'')+10;
  bx -= staW;
  drawRect(bx, 55, staW, 12, staBadgeColor, 5);
  doc.text(ticket.status||'', bx+5, 64);

  y = 82;

  // ── TICKET DETAILS ──────────────────────────────────────────────
  if (sel.details) {
    sectionHeader('Ticket Details');
    fieldGrid([
      ['Ticket ID',    ticket.ticket_id],
      ['Customer',     ticket.customer_name],
      ['Ref No',       ticket.job_no],
      ['Service Type', ticket.service_type],
      ['PLC Type',     ticket.plc_type],
      ['Warranty',     ticket.warranty_status==='in_warranty'?'In Warranty':'Billable'],
      ['Sales Agent',  ticket.sales_agent],
      ['Created',      fmtDate(ticket.created_at)],
      ['Deadline',     fmtDate(ticket.deadline_date)],
      ['Address',      ticket.address],
      ['Contact',      ticket.contact_name],
      ['Phone',        ticket.contact_phone],
    ]);
    if (ticket.description) {
      checkPage(30);
      drawRect(ML, y, CW, 28, LIGHT, 4);
      setFont(7, 'normal', SLATE);
      doc.text('Description', ML+6, y+9);
      setFont(8.5, 'normal', DARK);
      const desc = doc.splitTextToSize(ticket.description, CW-12);
      doc.text(desc[0]+(desc.length>1?'...':''), ML+6, y+20);
      y += 32;
    }
  }

  // ── ASSIGNED WORKERS ────────────────────────────────────────────
  if (sel.workers && assignments.length>0) {
    sectionHeader('Assigned Workers');
    const cw = [140,60,60,60,80,80];
    tableHeader(['Worker','Role','Sessions','Hours','Charged','Expense'], cw);
    for (const a of assignments) {
      const b = billing.find(x=>x.worker_id===a.worker_id)||{};
      const wSecs = sessions.filter(s=>s.worker_id===a.worker_id).reduce((acc,s)=>acc+(Number(s.total_seconds)||0),0);
      const wHrs = (wSecs/3600).toFixed(2)+'h';
      const wSessCount = sessions.filter(s=>s.worker_id===a.worker_id).length;
      tableRow(
        [a.worker_name, a.role?.toUpperCase(), wSessCount, wHrs,
         b.charged_amount?inr(b.charged_amount):'Not billed',
         b.expense_amount?inr(b.expense_amount):'-'],
        cw,
        [DARK, BLUE, DARK, DARK, b.charged_amount?GREEN:AMBER, RED]
      );
    }
    y += 6;
  }

  // ── SESSION LOG ─────────────────────────────────────────────────
  if (sel.sessions && sessions.length>0) {
    const totalSecs = sessions.reduce((a,s)=>a+(Number(s.total_seconds)||0),0);
    sectionHeader(`Session Log  \u00b7  Total: ${fmtSecs(totalSecs)}`);
    const cw = [120,70,70,70,70,60];
    tableHeader(['Worker','Date','Start','End','Duration','Status'], cw);
    for (const s of sessions) {
      const stColor = s.status==='completed'?GREEN:AMBER;
      tableRow(
        [s.worker_name, fmtDate(s.started_at), fmtTime(s.started_at),
         s.ended_at?fmtTime(s.ended_at):'-', fmtSecs(s.total_seconds), s.status],
        cw, [DARK,DARK,DARK,DARK,DARK,stColor]
      );
    }
    y += 6;
  }

  // ── BILLING SUMMARY ─────────────────────────────────────────────
  if (sel.billing) {
    const totalCharged = billing.reduce((a,b)=>a+(Number(b.charged_amount)||0),0);
    const totalExpense = billing.reduce((a,b)=>a+(Number(b.expense_amount)||0),0);
    const totalSecs    = sessions.reduce((a,s)=>a+(Number(s.total_seconds)||0),0);
    sectionHeader('Billing Summary');
    checkPage(70);
    const rows = [
      ['Total charged to customer', inr(totalCharged), totalCharged>0?GREEN:AMBER],
      ['Total worker expense',       inr(totalExpense), RED],
      ['Total work hours',           `${(totalSecs/3600).toFixed(2)}h`, DARK],
    ];
    for (const [label,val,color] of rows) {
      drawRect(ML, y, CW, 20, LIGHT, 3);
      setFont(9, 'normal', SLATE);
      doc.text(label, ML+8, y+13);
      setFont(10, 'bold', color);
      doc.text(val, W-MR-8, y+13, {align:'right'});
      y += 23;
    }
    y += 4;
  }

  // ── COST & PROFIT ───────────────────────────────────────────────
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

  // ── CHALLANS ────────────────────────────────────────────────────
  if (sel.challans && challans.length>0) {
    sectionHeader(`Challans (${challans.length})`);
    for (const ch of challans) {
      checkPage(28);
      drawRect(ML, y, CW, 24, LIGHT, 4);
      setFont(9, 'bold', DARK);
      doc.text(cleanName(ch.challan_no||'No number'), ML+8, y+14);
      setFont(7.5, 'normal', SLATE);
      const sub = `Added by ${ch.added_by_name||'-'}  \u00b7  ${fmtDate(ch.created_at)}${ch.note?'  \u00b7  '+cleanName(ch.note):''}`;
      doc.text(sub, ML+8, y+22);
      if (ch.file_path) {
        const challanUrl = getFileUrl(ch.file_path);
        setFont(7, 'bold', BLUE);
        doc.setTextColor(...BLUE); doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.textWithLink('[ View File ]', W-MR-8, y+14, { url: challanUrl, align:'right' }); doc.setTextColor(...DARK);
      }
      y += 28;
    }
    y += 4;
  }

  // ── IMAGE HELPER ────────────────────────────────────────────────
  async function drawFileRow(url, name, workerName, extra='') {
    checkPage(50);
    const cleanN = cleanName(name);
    const isImg  = isImage(cleanN);
    const isPDF  = isPdf(cleanN);

    const fullUrl = getFileUrl(url);
    if (isImg && url) {
      const b64 = await toBase64(url);
      if (b64) {
        drawRect(ML, y, 48, 40, LIGHT, 4);
        try { doc.addImage(b64,'PNG',ML+1,y+1,46,38); } catch(e) {}
        setFont(8.5, 'bold', DARK);
        doc.text(cleanN.length>40?cleanN.slice(0,40)+'…':cleanN, ML+56, y+14);
        setFont(7.5, 'normal', SLATE);
        doc.text(workerName+(extra?'  ·  '+extra:''), ML+56, y+26);
        // Clickable link over filename text
        setFont(7.5, 'normal', BLUE);
        doc.setTextColor(...BLUE); doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.textWithLink('[ View File ]', ML+56, y+36, { url: fullUrl }); doc.setTextColor(...DARK);
        y += 44;
        return;
      }
    }
    // Non-image or failed image
    const icon = isPDF?'PDF':'FILE';
    drawRect(ML, y, 48, 36, [239,246,255], 4);
    setFont(8, 'bold', BLUE);
    doc.text(icon, ML+14, y+22);
    setFont(8.5, 'bold', DARK);
    doc.text(cleanN.length>42?cleanN.slice(0,42)+'…':cleanN, ML+56, y+13);
    setFont(7.5, 'normal', SLATE);
    doc.text(workerName+(extra?'  ·  '+extra:''), ML+56, y+25);
    // Clickable link
    setFont(7.5, 'normal', BLUE);
    doc.setTextColor(...BLUE); doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.textWithLink('[ View File ]', ML+56, y+35, { url: fullUrl }); doc.setTextColor(...DARK);
    y += 42;
  }

  // ── INQUIRY ATTACHMENTS ─────────────────────────────────────────
  if (sel.media && (media.length>0||documents.length>0)) {
    sectionHeader(`Inquiry Attachments (${media.length+documents.length})`);
    const allFiles = [...media,...documents];
    // Images in a 4-column grid first
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
        } else {
          setFont(7,'normal',SLATE); doc.text('Image', x+gridW/2-8, rowY+gridW*0.38, {align:'left'});
        }
        setFont(6.5,'normal',SLATE);
        const nm = cleanName(f.original_name||f.file_name||'');
        doc.text(nm.length>16?nm.slice(0,16)+'…':nm, x+2, rowY+gridW*0.75+8);
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

  // ── WORKER REPORT FILES ─────────────────────────────────────────
  if (sel.report && billing.some(b=>b.all_report_files?.length>0)) {
    sectionHeader('Worker Report Files');
    for (const b of billing) {
      for (const f of (b.all_report_files||[])) {
        const absUrl = getFileUrl(f.url);
        await drawFileRow(absUrl, f.name||'Report', b.worker_name);
      }
    }
    y += 4;
  }

  // ── EXPENSE PROOF ───────────────────────────────────────────────
  if (sel.expense && billing.some(b=>b.all_expense_files?.length>0)) {
    sectionHeader('Expense Proof');
    for (const b of billing) {
      for (const f of (b.all_expense_files||[])) {
        const absUrl = getFileUrl(f.url);
        const extra = f.amount?inr(f.amount):'';
        await drawFileRow(absUrl, f.name||'Expense', b.worker_name, extra);
      }
    }
    y += 4;
  }

  // ── INTERNAL NOTES ──────────────────────────────────────────────
  if (sel.notes && notes.length>0) {
    sectionHeader(`Internal Notes (${notes.length})`);
    for (const n of notes) {
      const lines = doc.splitTextToSize(n.content||'', CW-60);
      const boxH = Math.max(30, lines.length*12+16);
      checkPage(boxH+6);
      drawRect(ML, y, CW, boxH, [255,251,235], 4);
      doc.setDrawColor(253,230,138); doc.setLineWidth(0.5);
      doc.rect(ML,y,CW,boxH);
      setFont(8,'bold',DARK);
      doc.text(n.author_name||'-', ML+8, y+11);
      setFont(7,'normal',SLATE);
      doc.text(`${fmtDate(n.created_at)}  ${fmtTime(n.created_at)}`, W-MR-8, y+11, {align:'right'});
      setFont(8,'normal',DARK);
      doc.text(lines, ML+8, y+22);
      y += boxH+6;
    }
  }

  // ── FOOTER on every page ─────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let i=1; i<=totalPages; i++) {
    doc.setPage(i);
    drawLine(ML, H-28, W-MR, BORDER);
    setFont(7,'normal',SLATE);
    doc.text('CESS Group  \u00b7  service.cessgroup.in', ML, H-18);
    doc.text(`${ticket.ticket_id}  \u00b7  Confidential`, W/2, H-18, {align:'center'});
    doc.text(`Page ${i} of ${totalPages}`, W-MR, H-18, {align:'right'});
  }

  doc.save(`${ticket.ticket_id}_report.pdf`);
}

export default function TicketPdfReport({ data, onClose }) {
  const [sel, setSel] = useState({
    details:true, workers:true, sessions:true, billing:true,
    profit:true, challans:true, media:true, report:true, expense:true, notes:false,
  });
  const [generating, setGenerating] = useState(false);
  const toggle = k => setSel(p=>({...p,[k]:!p[k]}));

  const generate = async () => {
    setGenerating(true);
    try { await buildPdf(data, sel); }
    catch(e){ console.error(e); alert('PDF failed: '+e.message); }
    finally { setGenerating(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-black text-slate-900">Download Ticket Report</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Select sections to include in the PDF</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-sm font-bold">x</button>
        </div>
        <div className="px-6 py-4">
          <div className="flex flex-wrap gap-2">
            {CHECKS.map(c=>(
              <button key={c.key} onClick={()=>toggle(c.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                  sel[c.key]?'bg-blue-50 border-blue-200 text-blue-700':'bg-slate-50 border-slate-200 text-slate-500'
                }`}>
                {sel[c.key]?'✓':'○'} {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium">Cancel</button>
          <button onClick={generate} disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-2xl disabled:opacity-60">
            {generating
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block"/> Generating...</>
              : <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download PDF
                </>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
