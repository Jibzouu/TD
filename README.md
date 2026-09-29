# Journal de trading

Journal de trading personnel, 100 % local : trades, statistiques, calendrier, prop firm, scaling, revue hebdomadaire.
Les données restent sur l'appareil (IndexedDB) ; rien n'est envoyé nulle part.

## Utilisation

- **Le plus simple** : ouvrir `journal-complet.html` (double-clic). Un seul fichier, fonctionne hors ligne
  (Chart.js et les polices sont intégrés).
- **En application installable** : servir le dossier `dist/` en http(s) (n'importe quel hébergement statique, ou
  `npx serve dist` en local) puis « Installer l'application » depuis le navigateur. Le service worker garde la page
  en cache : elle s'ouvre ensuite sans connexion.

Raccourcis : `N` saisie rapide · `/` ou `Ctrl+K` recherche · `1…9` pages · `F` filtre global · `←/→` trade ou
capture précédent/suivant · `E` modifier le trade ouvert · `?` aide.

## Développement

```bash
npm install
npm run build      # src/ → dist/journal.html (+ copie journal-complet.html)
npm test           # tests unitaires + build + tests de bout en bout (Playwright/Chromium)
```

Le fichier livré est **généré** : on modifie `src/`, jamais `journal-complet.html` directement.

```
src/
  index.html          gabarit (emplacements <!-- @vendor --> <!-- @styles --> <!-- @body --> …)
  styles/*.css        charte, thèmes, composants — concaténés dans l'ordre des préfixes
  partials/*.html     structure des pages
  boot/*.js           stockage (IndexedDB + migration localStorage), démarrage, PWA
  js/*.js             application, un module par domaine :
    00-core             état, constantes, nettoyage des trades
    00a-calc            calculs purs (win rate, R, CSV, drawdown, Monte-Carlo) — testés unitairement
    00b-ui              composants : html`` échappé, UI.stat / card / tile / table / empty…
    03b-state           filtre global, rendu ciblé par page
    06-charts-kit       réglages communs des graphiques
    11b-analyses        Monte-Carlo, MAE/MFE, R réalisé vs visé, équité par setup
    23-shortcuts-a11y   raccourcis, saisie rapide, focus des fenêtres
    24-weekly-review    revue hebdomadaire + export PDF
    …
  pwa/                manifeste, service worker, icône
tests/
  unit/               node:test sur les calculs purs
  e2e/                Playwright : parcours complets dans un vrai navigateur
```

La CI GitHub (`.github/workflows/ci.yml`) lance les tests à chaque push et vérifie que `journal-complet.html`
correspond bien aux sources.
