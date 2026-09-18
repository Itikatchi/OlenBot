
const { currentMonth } = require("../utils/dates");

const {
  getAgendaMessages,
  saveAgendaMessage
} = require("../database/agenda.repository");

const { calendarMessage } = require("./messages");

function createPublicCalendarRefresher(client) {
  return async function refreshPublicCalendars() {
    const entries = getAgendaMessages();
    const { year, month } = currentMonth();

    for (const entry of entries) {
      try {
        const channel = await client.channels.fetch(
          entry.channel_id
        );

        if (
          !channel?.isTextBased() ||
          !channel.messages?.fetch
        ) {
          console.warn(
            `Calendrier ignoré : salon ${entry.channel_id} inaccessible.`
          );
          continue;
        }

        const content = calendarMessage(
          "alternance",
          year,
          month,
          true
        );

        try {
          const message = await channel.messages.fetch(
            entry.message_id
          );

          await message.edit(content);

        } catch (error) {
          // 10008 = Unknown Message :
          // le message a été supprimé sur Discord.
          if (error.code !== 10008) {
            throw error;
          }

          console.warn(
            `Message ${entry.message_id} introuvable. ` +
            "Création d'un nouveau calendrier."
          );

          const newMessage = await channel.send(content);

          saveAgendaMessage(
            entry.channel_id,
            newMessage.id
          );

          console.log(
            `Calendrier recréé dans le salon ${entry.channel_id}.`
          );
        }

      } catch (error) {
        console.error(
          `Erreur actualisation calendrier (${entry.channel_id}) :`,
          error.message
        );
      }
    }
  };
}

module.exports = {
  createPublicCalendarRefresher
};