
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

const dbPath = path.join(__dirname, "agenda.db");

if (!fs.existsSync(dbPath)) {
  console.error("agenda.db introuvable. Lance le bot une première fois.");
  process.exit(1);
}

// E = Entreprise
// C = Cours / Formation au centre
// F = Jour férié
//
// Format : TYPE DATE_DEBUT DATE_FIN
// Les dates de fin sont incluses.

const planning = `
E 2026-08-17 2026-08-21
E 2026-08-24 2026-08-28
E 2026-08-31 2026-09-04
E 2026-09-07 2026-09-11
E 2026-09-14 2026-09-18
E 2026-09-21 2026-09-21
C 2026-09-22 2026-09-25
E 2026-09-28 2026-09-29
C 2026-09-30 2026-10-02

E 2026-10-05 2026-10-06
C 2026-10-07 2026-10-09
E 2026-10-12 2026-10-13
C 2026-10-14 2026-10-16
E 2026-10-19 2026-10-23
E 2026-10-26 2026-10-30

E 2026-11-02 2026-11-03
C 2026-11-04 2026-11-06
E 2026-11-09 2026-11-10
F 2026-11-11 2026-11-11
C 2026-11-12 2026-11-13
E 2026-11-16 2026-11-17
C 2026-11-18 2026-11-20
E 2026-11-23 2026-11-25
C 2026-11-26 2026-11-27
E 2026-11-30 2026-12-02

C 2026-12-03 2026-12-04
E 2026-12-07 2026-12-09
C 2026-12-10 2026-12-11
E 2026-12-14 2026-12-15
C 2026-12-16 2026-12-18
E 2026-12-21 2026-12-24
F 2026-12-25 2026-12-25
E 2026-12-28 2026-12-31

F 2027-01-01 2027-01-01
C 2027-01-04 2027-01-08
E 2027-01-11 2027-01-13
C 2027-01-14 2027-01-15
E 2027-01-18 2027-01-20
C 2027-01-21 2027-01-22
E 2027-01-25 2027-01-27
C 2027-01-28 2027-01-29

E 2027-02-01 2027-02-03
C 2027-02-04 2027-02-05
E 2027-02-08 2027-02-09
C 2027-02-10 2027-02-12
E 2027-02-15 2027-02-19
E 2027-02-22 2027-02-26

E 2027-03-01 2027-03-03
C 2027-03-04 2027-03-05
E 2027-03-08 2027-03-10
C 2027-03-11 2027-03-12
E 2027-03-15 2027-03-17
C 2027-03-18 2027-03-19
E 2027-03-22 2027-03-24
C 2027-03-25 2027-03-26
F 2027-03-29 2027-03-29
E 2027-03-30 2027-03-31

C 2027-04-01 2027-04-02
E 2027-04-05 2027-04-07
C 2027-04-08 2027-04-09
E 2027-04-12 2027-04-13
C 2027-04-14 2027-04-16
E 2027-04-19 2027-04-23
E 2027-04-26 2027-04-30

F 2027-05-01 2027-05-01
E 2027-05-03 2027-05-05
F 2027-05-06 2027-05-06
E 2027-05-07 2027-05-07
F 2027-05-08 2027-05-08
E 2027-05-10 2027-05-12
C 2027-05-13 2027-05-14
F 2027-05-17 2027-05-17
E 2027-05-18 2027-05-19
C 2027-05-20 2027-05-21
C 2027-05-24 2027-05-28
E 2027-05-31 2027-06-02

C 2027-06-03 2027-06-04
E 2027-06-07 2027-06-08
C 2027-06-09 2027-06-10
E 2027-06-11 2027-06-11
E 2027-06-14 2027-06-16
C 2027-06-17 2027-06-18
E 2027-06-21 2027-06-23
C 2027-06-24 2027-06-25
C 2027-06-28 2027-07-02

E 2027-07-05 2027-07-09
E 2027-07-12 2027-07-13
F 2027-07-14 2027-07-14
E 2027-07-15 2027-07-16
E 2027-07-19 2027-07-23
E 2027-07-26 2027-07-30
`;

const TYPES = {
  E: {
    type: "entreprise",
    description: "Entreprise"
  },
  C: {
    type: "cours",
    description: "Formation au centre"
  },
  F: {
    type: "ferie",
    description: "Jour férié"
  }
};

const periods = planning
  .trim()
  .split("\n")
  .map(line => line.trim())
  .filter(line => line.length > 0)
  .map(line => {
    const [code, debut, fin] = line.trim().split(/\s+/);

    if (!TYPES[code] || !debut || !fin || debut > fin) {
      throw new Error(`Ligne invalide : ${line}`);
    }

    return {
      ...TYPES[code],
      debut,
      fin
    };
  });

async function importPlanning() {
  const db = new Database(dbPath);

  try {
    // Sauvegarde SQLite avant toute modification
    const backupPath = path.join(
      __dirname,
      `agenda-backup-${Date.now()}.db`
    );

    await db.backup(backupPath);

    console.log(`Sauvegarde créée : ${backupPath}`);

    // Toutes les modifications sont effectuées ensemble.
    // En cas d'erreur, la transaction est annulée.

    const transaction = db.transaction(() => {
      // Remplace les périodes 4EADL, y compris l'ancien nom de groupe.
      db.prepare(`
        DELETE FROM events
        WHERE groupe IN ('4eadl', 'alternance')
      `).run();

      const insert = db.prepare(`
        INSERT INTO events
        (groupe, type, debut, fin, description)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const period of periods) {
        insert.run(
          "4eadl",
          period.type,
          period.debut,
          period.fin,
          period.description
        );
      }
    });

    transaction();

    console.log("Importation terminée !");
    console.log(`${periods.length} périodes importées.`);
    console.log("Groupe : 4EADL");
    console.log("Périodes école/entreprise également visibles pour 4ERIS.");

  } finally {
    db.close();
  }
}

importPlanning().catch(error => {
  console.error("Erreur d'importation :", error);
  process.exitCode = 1;
});
