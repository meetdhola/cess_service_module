require('dotenv').config();
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');
const jwt      = require('jsonwebtoken');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST','PATCH','DELETE'] }
});

const SECRET = process.env.JWT_SECRET || 'cess_secret_2526';

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Attach io to every request so routes can emit
app.use((req, _res, next) => { req.io = io; next(); });

// ── Existing task tracker routes ──
app.use('/api/auth',  require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/users', require('./routes/users'));

// ── Service module routes ──
app.use('/api/service/auth',     require('./routes/serviceAuth'));

/* ─── Party master search (public autocomplete) ─── */
app.get('/api/service/parties/search', async (req, res) => {
  const pool = require('./db/pool');
  const q = (req.query.q || '').trim();
  if (q.length < 1) return res.json([]);
  try {
    const { rows } = await pool.query(
      `SELECT code, name, city, state, phone, email
         FROM party_master
        WHERE is_active = TRUE
          AND (name ILIKE $1 OR city ILIKE $1)
        ORDER BY CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END, name ASC
        LIMIT 10`,
      [`%${q}%`, `${q}%`]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/api/service/tickets',  require('./routes/serviceTickets'));
app.use('/api/service/sessions', require('./routes/serviceSessions'));
app.use('/api/service/reports',  require('./routes/serviceReports'));
app.use('/api/service/reports',  require('./routes/serviceProfitability'));
app.use('/api/service', require('./routes/servicePhase2'));
app.use('/api/service/notifications', require('./routes/serviceNotifications.js'))

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── Socket.IO auth + rooms ──
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));
  try {
    const payload = jwt.verify(token, SECRET);
    socket.user = payload;
    next();
  } catch { next(new Error('Invalid token')); }
});

io.on('connection', (socket) => {
  const user = socket.user;
  // Each user joins their own room + role room + superadmin room
  socket.join(`user:${user.id}`);
  socket.join(`role:${user.role}`);
  if (user.role === 'superadmin' || user.role === 'admin') {
    socket.join('admins');
  }
  console.log(`🔌 ${user.name} (${user.role}) connected`);
  socket.on('disconnect', () => console.log(`🔌 ${user.name} disconnected`));
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`✅ Server + Socket.IO on port ${PORT}`));
