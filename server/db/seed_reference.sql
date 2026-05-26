-- ============================================================
-- SEED — All preset users (passwords plain-text for seed;
--        run through bcrypt in production via seed.js)
-- ============================================================
-- Use seed.js (Node) instead of this file directly in production.
-- This file is kept for reference.

INSERT INTO users (name, department, role, password, admin_level) VALUES
('Divy Shah',         'Sales',       'MD & Sales Head',            '$HASH_divy123',      'master'),
('Chirag Shah',       'Finance',     'MD & Finance Head',          '$HASH_chirag123',    'master'),
('Harish Joshi',      'Procurement', 'MD & Procurement Head',      '$HASH_harish123',    'master'),
('Jayesh Patel',      'Operations',  'Operations Head',            '$HASH_jayesh123',    'sub'),
('Francis Rathod',    'Store',       'Store Head – Panel',         '$HASH_francis123',   'sub'),
('Ajay Chauhan',      'Logistics',   'Logistics Head',             '$HASH_ajay123',      'sub'),
('Bhavesh Prajapati', 'Development', 'Development Head',           '$HASH_bhavesh123',   'sub'),
('Ketan Tundiya',     'Sales',       'Sr. Sales Engineer',         '$HASH_ketan123',     'sub'),
('Viral Trivedi',     'HR',          'HR Head',                    '$HASH_viral123',     'sub')
ON CONFLICT (name) DO NOTHING;
-- ... (full seed via seed.js)
