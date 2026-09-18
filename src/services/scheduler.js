
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
        await refreshPublicCalendars();
      } catch (error) {
        console.error(
          "Synchronisation de 20 h :",
          error.message
        );
      }
    },
    {
      timezone: CONFIG.timezone,
      noOverlap: true
    }
  );

  // Actualisation toutes les heures pour suivre
  // notamment les changements de mois.
  const hourlyTimer = setInterval(() => {
    refreshPublicCalendars().catch(console.error);
  }, 60 * 60 * 1000);

  return {
    dailyTask,
    hourlyTimer
  };
}

module.exports = {
  startScheduler
};