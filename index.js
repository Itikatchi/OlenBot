
require("dotenv").config();
const {
  CONFIG,
  GROUPS,
  TYPES,
  COLORS,
  LABELS,
  GROUP_LABELS
} = require("./src/config");

const {
  validDate,
  currentMonth,
  currentDate,
  parisDateTime,
  addDays,
  tomorrow
} = require("./src/utils/dates");

const {
  coursesFor,
  nextCourseDate,
  previousCourseDate,
  replaceCourses
} = require("./src/database/courses.repository");

const {
  getEvents,
  listEvents,
  addEvent,
  deleteEvent,
  getAgendaMessages,
  getAgendaMessage,
  saveAgendaMessage
} = require("./src/database/agenda.repository");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const { syncIcal } = require("./src/services/ical.service");
const { startScheduler } = require("./src/services/scheduler");
const { calendarImage } = require("./src/calendar/renderer");

// =====================================================
// DISCORD
// =====================================================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const rest = new REST({
  version: "10"
}).setToken(process.env.DISCORD_TOKEN);


// =====================================================
// COMMANDES DISCORD
// =====================================================

const commands = [

  new SlashCommandBuilder()
    .setName("agenda")
    .setDescription("Consulter le calendrier"),

  new SlashCommandBuilder()
    .setName("agenda-init")
    .setDescription(
      "Installer ou actualiser le calendrier dans ce salon"
    ),

  new SlashCommandBuilder()
    .setName("agenda-ajouter")
    .setDescription("Ajouter une période au calendrier")

    .addStringOption(option =>
      option
        .setName("groupe")
        .setDescription("Groupe concerné")
        .setRequired(true)
        .addChoices(
          {
            name: "Alternance",
            value: "alternance"
          },
          {
            name: "Formation initiale",
            value: "initiale"
          }
        )
    )

    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("Type de période")
        .setRequired(true)
        .addChoices(
          ...TYPES.map(type => ({
            name: LABELS[type],
            value: type
          }))
        )
    )

    .addStringOption(option =>
      option
        .setName("debut")
        .setDescription("Date AAAA-MM-JJ")
        .setRequired(true)
    )

    .addStringOption(option =>
      option
        .setName("fin")
        .setDescription("Date AAAA-MM-JJ")
        .setRequired(true)
    )

    .addStringOption(option =>
      option
        .setName("description")
        .setDescription("Description facultative")
    ),

  new SlashCommandBuilder()
    .setName("agenda-supprimer")
    .setDescription("Supprimer un événement")

    .addIntegerOption(option =>
      option
        .setName("id")
        .setDescription("Identifiant de l'événement")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("agenda-liste")
    .setDescription("Lister les événements enregistrés")

];

// =====================================================
// PERMISSIONS
// =====================================================

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

// =====================================================
// MESSAGE DISCORD
// =====================================================

  function calendarMessage(
    group,
    year,
    month,
    publicView = false,
    selectedDate = nextCourseDate(currentDate())
  ) {

  const image = calendarImage(
    group,
    year,
    month,
    selectedDate
  );

  const attachment = new AttachmentBuilder(
    image,
    {
      name: "agenda.png"
    }
  );

  const embed = new EmbedBuilder()

    .setTitle("Agenda de la classe")

    .setDescription(
      `Planning : ${GROUP_LABELS[group]}`
    )

    .setColor("#5865F2")

    .setImage("attachment://agenda.png");

  const buttons = new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          `cal:prev:${group}:${year}:${month}`
        )
        .setLabel("← Mois")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          `cal:switch:${group}:${year}:${month}`
        )
        .setLabel(
          group === "alternance"
            ? "Formation initiale"
            : "Alternance"
        )
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(
          `cal:next:${group}:${year}:${month}`
        )
        .setLabel("Mois →")
        .setStyle(ButtonStyle.Secondary)

    );

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
    components: [buttons, dayButtons],

    ...(publicView
      ? {}
      : {
          flags: MessageFlags.Ephemeral
        })
  };
}

// =====================================================
// ACTUALISATION DU MESSAGE PUBLIC
// =====================================================

async function refreshPublicCalendars() {

  const messages = getAgendaMessages();

  const { year, month } = currentMonth();

  for (const entry of messages) {

    try {

      const channel = await client.channels.fetch(
        entry.channel_id
      );

      if (!channel?.isTextBased() ||
          !channel.messages?.fetch) {
        continue;
      }

      const message = await channel.messages.fetch(
        entry.message_id
      );

      await message.edit(
        calendarMessage(
          "alternance",
          year,
          month,
          true
        )
      );

    } catch (error) {

      console.error(
        "Erreur actualisation calendrier :",
        error.message
      );

    }

  }

}

// =====================================================
// INTERACTIONS DISCORD
// =====================================================

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
  if (process.env.ICAL_URL) {
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