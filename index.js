
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const Database = require("better-sqlite3");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const path = require("node:path");
const ICAL = require("ical.js");
const cron = require("node-cron");
// =====================================================
// CONFIGURATION
// =====================================================

const CONFIG = {
  timezone: "Europe/Paris",
  width: 1680,
  height: 880,
  background: "#20232B"
};

const FONT_REGULAR =
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

const FONT_BOLD =
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

const regularLoaded = GlobalFonts.registerFromPath(
  FONT_REGULAR,
  "AgendaFont"
);

const boldLoaded = GlobalFonts.registerFromPath(
  FONT_BOLD,
  "AgendaFontBold"
);

if (!regularLoaded || !boldLoaded) {
  throw new Error(
    "Impossible de charger les polices DejaVu. " +
    "Installe fonts-dejavu-core sur Debian."
  );
}

// =====================================================
// DISCORD
// =====================================================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const rest = new REST({
  version: "10"
}).setToken(process.env.DISCORD_TOKEN);

// =====================================================
// BASE DE DONNÉES
// =====================================================

const db = new Database(
  path.join(__dirname, "agenda.db")
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

// =====================================================
// GROUPES ET COULEURS
// =====================================================

const GROUPS = [
  "alternance",
  "initiale"
];

const TYPES = [
  "cours",
  "entreprise",
  "vacances",
  "examen",
  "ferie"
];

const COLORS = {
  cours: "#FFF4A3",
  entreprise: "#B5F5FF",
  vacances: "#E5AA43",
  examen: "#D75C75",
  ferie: "#FF8080"
};

const LABELS = {
  cours: "ÉCOLE",
  entreprise: "ENTREPRISE",
  vacances: "VACANCES",
  examen: "EXAMEN",
  ferie: "FÉRIÉ"
};

const GROUP_LABELS = {
  alternance: "Alternance",
  initiale: "Formation initiale"
};

// =====================================================
// COMMANDES DISCORD
// =====================================================

const commands = [

  new SlashCommandBuilder()
    .setName("agenda")
    .setDescription("Consulter le calendrier"),

  new SlashCommandBuilder()
    .setName("agenda-init")
    .setDescription(
      "Installer ou actualiser le calendrier dans ce salon"
    ),

  new SlashCommandBuilder()
    .setName("agenda-ajouter")
    .setDescription("Ajouter une période au calendrier")

    .addStringOption(option =>
      option
        .setName("groupe")
        .setDescription("Groupe concerné")
        .setRequired(true)
        .addChoices(
          {
            name: "Alternance",
            value: "alternance"
          },
          {
            name: "Formation initiale",
            value: "initiale"
          }
        )
    )

    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("Type de période")
        .setRequired(true)
        .addChoices(
          ...TYPES.map(type => ({
            name: LABELS[type],
            value: type
          }))
        )
    )

    .addStringOption(option =>
      option
        .setName("debut")
        .setDescription("Date AAAA-MM-JJ")
        .setRequired(true)
    )

    .addStringOption(option =>
      option
        .setName("fin")
        .setDescription("Date AAAA-MM-JJ")
        .setRequired(true)
    )

    .addStringOption(option =>
      option
        .setName("description")
        .setDescription("Description facultative")
    ),

  new SlashCommandBuilder()
    .setName("agenda-supprimer")
    .setDescription("Supprimer un événement")

    .addIntegerOption(option =>
      option
        .setName("id")
        .setDescription("Identifiant de l'événement")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("agenda-liste")
    .setDescription("Lister les événements enregistrés")

];

// =====================================================
// PERMISSIONS
// =====================================================

function isAdmin(interaction) {
  const adminRoleId = process.env.ADMIN_ROLE_ID;

  if (!adminRoleId || !interaction.inGuild()) {
    return false;
  }

  const roles = interaction.member?.roles;

  return Array.isArray(roles)
    ? roles.includes(adminRoleId)
    : Boolean(roles?.cache?.has(adminRoleId));
}

// =====================================================
// DATES
// =====================================================

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
    Number(
      parts.find(part => part.type === type).value
    );

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

// =====================================================
// RÉCUPÉRATION DES ÉVÉNEMENTS
// =====================================================

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
    WHERE groupe = ?
      AND debut < ?
      AND fin >= ?
    ORDER BY debut, id
  `).all(group, next, start);
}
// =====================================================
// IMPORT ICALENDAR
// =====================================================

function parisDateTime(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
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

let syncInProgress = false;

async function syncIcal() {
  if (syncInProgress) {
    return;
  }

  if (!process.env.ICAL_URL) {
    throw new Error("ICAL_URL manque dans .env");
  }

  syncInProgress = true;

  try {
    const response = await fetch(process.env.ICAL_URL, {
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok) {
      throw new Error(`Erreur Ymag : HTTP ${response.status}`);
    }

    const content = await response.text();

    if (!content.includes("BEGIN:VCALENDAR")) {
      throw new Error("Le portail n'a pas renvoyé un calendrier.");
    }

    const calendar = new ICAL.Component(
      ICAL.parse(content)
    );

    const events = calendar.getAllSubcomponents("vevent");

    if (!events.length) {
      throw new Error("Export vide : anciens cours conservés.");
    }

    const records = new Map();
    let unsupportedRecurrences = 0;

    for (const component of events) {
      const event = new ICAL.Event(component);

      if (!event.uid || !event.startDate || !event.endDate) {
        continue;
      }

      const className = event.description || "";

      if (
        process.env.ICAL_CLASS_FILTER &&
        !className.includes(process.env.ICAL_CLASS_FILTER)
      ) {
        continue;
      }

      if (
        component.hasProperty("rrule") ||
        component.hasProperty("rdate") ||
        component.hasProperty("recurrence-id")
      ) {
        unsupportedRecurrences++;
        continue;
      }

      const start = parisDateTime(event.startDate.toJSDate());
      const end = parisDateTime(event.endDate.toJSDate());

      records.set(event.uid, {
        uid: event.uid,
        date: start.date,
        start_at: start.time,
        end_at: end.time,
        title: event.summary || "Cours",
        location: event.location || "",
        class_name: className
      });
    }

    if (!records.size || unsupportedRecurrences) {
      throw new Error(
        "Export sans cours exploitables ou avec récurrences : " +
        "anciens cours conservés."
      );
    }

    const upsert = db.prepare(`
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

    const remove = db.prepare(`
      DELETE FROM courses WHERE uid = ?
    `);

    db.transaction(() => {
      for (const record of records.values()) {
        upsert.run(record);
      }

      for (const row of db.prepare("SELECT uid FROM courses").all()) {
        if (!records.has(row.uid)) {
          remove.run(row.uid);
        }
      }
    })();

    console.log(
      `iCalendar : ${records.size} cours synchronisés.`
    );

    return records.size;

  } finally {
    syncInProgress = false;
  }
}
// =====================================================
// GÉNÉRATION DU CALENDRIER
// =====================================================
function drawDayPanel(ctx, selectedDate, group) {
  const x = 1120;
  const y = 30;
  const width = 525;
  const padding = 22;

  // Fond du panneau
  ctx.fillStyle = "#303540";
  ctx.fillRect(x, y, width, 815);

  // Titre
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "26px AgendaFontBold";
  ctx.fillText(
    "Prochaine journée de cours",
    x + padding,
    y + 43,
    width - padding * 2
  );

  // Date mise en évidence
  const heading = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${selectedDate}T12:00:00Z`));

  ctx.fillStyle = "#B5F5FF";
  ctx.font = "20px AgendaFontBold";
  ctx.fillText(
    heading.charAt(0).toUpperCase() + heading.slice(1),
    x + padding,
    y + 82,
    width - padding * 2
  );

  // Séparation
  ctx.fillStyle = "#505766";
  ctx.fillRect(x + padding, y + 99, width - padding * 2, 1);

  if (group !== "alternance") {
    ctx.fillStyle = "#D1D6E1";
    ctx.font = "17px AgendaFont";
    ctx.fillText(
      "Planning détaillé disponible pour l'alternance.",
      x + padding,
      y + 145,
      width - padding * 2
    );
    return;
  }

  const courses = coursesFor(selectedDate);

  if (!courses.length) {
    ctx.fillStyle = "#D1D6E1";
    ctx.font = "17px AgendaFont";
    ctx.fillText(
      "Aucun cours publié pour cette date.",
      x + padding,
      y + 145,
      width - padding * 2
    );
    return;
  }

  // Cartes des cours
  let courseY = y + 115;
  const cardHeight = 108;
  const cardGap = 10;

  for (const course of courses.slice(0, 6)) {
    const cardX = x + 14;
    const cardWidth = width - 28;

    ctx.fillStyle = "#20232B";
    ctx.fillRect(cardX, courseY, cardWidth, cardHeight);

    // Barre colorée sur le côté
    ctx.fillStyle = "#FFF4A3";
    ctx.fillRect(cardX, courseY, 4, cardHeight);

    // Horaires
    ctx.fillStyle = "#FFF4A3";
    ctx.font = "19px AgendaFontBold";
    ctx.fillText(
      `${course.start_at} – ${course.end_at}`,
      cardX + 18,
      courseY + 29
    );

    // Intitulé du cours
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "17px AgendaFontBold";
    ctx.fillText(
      course.title,
      cardX + 18,
      courseY + 60,
      cardWidth - 36
    );

    // Salle
    ctx.fillStyle = "#B9C1D2";
    ctx.font = "15px AgendaFont";
    ctx.fillText(
      course.location || "Salle non indiquée",
      cardX + 18,
      courseY + 89,
      cardWidth - 36
    );

    courseY += cardHeight + cardGap;
  }

  if (courses.length > 6) {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "14px AgendaFont";
    ctx.fillText(
      `+${courses.length - 6} cours supplémentaires`,
      x + padding,
      y + 805
    );
  }
}

function calendarImage(group, year, month, selectedDate = nextCourseDate(currentDate())) {

  const canvas = createCanvas(
    CONFIG.width,
    CONFIG.height
  );

  const ctx = canvas.getContext("2d");

  // Fond principal

  ctx.fillStyle = CONFIG.background;

  ctx.fillRect(
    0,
    0,
    CONFIG.width,
    CONFIG.height
  );

  // Titre du mois

  const monthName = new Intl.DateTimeFormat(
    "fr-FR",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }
  ).format(
    new Date(Date.UTC(year, month, 1))
  );

  const title =
    monthName.charAt(0).toUpperCase() +
    monthName.slice(1);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "38px AgendaFontBold";

  ctx.fillText(
    title,
    35,
    60
  );

  // Nom du groupe

  ctx.fillStyle = "#AAB2C5";
  ctx.font = "19px AgendaFont";

  ctx.fillText(
    GROUP_LABELS[group],
    35,
    100
  );

  // Jours de la semaine

  const days = [
    "Lun",
    "Mar",
    "Mer",
    "Jeu",
    "Ven",
    "Sam",
    "Dim"
  ];

  days.forEach((day, index) => {

    ctx.fillStyle = "#B9C1D2";
    ctx.font = "19px AgendaFontBold";

    ctx.fillText(
      day,
      35 + index * 153,
      155
    );

  });

  // Calcul des jours du mois

  const first = new Date(
    Date.UTC(year, month, 1)
  );

  const offset =
    (first.getUTCDay() + 6) % 7;

  const count = new Date(
    Date.UTC(year, month + 1, 0)
  ).getUTCDate();

  const events = getEvents(
    group,
    year,
    month
  );

  const today = currentDate();

  // Dessin des journées

  for (let day = 1; day <= count; day++) {

    const index = offset + day - 1;

    const col = index % 7;
    const row = Math.floor(index / 7);

    const x = 25 + col * 153;
    const y = 175 + row * 112;

    const date = [
      year,
      String(month + 1).padStart(2, "0"),
      String(day).padStart(2, "0")
    ].join("-");

    const isWeekend = col >= 5;

    // Fond des cases

    ctx.fillStyle = isWeekend
      ? "#101116"
      : date === today
        ? "#424D78"
        : "#303540";

    ctx.fillRect(
      x,
      y,
      145,
      105
    );

    // Numéro du jour

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "21px AgendaFontBold";

    ctx.fillText(
      String(day),
      x + 10,
      y + 27
    );

    // Événements actifs

    const active = events.filter(event =>
      event.debut <= date &&
      event.fin >= date
    );

    // Affichage des événements

    active.slice(0, 3).forEach((event, i) => {

      const color =
        COLORS[event.type] || "#5865F2";

      const label =
        LABELS[event.type] || event.type;

      // Fond coloré

      ctx.fillStyle = color;

      ctx.fillRect(
        x + 7,
        y + 37 + i * 21,
        131,
        18
      );

      // Texte

      ctx.fillStyle = "#20232B";
      ctx.font = "13px AgendaFontBold";
      
      ctx.fillText(
        label,
        x + 11,
        y + 51 + i * 21,
        123
      );

    });

    // Événements supplémentaires

    if (active.length > 3) {

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "11px AgendaFont";

      ctx.fillText(
        `+${active.length - 3} autre(s)`,
        x + 9,
        y + 100
      );

    }

  }

  // Légende

  ctx.font = "16px AgendaFont";
  ctx.fillStyle = "#B9C1D2";

  ctx.fillText(
    "Bleu : Entreprise | Jaune : École | Rouge : Férié | Noir : Week-end",
    35,
    865
  );

  drawDayPanel(ctx, selectedDate, group);

  return canvas.toBuffer("image/png");
}

// =====================================================
// MESSAGE DISCORD
// =====================================================

  function calendarMessage(
    group,
    year,
    month,
    publicView = false,
    selectedDate = nextCourseDate(currentDate())
  ) {

  const image = calendarImage(
    group,
    year,
    month,
    selectedDate
  );

  const attachment = new AttachmentBuilder(
    image,
    {
      name: "agenda.png"
    }
  );

  const embed = new EmbedBuilder()

    .setTitle("Agenda de la classe")

    .setDescription(
      `Planning : ${GROUP_LABELS[group]}`
    )

    .setColor("#5865F2")

    .setImage("attachment://agenda.png");

  const buttons = new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          `cal:prev:${group}:${year}:${month}`
        )
        .setLabel("← Mois")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          `cal:switch:${group}:${year}:${month}`
        )
        .setLabel(
          group === "alternance"
            ? "Formation initiale"
            : "Alternance"
        )
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(
          `cal:next:${group}:${year}:${month}`
        )
        .setLabel("Mois →")
        .setStyle(ButtonStyle.Secondary)

    );

    const dayButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`day:prev:${group}:${selectedDate}`)
        .setLabel("← Cours")
        .setStyle(ButtonStyle.Secondary),
    
      new ButtonBuilder()
        .setCustomId(`day:today:${group}:${selectedDate}`)
        .setLabel("Aujourd'hui")
        .setStyle(ButtonStyle.Secondary),
    
      new ButtonBuilder()
        .setCustomId(`day:tomorrow:${group}:${selectedDate}`)
        .setLabel("Prochain cours")
        .setStyle(ButtonStyle.Primary),
    
      new ButtonBuilder()
        .setCustomId(`day:next:${group}:${selectedDate}`)
        .setLabel("Cours →")
        .setStyle(ButtonStyle.Secondary)
    );

  return {
    embeds: [embed],
    files: [attachment],
    components: [buttons, dayButtons],

    ...(publicView
      ? {}
      : {
          flags: MessageFlags.Ephemeral
        })
  };
}

// =====================================================
// ACTUALISATION DU MESSAGE PUBLIC
// =====================================================

async function refreshPublicCalendars() {

  const messages = db.prepare(`
    SELECT *
    FROM agenda_messages
  `).all();

  const { year, month } = currentMonth();

  for (const entry of messages) {

    try {

      const channel = await client.channels.fetch(
        entry.channel_id
      );

      if (!channel?.isTextBased() ||
          !channel.messages?.fetch) {
        continue;
      }

      const message = await channel.messages.fetch(
        entry.message_id
      );

      await message.edit(
        calendarMessage(
          "alternance",
          year,
          month,
          true
        )
      );

    } catch (error) {

      console.error(
        "Erreur actualisation calendrier :",
        error.message
      );

    }

  }

}

// =====================================================
// INTERACTIONS DISCORD
// =====================================================

client.on(
  "interactionCreate",
  async interaction => {

    try {

      // ---------------------------------------------
      // BOUTONS
      // ---------------------------------------------

      if (interaction.isButton()) {
        if (interaction.customId.startsWith("day:")) {
          const [, action, group, date] =
            interaction.customId.split(":");

          if (!GROUPS.includes(group) || !validDate(date)) {
            return;
          }

          const previousCourse = db.prepare(`
            SELECT MAX(date) AS date
            FROM courses
            WHERE date < ?
          `).get(date)?.date;
          
          const selected =
            action === "prev" ? previousCourse :
            action === "next" ? nextCourseDate(date) :
            action === "today" ? currentDate() :
            action === "tomorrow" ? nextCourseDate(currentDate()) :
            null;

          if (!selected) {
            return;
          }

          const d = new Date(`${selected}T12:00:00Z`);

          return interaction.reply(
            calendarMessage(
              group,
              d.getUTCFullYear(),
              d.getUTCMonth(),
              false,
              selected
            )
          );
        }
        
        const [
          prefix,
          action,
          group,
          ys,
          ms
        ] = interaction.customId.split(":");

        if (
          prefix !== "cal" ||
          !GROUPS.includes(group)
        ) {
          return;
        }

        const year = Number(ys);
        const month = Number(ms);

        if (
          !Number.isInteger(year) ||
          !Number.isInteger(month) ||
          year < 2000 ||
          year > 2100 ||
          month < 0 ||
          month > 11
        ) {
          return;
        }

        // Changement de groupe

        if (action === "switch") {

          const other =
            group === "alternance"
              ? "initiale"
              : "alternance";

          return interaction.reply(
            calendarMessage(
              other,
              year,
              month
            )
          );

        }

        // Navigation entre les mois

        if (
          action !== "prev" &&
          action !== "next"
        ) {
          return;
        }

        const direction =
          action === "prev" ? -1 : 1;

        const date = new Date(
          Date.UTC(
            year,
            month + direction,
            1
          )
        );

        return interaction.reply(
          calendarMessage(
            group,
            date.getUTCFullYear(),
            date.getUTCMonth()
          )
        );

      }

      // ---------------------------------------------
      // COMMANDES
      // ---------------------------------------------

      if (!interaction.isChatInputCommand()) {
        return;
      }

      const name = interaction.commandName;

      // ---------------------------------------------
      // /agenda
      // ---------------------------------------------

      if (name === "agenda") {

        const { year, month } = currentMonth();

        return interaction.reply(
          calendarMessage(
            "alternance",
            year,
            month
          )
        );

      }

      // ---------------------------------------------
      // /agenda-init
      // ---------------------------------------------

      if (name === "agenda-init") {

        if (!isAdmin(interaction)) {

          return interaction.reply({
            content: "Permission insuffisante.",
            flags: MessageFlags.Ephemeral
          });

        }

        const { year, month } = currentMonth();

        await interaction.deferReply({
          flags: MessageFlags.Ephemeral
        });

        const existing = db.prepare(`
          SELECT *
          FROM agenda_messages
          WHERE channel_id = ?
        `).get(interaction.channelId);

        // Si un calendrier existe déjà, on le modifie

        if (existing) {

          try {

            const oldMessage =
              await interaction.channel.messages.fetch(
                existing.message_id
              );

            await oldMessage.edit(
              calendarMessage(
                "alternance",
                year,
                month,
                true
              )
            );

            return interaction.editReply(
              "Calendrier actualisé !"
            );

          } catch (error) {

            console.log(
              "Ancien calendrier introuvable, création d'un nouveau."
            );

          }

        }

        // Création du calendrier

        const message =
          await interaction.channel.send(
            calendarMessage(
              "alternance",
              year,
              month,
              true
            )
          );

        db.prepare(`
          INSERT INTO agenda_messages
          (channel_id, message_id)
          VALUES (?, ?)
          ON CONFLICT(channel_id)
          DO UPDATE SET
          message_id = excluded.message_id
        `).run(
          interaction.channelId,
          message.id
        );

        return interaction.editReply(
          "Calendrier installé avec succès !"
        );

      }

      // ---------------------------------------------
      // /agenda-liste
      // ---------------------------------------------
      if (name === "agenda-liste") {
      
        if (!isAdmin(interaction)) {
          return interaction.reply({
            content: "Tu n'as pas le rôle requis pour consulter cette liste.",
            flags: MessageFlags.Ephemeral
          });
        }

        const events = db.prepare(`
          SELECT *
          FROM events
          ORDER BY debut DESC, id DESC
          LIMIT 20
        `).all();

        const text = events.map(event =>
          `#${event.id} | ${event.groupe} | ` +
          `${event.type} | ${event.debut} au ${event.fin} | ` +
          `${event.description}`
        ).join("\n") || "Aucun événement.";

        return interaction.reply({
          content: text.slice(0, 1900),
          flags: MessageFlags.Ephemeral
        });

      }

      // ---------------------------------------------
      // VÉRIFICATION DES PERMISSIONS
      // ---------------------------------------------

      if (!isAdmin(interaction)) {

        return interaction.reply({
          content:
            "Seuls les responsables peuvent modifier l'agenda.",
          flags: MessageFlags.Ephemeral
        });

      }

      // ---------------------------------------------
      // /agenda-ajouter
      // ---------------------------------------------

      if (name === "agenda-ajouter") {

        const options = interaction.options;

        const groupe =
          options.getString("groupe");

        const type =
          options.getString("type");

        const debut =
          options.getString("debut");

        const fin =
          options.getString("fin");

        const description =
          options.getString("description") || "";

        if (
          !GROUPS.includes(groupe) ||
          !TYPES.includes(type) ||
          !validDate(debut) ||
          !validDate(fin) ||
          debut > fin ||
          description.length > 100
        ) {

          return interaction.reply({
            content:
              "Dates ou paramètres invalides. Utilise AAAA-MM-JJ.",
            flags: MessageFlags.Ephemeral
          });

        }

        const result = db.prepare(`
          INSERT INTO events
          (groupe, type, debut, fin, description)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          groupe,
          type,
          debut,
          fin,
          description
        );

        await interaction.reply({
          content:
            `Événement #${result.lastInsertRowid} ajouté.`,
          flags: MessageFlags.Ephemeral
        });

        await refreshPublicCalendars();

        return;
      }

      // ---------------------------------------------
      // /agenda-supprimer
      // ---------------------------------------------

      if (name === "agenda-supprimer") {

        const id =
          interaction.options.getInteger("id");

        const result = db.prepare(`
          DELETE FROM events
          WHERE id = ?
        `).run(id);

        await interaction.reply({
          content: result.changes
            ? `Événement #${id} supprimé.`
            : "Événement introuvable.",
          flags: MessageFlags.Ephemeral
        });

        if (result.changes) {
          await refreshPublicCalendars();
        }

        return;
      }

    } catch (error) {

      console.error(error);

      if (interaction.isRepliable()) {

        const message = {
          content: "Une erreur est survenue.",
          flags: MessageFlags.Ephemeral
        };

        if (
          interaction.replied ||
          interaction.deferred
        ) {

          await interaction.followUp(
            message
          ).catch(console.error);

        } else {

          await interaction.reply(
            message
          ).catch(console.error);

        }

      }

    }

  }
);

// =====================================================
// DÉMARRAGE
// =====================================================

async function start() {

  // Vérification des variables d'environnement

  const required = [
    "DISCORD_TOKEN",
    "CLIENT_ID",
    "GUILD_ID"
  ];

  for (const variable of required) {

    if (!process.env[variable]) {

      throw new Error(
        `Variable manquante dans .env : ${variable}`
      );

    }

  }

  // Enregistrement des commandes

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    {
      body: commands.map(command =>
        command.toJSON()
      )
    }
  );

  // Connexion Discord

  await client.login(
    process.env.DISCORD_TOKEN
  );

  console.log(
    `Bot connecté : ${client.user.tag}`
  );

  // Import initial
  if (process.env.ICAL_URL) {
    try {
      await syncIcal();
    } catch (error) {
      console.error("Import iCalendar :", error.message);
    }
  }

  // Synchronisation quotidienne à 20 h, heure de Paris
  cron.schedule("0 20 * * *", async () => {
    try {
      await syncIcal();
      await refreshPublicCalendars();
    } catch (error) {
      console.error("Synchronisation de 20 h :", error.message);
    }
  }, {
    timezone: "Europe/Paris",
    noOverlap: true
  });
  
  // Actualisation au démarrage

  await refreshPublicCalendars();

  // Actualisation périodique
  // Permet notamment de passer au mois suivant.

  setInterval(
    () => {
      refreshPublicCalendars().catch(
        console.error
      );
    },
    60 * 60 * 1000
  );

}

start().catch(console.error);