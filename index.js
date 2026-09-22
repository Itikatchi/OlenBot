
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes 
} = require("discord.js");

const { syncIcal } = require("./src/services/ical.service");
const { startScheduler } = require("./src/services/scheduler");
const { commands } = require("./src/discord/commands");
const { registerInteractions } = require("./src/discord/interactions");
const { createPublicCalendarRefresher } = require("./src/discord/public-calendar");

// =====================================================
// DISCORD
// =====================================================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const refreshPublicCalendars = createPublicCalendarRefresher(client);

const rest = new REST({
  version: "10"
}).setToken(process.env.DISCORD_TOKEN);


// =====================================================
// INTERACTIONS DISCORD
// =====================================================

registerInteractions(client, refreshPublicCalendars);

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
  if (process.env.ICAL_URL || process.env.ICAL_4EADL_URL || process.env.ICAL_4ERIS_URL) {
    try {
      await syncIcal();
    } catch (error) {
      console.error("Import iCalendar :", error.message);
    }
  }

  // Actualisation au démarrage
  await refreshPublicCalendars();

  // Démarrage des tâches automatiques
  startScheduler(refreshPublicCalendars);
}

start().catch(console.error);
