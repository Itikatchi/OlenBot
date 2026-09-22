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
    groupe TEXT NOT NULL,
    uid TEXT NOT NULL,
    date TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    class_name TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (groupe, uid)
  );
`);

// L'ancien calendrier correspond à 4EADL. Les UID du tronc commun peuvent
// apparaître dans les deux exports : chaque groupe conserve sa propre copie.
if (!db.pragma("table_info(courses)").some(column => column.name === "groupe")) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE courses_by_group (
        groupe TEXT NOT NULL,
        uid TEXT NOT NULL,
        date TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        title TEXT NOT NULL,
        location TEXT NOT NULL DEFAULT '',
        class_name TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (groupe, uid)
      );
      INSERT INTO courses_by_group
        SELECT '4eadl', uid, date, start_at, end_at, title, location, class_name
        FROM courses;
      DROP TABLE courses;
      ALTER TABLE courses_by_group RENAME TO courses;
    `);
  })();
}

db.exec(`
  CREATE INDEX IF NOT EXISTS courses_group_date ON courses (groupe, date);
  UPDATE events SET groupe = '4eadl' WHERE groupe = 'alternance';
`);

module.exports = db;
