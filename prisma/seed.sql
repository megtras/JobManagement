-- Fictional demo-only data for jobmanagement-db.
INSERT OR IGNORE INTO "Branch" ("id", "name", "address", "updatedAt")
VALUES ('demo-branch', 'Demo Branch', 'Megtras Job Management demo environment', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "User"
  ("id", "staffNo", "name", "email", "passwordHash", "role", "branchId", "position", "technicianStatus", "updatedAt")
VALUES
  ('demo-supervisor', 1, 'Demo Supervisor', 'supervisor@demo.local', '$2b$12$BcHCejb/Zj/SoOnn.zVmoOFEZykqXGkCxYs7e4b26NvJRJ7HPp/x2', 'SUPERVISOR', NULL, NULL, NULL, CURRENT_TIMESTAMP),
  ('demo-manager', 2, 'Demo Manager', 'manager@demo.local', '$2b$12$BcHCejb/Zj/SoOnn.zVmoOFEZykqXGkCxYs7e4b26NvJRJ7HPp/x2', 'MANAGER', 'demo-branch', NULL, NULL, CURRENT_TIMESTAMP),
  ('demo-admin', 3, 'Demo Admin', 'admin@demo.local', '$2b$12$BcHCejb/Zj/SoOnn.zVmoOFEZykqXGkCxYs7e4b26NvJRJ7HPp/x2', 'ADMIN', 'demo-branch', NULL, NULL, CURRENT_TIMESTAMP),
  ('demo-technician-1', 4, 'Demo Technician One', 'technician1@demo.local', '$2b$12$BcHCejb/Zj/SoOnn.zVmoOFEZykqXGkCxYs7e4b26NvJRJ7HPp/x2', 'TECHNICIAN', 'demo-branch', 'Technician', 'AVAILABLE', CURRENT_TIMESTAMP),
  ('demo-technician-2', 5, 'Demo Technician Two', 'technician2@demo.local', '$2b$12$BcHCejb/Zj/SoOnn.zVmoOFEZykqXGkCxYs7e4b26NvJRJ7HPp/x2', 'TECHNICIAN', 'demo-branch', 'Technician', 'AVAILABLE', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "Team" ("id", "name", "branchId", "updatedAt")
VALUES ('demo-team', 'Demo Team', 'demo-branch', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "_TeamMembers" ("A", "B") VALUES
  ('demo-team', 'demo-technician-1'),
  ('demo-team', 'demo-technician-2');

INSERT OR IGNORE INTO "JobCategory" ("id", "name", "price", "minEvidencePhotos", "updatedAt") VALUES
  ('demo-category-service', 'Aircond Service', 80, 3, CURRENT_TIMESTAMP),
  ('demo-category-repair', 'Aircond Repair', 150, 3, CURRENT_TIMESTAMP),
  ('demo-category-installation', 'Aircond Installation', 350, 3, CURRENT_TIMESTAMP);
