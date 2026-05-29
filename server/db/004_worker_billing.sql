BEGIN;

-- Per-worker billing entries for service tickets
CREATE TABLE IF NOT EXISTS ticket_worker_billing (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  worker_id       UUID NOT NULL REFERENCES service_users(id)   ON DELETE CASCADE,
  charged_amount  NUMERIC(12,2) NOT NULL CHECK (charged_amount >= 0),
  charged_note    TEXT,
  charged_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_by       UUID REFERENCES service_users(id) ON DELETE SET NULL,
  edited_at       TIMESTAMPTZ,
  UNIQUE (ticket_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_twb_ticket   ON ticket_worker_billing(ticket_id);
CREATE INDEX IF NOT EXISTS idx_twb_worker   ON ticket_worker_billing(worker_id);
CREATE INDEX IF NOT EXISTS idx_twb_charged  ON ticket_worker_billing(charged_at);

COMMIT;