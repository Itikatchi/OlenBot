# OlenBot

Démarrage : `npm start`.

Le bouton du calendrier permet de passer de **4EADL** à **4ERIS** et inversement.
Comme auparavant, les boutons ouvrent une vue privée ; le message public reste
sur 4EADL. Les journées, les cours détaillés et la navigation suivent le groupe
sélectionné.

Les périodes **école/entreprise sont communes à 4EADL et 4ERIS**. Une période de
type `cours` ou `entreprise` ajoutée pour l'un apparaît aussi pour l'autre ; sa
suppression s'applique donc aux deux vues. Les cours détaillés ICAL restent
propres à chaque groupe.

Les deux calendriers ICAL sont importés au démarrage et chaque jour à 20 h
(Europe/Paris), puis les calendriers publics déjà installés sont actualisés.
En cas d'échec d'une source, ses cours précédents sont conservés et l'autre
source est quand même synchronisée.

La commande **`/agenda-refresh`** force l'import des sources configurées puis
actualise les calendriers publics, sans redémarrer le bot. Elle est réservée au
rôle défini par `ADMIN_ROLE_ID` et répond en privé. Elle signale une
synchronisation déjà en cours ou un échec d'import/d'affichage.

Configuration dans `.env` (les URL personnelles restent dans ce fichier) :

```dotenv
ICAL_4EADL_URL="URL_ICAL_EADL"
ICAL_4EADL_CLASS_FILTER="4OLEN 26-27,4EADL Spé 26-27"
ICAL_4ERIS_URL="URL_ICAL_ERIS"
ICAL_4ERIS_CLASS_FILTER="4OLEN 26-27,4ERIS Spé 26-27"
```

Les anciens `ICAL_URL` et `ICAL_CLASS_FILTER` restent utilisables pour 4EADL si
leurs équivalents `ICAL_4EADL_*` ne sont pas définis. Chaque filtre accepte des
classes séparées par des virgules ; sans filtre, tous les cours de la source
sont importés.

La migration automatique rattache les cours et périodes de l'ancien calendrier
alternance à 4EADL. Les journées présentes dans chaque ICAL sont aussi signalées
dans la grille mensuelle. `import-planning.js` importe les périodes annuelles
pour 4EADL ; ses périodes école/entreprise apparaissent aussi dans la vue 4ERIS.
Les périodes peuvent être ajoutées avec `/agenda-ajouter`.

Le panneau affiche les cours d'aujourd'hui jusqu'à 18 h. Après 18 h, ou s'il n'y a
pas de cours aujourd'hui, il affiche la prochaine journée avec cours. Le message
public est actualisé aux heures pleines, notamment à 18 h et à minuit.

Tests : `npm test`.
