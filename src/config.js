const CONFIG = {
  timezone: "Europe/Paris",
  width: 1680,
  height: 880,
  background: "#20232B"
};

const GROUPS = [
  "alternance",
  "initiale"
];

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
  alternance: "Alternance",
  initiale: "Formation initiale"
};

module.exports = {
  CONFIG,
  GROUPS,
  TYPES,
  COLORS,
  LABELS,
  GROUP_LABELS
};