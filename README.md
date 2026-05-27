# Cess Task Tracker — PERN Stack

A full-stack rebuild of the Cess Task Tracker HTML app using:
- **P**ostgreSQL — database
- **E**xpress.js — REST API
- **R**eact — frontend (Create React App)
- **N**ode.js — server runtime

<!-- --- -->
<!-- 
## Project Structure

```
cess-task-tracker/
├── server/
│   ├── db/
│   │   ├── pool.js          # pg connection pool
│   │   ├── schema.sql       # PostgreSQL table definitions
│   │   └── init.js          # Run once: creates tables + seeds all 75 users
│   ├── middleware/
│   │   └── auth.js          # JWT verify middleware
│   ├── routes/
│   │   ├── auth.js          # /api/auth — login, register, reset-password
│   │   ├── tasks.js         # /api/tasks — full CRUD + admin + approval + export
│   │   └── users.js         # /api/users — list, teams, promote/demote
│   ├── index.js             # Express app entry
│   ├── package.json
│   └── .env.example
│
└── client/
    ├── public/index.html
    ├── src/
    │   ├── api.js                     # axios instance with JWT interceptor
    │   ├── App.jsx                    # Router + auth guards
    │   ├── index.js
    │   ├── index.css                  # All styles (exact match to original HTML)
    │   ├── constants.js               # SUBCATS, CATEGORIES, DEPARTMENTS
    │   ├── context/
    │   │   └── AuthContext.jsx        # Global auth state
    │   ├── pages/
    │   │   ├── LoginPage.jsx          # Select name + password + register
    │   │   └── MainPage.jsx           # Tabs: Today / Weekly / Admin / Settings
    │   └── components/
    │       ├── AppHeader.jsx          # Top bar with name, role, date, sign out
    │       ├── TaskForm.jsx           # Add task form
    │       ├── TaskList.jsx           # My tasks with filters, checkbox, edit, delete
    │       ├── DetailModal.jsx        # Task detail popup + EditModal
    │       ├── WeeklyView.jsx         # 7-day calendar grid + weekly stats
    │       ├── AdminPanel.jsx         # All staff tasks, approve/reject, export CSV
    │       └── SettingsPanel.jsx      # Sub-admin team management + promote/demote
    └── package.json
```

--- -->

## Setup

### 1. PostgreSQL — Create database

```bash
psql -U postgres
CREATE DATABASE cess_tracker;
\q
```

### 2. Server setup
```bash
npm install
node db/init.js        # Creates tables and seeds all 75 preset users + default teams
npm run dev            # Starts on port 5000
```

### 3. Client setup

```bash
cd client
npm install
npm start              # Starts on port 3000 (proxies /api → localhost:5000)
```

---