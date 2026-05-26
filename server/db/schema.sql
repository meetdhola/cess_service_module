-- ============================================================
-- CESS TASK TRACKER — PostgreSQL Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(120) NOT NULL UNIQUE,
  department   VARCHAR(80)  NOT NULL,
  role         VARCHAR(120) NOT NULL,
  password     VARCHAR(255) NOT NULL,          -- bcrypt hash
  admin_level  VARCHAR(20)  CHECK (admin_level IN ('master','sub',NULL)),
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- SUB-ADMIN TEAMS  (sub-admin → their team members)
CREATE TABLE IF NOT EXISTS teams (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sub_admin    VARCHAR(120) NOT NULL REFERENCES users(name) ON DELETE CASCADE,
  member       VARCHAR(120) NOT NULL REFERENCES users(name) ON DELETE CASCADE,
  UNIQUE(sub_admin, member)
);

-- TASKS
CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_name   VARCHAR(120) NOT NULL REFERENCES users(name) ON DELETE CASCADE,
  title        VARCHAR(500) NOT NULL,
  description  TEXT,
  category     VARCHAR(80)  NOT NULL,
  subcat       VARCHAR(80),
  priority     VARCHAR(10)  NOT NULL CHECK (priority IN ('High','Medium','Low')),
  status       VARCHAR(20)  NOT NULL CHECK (status IN ('Pending','In Progress','Done')),
  approval     VARCHAR(20)  CHECK (approval IN ('Approved','Rejected','Pending')),
  assigned_by  VARCHAR(120) REFERENCES users(name) ON DELETE SET NULL,
  assigned_to  VARCHAR(120) REFERENCES users(name) ON DELETE SET NULL,
  task_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
  logged_time  VARCHAR(10),
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_owner_date ON tasks(owner_name, task_date);
CREATE INDEX IF NOT EXISTS idx_tasks_date       ON tasks(task_date);
