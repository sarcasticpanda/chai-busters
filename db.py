import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.environ.get("DATABASE_PATH", "chai_busters.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS chats (
    chat_id INTEGER PRIMARY KEY,
    title TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chai_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    day TEXT NOT NULL,
    month TEXT NOT NULL,
    cups INTEGER NOT NULL DEFAULT 1 CHECK(cups > 0),
    ts TEXT DEFAULT (datetime('now')),
    UNIQUE(chat_id, user_id, day)
);
CREATE TABLE IF NOT EXISTS champions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    count INTEGER NOT NULL,
    UNIQUE(chat_id, month)
);
"""


@contextmanager
def db():
    # A short wait makes overlapping Telegram updates safe on SQLite, while
    # WAL reduces read/write contention for a busy group.
    conn = sqlite3.connect(DB_PATH, timeout=10)
    try:
        conn.executescript(SCHEMA)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with db() as c:
        # Existing installs predate cup tracking. SQLite can add the new
        # column without losing the old leaderboard history.
        columns = {row[1] for row in c.execute("PRAGMA table_info(chai_events)")}
        if "cups" not in columns:
            c.execute(
                "ALTER TABLE chai_events ADD COLUMN cups INTEGER NOT NULL DEFAULT 1"
            )


def upsert_chat(chat_id: int, title: str):
    with db() as c:
        c.execute(
            "INSERT OR REPLACE INTO chats(chat_id, title) VALUES (?, ?)",
            (chat_id, title),
        )


def all_chats() -> list:
    with db() as c:
        return [r[0] for r in c.execute("SELECT chat_id FROM chats")]


def already_logged_today(chat_id: int, user_id: int, day: str) -> bool:
    with db() as c:
        return (
            c.execute(
                "SELECT 1 FROM chai_events WHERE chat_id=? AND user_id=? AND day=?",
                (chat_id, user_id, day),
            ).fetchone()
            is not None
        )


def log_chai(chat_id: int, user_id: int, user_name: str, day: str, cups: int) -> bool:
    month = day[:7]
    with db() as c:
        result = c.execute(
            "INSERT OR IGNORE INTO chai_events(chat_id, user_id, user_name, day, month, cups)"
            " VALUES (?,?,?,?,?,?)",
            (chat_id, user_id, user_name, day, month, cups),
        )
        return result.rowcount == 1


def update_chai_cups(chat_id: int, user_id: int, day: str, cups: int) -> int | None:
    """Set a brewer's total servings for the day and return the previous total."""
    with db() as c:
        row = c.execute(
            "SELECT cups FROM chai_events WHERE chat_id=? AND user_id=? AND day=?",
            (chat_id, user_id, day),
        ).fetchone()
        if row is None:
            return None
        c.execute(
            "UPDATE chai_events SET cups=? WHERE chat_id=? AND user_id=? AND day=?",
            (cups, chat_id, user_id, day),
        )
        return row[0]


def monthly_leaderboard(chat_id: int, month: str) -> list:
    with db() as c:
        return c.execute(
            "SELECT user_name, COUNT(*) AS brew_rounds, SUM(cups) AS total_cups, user_id "
            "FROM chai_events WHERE chat_id=? AND month=? "
            "GROUP BY user_id, user_name "
            "ORDER BY total_cups DESC, brew_rounds DESC, user_name COLLATE NOCASE",
            (chat_id, month),
        ).fetchall()


def daily_brewers(chat_id: int, day: str) -> list:
    with db() as c:
        return [
            (row[0], row[1])
            for row in c.execute(
                "SELECT user_name, cups FROM chai_events WHERE chat_id=? AND day=? ORDER BY ts ASC",
                (chat_id, day),
            )
        ]


def monthly_group_stats(chat_id: int, month: str) -> tuple[int, int, int]:
    """Return brew rounds, active brewers, and total servings for one group."""
    with db() as c:
        rounds, brewers, cups = c.execute(
            "SELECT COUNT(*), COUNT(DISTINCT user_id), COALESCE(SUM(cups), 0) "
            "FROM chai_events WHERE chat_id=? AND month=?",
            (chat_id, month),
        ).fetchone()
        return rounds, brewers, cups


def record_champion(chat_id: int, month: str, user_id: int, user_name: str, count: int):
    with db() as c:
        c.execute(
            "INSERT OR REPLACE INTO champions(chat_id, month, user_id, user_name, count)"
            " VALUES (?,?,?,?,?)",
            (chat_id, month, user_id, user_name, count),
        )


def last_champion(chat_id: int):
    with db() as c:
        return c.execute(
            "SELECT month, user_name, count FROM champions"
            " WHERE chat_id=? ORDER BY month DESC LIMIT 1",
            (chat_id,),
        ).fetchone()
