import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.environ.get("DATABASE_PATH", "chai.db")

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
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with db():
        pass


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


def log_chai(chat_id: int, user_id: int, user_name: str, day: str):
    month = day[:7]
    with db() as c:
        c.execute(
            "INSERT OR IGNORE INTO chai_events(chat_id, user_id, user_name, day, month)"
            " VALUES (?,?,?,?,?)",
            (chat_id, user_id, user_name, day, month),
        )


def monthly_leaderboard(chat_id: int, month: str) -> list:
    with db() as c:
        return c.execute(
            "SELECT user_name, COUNT(*) AS n, user_id FROM chai_events"
            " WHERE chat_id=? AND month=? GROUP BY user_id, user_name ORDER BY n DESC",
            (chat_id, month),
        ).fetchall()


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
