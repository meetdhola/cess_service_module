BEGIN;

-- Warranty + Invoice/Challan on tickets
ALTER TABLE service_tickets
  ADD COLUMN IF NOT EXISTS warranty_status    VARCHAR(20) CHECK (warranty_status IN ('in_warranty','out_of_warranty')) DEFAULT 'in_warranty',
  ADD COLUMN IF NOT EXISTS invoice_no         VARCHAR(80),
  ADD COLUMN IF NOT EXISTS invoice_date       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS challan_no         VARCHAR(80),
  ADD COLUMN IF NOT EXISTS challan_date       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_updated_by UUID REFERENCES service_users(id) ON DELETE SET NULL;

-- Multi-assign junction table
CREATE TABLE IF NOT EXISTS ticket_assignments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id   UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  worker_id   UUID NOT NULL REFERENCES service_users(id)   ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL CHECK (role IN ('plc','wireman')),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES service_users(id) ON DELETE SET NULL,
  UNIQUE (ticket_id, worker_id, role)
);
CREATE INDEX IF NOT EXISTS idx_assignments_ticket ON ticket_assignments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_assignments_worker ON ticket_assignments(worker_id);

-- Backfill existing single-assign data
INSERT INTO ticket_assignments (ticket_id, worker_id, role)
SELECT id, assigned_plc, 'plc' FROM service_tickets WHERE assigned_plc IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO ticket_assignments (ticket_id, worker_id, role)
SELECT id, assigned_wireman, 'wireman' FROM service_tickets WHERE assigned_wireman IS NOT NULL
ON CONFLICT DO NOTHING;

-- THIS IS THE KEY TABLE — ticket_documents
CREATE TABLE IF NOT EXISTS ticket_documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id     UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  doc_type      VARCHAR(40) NOT NULL CHECK (doc_type IN ('challan','invoice','job_card','signed_proof','photo','video','voice','other')),
  filename      VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  file_size     BIGINT,
  url           TEXT,
  note          TEXT,
  uploaded_by   UUID REFERENCES service_users(id) ON DELETE SET NULL,
  uploaded_role VARCHAR(20),
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docs_ticket ON ticket_documents(ticket_id);

-- Pause reason category
ALTER TABLE session_pauses
  ADD COLUMN IF NOT EXISTS reason_category VARCHAR(40);
UPDATE session_pauses SET reason_category = CASE
  WHEN reason ILIKE '%material%' THEN 'material_shortage'
  WHEN reason ILIKE '%lunch%'    THEN 'lunch_break'
  WHEN reason ILIKE '%tea%'      THEN 'tea_break'
  WHEN reason ILIKE '%instruction%' THEN 'awaiting_instructions'
  WHEN reason ILIKE '%site%'     THEN 'site_issue'
  ELSE 'other'
END WHERE reason_category IS NULL;

COMMIT;