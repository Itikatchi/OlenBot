const db = require("./index");
const { addDays, parisDateTime } = require("../utils/dates");
const { DEFAULT_GROUP } = require("../config");

function coursesFor(date, group = DEFAULT_GROUP) {
  return db.prepare(`
    SELECT *
    FROM courses
    WHERE date = ? AND groupe = ?
    ORDER BY start_at, uid
  `).all(date, group);
}

function nextCourseDate(fromDate, includeToday = false, group = DEFAULT_GROUP) {
  const startDate = includeToday
    ? fromDate
    : addDays(fromDate, 1);

  const next = db.prepare(`
    SELECT MIN(date) AS date
    FROM courses
    WHERE date >= ? AND groupe = ?
  `).get(startDate, group);

  return next?.date || startDate;
}

function previousCourseDate(date, group = DEFAULT_GROUP) {
  return db.prepare(`
    SELECT MAX(date) AS date
    FROM courses
    WHERE date < ? AND groupe = ?
  `).get(date, group)?.date;
}

function defaultCourseDate(now = new Date(), group = DEFAULT_GROUP) {
  const { date, time } = parisDateTime(now);
  return nextCourseDate(date, time < "18:00", group);
}

function courseDatesForMonth(group, year, month) {
  const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10);
  return new Set(db.prepare(`
    SELECT DISTINCT date FROM courses
    WHERE groupe = ? AND date >= ? AND date < ?
  `).all(group, start, end).map(row => row.date));
}

const upsertCourse = db.prepare(`
  INSERT INTO courses (
    groupe, uid, date, start_at, end_at,
    title, location, class_name
  )
  VALUES (
    @groupe, @uid, @date, @start_at, @end_at,
    @title, @location, @class_name
  )
  ON CONFLICT(groupe, uid) DO UPDATE SET
    date = excluded.date,
    start_at = excluded.start_at,
    end_at = excluded.end_at,
    title = excluded.title,
    location = excluded.location,
    class_name = excluded.class_name
`);

const removeCourse = db.prepare(`
  DELETE FROM courses WHERE uid = ? AND groupe = ?
`);

const allCourseUids = db.prepare(`
  SELECT uid FROM courses WHERE groupe = ?
`);

function replaceCourses(records, group = DEFAULT_GROUP) {
  db.transaction(() => {
    for (const record of records.values()) {
      upsertCourse.run({ ...record, groupe: group });
    }

    for (const row of allCourseUids.all(group)) {
      if (!records.has(row.uid)) {
        removeCourse.run(row.uid, group);
      }
    }
  })();
}

module.exports = {
  coursesFor,
  nextCourseDate,
  defaultCourseDate,
  courseDatesForMonth,
  previousCourseDate,
  replaceCourses
};
