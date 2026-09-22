const { SlashCommandBuilder } = require("discord.js");
const { TYPES, LABELS, GROUPS, GROUP_LABELS } = require("../config");

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
    .setName("agenda-refresh")
    .setDescription("Réimporter les calendriers ICAL et actualiser l'agenda (admin)"),

  new SlashCommandBuilder()
    .setName("agenda-ajouter")
    .setDescription("Ajouter une période au calendrier")

    .addStringOption(option =>
      option
        .setName("groupe")
        .setDescription("Groupe concerné (école et entreprise partagés entre 4EADL et 4ERIS)")
        .setRequired(true)
        .addChoices(
          ...GROUPS.map(group => ({ name: GROUP_LABELS[group], value: group }))
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
