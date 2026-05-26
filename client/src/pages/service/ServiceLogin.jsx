import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import svcApi from '../../serviceApi';
import { useSvcAuth } from '../../context/SvcAuthContext';

export default function ServiceLogin() {
  const { svcLogin } = useSvcAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [keys,  setKeys]  = useState(['','','','','','']);
  const [err,   setErr]   = useState('');
  const [busy,  setBusy]  = useState(false);
  const refs = useRef([]);

  const handleDigit = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const n = [...keys]; n[i] = val; setKeys(n);
    if (val && i < 5) refs.current[i + 1]?.focus();
  };
  const handleKD = (i, e) => {
    if (e.key === 'Backspace' && !keys[i] && i > 0) refs.current[i - 1]?.focus();
  };
  const handlePaste = (e) => {
    const p = e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6);
    if (p.length === 6) { setKeys(p.split('')); refs.current[5]?.focus(); }
    e.preventDefault();
  };

  const submit = async () => {
    setErr('');
    if (!phone.trim()) { setErr('Enter your mobile number'); return; }
    const sk = keys.join('');
    if (sk.length < 6) { setErr('Enter your 6-digit secret key'); return; }
    setBusy(true);
    try {
      const { data } = await svcApi.post('/auth/login', { phone: phone.trim(), secretKey: sk });
      svcLogin(data.token, data.user);
      navigate(data.user.role === 'superadmin' || data.user.role === 'admin' ? '/service/admin' : '/service/worker');
    } catch (e) { setErr(e.response?.data?.error || 'Invalid credentials'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F6F8] px-4 py-8 relative overflow-hidden font-sans">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.4]" style={{ backgroundImage:'radial-gradient(circle at 1px 1px, #cbd5e1 1px, transparent 0)', backgroundSize:'24px 24px' }}/>
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-100/40 blur-3xl pointer-events-none"/>
      <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full bg-slate-200/40 blur-3xl pointer-events-none"/>

      <div className="relative z-10 w-full max-w-[920px] grid lg:grid-cols-[1.1fr_1fr] gap-0 bg-white rounded-3xl border border-slate-200/60 shadow-2xl shadow-slate-200/40 overflow-hidden">

        {/* LEFT — Dark feature panel (matches AdminDashboard hero card) */}
        <div className="hidden lg:flex flex-col justify-between bg-slate-900 p-10 text-white relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-blue-500/30 blur-3xl"/>
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-indigo-500/20 blur-3xl"/>

          {/* Logo */}
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                <svg className="w-4 h-4 text-slate-900" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-black tracking-tight">Service Portal</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">Cess Engineering</p>
              </div>
            </div>
            <h2 className="text-3xl font-black leading-tight mb-3 relative">Welcome back to<br/>the Field Portal</h2>
            <p className="text-sm text-slate-400 leading-relaxed mb-6 relative max-w-xs">Sign in with your phone and secret key to access tickets, track time, and complete jobs.</p>

            {/* Stat preview chips */}
            <div className="grid grid-cols-2 gap-2 max-w-sm relative">
              {[['Tickets','tracked'],['Workers','realtime'],['Reports','analytics'],['Secure','encrypted']].map(([t,sub])=>(
                <div key={t} className="bg-slate-800/60 backdrop-blur rounded-2xl px-4 py-3 border border-slate-700/50">
                  <p className="text-xs font-bold">{t}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer note */}
          <div className="relative z-10 text-[11px] text-slate-500">
            Need help? Contact your administrator.
          </div>
        </div>

        {/* RIGHT — Login form */}
        <div className="px-6 sm:px-10 py-10 sm:py-12 flex flex-col justify-center">

          {/* Mobile-only mini brand */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Service Portal</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Cess Engineering</p>
            </div>
          </div>

          <div className="mb-7">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Sign in to your account</h1>
            <p className="text-sm text-slate-400 mt-1">Enter your registered phone and secret key</p>
          </div>

          {err && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-5">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p className="text-red-600 text-sm font-medium">{err}</p>
            </div>
          )}

          {/* Phone */}
          <div className="mb-5">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Mobile Number</label>
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* OTP boxes */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Secret Key</label>
              <span className="text-[10px] text-slate-400">6 digits</span>
            </div>
            <div className="grid grid-cols-6 gap-2" onPaste={handlePaste}>
              {keys.map((k, i) => (
                <input
                  key={i}
                  ref={el => refs.current[i] = el}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={k}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleKD(i, e)}
                  className={`aspect-square text-center text-xl font-black rounded-2xl border-2 outline-none transition-all ${k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-slate-400 focus:bg-white'}`}
                />
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={submit}
            disabled={busy}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl shadow-lg shadow-slate-900/15 flex items-center justify-center gap-2.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
              : <>Sign In Securely
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </>}
          </button>

          <p className="text-center text-[11px] text-slate-400 mt-5 leading-relaxed">
            Secret key is assigned by your administrator.<br/>Contact admin if you need access.
          </p>

          <div className="flex items-center gap-5 my-6">
            <div className="flex-1 h-px bg-slate-100"/>
            {/* <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">or</span> */}
            <div className="flex-1 h-px bg-slate-100"/>
          </div>

          {/* <Link to="/service" className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-700 hover:border-slate-400 hover:bg-slate-50 text-sm font-bold rounded-2xl transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Submit a Service Request
          </Link> */}
        </div>
      </div>
    </div>
  );
}



// import React, { useState, useRef } from 'react';
// import { useNavigate, Link } from 'react-router-dom';
// import svcApi from '../../serviceApi';
// import { useSvcAuth } from '../../context/SvcAuthContext';

// export default function ServiceLogin() {
//   const { svcLogin } = useSvcAuth();
//   const navigate = useNavigate();
//   const [phone, setPhone] = useState('');
//   const [keys,  setKeys]  = useState(['','','','','','']);
//   const [err,   setErr]   = useState('');
//   const [busy,  setBusy]  = useState(false);
//   const refs = useRef([]);

//   const handleDigit = (i, val) => {
//     if (!/^\d?$/.test(val)) return;
//     const n = [...keys]; n[i] = val; setKeys(n);
//     if (val && i < 5) refs.current[i + 1]?.focus();
//   };
//   const handleKD = (i, e) => { if (e.key === 'Backspace' && !keys[i] && i > 0) refs.current[i - 1]?.focus(); };
//   const handlePaste = (e) => {
//     const p = e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6);
//     if (p.length === 6) { setKeys(p.split('')); refs.current[5]?.focus(); }
//     e.preventDefault();
//   };

//   const submit = async () => {
//     setErr('');
//     if (!phone.trim()) { setErr('Enter your mobile number'); return; }
//     const sk = keys.join('');
//     if (sk.length < 6) { setErr('Enter your 6-digit secret key'); return; }
//     setBusy(true);
//     try {
//       const { data } = await svcApi.post('/auth/login', { phone: phone.trim(), secretKey: sk });
//       svcLogin(data.token, data.user);
//       navigate(data.user.role === 'superadmin' || data.user.role === 'admin' ? '/service/admin' : '/service/worker');
//     } catch (e) { setErr(e.response?.data?.error || 'Invalid credentials'); }
//     finally { setBusy(false); }
//   };

//   return (
//     <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/50 to-purple-50/40 px-4 relative overflow-hidden">
//       <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-indigo-200/25 blur-3xl pointer-events-none" />
//       <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full bg-purple-200/20 blur-3xl pointer-events-none" />

//       <div className="relative z-10 w-full max-w-md">
//         <div className="bg-white/85 backdrop-blur-2xl border border-white rounded-3xl shadow-2xl shadow-indigo-100/50 px-8 py-10">
//           <div className="text-center mb-8">
//             <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-300/40 mb-4">
//               <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
//                 <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
//               </svg>
//             </div>
//             <h1 className="text-2xl font-black text-slate-800 tracking-tight">Service Portal</h1>
//             <p className="text-sm text-slate-400 mt-1">Cess Engineering · Field Operations</p>
//           </div>

//           {err && (
//             <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
//               <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
//               <p className="text-red-600 text-sm font-medium">{err}</p>
//             </div>
//           )}

//           <div className="mb-5">
//             <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Mobile Number</label>
//             <input type="tel" placeholder="+91 98765 43210" value={phone}
//               onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
//               className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white transition-all font-medium"
//             />
//           </div>

//           <div className="mb-6">
//             <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Secret Key — 6 digits</label>
//             <div className="grid grid-cols-6 gap-2" onPaste={handlePaste}>
//               {keys.map((k, i) => (
//                 <input key={i} ref={el => refs.current[i] = el} type="password" inputMode="numeric" maxLength={1} value={k}
//                   onChange={e => handleDigit(i, e.target.value)} onKeyDown={e => handleKD(i, e)}
//                   className={`aspect-square text-center text-xl font-black rounded-xl border-2 outline-none transition-all ${k ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-indigo-400 focus:bg-white'}`}
//                 />
//               ))}
//             </div>
//           </div>

//           <button onClick={submit} disabled={busy}
//             className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-200/50 flex items-center justify-center gap-2.5 transition-all disabled:opacity-60 hover:-translate-y-0.5">
//             {busy
//               ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
//               : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10,17 15,12 10,7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>Sign In Securely</>}
//           </button>

//           <p className="text-center text-xs text-slate-400 mt-5 leading-relaxed">Key assigned by administrator. Contact admin if you need access.</p>

//           <div className="flex items-center gap-3 my-5"><div className="flex-1 h-px bg-slate-100" /><span className="text-xs text-slate-300">OR</span><div className="flex-1 h-px bg-slate-100" /></div>

//           <Link to="/service" className="flex items-center justify-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">
//             <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
//             Submit a Service Request
//           </Link>
//         </div>
//       </div>
//     </div>
//   );
// }
