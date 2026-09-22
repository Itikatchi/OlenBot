const db = require("./index");

function getEvents(group, year, month) {
  const start = [
    year,
    String(month + 1).padStart(2, "0"),
    "01"
  ].join("-");

  const next = new Date(
    Date.UTC(year, month + 1, 1)
  ).toISOString().slice(0, 10);

  return db.prepare(`
    SELECT *
    FROM events
    WHERE (
        groupe = ?
        OR (
          ? IN ('4eadl', '4eris')
          AND groupe IN ('4eadl', '4eris')
          AND type IN ('cours', 'entreprise')
        )
      )
      AND debut < ?
      AND fin >= ?
    ORDER BY debut, id
  `).all(group, group, next, start);
}

function listEvents() {
  return db.prepare(`
    SELECT *
    FROM events
    ORDER BY debut DESC, id DESC
    LIMIT 20
  `).all();
}

function addEvent(groupe, type, debut, fin, description) {
  return db.prepare(`
    INSERT INTO events
    (groupe, type, debut, fin, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(groupe, type, debut, fin, description);
}

function deleteEvent(id) {
  return db.prepare(`
    DELETE FROM events
    WHERE id = ?
  `).run(id);
}

function getAgendaMessages() {
  return db.prepare(`
    SELECT *
    FROM agenda_messages
  `).all();
}

function getAgendaMessage(channelId) {
  return db.prepare(`
    SELECT *
    FROM agenda_messages
    WHERE channel_id = ?
  `).get(channelId);
}

function saveAgendaMessage(channelId, messageId) {
  return db.prepare(`
    INSERT INTO agenda_messages
    (channel_id, message_id)
    VALUES (?, ?)
    ON CONFLICT(channel_id)
    DO UPDATE SET
      message_id = excluded.message_id
  `).run(channelId, messageId);
}

module.exports = {
  getEvents,
  listEvents,
  addEvent,
  deleteEvent,
  getAgendaMessages,
  getAgendaMessage,
  saveAgendaMessage
};
