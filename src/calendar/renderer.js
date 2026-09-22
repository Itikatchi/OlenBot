
const { createCanvas } = require("@napi-rs/canvas");

const {
  CONFIG,
  COLORS,
  LABELS,
  GROUP_LABELS
} = require("../config");

const {
  currentDate
} = require("../utils/dates");

const {
  getEvents
} = require("../database/agenda.repository");

const {
  defaultCourseDate,
  courseDatesForMonth
} = require("../database/courses.repository");

const {
  drawDayPanel
} = require("./day-panel");

const {
  loadFonts
} = require("./fonts");

// Chargement des polices une seule fois.
loadFonts();

function calendarImage(
  group,
  year,
  month,
  selectedDate = defaultCourseDate(new Date(), group)
) {
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
  const courseDates = courseDatesForMonth(group, year, month);

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

    if (courseDates.has(date) && !active.some(event => event.type === "cours")) {
      active.unshift({ type: "cours" });
    }

    // Affichage des événements
    active.slice(0, 3).forEach((event, i) => {
      const color =
        COLORS[event.type] || "#5865F2";

      const label =
        LABELS[event.type] || event.type;

      ctx.fillStyle = color;

      ctx.fillRect(
        x + 7,
        y + 37 + i * 21,
        131,
        18
      );

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

  // Panneau détaillé
  drawDayPanel(ctx, selectedDate, group);

  return canvas.toBuffer("image/png");
}

module.exports = {
  calendarImage
};
