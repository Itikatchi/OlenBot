const { CONFIG } = require("../config");

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(value + "T12:00:00Z");

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CONFIG.timezone,
    year: "numeric",
    month: "numeric"
  }).formatToParts(new Date());

  const get = type =>
    Number(parts.find(part => part.type === type).value);

  return {
    year: get("year"),
    month: get("month") - 1
  };
}

function currentDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = type =>
    parts.find(part => part.type === type).value;

  return [
    get("year"),
    get("month"),
    get("day")
  ].join("-");
}

function parisDateTime(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const get = type =>
    parts.find(part => part.type === type).value;

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`
  };
}

function addDays(date, amount) {
  const value = new Date(`${date}T12:00:00Z`);

  value.setUTCDate(value.getUTCDate() + amount);

  return value.toISOString().slice(0, 10);
}

function tomorrow() {
  return addDays(currentDate(), 1);
}

module.exports = {
  validDate,
  currentMonth,
  currentDate,
  parisDateTime,
  addDays,
  tomorrow
};