const assert = require("node:assert/strict");
const { test, beforeEach, afterEach, after } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const Database = require("better-sqlite3");

// Charger le schéma réel dans une base en mémoire, sans toucher à agenda.db.
const databasePath = require.resolve("../src/database");
const databaseModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(databasePath, "utf8"), {
  require: name => name === "better-sqlite3"
    ? function () { return new Database(":memory:"); }
    : require(name),
  __dirname: require("node:path").dirname(databasePath),
  module: databaseModule
});
const db = databaseModule.exports;
require.cache[databasePath] = { id: databasePath, loaded: true, exports: db };

const { coursesFor, replaceCourses, defaultCourseDate, nextCourseDate, previousCourseDate, courseDatesForMonth } = require("../src/database/courses.repository");
const { syncIcal } = require("../src/services/ical.service");
const { calendarMessage } = require("../src/discord/messages");
const { createPublicCalendarRefresher } = require("../src/discord/public-calendar");
const { startScheduler } = require("../src/services/scheduler");
const { registerInteractions } = require("../src/discord/interactions");
const { drawDayPanel } = require("../src/calendar/day-panel");
const cron = require("node-cron");
const { MessageFlags } = require("discord.js");
const { commands } = require("../src/discord/commands");
const { getEvents, addEvent, deleteEvent } = require("../src/database/agenda.repository");

function record(uid, date, title = "Maths") {
  return { uid, date, start_at: "08:15", end_at: "10:15", title, location: "A1", class_name: "Classe test" };
}

function seed(...records) {
  replaceCourses(new Map(records.map(course => [course.uid, course])));
}

function calendar(...events) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OlenBot//Tests//FR", ...events, "END:VCALENDAR"].join("\r\n");
}

function event(uid, date, title = "Maths", description = "Classe test") {
  return ["BEGIN:VEVENT", `UID:${uid}`, `DTSTART:${date}T061500Z`, `DTEND:${date}T081500Z`, `SUMMARY:${title}`, `DESCRIPTION:${description}`, "END:VEVENT"].join("\r\n");
}

let originalEnv;
beforeEach(() => {
  db.exec("DELETE FROM courses; DELETE FROM agenda_messages; DELETE FROM events");
  originalEnv = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("ICAL_")) delete process.env[key];
  }
});
afterEach(() => { process.env = originalEnv; });
after(() => db.close());

test("4EADL et 4ERIS partagent les périodes école/entreprise sans mélanger les autres événements", () => {
  addEvent("4eadl", "entreprise", "2026-08-31", "2026-09-04", "Entreprise");
  addEvent("4eadl", "cours", "2026-09-22", "2026-09-25", "École");
  addEvent("4eris", "entreprise", "2026-09-28", "2026-10-02", "Entreprise");
  addEvent("4eris", "examen", "2026-09-23", "2026-09-23", "Examen ERIS");
  addEvent("initiale", "cours", "2026-09-23", "2026-09-23", "Ancien groupe");
  addEvent("4eadl", "cours", "2026-10-07", "2026-10-09", "Mois suivant");

  const eadl = getEvents("4eadl", 2026, 8);
  const eris = getEvents("4eris", 2026, 8);
  assert.equal(eadl.length, 3);
  assert.equal(eris.length, 4);
  assert.deepEqual(eris.filter(event => event.type !== "examen"), eadl);
  assert.equal(getEvents("initiale", 2026, 8).length, 1);
});

test("supprimer une période partagée la retire des deux vues", () => {
  const { lastInsertRowid } = addEvent("4eris", "cours", "2026-09-23", "2026-09-23", "École");
  assert.equal(getEvents("4eadl", 2026, 8).length, 1);
  assert.equal(getEvents("4eris", 2026, 8).length, 1);
  deleteEvent(lastInsertRowid);
  assert.equal(getEvents("4eadl", 2026, 8).length, 0);
  assert.equal(getEvents("4eris", 2026, 8).length, 0);
});

test("garde toute la journée actuelle avant 18 h, puis passe à la prochaine journée", () => {
  seed(record("today", "2026-09-22"), record("next", "2026-09-24"));
  assert.equal(defaultCourseDate(new Date("2026-09-22T15:59:59Z")), "2026-09-22");
  assert.equal(defaultCourseDate(new Date("2026-09-22T16:00:00Z")), "2026-09-24");
});

test("utilise l'heure de Paris en hiver et traverse le changement d'année", () => {
  seed(record("today", "2026-12-31"), record("next", "2027-01-04"));
  assert.equal(defaultCourseDate(new Date("2026-12-31T16:59:59Z")), "2026-12-31");
  assert.equal(defaultCourseDate(new Date("2026-12-31T17:00:00Z")), "2027-01-04");
});

test("saute les jours sans cours, même avant 18 h", () => {
  seed(record("past", "2026-09-25"), record("next", "2026-09-30"));
  assert.equal(defaultCourseDate(new Date("2026-09-26T08:00:00Z")), "2026-09-30");
});

test("sans cours futur, conserve une date valide pour le panneau vide", () => {
  seed(record("past", "2026-09-21"));
  assert.equal(defaultCourseDate(new Date("2026-09-22T08:00:00Z")), "2026-09-22");
  assert.equal(defaultCourseDate(new Date("2026-09-22T16:00:00Z")), "2026-09-23");
});

test("un nouvel import ajoute, modifie et retire les cours de l'ancien export", async t => {
  const savedEnv = { ...process.env };
  t.after(() => { process.env = savedEnv; });
  process.env.ICAL_URL = "https://calendar.example.test/agenda.ics";
  process.env.ICAL_CLASS_FILTER = "Classe test";
  t.mock.method(console, "log", () => {});
  let content = calendar(event("existing", "20260922"), event("removed", "20260923"));
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, process.env.ICAL_URL);
    assert.equal(options.cache, "no-store");
    return new Response(content);
  });
  assert.equal(await syncIcal(), 2);
  content = calendar(event("existing", "20260922", "Physique"), event("added", "20260924"), event("other", "20260925", "Autre", "Autre classe"));
  assert.equal(await syncIcal(), 2);
  assert.equal(coursesFor("2026-09-22")[0].title, "Physique");
  assert.equal(coursesFor("2026-09-22")[0].start_at, "08:15");
  assert.equal(coursesFor("2026-09-23").length, 0);
  assert.equal(coursesFor("2026-09-24").length, 1);
  assert.equal(coursesFor("2026-09-25").length, 0);
});

test("importe le tronc commun et la spécialité du 23 septembre avec plusieurs filtres", async t => {
  const savedEnv = { ...process.env };
  t.after(() => { process.env = savedEnv; });
  process.env.ICAL_URL = "https://calendar.example.test/agenda.ics";
  process.env.ICAL_CLASS_FILTER = " 4OLEN 26-27, 4EADL Spé 26-27, ";
  t.mock.method(console, "log", () => {});
  t.mock.method(globalThis, "fetch", async () => new Response(calendar(
    event("common", "20260922", "Tronc commun", "4OLEN 26-27"),
    event("specialty", "20260923", "Architecture logicielle", "4EADL Spé 26-27"),
    event("other", "20260923", "Autre cours", "Autre classe")
  )));

  assert.equal(await syncIcal(), 2);
  assert.equal(coursesFor("2026-09-22").length, 1);
  assert.equal(coursesFor("2026-09-23").length, 1);
  assert.equal(coursesFor("2026-09-23")[0].title, "Architecture logicielle");
  assert.equal(defaultCourseDate(new Date("2026-09-22T16:00:00Z")), "2026-09-23");
});

test("un échec de téléchargement préserve les cours et autorise l'import suivant", async t => {
  const savedEnv = { ...process.env };
  t.after(() => { process.env = savedEnv; });
  process.env.ICAL_URL = "https://calendar.example.test/agenda.ics";
  delete process.env.ICAL_CLASS_FILTER;
  t.mock.method(console, "log", () => {});
  seed(record("existing", "2026-09-22"));
  let response = new Response("Indisponible", { status: 503 });
  t.mock.method(globalThis, "fetch", async () => response);
  await assert.rejects(syncIcal(), /HTTP 503/);
  assert.equal(coursesFor("2026-09-22").length, 1);
  response = new Response("<html>Connexion</html>");
  await assert.rejects(syncIcal(), /calendrier/);
  assert.equal(coursesFor("2026-09-22").length, 1);
  response = new Response(calendar(event("next", "20260924")));
  assert.equal(await syncIcal(), 1);
});

test("le message Discord utilise la journée automatique et remplace son image", t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-22T15:59:59Z") });
  seed(record("today", "2026-09-22"), record("next", "2026-09-24"));
  const message = calendarMessage("4eadl", 2026, 8, true);
  assert.match(message.components[1].components[0].data.custom_id, /2026-09-22$/);
  assert.deepEqual(message.attachments, []);
  assert.equal(message.files[0].attachment.subarray(1, 4).toString(), "PNG");
  t.mock.timers.tick(1000);
  const evening = calendarMessage("4eadl", 2026, 8, true);
  assert.match(evening.components[1].components[0].data.custom_id, /2026-09-24$/);
});

test("l'actualisation est calée sur les heures pleines et continue si l'import échoue", async t => {
  const jobs = [];
  t.mock.method(cron, "schedule", (expression, callback, options) => {
    const job = { expression, callback, options };
    jobs.push(job);
    return job;
  });
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Portail indisponible"); });
  let refreshes = 0;
  startScheduler(async () => { refreshes++; });
  assert.equal(jobs[1].expression, "0 0-19,21-23 * * *");
  assert.equal(jobs[1].options.timezone, "Europe/Paris");
  await jobs[1].callback();
  await jobs[0].callback();
  assert.equal(refreshes, 2);
});

test("le calendrier public remplace le message existant avec la nouvelle journée", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-22T16:00:00Z") });
  seed(record("today", "2026-09-22"), record("next", "2026-09-24"));
  db.prepare("INSERT INTO agenda_messages VALUES (?, ?)").run("channel", "message");
  let updated;
  const refresh = createPublicCalendarRefresher({ channels: { fetch: async channelId => {
    assert.equal(channelId, "channel");
    return {
      isTextBased: () => true,
      messages: { fetch: async messageId => {
        assert.equal(messageId, "message");
        return { edit: async payload => { updated = payload; } };
      } }
    };
  } } });
  await refresh();
  assert.deepEqual(updated.attachments, []);
  assert.match(updated.components[1].components[0].data.custom_id, /2026-09-24$/);
});

test("au démarrage, attend l'import ICAL avant d'actualiser le calendrier public", async () => {
  const calls = [];
  await new Promise((resolve, reject) => {
    const modules = {
      dotenv: { config() {} },
      "discord.js": {
        Client: class { user = { tag: "Test" }; async login() {} },
        GatewayIntentBits: { Guilds: 1 },
        REST: class { setToken() { return this; } async put() {} },
        Routes: { applicationGuildCommands() {} }
      },
      "./src/services/ical.service": { syncIcal: async () => {
        await Promise.resolve();
        calls.push("import");
      } },
      "./src/services/scheduler": { startScheduler: () => { calls.push("scheduler"); resolve(); } },
      "./src/discord/commands": { commands: [] },
      "./src/discord/interactions": { registerInteractions() {} },
      "./src/discord/public-calendar": { createPublicCalendarRefresher: () => async () => { calls.push("refresh"); } }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve("../index.js"), "utf8"), {
      require: name => {
        assert.ok(modules[name], `Module inattendu : ${name}`);
        return modules[name];
      },
      process: { env: { DISCORD_TOKEN: "test", CLIENT_ID: "test", GUILD_ID: "test", ICAL_URL: "https://calendar.example.test" } },
      console: { log() {}, error: reject }
    });
  });
  assert.deepEqual(calls, ["import", "refresh", "scheduler"]);
});

test("les imports des deux groupes conservent les UID communs sans écrasement", async t => {
  process.env.ICAL_4EADL_URL = "https://calendar.example.test/eadl";
  process.env.ICAL_4ERIS_URL = "https://calendar.example.test/eris";
  process.env.ICAL_4EADL_CLASS_FILTER = "4OLEN,4EADL";
  process.env.ICAL_4ERIS_CLASS_FILTER = "4OLEN,4ERIS";
  t.mock.method(console, "log", () => {});
  t.mock.method(globalThis, "fetch", async url => new Response(calendar(
    event("common", "20260922", "Tronc commun", "4OLEN"),
    url.endsWith("/eadl")
      ? event("specialty", "20260923", "Développement", "4EADL")
      : event("specialty", "20260924", "Réseaux", "4ERIS"),
    event("old", "20260925", "Ancienne classe", "3OLEN")
  )));
  assert.equal(await syncIcal(), 4);
  assert.equal(coursesFor("2026-09-22", "4eadl").length, 1);
  assert.equal(coursesFor("2026-09-22", "4eris").length, 1);
  assert.equal(coursesFor("2026-09-23", "4eris").length, 0);
  assert.equal(coursesFor("2026-09-24", "4eris")[0].title, "Réseaux");
  assert.equal(coursesFor("2026-09-25", "4eris").length, 0);

  // La suppression d'un cours EADL ne retire pas sa copie ERIS.
  seed(record("new", "2026-09-25"));
  assert.equal(coursesFor("2026-09-22", "4eadl").length, 0);
  assert.equal(coursesFor("2026-09-22", "4eris").length, 1);
});

test("l'échec d'un groupe conserve ses cours et laisse l'autre groupe se synchroniser", async t => {
  seed(record("existing", "2026-09-22"));
  process.env.ICAL_4EADL_URL = "https://calendar.example.test/eadl";
  process.env.ICAL_4ERIS_URL = "https://calendar.example.test/eris";
  t.mock.method(console, "log", () => {});
  t.mock.method(globalThis, "fetch", async url => url.endsWith("/eadl")
    ? new Response("Indisponible", { status: 503 })
    : new Response(calendar(event("eris", "20260923"))));
  await assert.rejects(syncIcal(), /4EADL.*503/);
  assert.equal(coursesFor("2026-09-22", "4eadl").length, 1);
  assert.equal(coursesFor("2026-09-23", "4eris").length, 1);
});

test("les dates, le panneau et le calendrier mensuel restent propres au groupe", () => {
  seed(record("eadl", "2026-09-23", "Développement"));
  replaceCourses(new Map([
    ["eris", record("eris", "2026-09-24", "Réseaux")],
    ["eris-next", record("eris-next", "2026-09-25", "Sécurité")]
  ]), "4eris");
  assert.equal(defaultCourseDate(new Date("2026-09-22T16:00:00Z"), "4eris"), "2026-09-24");
  assert.equal(nextCourseDate("2026-09-22", false, "4eris"), "2026-09-24");
  assert.equal(previousCourseDate("2026-09-25", "4eris"), "2026-09-24");
  assert.equal(previousCourseDate("2026-09-24", "4eris"), null);
  assert.deepEqual([...courseDatesForMonth("4eris", 2026, 8)], ["2026-09-24", "2026-09-25"]);
  const labels = [];
  drawDayPanel({ fillRect() {}, fillText: text => labels.push(text) }, "2026-09-24", "4eris");
  assert.ok(labels.includes("Réseaux"));
  assert.ok(!labels.includes("Développement"));
});

test("le bouton échange 4EADL et 4ERIS et la navigation conserve le groupe", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-22T16:00:00Z") });
  seed(record("eadl", "2026-09-23"));
  replaceCourses(new Map([["eris", record("eris", "2026-09-24")]]), "4eris");
  let handler;
  registerInteractions({ on: (_event, callback) => { handler = callback; } }, async () => {});
  async function click(customId) {
    let response;
    await handler({
      isButton: () => true,
      customId,
      reply: async payload => { response = payload; },
      isRepliable: () => false
    });
    assert.ok(response);
    return response;
  }
  const eris = await click("cal:switch:4eadl:2026:8");
  assert.equal(eris.embeds[0].data.description, "Planning : 4ERIS");
  assert.equal(eris.components[0].components[1].data.label, "4EADL");
  assert.equal(eris.components[1].components[0].data.custom_id, "day:prev:4eris:2026-09-24");
  const eadl = await click("cal:switch:4eris:2026:8");
  assert.equal(eadl.embeds[0].data.description, "Planning : 4EADL");
  assert.equal(eadl.components[0].components[1].data.label, "4ERIS");
  const next = await click("day:next:4eris:2026-09-22");
  assert.equal(next.components[1].components[0].data.custom_id, "day:prev:4eris:2026-09-24");
  const month = await click("cal:next:4eris:2026:8");
  assert.equal(month.components[0].components[1].data.custom_id, "cal:switch:4eris:2026:9");
});

test("la migration préserve les cours existants, les périodes et le message public", () => {
  const oldDb = new Database(":memory:");
  try {
    oldDb.exec(`
      CREATE TABLE courses (
        uid TEXT PRIMARY KEY, date TEXT NOT NULL, start_at TEXT NOT NULL,
        end_at TEXT NOT NULL, title TEXT NOT NULL,
        location TEXT NOT NULL DEFAULT '', class_name TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO courses VALUES ('existing', '2026-09-23', '08:15', '12:15', 'Cours', 'A1', '4EADL');
      CREATE TABLE events (id INTEGER PRIMARY KEY, groupe TEXT, type TEXT, debut TEXT, fin TEXT, description TEXT);
      INSERT INTO events VALUES (1, 'alternance', 'cours', '2026-09-22', '2026-09-25', 'École');
      INSERT INTO events VALUES (2, 'initiale', 'cours', '2026-09-22', '2026-09-25', 'Ancien planning');
      CREATE TABLE agenda_messages (channel_id TEXT PRIMARY KEY, message_id TEXT NOT NULL);
      INSERT INTO agenda_messages VALUES ('channel', 'message');
    `);
    const runMigration = () => vm.runInNewContext(fs.readFileSync(databasePath, "utf8"), {
      require: name => name === "better-sqlite3" ? function () { return oldDb; } : require(name),
      __dirname: require("node:path").dirname(databasePath),
      module: { exports: {} }
    });
    runMigration();
    runMigration();
    assert.equal(oldDb.prepare("SELECT groupe FROM courses").get().groupe, "4eadl");
    assert.equal(oldDb.prepare("SELECT groupe FROM events WHERE id = 1").get().groupe, "4eadl");
    assert.equal(oldDb.prepare("SELECT groupe FROM events WHERE id = 2").get().groupe, "initiale");
    assert.equal(oldDb.prepare("SELECT message_id FROM agenda_messages").get().message_id, "message");
    assert.equal(oldDb.prepare("SELECT COUNT(*) AS count FROM courses").get().count, 1);
  } finally { oldDb.close(); }
});

function refreshCommand(refresh, roles = ["admin"]) {
  const calls = [];
  let handler;
  registerInteractions({ on: (_event, callback) => { handler = callback; } }, refresh);
  const interaction = {
    commandName: "agenda-refresh",
    isButton: () => false,
    isChatInputCommand: () => true,
    inGuild: () => true,
    isRepliable: () => true,
    member: { roles },
    reply: async payload => { calls.push({ type: "reply", payload }); },
    deferReply: async payload => { calls.push({ type: "defer", payload }); interaction.deferred = true; },
    editReply: async payload => { calls.push({ type: "edit", payload }); }
  };
  return { calls, interaction, run: () => handler(interaction) };
}

test("agenda-refresh refuse les non-admins, les messages privés et un rôle non configuré", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Appel interdit"); });
  let refreshes = 0;
  for (const scenario of ["other-role", "dm", "missing-role"]) {
    process.env.ADMIN_ROLE_ID = "admin";
    const command = refreshCommand(async () => { refreshes++; }, scenario === "other-role" ? ["member"] : ["admin"]);
    if (scenario === "dm") command.interaction.inGuild = () => false;
    if (scenario === "missing-role") delete process.env.ADMIN_ROLE_ID;
    await command.run();
    assert.equal(command.calls.length, 1);
    assert.equal(command.calls[0].type, "reply");
    assert.equal(command.calls[0].payload.flags, MessageFlags.Ephemeral);
    assert.match(command.calls[0].payload.content, /responsables/);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(refreshes, 0);
});

test("agenda-refresh attend les deux imports avant le rafraîchissement et répond en privé", async t => {
  assert.ok(commands.some(command => command.toJSON().name === "agenda-refresh"));
  process.env.ADMIN_ROLE_ID = "admin";
  process.env.ICAL_4EADL_URL = "https://calendar.example.test/eadl";
  process.env.ICAL_4ERIS_URL = "https://calendar.example.test/eris";
  t.mock.method(console, "log", () => {});
  const order = [];
  const command = refreshCommand(async () => {
    order.push("refresh");
    assert.equal(coursesFor("2026-09-23", "4eadl").length, 1);
    assert.equal(coursesFor("2026-09-23", "4eris").length, 1);
    return { refreshed: 1, failed: 0 };
  }, { cache: new Map([["admin", {}]]) });
  t.mock.method(globalThis, "fetch", async () => {
    assert.equal(command.calls[0].type, "defer");
    order.push("fetch");
    return new Response(calendar(event("course", "20260923")));
  });
  await command.run();
  assert.deepEqual(order, ["fetch", "fetch", "refresh"]);
  assert.equal(command.calls[0].payload.flags, MessageFlags.Ephemeral);
  assert.match(command.calls[1].payload, /2 cours synchronisés avec succès/);
});

test("agenda-refresh signale l'échec partiel et affiche quand même les cours importés", async t => {
  process.env.ADMIN_ROLE_ID = "admin";
  process.env.ICAL_4EADL_URL = "https://calendar.example.test/eadl";
  process.env.ICAL_4ERIS_URL = "https://calendar.example.test/eris";
  seed(record("old", "2026-09-22"));
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async url => url.endsWith("/eadl")
    ? new Response("Indisponible", { status: 503 })
    : new Response(calendar(event("new", "20260923"))));
  let refreshed = false;
  const command = refreshCommand(async () => { refreshed = true; });
  await command.run();
  assert.equal(refreshed, true);
  assert.equal(coursesFor("2026-09-22", "4eadl").length, 1);
  assert.equal(coursesFor("2026-09-23", "4eris").length, 1);
  assert.match(command.calls[1].payload, /Import incomplet/);
});

test("agenda-refresh signale une synchronisation déjà en cours sans faux succès", async t => {
  process.env.ADMIN_ROLE_ID = "admin";
  process.env.ICAL_URL = "https://calendar.example.test/eadl";
  t.mock.method(console, "log", () => {});
  let release;
  t.mock.method(globalThis, "fetch", () => new Promise(resolve => { release = resolve; }));
  const running = syncIcal();
  let refreshes = 0;
  try {
    const command = refreshCommand(async () => { refreshes++; });
    await command.run();
    assert.match(command.calls[1].payload, /déjà en cours/);
    assert.equal(refreshes, 0);
  } finally {
    release(new Response(calendar(event("course", "20260923"))));
    await running;
  }
});

test("agenda-refresh signale les calendriers publics inaccessibles", async t => {
  process.env.ADMIN_ROLE_ID = "admin";
  process.env.ICAL_URL = "https://calendar.example.test/eadl";
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async () => new Response(calendar(event("course", "20260923"))));
  db.prepare("INSERT INTO agenda_messages VALUES (?, ?)").run("channel", "message");
  const refresh = createPublicCalendarRefresher({ channels: { fetch: async () => null } });
  const command = refreshCommand(refresh);
  await command.run();
  assert.match(command.calls[1].payload, /1 cours synchronisés avec succès/);
  assert.match(command.calls[1].payload, /n'ont pas pu être actualisés/);
});
