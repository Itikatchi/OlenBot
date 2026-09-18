const { MessageFlags } = require("discord.js");
const { GROUPS, TYPES } = require("../config");
const { validDate, currentMonth, currentDate } = require("../utils/dates");
const { nextCourseDate, previousCourseDate } = require("../database/courses.repository");
const { listEvents, addEvent, deleteEvent, getAgendaMessage, saveAgendaMessage } = require("../database/agenda.repository");
const { calendarMessage } = require("./messages");

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

function registerInteractions(client, refreshPublicCalendars) {
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
          
          const previousCourse = previousCourseDate(date);

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

        const existing = getAgendaMessage(interaction.channelId);

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

        saveAgendaMessage(
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

        const events = listEvents();

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

        const result = addEvent(
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

        const result = deleteEvent(id);

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

}

module.exports = { registerInteractions };
