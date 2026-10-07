// ── TÉLÉPHONE : bouton « + » flottant ───────────────────────────────────
// Sur petit écran, un bouton rond en bas à droite ouvre la saisie rapide : noter un trade en 10 secondes après sa
// clôture (actif récent en un toucher, résultat, P&L, photo de la capture).
onReady(() => {
  if (document.getElementById('fab-add')) return;
  const b = document.createElement('button');
  b.id = 'fab-add'; b.type = 'button'; b.className = 'fab-add';
  b.setAttribute('aria-label', LANG === 'en' ? 'Add a trade' : 'Ajouter un trade');
  b.textContent = '+';
  b.addEventListener('click', () => openQuickAdd());
  document.body.appendChild(b);
});
