import React, { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const SVC = [
  { value:'installation',    label:'Installation',    prefix:'IN', desc:'Set up new equipment' },
  { value:'troubleshooting', label:'Troubleshooting', prefix:'SE', desc:'Diagnose & fix issues' },
  { value:'new_development', label:'New Development', prefix:'SE', desc:'Custom build / project' },
  { value:'after_sales',     label:'After Sales',     prefix:'SE', desc:'Post-sale support' },
];
const AGENTS = ['Divy Shah','Chirag Shah','Ketan Tundiya','Chetankumar Shah','Pankaj Rana','Vivardhan Gandhi','Nikita Koshti','Yogita Shah'];
// const INIT = { customer_name:'', address:'', service_type:'', description:'', contact_name:'', contact_phone:'', designation:'', sales_agent:'', priority:'Medium', needs_plc:false, needs_wiring:false, plc_type:'' };
const INIT = {
  customer_name:'', address:'', service_type:'', description:'',
  contact_name:'', contact_phone:'', designation:'', sales_agent:'',
  priority:'Medium', needs_plc:false, needs_wiring:false, plc_type:'',
  warranty_status:'in_warranty',
  invoice_no:'', challan_no:''
};

// const FLabel = ({ children }) => <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">{children}</label>;
// const FInput = (p) => <input {...p} className={`w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all ${p.className||''}`}/>;
// const FSel   = (p) => <select {...p} className={`w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 outline-none focus:border-slate-400 focus:bg-white transition-all ${p.className||''}`}/>;
/* ─── Reusable form atoms (defined OUTSIDE components to keep refs stable) ─── */
const FLabel = ({ children }) => (
  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">{children}</label>
);
const FInput = (p) => (
  <input
    {...p}
    className={`w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all ${p.className||''}`}
  />
);
const FSel = (p) => (
  <select
    {...p}
    className={`w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 outline-none focus:border-slate-400 focus:bg-white transition-all ${p.className||''}`}
  />
);

export default function InquiryForm() {
  const [form,  setForm]  = useState(INIT);
  const [files, setFiles] = useState([]);
  const [done,  setDone]  = useState(null);
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState('');
  const [step,  setStep]  = useState(1);

  const set = (k,v) => setForm(p => ({...p, [k]: v}));
  const sel = SVC.find(s => s.value === form.service_type);

  const addFiles = e => setFiles(p => [...p, ...Array.from(e.target.files)].slice(0,10));
  const rmFile   = i => setFiles(p => p.filter((_,idx) => idx !== i));
  const fIcon    = f => f.type.startsWith('image/') ? '🖼' : f.type.startsWith('video/') ? '🎬' : '🎤';

  const goNext = (to) => {
    setErr('');
    if (to === 2 && (!form.customer_name.trim() || !form.address.trim() || !form.service_type)) { setErr('Please fill all required fields'); return; }
    setStep(to);
  };

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const { data: ticket } = await axios.post('/api/service/tickets', form);
      if (files.length) {
        const fd = new FormData();
        files.forEach(f => fd.append('files', f));
        await axios.post(`/api/service/tickets/${ticket.id}/media`, fd);
      }
      setDone(ticket);
    } catch (e) { setErr(e.response?.data?.error || 'Submission failed. Please try again.'); }
    finally { setBusy(false); }
  };

  /* ─── SUCCESS SCREEN ─── */
  if (done) return (
    <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center px-4 py-8 font-sans">
      <div className="w-full max-w-[920px] grid lg:grid-cols-[1.1fr_1fr] gap-0 bg-white rounded-3xl border border-slate-200/60 shadow-2xl shadow-slate-200/40 overflow-hidden">
        {/* LEFT — dark success panel */}
        <div className="hidden lg:flex flex-col justify-between bg-slate-900 p-10 text-white relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-emerald-500/30 blur-3xl"/>
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-blue-500/20 blur-3xl"/>
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-2xl mb-8 shadow-lg shadow-emerald-500/30">✓</div>
            <h2 className="text-3xl font-black leading-tight mb-3">Request<br/>Submitted</h2>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xs">Our team will review your request and contact you shortly with next steps.</p>
          </div>
          <div className="relative z-10">
            <div className="bg-slate-800/60 backdrop-blur rounded-2xl px-4 py-3 border border-slate-700/50">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">What's Next?</p>
              <ul className="space-y-1.5 text-xs">
                {['Track ticket status anytime','Workers will be assigned soon','You\'ll get updates via SMS'].map(t=>(
                  <li key={t} className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-emerald-400"/>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* RIGHT — success details */}
        <div className="px-6 sm:px-10 py-10 sm:py-12 text-center">
          <div className="lg:hidden w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-3xl mx-auto mb-5 shadow-lg shadow-emerald-200">✓</div>
          <h1 className="text-2xl font-black text-slate-900 mb-1">Request submitted</h1>
          <p className="text-sm text-slate-400 mb-7">Save your ticket ID for reference</p>

          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 mb-6">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Your Ticket ID</p>
            <p className="text-4xl sm:text-5xl font-black font-mono text-slate-900 tracking-[8px]">{done.ticket_id}</p>
          </div>

          <div className="space-y-2 bg-white border border-slate-200/60 rounded-2xl p-4 mb-6 text-left">
            {[['Customer', done.customer_name],['Service', SVC.find(s=>s.value===done.service_type)?.label],['Priority', done.priority]].map(([k,v])=>(
              <div key={k} className="flex justify-between items-center text-sm py-1">
                <span className="text-slate-400 text-xs">{k}</span>
                <span className="font-bold text-slate-700">{v}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <button onClick={()=>{setDone(null);setForm(INIT);setFiles([]);setStep(1);}} className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl text-sm transition-all shadow-md shadow-slate-900/10">Submit Another Request</button>
            <Link to="/service/login" className="block w-full py-3 border border-slate-200 text-slate-700 hover:border-slate-400 hover:bg-slate-50 font-bold rounded-2xl text-sm text-center transition-all">Go to Dashboard →</Link>
          </div>
        </div>
      </div>
    </div>
  );

  /* ─── FORM ─── */
  return (
    <div className="min-h-screen bg-[#F5F6F8] px-4 py-6 sm:py-10 font-sans">
      <div className="max-w-3xl mx-auto">

        {/* Header card — dark like the AdminDashboard hero */}
        <div className="bg-slate-900 rounded-3xl p-6 mb-5 text-white relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-blue-500/30 blur-3xl"/>
          <div className="absolute -left-6 -bottom-6 w-24 h-24 rounded-full bg-indigo-500/20 blur-2xl"/>
          <div className="flex items-center gap-4 relative">
            <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cess Engineering</p>
              <h1 className="text-xl font-black tracking-tight">Service Request</h1>
            </div>
            <Link to="/service/login" className="hidden sm:flex items-center gap-1.5 bg-white/10 hover:bg-white/15 backdrop-blur px-3.5 py-2 rounded-full text-xs font-bold transition-all">
              Dashboard
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </div>
        </div>

        {/* Step progress */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-5 flex overflow-x-auto gap-1">
          {['Service Type','Details & Media','Contact & Priority'].map((s,i) => (
            <div key={i} className={`flex items-center gap-2.5 flex-1 min-w-max px-3 ${i < 2 ? 'after:content-["›"] after:text-slate-300 after:text-lg after:ml-1' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${step > i+1 ? 'bg-emerald-500 text-white' : step === i+1 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {step > i+1 ? '✓' : i+1}
              </div>
              <span className={`text-xs font-bold transition-all ${step === i+1 ? 'text-slate-900' : step > i+1 ? 'text-emerald-600' : 'text-slate-400'}`}>{s}</span>
            </div>
          ))}
        </div>

        {err && <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4 text-red-600 text-sm font-medium">{err}</div>}

        {/* STEP 1 */}
        {step === 1 && (
          <div className="bg-white rounded-3xl border border-slate-200/60 p-6 sm:p-8">
            <div className="mb-6">
              <h3 className="text-base font-black text-slate-900">Basic Information</h3>
              <p className="text-xs text-slate-400 mt-1">Tell us about the customer and the service needed</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-5">
              <div><FLabel>Customer / Company *</FLabel><FInput placeholder="e.g. Gujarat Pipes Ltd" value={form.customer_name} onChange={e=>set('customer_name',e.target.value)}/></div>
              <div><FLabel>Site Address *</FLabel><FInput placeholder="Full site address" value={form.address} onChange={e=>set('address',e.target.value)}/></div>
            </div>

            <div className="mb-5">
              <FLabel>Select Service Type *</FLabel>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
                {SVC.map(st => (
                  <button key={st.value} type="button" onClick={()=>set('service_type',st.value)}
                    className={`text-left p-4 rounded-2xl border-2 transition-all ${form.service_type===st.value ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10' : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700'}`}>
                    <p className={`text-[10px] font-mono font-bold mb-1.5 ${form.service_type===st.value?'text-slate-400':'text-slate-400'}`}>{st.prefix}xxxx</p>
                    <p className="text-sm font-black">{st.label}</p>
                    <p className={`text-[10px] mt-1 ${form.service_type===st.value?'text-slate-400':'text-slate-400'}`}>{st.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {sel && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-5">
                <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span className="text-xs text-slate-600">Ticket ID preview:</span>
                <span className="font-black text-sm font-mono text-slate-900">{sel.prefix}#### — assigned on submit</span>
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={()=>goNext(2)} className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl shadow-md shadow-slate-900/10 transition-all flex items-center gap-1.5">
                Next: Add Details
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="bg-white rounded-3xl border border-slate-200/60 p-6 sm:p-8">
            <div className="mb-6">
              <h3 className="text-base font-black text-slate-900">Problem Details & Attachments</h3>
              <p className="text-xs text-slate-400 mt-1">Help us understand the situation</p>
            </div>

            <div className="mb-5">
              <FLabel>Description</FLabel>
              <textarea placeholder="Describe the issue or requirements in detail…" value={form.description} onChange={e=>set('description',e.target.value)} rows={4}
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all resize-none leading-relaxed"/>
            </div>

            <div className="mb-5">
              <FLabel>Attachments — Photos, Videos, Voice Notes</FLabel>
              <div onClick={()=>document.getElementById('inqF').click()}
                className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-all">
                <input id="inqF" type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={addFiles}/>
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
                <p className="text-sm font-bold text-slate-700">Click or drag files here</p>
                <p className="text-[11px] text-slate-400 mt-1">Images · Videos · Audio · max 50 MB · up to 10 files</p>
              </div>
              {files.length > 0 && (
                <div className="mt-3 space-y-2">
                  {files.map((f,i) => (
                    <div key={i} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5">
                      <span className="text-base">{fIcon(f)}</span>
                      <span className="flex-1 text-xs text-slate-700 font-medium truncate">{f.name}</span>
                      <span className="text-[10px] text-slate-400">{(f.size/1024/1024).toFixed(1)}MB</span>
                      <button onClick={()=>rmFile(i)} className="w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 transition-all text-xs">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-5">
              <FLabel>Work Requirements</FLabel>
              <div className="grid grid-cols-2 gap-3">
                {[['needs_plc','🖥','PLC Work'],['needs_wiring','⚡','Wiring Work']].map(([k,ic,lb]) => (
                  <label key={k} className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 cursor-pointer transition-all select-none ${form[k] ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}>
                    <input type="checkbox" className="hidden" checked={form[k]} onChange={e=>set(k,e.target.checked)}/>
                    <span className="text-xl">{ic}</span>
                    <span className="text-sm font-bold">{lb}</span>
                    {form[k] && <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                  </label>
                ))}
              </div>
            </div>

            {form.needs_plc && (
              <div className="mb-5">
                <FLabel>PLC Work Type</FLabel>
                <div className="grid grid-cols-2 gap-3">
                  {[['site','🏭','On-site'],['remote','💻','Remote']].map(([v,ic,l]) => (
                    <label key={v} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 cursor-pointer transition-all select-none ${form.plc_type===v ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}>
                      <input type="radio" name="plc" className="hidden" value={v} checked={form.plc_type===v} onChange={()=>set('plc_type',v)}/>
                      <span className="text-lg">{ic}</span>
                      <span className="text-sm font-bold">{l}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between gap-3 mt-2">
              <button onClick={()=>{setErr('');setStep(1);}} className="px-6 py-2.5 border border-slate-200 text-slate-700 font-bold text-sm rounded-2xl hover:bg-slate-50 transition-all flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                Back
              </button>
              <button onClick={()=>goNext(3)} className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl shadow-md shadow-slate-900/10 transition-all flex items-center gap-1.5">
                Next: Contact Info
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="bg-white rounded-3xl border border-slate-200/60 p-6 sm:p-8">
            <div className="mb-6">
              <h3 className="text-base font-black text-slate-900">Contact & Priority</h3>
              <p className="text-xs text-slate-400 mt-1">Who should we contact, and how urgent is this?</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-5">
              <div><FLabel>Contact Person</FLabel><FInput placeholder="On-site contact name" value={form.contact_name} onChange={e=>set('contact_name',e.target.value)}/></div>
              <div><FLabel>Contact Phone</FLabel><FInput type="tel" placeholder="+91 98765 43210" value={form.contact_phone} onChange={e=>set('contact_phone',e.target.value)}/></div>
              <div><FLabel>Designation</FLabel><FInput placeholder="e.g. Plant Manager" value={form.designation} onChange={e=>set('designation',e.target.value)}/></div>
              <div><FLabel>Sales Agent</FLabel>
                <FSel value={form.sales_agent} onChange={e=>set('sales_agent',e.target.value)}>
                  <option value="">— Select agent —</option>
                  {AGENTS.map(a=><option key={a}>{a}</option>)}
                </FSel>
              </div>
            </div>
          {/* Warranty Status */}
<div className="mb-5">
  <FLabel>Warranty Status</FLabel>
  <div className="grid grid-cols-2 gap-3">
    {[
      ['in_warranty',     '✓ In Warranty',     'Customer is under active warranty',  'emerald'],
      ['out_of_warranty', '⚠ Out of Warranty', 'Warranty expired — billable service', 'amber'],
    ].map(([v,lb,desc,clr]) => (
      <label key={v} className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all select-none ${form.warranty_status===v ? (clr==='emerald'?'border-emerald-400 bg-emerald-50':'border-amber-400 bg-amber-50') : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
        <input type="radio" name="warranty" className="hidden" value={v} checked={form.warranty_status===v} onChange={()=>set('warranty_status',v)}/>
        <span className={`w-3 h-3 rounded-full mt-1 ${clr==='emerald'?'bg-emerald-500':'bg-amber-500'}`}/>
        <div className="flex-1">
          <p className="text-sm font-black text-slate-900">{lb}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>
        </div>
      </label>
    ))}
  </div>
</div>

{/* Invoice & Challan (optional) */}
<div className="mb-5">
  <div className="flex items-center justify-between mb-1.5">
    <FLabel>Invoice & Challan</FLabel>
    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Optional · editable later</span>
  </div>
  <div className="grid sm:grid-cols-2 gap-3">
    <div>
      <input type="text" placeholder="Invoice Number" value={form.invoice_no} onChange={e=>set('invoice_no',e.target.value)}
        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all"/>
      <p className="text-[10px] text-slate-400 mt-1">Usually filled for installations</p>
    </div>
    <div>
      <input type="text" placeholder="Challan Number" value={form.challan_no} onChange={e=>set('challan_no',e.target.value)}
        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all"/>
      <p className="text-[10px] text-slate-400 mt-1">Add after dispatch / delivery</p>
    </div>
  </div>
</div>
            <div className="mb-5">
              <FLabel>Priority Level</FLabel>
              <div className="space-y-2.5 mt-1">
                {[
                  ['High','High priority — urgent attention','red'],
                  ['Medium','Standard — normal turnaround','amber'],
                  ['Low','Low urgency — when available','emerald'],
                ].map(([v,desc,clr]) => (
                  <label key={v} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all select-none ${form.priority===v ? `border-${clr}-400 bg-${clr}-50` : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name="pri" className="hidden" value={v} checked={form.priority===v} onChange={()=>set('priority',v)}/>
                    <span className={`w-3 h-3 rounded-full ${clr==='red'?'bg-red-500':clr==='amber'?'bg-amber-500':'bg-emerald-500'}`}/>
                    <div className="flex-1">
                      <p className="text-sm font-black text-slate-900">{v}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{desc}</p>
                    </div>
                    {form.priority===v && <svg className={`w-5 h-5 ${clr==='red'?'text-red-500':clr==='amber'?'text-amber-500':'text-emerald-500'}`} fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                  </label>
                ))}
              </div>
            </div>

            {/* Summary card */}
            <div className="bg-slate-900 rounded-3xl p-5 mb-6 text-white relative overflow-hidden">
              <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-blue-500/20 blur-3xl"/>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 relative">Request Summary</p>
              <div className="grid grid-cols-3 gap-3 relative">
                {[
                  // ['Customer',form.customer_name||'—'],['Service',sel?.label||'—'],['Priority',form.priority],['PLC',form.needs_plc?(form.plc_type?`Yes (${form.plc_type})`:'Yes'):'No'],['Wiring',form.needs_wiring?'Yes':'No'],['Files',`${files.length} attached`]
                    ['Customer', form.customer_name||'—'],
  ['Service',  sel?.label||'—'],
  ['Priority', form.priority],
  ['Warranty', form.warranty_status==='in_warranty'?'✓ In Warranty':'⚠ Out of Warranty'],
  ['Invoice',  form.invoice_no||'—'],
  ['Challan',  form.challan_no||'—'],
                ].map(([k,v]) => (
                  <div key={k}>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">{k}</p>
                    <p className="text-xs font-bold text-white mt-0.5 truncate">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between gap-3">
              <button onClick={()=>{setErr('');setStep(2);}} className="px-6 py-2.5 border border-slate-200 text-slate-700 font-bold text-sm rounded-2xl hover:bg-slate-50 transition-all flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                Back
              </button>
              <button onClick={submit} disabled={busy}
                className="px-8 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl shadow-md shadow-slate-900/10 flex items-center gap-2 transition-all disabled:opacity-70">
                {busy && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
                {busy ? 'Submitting…' : 'Submit Request'}
                {!busy && <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}






// import React, { useState } from 'react';
// import axios from 'axios';
// import { Link } from 'react-router-dom';

// const SVC = [
//   { value:'installation',    label:'Installation',    prefix:'IN', emoji:'🔧', bg:'bg-blue-50',   border:'border-blue-300',   text:'text-blue-700',   ring:'ring-blue-200' },
//   { value:'troubleshooting', label:'Troubleshooting', prefix:'SE', emoji:'🔍', bg:'bg-amber-50',  border:'border-amber-300',  text:'text-amber-700',  ring:'ring-amber-200' },
//   { value:'new_development', label:'New Development', prefix:'SE', emoji:'⚡', bg:'bg-purple-50', border:'border-purple-300', text:'text-purple-700', ring:'ring-purple-200' },
//   { value:'after_sales',     label:'After Sales',     prefix:'SE', emoji:'🤝', bg:'bg-emerald-50',border:'border-emerald-300',text:'text-emerald-700',ring:'ring-emerald-200' },
// ];
// const AGENTS = ['Divy Shah','Chirag Shah','Ketan Tundiya','Chetankumar Shah','Pankaj Rana','Vivardhan Gandhi','Nikita Koshti','Yogita Shah'];
// const INIT   = { customer_name:'',address:'',service_type:'',description:'',contact_name:'',contact_phone:'',designation:'',sales_agent:'',priority:'Medium',needs_plc:false,needs_wiring:false,plc_type:'' };

// const Label = ({ children }) => <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{children}</label>;
// const Input = (props) => <input {...props} className={`w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white transition-all font-medium ${props.className||''}`}/>;
// const Sel   = (props) => <select {...props} className={`w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:border-indigo-400 focus:bg-white transition-all font-medium ${props.className||''}`}/>;

// export default function InquiryForm() {
//   const [form,  setForm]  = useState(INIT);
//   const [files, setFiles] = useState([]);
//   const [done,  setDone]  = useState(null);
//   const [busy,  setBusy]  = useState(false);
//   const [err,   setErr]   = useState('');
//   const [step,  setStep]  = useState(1);

//   const set = (k,v) => setForm(p => ({...p, [k]: v}));
//   const sel = SVC.find(s => s.value === form.service_type);

//   const addFiles = e => setFiles(p => [...p, ...Array.from(e.target.files)].slice(0,10));
//   const rmFile   = i => setFiles(p => p.filter((_,idx) => idx !== i));
//   const fIcon    = f => f.type.startsWith('image/') ? '🖼' : f.type.startsWith('video/') ? '🎬' : '🎤';

//   const goNext = (to) => {
//     setErr('');
//     if (to === 2 && (!form.customer_name.trim() || !form.address.trim() || !form.service_type)) { setErr('Please fill all required fields'); return; }
//     setStep(to);
//   };

//   const submit = async () => {
//     setErr(''); setBusy(true);
//     try {
//       const { data: ticket } = await axios.post('/api/service/tickets', form);
//       if (files.length) {
//         const fd = new FormData();
//         files.forEach(f => fd.append('files', f));
//         await axios.post(`/api/service/tickets/${ticket.id}/media`, fd);
//       }
//       setDone(ticket);
//     } catch (e) { setErr(e.response?.data?.error || 'Submission failed. Please try again.'); }
//     finally { setBusy(false); }
//   };

//   if (done) return (
//     <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/40 flex items-center justify-center px-4 py-8">
//       <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/60 p-8 w-full max-w-md text-center">
//         <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-green-600 rounded-full flex items-center justify-center text-3xl text-white mx-auto mb-6 shadow-lg shadow-emerald-200">✓</div>
//         <h2 className="text-2xl font-black text-slate-800 mb-1">Request Submitted!</h2>
//         <p className="text-slate-400 text-sm mb-6">Our team will contact you shortly.</p>
//         <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5 mb-6">
//           <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Ticket ID</p>
//           <p className="text-4xl font-black text-indigo-600 font-mono tracking-widest">{done.ticket_id}</p>
//         </div>
//         <div className="space-y-2 bg-slate-50 rounded-2xl p-4 mb-6 text-left">
//           {[['Customer', done.customer_name], ['Service', SVC.find(s=>s.value===done.service_type)?.label], ['Priority', done.priority]].map(([k,v]) => (
//             <div key={k} className="flex justify-between items-center text-sm"><span className="text-slate-400">{k}</span><span className="font-semibold text-slate-700">{v}</span></div>
//           ))}
//         </div>
//         <div className="flex flex-col gap-3">
//           <button onClick={()=>{setDone(null);setForm(INIT);setFiles([]);setStep(1);}} className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-200/50">Submit Another Request</button>
//           <Link to="/service/login" className="w-full py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl text-sm text-center hover:border-indigo-300 hover:text-indigo-600 transition-all">Go to Dashboard →</Link>
//         </div>
//       </div>
//     </div>
//   );

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/20 px-4 py-6 sm:py-10">
//       <div className="max-w-2xl mx-auto">
//         {/* Header */}
//         <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-3xl p-6 mb-6 text-white shadow-xl shadow-indigo-200/50">
//           <div className="flex items-center gap-4">
//             <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
//               <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
//             </div>
//             <div>
//               <h1 className="text-xl font-black">Service Request</h1>
//               <p className="text-indigo-200 text-sm mt-0.5">Cess Engineering · Raise a ticket in 3 steps</p>
//             </div>
//             <Link to="/service/login" className="ml-auto flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl text-sm font-semibold transition-all">
//               Dashboard →
//             </Link>
//           </div>
//         </div>

//         {/* Steps */}
//         <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-5 shadow-sm flex overflow-x-auto gap-1">
//           {['Service Type','Details & Media','Contact & Priority'].map((s,i) => (
//             <div key={i} className={`flex items-center gap-2.5 flex-1 min-w-max px-3 ${i < 2 ? 'after:content-["›"] after:text-slate-300 after:text-lg after:ml-1' : ''}`}>
//               <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${step > i+1 ? 'bg-emerald-500 text-white' : step === i+1 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{step > i+1 ? '✓' : i+1}</div>
//               <span className={`text-xs font-semibold transition-all ${step === i+1 ? 'text-indigo-600' : step > i+1 ? 'text-emerald-600' : 'text-slate-400'}`}>{s}</span>
//             </div>
//           ))}
//         </div>

//         {err && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-red-600 text-sm font-medium">{err}</div>}

//         {/* STEP 1 */}
//         {step === 1 && (
//           <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-sm">
//             <h3 className="text-base font-bold text-slate-800 mb-6">Basic Information</h3>
//             <div className="grid sm:grid-cols-2 gap-4 mb-5">
//               <div><Label>Customer / Company *</Label><Input placeholder="e.g. Gujarat Pipes Ltd" value={form.customer_name} onChange={e=>set('customer_name',e.target.value)}/></div>
//               <div><Label>Site Address *</Label><Input placeholder="Full site address" value={form.address} onChange={e=>set('address',e.target.value)}/></div>
//             </div>
//             <div className="mb-5">
//               <Label>Select Service Type *</Label>
//               <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
//                 {SVC.map(st => (
//                   <button key={st.value} type="button" onClick={()=>set('service_type',st.value)}
//                     className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${form.service_type===st.value ? `${st.bg} ${st.border} ring-2 ${st.ring}` : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
//                     <span className="text-2xl">{st.emoji}</span>
//                     <span className={`text-xs font-bold ${form.service_type===st.value ? st.text : 'text-slate-600'}`}>{st.label}</span>
//                     <span className="text-[10px] font-mono text-slate-400">{st.prefix}xxxx</span>
//                   </button>
//                 ))}
//               </div>
//             </div>
//             {sel && (
//               <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 mb-5">
//                 <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/></svg>
//                 <span className="text-sm text-slate-600">Ticket ID preview:</span>
//                 <span className={`font-black text-base font-mono ${sel.text}`}>{sel.prefix}#### — assigned on submit</span>
//               </div>
//             )}
//             <div className="flex justify-end mt-2">
//               <button onClick={()=>goNext(2)} className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-200/50 hover:-translate-y-0.5 transition-all">Next: Add Details →</button>
//             </div>
//           </div>
//         )}

//         {/* STEP 2 */}
//         {step === 2 && (
//           <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-sm">
//             <h3 className="text-base font-bold text-slate-800 mb-6">Problem Details & Attachments</h3>
//             <div className="mb-5">
//               <Label>Description</Label>
//               <textarea placeholder="Describe the issue or requirements in detail…" value={form.description} onChange={e=>set('description',e.target.value)} rows={4}
//                 className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white transition-all resize-none leading-relaxed"/>
//             </div>
//             <div className="mb-5">
//               <Label>Attachments (Photos, Videos, Voice Notes)</Label>
//               <div onClick={()=>document.getElementById('inqF').click()}
//                 className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 transition-all">
//                 <input id="inqF" type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={addFiles}/>
//                 <div className="text-3xl mb-2">📎</div>
//                 <p className="text-sm font-semibold text-slate-600">Click or drag files here</p>
//                 <p className="text-xs text-slate-400 mt-1">Images, Videos, Audio · max 50MB · up to 10 files</p>
//               </div>
//               {files.length > 0 && (
//                 <div className="mt-3 space-y-2">
//                   {files.map((f,i) => (
//                     <div key={i} className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5">
//                       <span className="text-base">{fIcon(f)}</span>
//                       <span className="flex-1 text-xs text-slate-700 font-medium truncate">{f.name}</span>
//                       <span className="text-xs text-slate-400">{(f.size/1024/1024).toFixed(1)}MB</span>
//                       <button onClick={()=>rmFile(i)} className="text-slate-400 hover:text-red-500 text-lg leading-none transition-colors">×</button>
//                     </div>
//                   ))}
//                 </div>
//               )}
//             </div>
//             <div className="mb-5">
//               <Label>Work Requirements</Label>
//               <div className="flex gap-3 flex-wrap">
//                 {[['needs_plc','🖥','PLC Work Required'],['needs_wiring','⚡','Wiring Work Required']].map(([k,ic,lb]) => (
//                   <label key={k} className={`flex items-center gap-2.5 px-5 py-3 rounded-xl border-2 cursor-pointer transition-all select-none flex-1 min-w-max ${form[k] ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}>
//                     <input type="checkbox" className="hidden" checked={form[k]} onChange={e=>set(k,e.target.checked)}/>
//                     <span className="text-lg">{ic}</span><span className="text-sm font-semibold">{lb}</span>
//                   </label>
//                 ))}
//               </div>
//             </div>
//             {form.needs_plc && (
//               <div className="mb-5">
//                 <Label>PLC Work Type</Label>
//                 <div className="flex gap-3">
//                   {[['site','🏭 PLC On-site'],['remote','💻 PLC Remote']].map(([v,l]) => (
//                     <label key={v} className={`flex items-center gap-2 px-5 py-3 rounded-xl border-2 cursor-pointer transition-all flex-1 select-none ${form.plc_type===v ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}>
//                       <input type="radio" name="plc" className="hidden" value={v} checked={form.plc_type===v} onChange={()=>set('plc_type',v)}/>
//                       <span className="text-sm font-semibold">{l}</span>
//                     </label>
//                   ))}
//                 </div>
//               </div>
//             )}
//             <div className="flex justify-between mt-2 gap-3">
//               <button onClick={()=>{setErr('');setStep(1);}} className="px-6 py-2.5 border-2 border-slate-200 text-slate-600 font-semibold text-sm rounded-xl hover:border-slate-300 transition-all">← Back</button>
//               <button onClick={()=>goNext(3)} className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-200/50 hover:-translate-y-0.5 transition-all">Next: Contact Info →</button>
//             </div>
//           </div>
//         )}

//         {/* STEP 3 */}
//         {step === 3 && (
//           <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-sm">
//             <h3 className="text-base font-bold text-slate-800 mb-6">Contact & Priority</h3>
//             <div className="grid sm:grid-cols-2 gap-4 mb-5">
//               <div><Label>Contact Person</Label><Input placeholder="On-site contact name" value={form.contact_name} onChange={e=>set('contact_name',e.target.value)}/></div>
//               <div><Label>Contact Phone</Label><Input type="tel" placeholder="+91 98765 43210" value={form.contact_phone} onChange={e=>set('contact_phone',e.target.value)}/></div>
//               <div><Label>Designation</Label><Input placeholder="e.g. Plant Manager" value={form.designation} onChange={e=>set('designation',e.target.value)}/></div>
//               <div><Label>Sales Agent</Label>
//                 <Sel value={form.sales_agent} onChange={e=>set('sales_agent',e.target.value)}>
//                   <option value="">— Select agent —</option>
//                   {AGENTS.map(a=><option key={a}>{a}</option>)}
//                 </Sel>
//               </div>
//             </div>
//             <div className="mb-5">
//               <Label>Priority Level</Label>
//               <div className="space-y-2.5 mt-1">
//                 {[['High','🔴','Urgent — needs immediate attention','border-red-300 bg-red-50 text-red-700','border-slate-200 hover:border-red-200'],
//                   ['Medium','🟡','Standard — normal turnaround','border-amber-300 bg-amber-50 text-amber-700','border-slate-200 hover:border-amber-200'],
//                   ['Low','🟢','Low urgency — when available','border-emerald-300 bg-emerald-50 text-emerald-700','border-slate-200 hover:border-emerald-200']
//                 ].map(([v,ic,desc,active,hover]) => (
//                   <label key={v} className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all select-none ${form.priority===v ? active : hover}`}>
//                     <input type="radio" name="pri" className="hidden" value={v} checked={form.priority===v} onChange={()=>set('priority',v)}/>
//                     <span className="text-xl">{ic}</span>
//                     <div><p className="text-sm font-bold">{v}</p><p className="text-xs text-slate-400 mt-0.5">{desc}</p></div>
//                   </label>
//                 ))}
//               </div>
//             </div>
//             <div className="bg-gradient-to-br from-slate-50 to-indigo-50/40 border border-indigo-100 rounded-2xl p-4 mb-6">
//               <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Summary</p>
//               <div className="grid grid-cols-3 gap-3">
//                 {[['Customer',form.customer_name||'—'],['Service',sel?.label||'—'],['Priority',form.priority],['PLC',form.needs_plc?(form.plc_type?`Yes (${form.plc_type})`:'Yes'):'No'],['Wiring',form.needs_wiring?'Yes':'No'],['Files',`${files.length} attached`]].map(([k,v]) => (
//                   <div key={k}><p className="text-[10px] text-slate-400 uppercase">{k}</p><p className="text-xs font-bold text-slate-700 mt-0.5">{v}</p></div>
//                 ))}
//               </div>
//             </div>
//             <div className="flex justify-between gap-3">
//               <button onClick={()=>{setErr('');setStep(2);}} className="px-6 py-2.5 border-2 border-slate-200 text-slate-600 font-semibold text-sm rounded-xl hover:border-slate-300 transition-all">← Back</button>
//               <button onClick={submit} disabled={busy} className="px-8 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-200/50 flex items-center gap-2 hover:-translate-y-0.5 transition-all disabled:opacity-70">
//                 {busy && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
//                 {busy ? 'Submitting…' : '✓ Submit Request'}
//               </button>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }
