CREATE TABLE IF NOT EXISTS chats (
  chat_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chai_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  day TEXT NOT NULL,
  month TEXT NOT NULL,
  cups INTEGER NOT NULL CHECK(cups > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chat_id, user_id, day)
);

CREATE INDEX IF NOT EXISTS chai_events_group_month
  ON chai_events(chat_id, month);

CREATE INDEX IF NOT EXISTS chai_events_group_day
  ON chai_events(chat_id, day);

CREATE TABLE IF NOT EXISTS champions (
  chat_id TEXT NOT NULL,
  month TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  cups INTEGER NOT NULL,
  PRIMARY KEY(chat_id, month)
);
