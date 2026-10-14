-- Initial schema. Day values are Asia/Dhaka calendar dates as 'YYYY-MM-DD' text.
-- Names are unique case-insensitively via COLLATE NOCASE.

CREATE TABLE employees (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE snacks (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL COLLATE NOCASE UNIQUE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'retired')),
  suggested_by INTEGER REFERENCES employees (id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE votes (
  day         TEXT NOT NULL,
  employee_id INTEGER NOT NULL REFERENCES employees (id),
  snack_id    INTEGER NOT NULL REFERENCES snacks (id),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, employee_id)
);

CREATE TABLE results (
  day            TEXT PRIMARY KEY,
  status         TEXT NOT NULL CHECK (status IN ('decided', 'skipped')),
  winner_snack_id INTEGER REFERENCES snacks (id),
  method         TEXT NOT NULL CHECK (method IN ('votes', 'tie_random', 'admin', 'no_votes')),
  counts         TEXT NOT NULL DEFAULT '{}', -- JSON snapshot of vote counts per snack
  decided_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Single row, enforced by CHECK (id = 1).
-- working_days: comma-separated ISO weekday numbers, Monday=1 .. Sunday=7.
CREATE TABLE settings (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  open_time    TEXT NOT NULL,
  cutoff_time  TEXT NOT NULL,
  working_days TEXT NOT NULL
);

INSERT INTO settings (id, open_time, cutoff_time, working_days) VALUES (1, '09:00', '14:00', '1,2,3,4,5');
