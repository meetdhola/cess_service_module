import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth }       from './context/AuthContext';
import { SvcAuthProvider, useSvcAuth } from './context/SvcAuthContext';
import ServiceLogin    from './pages/service/ServiceLogin';
import InquiryForm     from './pages/service/InquiryForm';
import WorkerDashboard from './pages/service/WorkerDashboard';
import AdminDashboard  from './pages/service/AdminDashboard';
import TicketDetailPage from './pages/service/TicketDetailPage';
import './index.css';

function PrivateRoute({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? children : <Navigate to="/" replace />;
}
function PublicRoute({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? <Navigate to="/app" replace /> : children;
}
function SvcPrivate({ roles, children }) {
  const { svcUser, svcReady } = useSvcAuth();
  if (!svcReady) return null;
  if (!svcUser) return <Navigate to="/service/login" replace />;
  if (roles && !roles.includes(svcUser.role)) return <Navigate to="/service/login" replace />;
  return children;
}
function SvcPublic({ children }) {
  const { svcUser, svcReady } = useSvcAuth();
  if (!svcReady) return null;
  if (svcUser) return <Navigate to={svcUser.role === 'plc' || svcUser.role === 'wireman' ? '/service/worker' : '/service/admin'} replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <SvcAuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/service" element={<InquiryForm />} />
            <Route path="/" element={<SvcPublic><ServiceLogin /></SvcPublic>} />

            {/* WORKER routes — with :tab param */}
            <Route path="/service/worker"        element={<SvcPrivate roles={['plc','wireman']}><WorkerDashboard /></SvcPrivate>}/>
            <Route path="/service/worker/:tab"   element={<SvcPrivate roles={['plc','wireman']}><WorkerDashboard /></SvcPrivate>}/>
            <Route path="/service/worker/tickets/:ticketId"
                                                 element={<SvcPrivate roles={['plc','wireman']}><TicketDetailPage /></SvcPrivate>}/>

            {/* ADMIN routes — with :tab param */}
            <Route path="/service/admin"         element={<SvcPrivate roles={['admin','superadmin']}><AdminDashboard /></SvcPrivate>}/>
            <Route path="/service/admin/:tab"    element={<SvcPrivate roles={['admin','superadmin']}><AdminDashboard /></SvcPrivate>}/>
            <Route path="/service/admin/tickets/:ticketId"
                                                 element={<SvcPrivate roles={['admin','superadmin']}><TicketDetailPage /></SvcPrivate>}/>

            <Route path="/uploads/*" element={null} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </SvcAuthProvider>
    </AuthProvider>
  );
}



// import React from 'react';
// import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// import { AuthProvider, useAuth }       from './context/AuthContext';
// import { SvcAuthProvider, useSvcAuth } from './context/SvcAuthContext';
// import ServiceLogin    from './pages/service/ServiceLogin';
// import InquiryForm     from './pages/service/InquiryForm';
// import WorkerDashboard from './pages/service/WorkerDashboard';
// import AdminDashboard  from './pages/service/AdminDashboard';
// import './index.css';

// function PrivateRoute({ children }) {
//   const { user, ready } = useAuth();
//   if (!ready) return null;
//   return user ? children : <Navigate to="/" replace />;
// }
// function PublicRoute({ children }) {
//   const { user, ready } = useAuth();
//   if (!ready) return null;
//   return user ? <Navigate to="/app" replace /> : children;
// }
// function SvcPrivate({ roles, children }) {
//   const { svcUser, svcReady } = useSvcAuth();
//   if (!svcReady) return null;
//   if (!svcUser) return <Navigate to="/service/login" replace />;
//   if (roles && !roles.includes(svcUser.role)) return <Navigate to="/service/login" replace />;
//   return children;
// }
// function SvcPublic({ children }) {
//   const { svcUser, svcReady } = useSvcAuth();
//   if (!svcReady) return null;
//   if (svcUser) return <Navigate to={svcUser.role === 'plc' || svcUser.role === 'wireman' ? '/service/worker' : '/service/admin'} replace />;
//   return children;
// }

// export default function App() {
//   return (
//     <AuthProvider>
//       <SvcAuthProvider>
//         <BrowserRouter>
//           <Routes>
//             {/* <Route path="/"    element={<PublicRoute><LoginPage /></PublicRoute>} />x */}
//             {/* <Route path="/app" element={<PrivateRoute><MainPage /></PrivateRoute>} /> */}
//             <Route path="/service"       element={<InquiryForm />} />
//             <Route path="/" element={<SvcPublic><ServiceLogin /></SvcPublic>} />
//             <Route path="/service/worker" element={<SvcPrivate roles={['plc','wireman']}><WorkerDashboard /></SvcPrivate>}/>
//             <Route path="/service/admin"  element={<SvcPrivate roles={['admin','superadmin']}><AdminDashboard /></SvcPrivate>}/>
//             <Route path="/uploads/*" element={null} />
            <Route path="*" element={<Navigate to="/" replace />} />
//           </Routes>
//         </BrowserRouter>
//       </SvcAuthProvider>
//     </AuthProvider>
//   );
// }
