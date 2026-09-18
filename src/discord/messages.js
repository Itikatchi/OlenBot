
const {
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const { GROUP_LABELS } = require("../config");

const { currentDate } = require("../utils/dates");

const {
  nextCourseDate
} = require("../database/courses.repository");

const {
  calendarImage
} = require("../calendar/renderer");

function calendarMessage(
  group,
  year,
  month,
  publicView = false,
  selectedDate = nextCourseDate(currentDate())
) {
  // Génération de l'image
  const image = calendarImage(
    group,
    year,
    month,
    selectedDate
  );

  const attachment = new AttachmentBuilder(image, {
    name: "agenda.png"
  });

  // Embed Discord
  const embed = new EmbedBuilder()
    .setTitle("Agenda de la classe")
    .setDescription(`Planning : ${GROUP_LABELS[group]}`)
    .setColor("#5865F2")
    .setImage("attachment://agenda.png");

  // Navigation entre les mois et les groupes
  const monthButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cal:prev:${group}:${year}:${month}`)
      .setLabel("← Mois")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`cal:switch:${group}:${year}:${month}`)
      .setLabel(
        group === "alternance"
          ? "Formation initiale"
          : "Alternance"
      )
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`cal:next:${group}:${year}:${month}`)
      .setLabel("Mois →")
      .setStyle(ButtonStyle.Secondary)
  );

  // Navigation entre les journées de cours
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
    components: [monthButtons, dayButtons],

    ...(publicView
      ? {}
      : { flags: MessageFlags.Ephemeral })
  };
}

module.exports = {
  calendarMessage
};