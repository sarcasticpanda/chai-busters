ALTER TABLE chai_events
  ADD COLUMN base_cups INTEGER NOT NULL DEFAULT 1 CHECK (base_cups > 0);

UPDATE chai_events SET base_cups = cups;

CREATE TABLE IF NOT EXISTS chai_polls (
  poll_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  brewer_id TEXT NOT NULL,
  brewer_name TEXT NOT NULL,
  day TEXT NOT NULL,
  month TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS chai_polls_group_brewer_day
  ON chai_polls(chat_id, brewer_id, day);

CREATE TABLE IF NOT EXISTS chai_poll_votes (
  poll_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  wants_chai INTEGER NOT NULL CHECK (wants_chai IN (0, 1)),
  PRIMARY KEY (poll_id, voter_id)
);

CREATE INDEX IF NOT EXISTS chai_poll_votes_poll
  ON chai_poll_votes(poll_id);
