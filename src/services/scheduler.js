
const cron = require("node-cron");

const { CONFIG } = require("../config");
const { syncIcal } = require("./ical.service");

function startScheduler(refreshPublicCalendars) {
  // Import quotidien à 20 h, heure de Paris.
  const dailyTask = cron.schedule(
    "0 20 * * *",
    async () => {
      try {
        await syncIcal();
      } catch (error) {
        console.error(
          "Synchronisation de 20 h :",
          error.message
        );
      }

      // Actualiser la date affichée même si le portail ICAL est indisponible.
      await refreshPublicCalendars().catch(console.error);
    },
    {
      timezone: CONFIG.timezone,
      noOverlap: true
    }
  );

  // Heures pleines : bascule à 18 h et changements de jour/mois.
  // À 20 h, l'import doit se terminer avant de rafraîchir l'image.
  const hourlyTask = cron.schedule(
    "0 0-19,21-23 * * *",
    async () => {
      await refreshPublicCalendars().catch(console.error);
    },
    {
      timezone: CONFIG.timezone,
      noOverlap: true
    }
  );

  return {
    dailyTask,
    hourlyTask
  };
}

module.exports = {
  startScheduler
};
