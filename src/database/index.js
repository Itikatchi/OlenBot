const Database = require("better-sqlite3");
const path = require("node:path");

const db = new Database(
  path.join(__dirname, "..", "..", "agenda.db")
);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    groupe TEXT NOT NULL,
    type TEXT NOT NULL,
    debut TEXT NOT NULL,
    fin TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS agenda_messages (
    channel_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS courses (
    uid TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    class_name TEXT NOT NULL DEFAULT ''
  );
`);

module.exports = db;