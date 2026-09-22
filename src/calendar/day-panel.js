
const {
  coursesFor
} = require("../database/courses.repository");
const { currentDate } = require("../utils/dates");

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
    selectedDate === currentDate()
      ? "Cours d'aujourd'hui"
      : "Journée de cours",
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
  }).format(
    new Date(`${selectedDate}T12:00:00Z`)
  );

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

  ctx.fillRect(
    x + padding,
    y + 99,
    width - padding * 2,
    1
  );

  const courses = coursesFor(selectedDate, group);

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

    ctx.fillRect(
      cardX,
      courseY,
      cardWidth,
      cardHeight
    );

    // Barre colorée
    ctx.fillStyle = "#FFF4A3";

    ctx.fillRect(
      cardX,
      courseY,
      4,
      cardHeight
    );

    // Horaires
    ctx.fillStyle = "#FFF4A3";
    ctx.font = "19px AgendaFontBold";

    ctx.fillText(
      `${course.start_at} – ${course.end_at}`,
      cardX + 18,
      courseY + 29
    );

    // Intitulé
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

module.exports = {
  drawDayPanel
};
