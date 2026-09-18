const db = require("./index");
const { addDays } = require("../utils/dates");

function coursesFor(date) {
  return db.prepare(`
    SELECT *
    FROM courses
    WHERE date = ?
    ORDER BY start_at, uid
  `).all(date);
}

function nextCourseDate(fromDate, includeToday = false) {
  const startDate = includeToday
    ? fromDate
    : addDays(fromDate, 1);

  const next = db.prepare(`
    SELECT MIN(date) AS date
    FROM courses
    WHERE date >= ?
  `).get(startDate);

  return next?.date || startDate;
}

function previousCourseDate(date) {
  return db.prepare(`
    SELECT MAX(date) AS date
    FROM courses
    WHERE date < ?
  `).get(date)?.date;
}

const upsertCourse = db.prepare(`
  INSERT INTO courses (
    uid, date, start_at, end_at,
    title, location, class_name
  )
  VALUES (
    @uid, @date, @start_at, @end_at,
    @title, @location, @class_name
  )
  ON CONFLICT(uid) DO UPDATE SET
    date = excluded.date,
    start_at = excluded.start_at,
    end_at = excluded.end_at,
    title = excluded.title,
    location = excluded.location,
    class_name = excluded.class_name
`);

const removeCourse = db.prepare(`
  DELETE FROM courses WHERE uid = ?
`);

const allCourseUids = db.prepare(`
  SELECT uid FROM courses
`);

function replaceCourses(records) {
  db.transaction(() => {
    for (const record of records.values()) {
      upsertCourse.run(record);
    }

    for (const row of allCourseUids.all()) {
      if (!records.has(row.uid)) {
        removeCourse.run(row.uid);
      }
    }
  })();
}

module.exports = {
  coursesFor,
  nextCourseDate,
  previousCourseDate,
  replaceCourses
};