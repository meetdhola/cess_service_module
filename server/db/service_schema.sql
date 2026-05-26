-- ============================================================
-- SERVICE MODULE — PostgreSQL Schema
-- ============================================================

-- Service workers / users (phone + secret key login)
CREATE TABLE IF NOT EXISTS service_users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(120) NOT NULL,
  phone        VARCHAR(20)  NOT NULL UNIQUE,
  secret_key   CHAR(6)      NOT NULL,            -- random 6-digit, unique per user
  role         VARCHAR(20)  NOT NULL CHECK (role IN ('plc','wireman','admin','superadmin')),
  department   VARCHAR(80),
  is_active    BOOLEAN      DEFAULT TRUE,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- Ticket counter per service type (for auto-increment per prefix)
CREATE TABLE IF NOT EXISTS ticket_counters (
  prefix       VARCHAR(10)  PRIMARY KEY,         -- 'IN' or 'SE'
  last_num     INT          NOT NULL DEFAULT 0
);
INSERT INTO ticket_counters (prefix, last_num) VALUES ('IN', 0),('SE', 0)
ON CONFLICT DO NOTHING;

-- Service tickets / inquiries
CREATE TABLE IF NOT EXISTS service_tickets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id       VARCHAR(20)  NOT NULL UNIQUE,   -- IN0001 / SE0001
  service_type    VARCHAR(30)  NOT NULL CHECK (service_type IN ('installation','troubleshooting','new_development','after_sales')),
  customer_name   VARCHAR(150) NOT NULL,
  address         TEXT         NOT NULL,
  description     TEXT,
  priority        VARCHAR(10)  NOT NULL CHECK (priority IN ('High','Medium','Low')) DEFAULT 'Medium',
  contact_name    VARCHAR(150),
  contact_phone   VARCHAR(20),
  designation     VARCHAR(100),
  sales_agent     VARCHAR(120),
  needs_plc       BOOLEAN      DEFAULT FALSE,
  needs_wiring    BOOLEAN      DEFAULT FALSE,
  plc_type        VARCHAR(20)  CHECK (plc_type IN ('site','remote',NULL)),
  status          VARCHAR(20)  NOT NULL DEFAULT 'Open'
                  CHECK (status IN ('Open','Assigned','In Progress','Completed','Closed')),
  assigned_plc    UUID         REFERENCES service_users(id) ON DELETE SET NULL,
  assigned_wireman UUID        REFERENCES service_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- Ticket media attachments (photos, videos, voice notes)
CREATE TABLE IF NOT EXISTS ticket_media (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id    UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  media_type   VARCHAR(10) NOT NULL CHECK (media_type IN ('photo','video','voice')),
  filename     VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  file_size    BIGINT,
  url          TEXT,
  uploaded_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Work sessions (timer: start/pause/stop)
CREATE TABLE IF NOT EXISTS work_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id    UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  worker_id    UUID NOT NULL REFERENCES service_users(id) ON DELETE CASCADE,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  total_seconds INT          DEFAULT 0,
  status       VARCHAR(15)  NOT NULL DEFAULT 'running'
               CHECK (status IN ('running','paused','completed')),
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- Pause logs (reason for each pause)
CREATE TABLE IF NOT EXISTS session_pauses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  paused_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resumed_at   TIMESTAMPTZ,
  reason       TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tickets_status     ON service_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created    ON service_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_worker    ON work_sessions(worker_id);
CREATE INDEX IF NOT EXISTS idx_sessions_ticket    ON work_sessions(ticket_id);
