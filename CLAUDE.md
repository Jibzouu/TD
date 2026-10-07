# Journal de trading — notes pour les contributeurs (et Claude)

- Application en un seul fichier : `node build.mjs` assemble `src/` dans `dist/journal.html`, copié dans `journal-complet.html`.
- Tests : `npm test` (unitaires + e2e Playwright). Tout doit passer avant de pousser.
- Langue : interface en français ; l'anglais passe par `tools/i18n/en.json` (vérifier avec `node tools/i18n-extract.mjs --check en`).

## Règle : guide et raccourcis à jour

**À chaque fonctionnalité ajoutée ou modifiée**, mettre à jour `src/js/35-guide.js` (page « Guide » du menu, sous Paramètres : mode d'emploi + raccourcis clavier) :
- `GUIDE` : la section de la page concernée (texte en français et en anglais). Toute nouvelle page du menu doit avoir sa section (un test e2e le vérifie).
- `SHORTCUTS` (dans `23-shortcuts-a11y.js`) ou `shortcutGroups()` : tout nouveau raccourci clavier.
  Les raccourcis des outils de dessin du replay sont lus automatiquement dans `RPD_TOOLS`.
