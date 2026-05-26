# Cess Task Tracker — PERN Stack

A full-stack rebuild of the Cess Task Tracker HTML app using:
- **P**ostgreSQL — database
- **E**xpress.js — REST API
- **R**eact — frontend (Create React App)
- **N**ode.js — server runtime

---

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

---

## Setup

### 1. PostgreSQL — Create database

```bash
psql -U postgres
CREATE DATABASE cess_tracker;
\q
```

### 2. Server setup

```bash
cd server
cp .env.example .env
# Edit .env — set DB_PASSWORD and JWT_SECRET

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

## Features (exact match to original HTML)

| Feature | Details |
|---|---|
| **Login** | Select name from dropdown + password |
| **Register** | New staff self-registration |
| **Today Tab** | Add task (title, description, category, sub-category, priority, status, assign) |
| **Task List** | Filter: All / Pending / In Progress / Done / Assigned to me |
| **Checkbox toggle** | Mark task done/pending |
| **Edit task** | All fields editable in modal |
| **Detail modal** | Full description, metadata, assigned by/to |
| **Delete** | With confirm |
| **Weekly View** | 7-day grid with task counts and weekly stats |
| **Admin Panel** | All staff tasks today, filter by status/approval, approve ✓ / reject ✗ |
| **Export CSV** | Export today or this week (respects admin scope) |
| **Registered Users table** | With reset password |
| **Settings Tab** | Sub-admin team management (add/remove members) |
| **Promote/Demote** | Master admin can make any user a Sub-Admin or demote |
| **Access levels** | Master Admin (all data) · Sub-Admin (own team only) · Staff (own tasks only) |

### Default Credentials (all preset users)

| Name | Password |
|---|---|
| Divy Shah | divy123 |
| Chirag Shah | chirag123 |
| Harish Joshi | harish123 |
| Jayesh Patel | jayesh123 |
| Bhavesh Prajapati | bhavesh123 |
| Ketan Tundiya | ketan123 |
| Viral Trivedi | viral123 |
| *(any other staff)* | *name*123 (see init.js) |

---

## API Endpoints

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/users` | None | All users for login dropdown |
| POST | `/api/auth/login` | None | Login → JWT |
| POST | `/api/auth/register` | None | New staff registration |
| PATCH | `/api/auth/reset-password` | Master | Reset another user's password |

### Tasks
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/tasks?date=` | Any | My tasks for a date |
| GET | `/api/tasks/weekly?from=&to=` | Any | My tasks across date range |
| GET | `/api/tasks/admin?date=&status=` | Admin | All visible staff tasks |
| GET | `/api/tasks/admin/weekly?from=&to=` | Admin | Admin weekly export |
| POST | `/api/tasks` | Any | Create task (+ assign copy) |
| PATCH | `/api/tasks/:id` | Owner/Admin | Edit task fields |
| PATCH | `/api/tasks/:id/toggle-done` | Owner | Toggle Done/Pending |
| PATCH | `/api/tasks/:id/approval` | Admin | Approve or Reject |
| DELETE | `/api/tasks/:id` | Owner/Admin | Delete task |

### Users
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/users` | Any | All users (for assign dropdown) |
| GET | `/api/users/teams` | Master | Sub-admin → member map |
| POST | `/api/users/teams` | Master | Add member to team |
| DELETE | `/api/users/teams` | Master | Remove member from team |
| PATCH | `/api/users/:name/promote` | Master | Promote/demote user |
