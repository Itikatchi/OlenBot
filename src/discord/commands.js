const { SlashCommandBuilder } = require("discord.js");
const { TYPES, LABELS } = require("../config");

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

module.exports = { commands };
