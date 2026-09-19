
const ICAL = require("ical.js");

const { parisDateTime } = require("../utils/dates");
const { replaceCourses } = require("../database/courses.repository");

let syncInProgress = false;

async function syncIcal() {
  
  // Empêche deux imports simultanés.
  if (syncInProgress) {
    logYmag("Début de la récupération du calendrier.");
    return;
  }

  if (!process.env.ICAL_URL) {
    logYmag("Échec : ICAL_URL manque dans .env.");
    throw new Error("ICAL_URL manque dans .env");
  }

  syncInProgress = true;
  logYmag("Début de la récupération du calendrier.");

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
        continue;d
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

    replaceCourses(records);

    logYmag(
      `Calendrier récupéré et synchronisé avec succès : ${records.size} cours.`
    );

    return records.size;
  } catch (error) {
    logYmag(`Échec de la synchronisation : ${error.message}`);
    throw error;
  } finally {
    syncInProgress = false;
  }
}
  function logYmag(message) {
    const date = new Date().toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      dateStyle: "short",
      timeStyle: "medium",
    });

    console.log(`[Ymag][${date}] ${message}`);
  }

module.exports = {
  syncIcal
};