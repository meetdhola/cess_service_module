-- ════════════════════════════════════════════════════════════════════
-- Migration 009 — generic notifications + note mentions
-- Cess Engineering Service Module
--
-- notifications: generic in-app notification inbox per user.
--   type='note_mention' for this feature; designed so future kinds
--   (ticket_assigned, task_due_soon, etc.) reuse the same table.
--
-- note_mentions: which note tagged which user. A junction table
--   separate from notifications because (a) deleting a note should
--   cascade-delete its mentions but NOT the recipients' inbox rows,
--   and (b) we may want to render "you were mentioned" UI without
--   touching the notifications stream.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- Notifications inbox
CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES service_users(id) ON DELETE CASCADE,
  type         VARCHAR(40) NOT NULL,                      -- 'note_mention', future: 'ticket_assigned', etc.
  title        TEXT NOT NULL,                             -- one-line headline shown in dropdown/toast
  body         TEXT,                                      -- optional preview
  link         TEXT,                                      -- where the bell click should navigate (e.g. /service/admin/tickets/SE0004)
  context      JSONB NOT NULL DEFAULT '{}'::jsonb,        -- type-specific data (note_id, ticket_id, actor_id, etc.)
  read_at      TIMESTAMPTZ,                               -- NULL until the user marks read
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast "my unread, newest first" query
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read
  ON notifications (recipient_id, read_at NULLS FIRST, created_at DESC);

-- Junction: which note tagged which user
CREATE TABLE IF NOT EXISTS note_mentions (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id   UUID NOT NULL REFERENCES ticket_notes(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES service_users(id) ON DELETE CASCADE,
  is_everyone BOOLEAN NOT NULL DEFAULT FALSE,             -- true when the user was hit by an @everyone broadcast
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (note_id, user_id)                               -- one mention per (note, user) regardless of duplicate @-tokens
);

CREATE INDEX IF NOT EXISTS idx_note_mentions_user ON note_mentions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_mentions_note ON note_mentions (note_id);

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFY:
--   \d notifications
--   \d note_mentions
-- ════════════════════════════════════════════════════════════════════