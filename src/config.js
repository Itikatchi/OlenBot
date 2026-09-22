const CONFIG = {
  timezone: "Europe/Paris",
  width: 1680,
  height: 880,
  background: "#20232B"
};

const GROUPS = [
  "4eadl",
  "4eris"
];

const DEFAULT_GROUP = "4eadl";

function getIcalSources() {
  return [
    {
      group: "4eadl",
      url: process.env.ICAL_4EADL_URL || process.env.ICAL_URL,
      filter: process.env.ICAL_4EADL_CLASS_FILTER ?? process.env.ICAL_CLASS_FILTER ?? ""
    },
    {
      group: "4eris",
      url: process.env.ICAL_4ERIS_URL,
      filter: process.env.ICAL_4ERIS_CLASS_FILTER ?? ""
    }
  ].filter(source => source.url);
}

const TYPES = [
  "cours",
  "entreprise",
  "vacances",
  "examen",
  "ferie"
];

const COLORS = {
  cours: "#FFF4A3",
  entreprise: "#B5F5FF",
  vacances: "#E5AA43",
  examen: "#D75C75",
  ferie: "#FF8080"
};

const LABELS = {
  cours: "ÉCOLE",
  entreprise: "ENTREPRISE",
  vacances: "VACANCES",
  examen: "EXAMEN",
  ferie: "FÉRIÉ"
};

const GROUP_LABELS = {
  "4eadl": "4EADL",
  "4eris": "4ERIS"
};

module.exports = {
  CONFIG,
  GROUPS,
  DEFAULT_GROUP,
  getIcalSources,
  TYPES,
  COLORS,
  LABELS,
  GROUP_LABELS
};
