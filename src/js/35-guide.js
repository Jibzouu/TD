// ── GUIDE D'UTILISATION ET RACCOURCIS (Paramètres → Guide / Raccourcis) ──
// Source unique du mode d'emploi : chaque page du menu a sa section (test e2e : une page sans section fait échouer
// les tests). À METTRE À JOUR À CHAQUE NOUVELLE FONCTIONNALITÉ (voir CLAUDE.md).
// Textes bilingues : [français, anglais].

const GUIDE = [
  { id: 'start', icon: '🚀', title: ['Bien démarrer', 'Getting started'],
    intro: ['Le journal fonctionne entièrement dans ton navigateur : rien n’est envoyé sur un serveur.', 'The journal runs entirely in your browser: nothing is sent to a server.'],
    items: [
      ['Trois comptes séparés : Live (trades réels), Backtest (stratégies testées, avec le Backtest replay) et Prop Firm (challenge). Change de compte avec le menu en haut à gauche.', 'Three separate accounts: Live (real trades), Backtest (tested strategies, with Backtest replay) and Prop Firm (challenge). Switch with the menu at the top left.'],
      ['Ajouter un trade : bouton « Nouveau trade » (formulaire complet) ou touche N (saisie rapide : actif, résultat, P&L).', 'Add a trade: “New trade” button (full form) or the N key (quick entry: asset, result, P&L).'],
      ['Importer un historique : Export / Import → TradingView, MetaTrader 4/5 ou cTrader. Les doublons sont ignorés.', 'Import a history: Export / Import → TradingView, MetaTrader 4/5 or cTrader. Duplicates are skipped.'],
      ['Filtre global (en haut) : période, actif, session, setup et sens s’appliquent à toutes les pages d’analyse.', 'Global filter (top bar): period, asset, session, setup and direction apply to every analysis page.'],
      ['Recherche : / ou Ctrl/⌘ + K pour trouver une page, une action ou un trade.', 'Search: / or Ctrl/⌘ + K to find a page, an action or a trade.'],
      ['Sauvegarde : pense à exporter une sauvegarde régulièrement (Export / Import), surtout avant de changer de navigateur.', 'Backups: export a backup regularly (Export / Import), especially before switching browsers.']
    ] },
  { id: 'dashboard', page: 'dashboard', icon: '📊', title: ['Dashboard', 'Dashboard'],
    intro: ['Ta vue d’ensemble : performance globale en haut, puis où tu gagnes et comment tu trades.', 'Your overview: overall performance at the top, then where you win and how you trade.'],
    items: [
      ['Win rate = gagnants ÷ (gagnants + perdants) : les break-even ne comptent ni comme gains ni comme pertes. Il est vert au-dessus de ton seuil de rentabilité (calculé avec ton gain moyen et ta perte moyenne).', 'Win rate = wins ÷ (wins + losses): break-evens count as neither. It turns green above your break-even threshold (computed from your average win and loss).'],
      ['Routine du jour : préparer la séance → noter ses trades → faire le bilan ; les étapes se cochent toutes seules.', 'Daily routine: prepare the session → log trades → review; steps tick themselves.'],
      ['Clique sur le titre d’une section pour la replier. Glisse la poignée ⠿ d’un bloc pour réorganiser (Paramètres → réinitialiser la disposition).', 'Click a section title to collapse it. Drag a block’s ⠿ handle to rearrange (Settings → reset layout).'],
      ['Donuts : part de trades, journées et semaines gagnants — les neutres et break-even sont exclus.', 'Donuts: share of winning trades, days and weeks — flat ones and break-evens are excluded.']
    ] },
  { id: 'trades', page: 'trades', icon: '📒', title: ['Journal des trades', 'Trade journal'],
    intro: ['Tous tes trades, groupés par jour par défaut (bouton « Grouper par jour » pour changer, choix gardé).', 'All your trades, grouped by day by default (“Group by day” button to change, remembered).'],
    items: [
      ['Chaque jour affiche ses trades, TP / SL / BE et son résultat en R et en €.', 'Each day shows its trades, TP / SL / BE and its result in R and €.'],
      ['Filtres : recherche, résultat, actif, session, dates. Clique un en-tête de colonne pour trier.', 'Filters: search, result, asset, session, dates. Click a column header to sort.'],
      ['Clique une ligne pour ouvrir la fiche : captures (annotables), notes, tags, erreurs, checklist, MAE / MFE. ← / → passe au trade précédent / suivant, E pour modifier.', 'Click a row to open the trade sheet: screenshots (annotatable), notes, tags, mistakes, checklist, MAE / MFE. ← / → for previous / next, E to edit.'],
      ['Le R est calculé depuis les prix (entrée, stop, sortie) quand ils sont renseignés ; sinon depuis ton P&L et ton risque.', 'R is computed from prices (entry, stop, exit) when available; otherwise from your P&L and risk.']
    ] },
  { id: 'calendrier', page: 'calendrier', icon: '📅', title: ['Calendrier', 'Calendar'],
    intro: ['Chaque jour coloré selon son résultat net (vert, rouge, orange pour un break-even).', 'Each day colored by its net result (green, red, orange for break-even).'],
    items: [
      ['Dans chaque case : résultat en € et en R, puis gagnants ✓, perdants ✗, break-even (BE) et win rate.', 'In each cell: result in € and R, then wins ✓, losses ✗, break-evens (BE) and win rate.'],
      ['🏆 meilleur jour, ⚠️ jour le plus coûteux, 🔥 / ❄️ séries de gains ou de pertes.', '🏆 best day, ⚠️ costliest day, 🔥 / ❄️ winning or losing streaks.'],
      ['Totaux par semaine (colonne de droite) et tableaux par semaine / par mois ; vue annuelle avec le bouton 📅.', 'Weekly totals (right column) and week / month tables; yearly view with the 📅 button.'],
      ['Clique un jour pour ouvrir son bilan.', 'Click a day to open its review.']
    ] },
  { id: 'bilan', page: 'bilan', icon: '🗓️', title: ['Bilan journalier', 'Daily review'],
    intro: ['La page de ta séance : préparation avant, bilan après.', 'Your session page: preparation before, review after.'],
    items: [
      ['Avant la séance : biais, plan, point de vigilance, humeur.', 'Before the session: bias, plan, point of attention, mood.'],
      ['Chiffres du jour : trades, TP, SL, BE, win rate, P&L en € et en R, humeur moyenne, et la liste des trades.', 'Day figures: trades, TP, SL, BE, win rate, P&L in € and R, average mood, and the trade list.'],
      ['Après la séance : ce qui s’est passé, la leçon, la discipline.', 'After the session: what happened, the lesson, discipline.'],
      ['Meilleures heures, sessions et jours de la semaine (avec le nombre de BE).', 'Best hours, sessions and weekdays (with the number of BE).']
    ] },
  { id: 'stats', page: 'stats', icon: '📈', title: ['Statistiques', 'Statistics'],
    intro: ['L’analyse détaillée, en onglets.', 'Detailed analysis, in tabs.'],
    items: [
      ['Détecteur d’edge : tes segments les plus et les moins rentables (actif, session, setup, sens…).', 'Edge finder: your most and least profitable segments (asset, session, setup, direction…).'],
      ['Checklist : ce que rapporte le fait de la respecter en entier.', 'Checklist: what following it fully is worth.'],
      ['MAE / MFE : jusqu’où tes trades vont contre toi et en ta faveur.', 'MAE / MFE: how far your trades go against you and in your favor.'],
      ['Tilt meter et coût réel des erreurs.', 'Tilt meter and the real cost of mistakes.'],
      ['Tableaux par actif et par unité de temps (TP, SL, BE, win rate, R).', 'Tables by asset and timeframe (TP, SL, BE, win rate, R).']
    ] },
  { id: 'revue', page: 'revue', icon: '🗒️', title: ['Revue hebdo', 'Weekly review'],
    intro: ['Une revue guidée de ta semaine, à faire le week-end.', 'A guided review of your week, for the weekend.'],
    items: [
      ['Meilleurs et pires trades, erreurs de la semaine, setups, comparaison avec la semaine précédente.', 'Best and worst trades, mistakes of the week, setups, comparison with the previous week.'],
      ['Réponds aux questions et fixe ton objectif pour la semaine suivante ; export PDF possible.', 'Answer the questions and set next week’s goal; PDF export available.']
    ] },
  { id: 'scaling', page: 'scaling', icon: '🪜', title: ['Scaling Account', 'Scaling account'],
    intro: ['Fais grandir ton risque par paliers, en gardant un coussin de sécurité.', 'Grow your risk in steps while keeping a safety cushion.'],
    items: [
      ['Réglages de base : capital de départ, risque par trade, pas des paliers, objectif.', 'Basic settings: starting capital, risk per trade, step size, goal.'],
      ['Coussin : le nombre de pertes que tu peux encaisser au premier palier — réglable à la main.', 'Cushion: how many losses you can absorb at the first step — set it manually.'],
      ['La frise montre où tu en es (« Toi ») et le risque à utiliser maintenant.', 'The timeline shows where you are (“You”) and the risk to use now.']
    ] },
  { id: 'propfirm', page: 'propfirm', icon: '🏁', title: ['Prop Firm', 'Prop firm'],
    intro: ['Compte Prop Firm uniquement : suis les règles de ton challenge.', 'Prop Firm account only: track your challenge rules.'],
    items: [
      ['Objectif de profit, perte maximale journalière et totale, jours minimum : avancement et marge restante.', 'Profit target, daily and total max loss, minimum days: progress and remaining margin.']
    ] },
  { id: 'replay', page: 'replay', icon: '⏯️', title: ['Backtest replay', 'Backtest replay'],
    intro: ['Compte Backtest uniquement : rejoue le marché bougie par bougie, sans voir le futur, et trade comme en réel. Chaque trade fermé part dans ton journal avec une capture.', 'Backtest account only: replay the market bar by bar, without seeing the future, and trade as if live. Every closed trade goes to your journal with a screenshot.'],
    items: [
      ['Données : crypto en direct (Binance, sans compte), forex et or via Twelve Data (clé gratuite à coller une fois) ou ton propre fichier de bougies (TradingView, MetaTrader, HistData, Dukascopy).', 'Data: live crypto (Binance, no account), forex and gold via Twelve Data (free key pasted once) or your own candle file (TradingView, MetaTrader, HistData, Dukascopy).'],
      ['Choisis la date de départ dans le calendrier (raccourcis « il y a 1 semaine / 1 mois… »), le solde et les frais.', 'Pick the start date in the calendar (“1 week / 1 month ago” shortcuts), the balance and fees.'],
      ['Lecture : ▶ / Espace, bougie suivante →, +10 bougies Maj + →, vitesse réglable, unités de temps en boutons.', 'Playback: ▶ / Space, next bar →, +10 bars Shift + →, adjustable speed, timeframe buttons.'],
      ['Panneau d’ordre : Vente / Achat, Marché / Limite / Stop, stop loss et take profit (prix, écart, %, RR), risque en % ou en $ : la quantité se calcule toute seule (lots et pips en forex).', 'Order panel: Sell / Buy, Market / Limit / Stop, stop loss and take profit (price, distance, %, RR), risk in % or $: the quantity is computed for you (lots and pips for forex).'],
      ['Sur le graphique : boutons VENTE / ACHAT au marché, bouton « + » ou clic droit pour un ordre limite / stop au prix voulu.', 'On the chart: SELL / BUY market buttons, “+” button or right-click for a limit / stop order at the price you want.'],
      ['Lignes d’ordres : glisse une étiquette TP / SL / ordre pour la déplacer, × pour fermer ou annuler, « +TP » pour ajouter un objectif à 2R.', 'Order lines: drag a TP / SL / order label to move it, × to close or cancel, “+TP” to add a 2R target.'],
      ['Outils de dessin (barre de gauche) : tendance, rayons, horizontales, verticale, canal, rectangle, Fibonacci, flèche, texte, pinceau, mesure, positions longue / courte. Aimant, masquer, annuler, modèles de style (« Modèle ▾ »).', 'Drawing tools (left bar): trend, rays, horizontal, vertical, channel, rectangle, Fibonacci, arrow, text, brush, measure, long / short positions. Magnet, hide, undo, style templates (“Template ▾”).'],
      ['Position longue / courte : place la boîte, ajuste cible, stop et largeur, puis « ▶ Passer cet ordre ». Elle affiche le résultat simulé.', 'Long / short position: place the box, adjust target, stop and width, then “▶ Place this order”. It shows the simulated outcome.'],
      ['Indicateurs (20) : sur le graphique (moyennes, Bollinger, Keltner, Donchian, VWAP, Ichimoku, SAR, SuperTrend, volume) ou en panneau dessous (RSI, MACD, Stochastique, ATR, CCI, %R, MFI, OBV, DMI, Momentum). Survole leur nom dans la légende : 👁 masquer, ⚙ réglages, × retirer.', 'Indicators (20): on the chart (moving averages, Bollinger, Keltner, Donchian, VWAP, Ichimoku, SAR, SuperTrend, volume) or in a pane below (RSI, MACD, Stochastic, ATR, CCI, %R, MFI, OBV, DMI, Momentum). Hover their name in the legend: 👁 hide, ⚙ settings, × remove.'],
      ['En-tête : type de graphique, disposition à 2 graphiques (unité supérieure), couleurs du graphique (⚙), panneau d’ordre masquable, plein écran (Échap pour sortir).', 'Header: chart type, two-chart layout (higher timeframe), chart colors (⚙), hideable order panel, full screen (Esc to exit).'],
      ['« Terminer » clôt la séance ; une séance en cours se reprend plus tard avec « Reprendre ».', '“End” closes the session; an ongoing session can be resumed later with “Resume”.']
    ] },
  { id: 'plan', page: 'plan', icon: '🧭', title: ['Plan de trading', 'Trading plan'],
    intro: ['Tes règles écrites, utilisées partout dans le journal.', 'Your written rules, used throughout the journal.'],
    items: [
      ['Checklist d’entrée (cochée dans chaque trade), filtres « ne pas trader si… », setups.', 'Entry checklist (ticked in each trade), “don’t trade if…” filters, setups.'],
      ['Limites du jour (nombre max de TP / SL) : alertes quand tu les atteins ou les dépasses.', 'Daily limits (max number of TP / SL): alerts when you reach or exceed them.']
    ] },
  { id: 'playbooks', page: 'playbooks', icon: '📘', title: ['Playbooks', 'Playbooks'],
    intro: ['Une fiche par setup : règles, exemples, statistiques réelles.', 'One sheet per setup: rules, examples, real statistics.'],
    items: [
      ['Win rate, espérance en R, résultat net et courbe de chaque setup, calculés sur tes trades.', 'Win rate, R expectancy, net result and curve of each setup, computed from your trades.']
    ] },
  { id: 'watchlist', page: 'watchlist', icon: '👀', title: ['Watchlist', 'Watchlist'],
    intro: ['Les actifs que tu surveilles, avec tes notes et tes statistiques par actif.', 'The assets you watch, with your notes and per-asset statistics.'],
    items: [] },
  { id: 'export', page: 'export', icon: '💾', title: ['Export / Import', 'Export / Import'],
    intro: ['Tes données t’appartiennent.', 'Your data belongs to you.'],
    items: [
      ['Sauvegarde complète (fichier) et restauration ; synchronisation entre appareils par fichier (fusion sans doublons).', 'Full backup (file) and restore; sync between devices by file (merge without duplicates).'],
      ['Export CSV de tes trades ; import TradingView, MetaTrader 4/5, cTrader.', 'CSV export of your trades; TradingView, MetaTrader 4/5, cTrader import.'],
      ['Rapport mentor : un fichier à partager avec ton mentor sur la période choisie.', 'Mentor report: a file to share with your mentor for the chosen period.']
    ] },
  { id: 'parametres', page: 'parametres', icon: '⚙️', title: ['Paramètres', 'Settings'],
    intro: ['Ton compte et l’apparence du journal.', 'Your account and the journal’s look.'],
    items: [
      ['Langue, comptes, solde de départ, perte journalière max, disposition du Dashboard.', 'Language, accounts, starting balance, daily max loss, Dashboard layout.'],
      ['Thèmes (dont Néon) et « Personnaliser mon thème » : couleurs, ambiance, formes et polices, graphiques, mes thèmes.', 'Themes (including Neon) and “Customize my theme”: colors, mood, shapes and fonts, charts, my themes.'],
      ['Ce guide et la liste des raccourcis clavier (onglets en haut de cette page).', 'This guide and the keyboard shortcut list (tabs at the top of this page).']
    ] }
];

// Raccourcis par contexte. Les outils de dessin du replay sont lus directement dans RPD_TOOLS (jamais désynchronisés).
function shortcutGroups() {
  const L = (fr, en) => LANG === 'en' ? en : fr;
  const drawing = (typeof RPD_TOOLS !== 'undefined' ? RPD_TOOLS.filter(t => t.key) : []).map(t => ['Alt + ' + t.key, tr(t.label)]);
  return [
    { title: L('Partout', 'Everywhere'), rows: SHORTCUTS.map(([k, d]) => [k, tr(d)]) },
    { title: L('Fiche trade et visionneuse', 'Trade sheet and viewer'), rows: [['← / →', L('Trade précédent / suivant · capture précédente / suivante', 'Previous / next trade · previous / next screenshot')], ['E', L('Modifier le trade ouvert', 'Edit the open trade')], [L('Échap', 'Esc'), L('Fermer', 'Close')]] },
    { title: L('Recherche et saisie rapide', 'Search and quick entry'), rows: [['↑ / ↓', L('Choisir un résultat', 'Choose a result')], [L('Entrée', 'Enter'), L('Ouvrir le résultat · enregistrer la saisie rapide', 'Open the result · save the quick entry')]] },
    { title: L('Backtest replay', 'Backtest replay'), rows: [[L('Espace', 'Space'), L('Lecture / pause', 'Play / pause')], ['→', L('Bougie suivante', 'Next bar')], [L('Maj + →', 'Shift + →'), L('10 bougies', '10 bars')], [L('Échap', 'Esc'), L('Quitter le plein écran · fermer une fenêtre', 'Exit full screen · close a window')]] },
    { title: L('Replay : dessin', 'Replay: drawing'), rows: drawing.concat([[L('Suppr', 'Del'), L('Supprimer le dessin sélectionné', 'Delete the selected drawing')], ['Ctrl/⌘ + Z', L('Annuler', 'Undo')], [L('Échap', 'Esc'), L('Revenir au curseur, désélectionner', 'Back to cursor, deselect')], [L('Double-clic', 'Double-click'), L('Modifier un texte', 'Edit a text')]]) }
  ];
}

// ── Rendu ──
function guideText(pair) { return LANG === 'en' ? pair[1] : pair[0]; }
function guideAvailable(s) { return !s.page || !!document.querySelector('.nav-item[data-page="' + s.page + '"]'); }
function renderGuide() {
  const el = document.getElementById('guide-list'); if (!el) return;
  const q = String((document.getElementById('guide-q') || {}).value || '').toLowerCase().trim();
  const L = (fr, en) => LANG === 'en' ? en : fr;
  const secs = GUIDE.filter(s => !q || [s.title, s.intro].concat(s.items).some(p => guideText(p).toLowerCase().includes(q)));
  mount(el, secs.length ? html`${secs.map(s => html`<details class="gd-sec" id="${'gd-' + s.id}" ${raw(q ? 'open' : '')}>
      <summary><span class="gd-ic" aria-hidden="true">${s.icon}</span><span class="gd-tt">${guideText(s.title)}<small>${guideText(s.intro)}</small></span><span class="cz-chev" aria-hidden="true"></span></summary>
      <div class="gd-body">
        ${s.items.length ? html`<ul>${s.items.map(it => html`<li>${guideText(it)}</li>`)}</ul>` : ''}
        ${s.page && s.page !== 'parametres' ? (guideAvailable(s)
          ? html`<button class="btn-ghost gd-go" onclick="${raw("showPage('" + s.page + "', document.querySelector('.nav-item[data-page=" + s.page + "]'))")}">${L('Ouvrir la page', 'Open the page')} →</button>`
          : html`<p class="gd-na">${L('Disponible sur un autre type de compte.', 'Available on another account type.')}</p>`) : ''}
      </div></details>`)}`
    : html`<p class="empty-note">${L('Aucun résultat dans le guide.', 'Nothing found in the guide.')}</p>`);
}
function renderShortcutsPage() {
  const el = document.getElementById('keys-list'); if (!el) return;
  mount(el, html`${shortcutGroups().map(g => html`<div class="panel gd-keys"><div class="panel-hdr"><span>${g.title}</span></div>
    <div class="sh-grid">${g.rows.map(([k, d]) => html`<kbd>${k}</kbd><span>${d}</span>`)}</div></div>`)}`);
}
// Onglets de la page Paramètres : Réglages / Guide d'utilisation / Raccourcis (dernier onglet gardé).
function showSettingsTab(id) {
  id = ['settings', 'guide', 'keys'].includes(id) ? id : 'settings';
  document.querySelectorAll('#page-parametres .set-tab').forEach(b => { const on = b.dataset.set === id; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
  document.querySelectorAll('#page-parametres .set-pane').forEach(p => { p.hidden = p.dataset.set !== id; });
  try { DB.setItem('g_set_tab', id); } catch (e) {}
  if (id === 'guide') renderGuide();
  if (id === 'keys') renderShortcutsPage();
}
function openGuide(sectionId) {
  showPage('parametres', document.querySelector('.nav-item[data-page="parametres"]'));
  showSettingsTab('guide');
  if (sectionId) { const d = document.getElementById('gd-' + sectionId); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
}
function openShortcutsPage() { closeShortcutsHelp(); showPage('parametres', document.querySelector('.nav-item[data-page="parametres"]')); showSettingsTab('keys'); }
onReady(() => showSettingsTab(DB.getItem('g_set_tab') || 'settings'));
