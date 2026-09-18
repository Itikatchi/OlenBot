
const path = require("node:path");
const fs = require("node:fs");
const { GlobalFonts } = require("@napi-rs/canvas");

const FONT_REGULAR = path.join(
  __dirname,
  "..",
  "..",
  "assets",
  "fonts",
  "DejaVuSans.ttf"
);

const FONT_BOLD = path.join(
  __dirname,
  "..",
  "..",
  "assets",
  "fonts",
  "DejaVuSans-Bold.ttf"
);

function loadFonts() {
  if (!fs.existsSync(FONT_REGULAR)) {
    throw new Error(
      `Police normale introuvable : ${FONT_REGULAR}`
    );
  }

  if (!fs.existsSync(FONT_BOLD)) {
    throw new Error(
      `Police grasse introuvable : ${FONT_BOLD}`
    );
  }

  const regularLoaded = GlobalFonts.registerFromPath(
    FONT_REGULAR,
    "AgendaFont"
  );

  const boldLoaded = GlobalFonts.registerFromPath(
    FONT_BOLD,
    "AgendaFontBold"
  );

  if (!regularLoaded || !boldLoaded) {
    throw new Error(
      "Impossible de charger les polices DejaVu."
    );
  }
}

module.exports = {
  loadFonts
};