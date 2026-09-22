
const ICAL = require("ical.js");
const { getIcalSources, GROUP_LABELS } = require("../config");

const { parisDateTime } = require("../utils/dates");
const { replaceCourses } = require("../database/courses.repository");

let syncInProgress = false;

async function syncIcal() {
  
  // Empêche deux imports simultanés.
  if (syncInProgress) {
    logYmag("Synchronisation déjà en cours, import ignoré.");
    return;
  }

  const sources = getIcalSources();
  if (!sources.length) {
    throw new Error("Aucune URL ICAL configurée dans .env");
  }

  syncInProgress = true;
  logYmag("Début de la récupération du calendrier.");

  try {
    let total = 0;
    const failures = [];
    for (const source of sources) {
      try {
        total += await syncSource(source);
      } catch (error) {
        // Un portail indisponible ne bloque pas l'import de l'autre groupe.
        failures.push(`${GROUP_LABELS[source.group]} : ${error.message}`);
      }
    }
    if (failures.length) {
      throw new Error(failures.join(" ; "));
    }
    return total;
  } catch (error) {
    logYmag(`Échec de la synchronisation : ${error.message}`);
    throw error;
  } finally {
    syncInProgress = false;
  }
}

async function syncSource({ group, url, filter }) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(25000),
    cache: "no-store"
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
  const classFilters = filter
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

  for (const component of events) {
    const event = new ICAL.Event(component);

    if (!event.uid || !event.startDate || !event.endDate) {
      continue;
    }

    const className = event.description || "";

    if (
      classFilters.length &&
      !classFilters.some(filter => className.includes(filter))
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

  replaceCourses(records, group);

  logYmag(
    `${GROUP_LABELS[group]} : calendrier synchronisé avec succès, ${records.size} cours.`
  );

  return records.size;
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
