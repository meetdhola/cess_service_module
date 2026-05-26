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
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Attach io to every request so routes can emit
app.use((req, _res, next) => { req.io = io; next(); });

// ── Existing task tracker routes ──
app.use('/api/auth',  require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/users', require('./routes/users'));

// ── Service module routes ──
app.use('/api/service/auth',     require('./routes/serviceAuth'));
app.use('/api/service/tickets',  require('./routes/serviceTickets'));
app.use('/api/service/sessions', require('./routes/serviceSessions'));
app.use('/api/service/reports',  require('./routes/serviceReports'));

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
