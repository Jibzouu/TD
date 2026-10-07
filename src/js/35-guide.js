// ── GUIDE D'UTILISATION ET RACCOURCIS (page « Guide » du menu, sous Paramètres) ──
// Source unique du mode d'emploi : chaque page du menu a sa section (test e2e : une page sans section fait échouer
// les tests). À METTRE À JOUR À CHAQUE NOUVELLE FONCTIONNALITÉ (voir CLAUDE.md).
// Textes bilingues : [français, anglais].

const GUIDE = [
  { id: 'start', icon: '🚀', title: ['Bien démarrer', 'Getting started'],
    intro: ['Le journal fonctionne entièrement dans ton navigateur : rien n’est envoyé sur un serveur.', 'The journal runs entirely in your browser: nothing is sent to a server.'],
    items: [
      ['Trois comptes séparés : Live (trades réels), Backtest (stratégies testées, avec le Backtest replay) et Prop Firm (challenge). Change de compte avec le menu en haut à gauche.', 'Three separate accounts: Live (real trades), Backtest (tested strategies, with Backtest replay) and Prop Firm (challenge). Switch with the menu at the top left.'],
      ['Tu débutes ? Garde coché « plan débutant » au premier lancement (ou applique-le depuis Gestion du risque) et choisis ton étape dans le parcours de progression : le journal t’arrêtera avant les erreurs classiques.', 'New to trading? Keep “beginner plan” ticked at first launch (or apply it from Risk management) and pick your step in the progression path: the journal will stop you before the classic mistakes.'],
      ['Ajouter un trade : bouton « Nouveau trade » (formulaire complet) ou touche N (saisie rapide : actif, résultat, P&L).', 'Add a trade: “New trade” button (full form) or the N key (quick entry: asset, result, P&L).'],
      ['Importer un historique : Export / Import → TradingView, MetaTrader 4/5 ou cTrader. Les doublons sont ignorés.', 'Import a history: Export / Import → TradingView, MetaTrader 4/5 or cTrader. Duplicates are skipped.'],
      ['Filtre global (en haut) : période, actif, session, setup et sens s’appliquent à toutes les pages d’analyse.', 'Global filter (top bar): period, asset, session, setup and direction apply to every analysis page.'],
      ['Recherche : / ou Ctrl/⌘ + K pour trouver une page, une action ou un trade.', 'Search: / or Ctrl/⌘ + K to find a page, an action or a trade.'],
      ['Sauvegarde : pense à exporter une sauvegarde régulièrement (Export / Import), surtout avant de changer de navigateur.', 'Backups: export a backup regularly (Export / Import), especially before switching browsers.']
    ] },
  { id: 'dashboard', page: 'dashboard', icon: '📊', title: ['Dashboard', 'Dashboard'],
    intro: ['Ta vue d’ensemble : solde du compte et performance globale en haut, puis où tu gagnes et comment tu trades.', 'Your overview: account balance and overall performance at the top, then where you win and how you trade.'],
    items: [
      ['Win rate = gagnants ÷ (gagnants + perdants) : les break-even ne comptent ni comme gains ni comme pertes. Il est vert au-dessus de ton seuil de rentabilité (calculé avec ton gain moyen et ta perte moyenne).', 'Win rate = wins ÷ (wins + losses): break-evens count as neither. It turns green above your break-even threshold (computed from your average win and loss).'],
      ['Garde-fou du jour (sous la performance) : feu vert / orange / rouge, ce qu’il te reste à perdre aujourd’hui, risque conseillé, marge au-dessus du plancher et discipline. Clique dessus pour la page Gestion du risque.', 'Daily guard (below performance): green / orange / red light, what you can still lose today, suggested risk, room above the floor and discipline. Click it for the Risk management page.'],
      ['Sous 100 trades, un rappel te dit qu’il est trop tôt pour juger ta stratégie : les chiffres d’un petit échantillon trompent.', 'Under 100 trades, a reminder tells you it is too early to judge your strategy: small-sample numbers are misleading.'],
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
      ['La frise montre où tu en es (« Toi ») et le risque à utiliser maintenant.', 'The timeline shows where you are (“You”) and the risk to use now.'],
      ['Ce risque sert de base au « risque conseillé » de la Gestion du risque, qui le plafonne selon ton étape et le réduit si ton compte baisse.', 'This risk is the base of the “suggested risk” in Risk management, which caps it by your step and reduces it if your account drops.']
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
  { id: 'risque', page: 'risque', icon: '🛡️', title: ['Gestion du risque', 'Risk management'],
    intro: ['Protège ton capital de départ et avance doucement : le journal t’arrête avant l’erreur.', 'Protect your starting capital and progress slowly: the journal stops you before the mistake.'],
    items: [
      ['Garde-fou du jour (aussi en haut du Dashboard et dans le formulaire de trade) : feu vert, orange ou rouge selon tes pertes du jour, de la semaine et du mois, tes pertes d’affilée, ton nombre de trades et la pause après une perte. Il te dit combien tu peux encore perdre aujourd’hui. Toutes ses limites (jour, semaine, mois, pertes d’affilée, trades, TP / SL max, pause) se règlent dans la page.', 'Daily guard (also at the top of the Dashboard and in the trade form): green, orange or red light based on your daily, weekly and monthly losses, losses in a row, number of trades and the break after a loss. It tells you how much you can still lose today. All its limits (day, week, month, losses in a row, trades, max TP / SL, break) are set on the page.'],
      ['Protection du capital : un plancher (ex. 90 % du capital de départ) à ne jamais franchir, et un risque qui baisse tout seul quand le compte baisse (÷ 2 à −5 %, ÷ 4 à −10 %, réglable).', 'Capital protection: a floor (e.g. 90 % of starting capital) never to cross, and a risk that drops by itself when the account drops (÷ 2 at −5 %, ÷ 4 at −10 %, adjustable).'],
      ['Risque conseillé : ton plan de Scaling, plafonné par ton étape du parcours et réduit si le compte baisse.', 'Suggested risk: your Scaling plan, capped by your progression step and reduced if the account drops.'],
      ['Parcours de progression : Backtest → Live 0,25 % → Live 0,5 % → 1 %. Chaque étape se débloque sur des critères (nombre de trades, discipline, espérance, profit factor, baisse max). Déjà expérimenté : choisis ton étape, ou « Personnalisé » : tes propres règles, sans plafond ni critères. Les règles débutant du garde-fou y sont désactivées (0 = désactivé) et tes réglages d’avant reviennent (perte max du jour, TP / SL max, checklist, risque du Scaling, même si tu avais appliqué le plan débutant). Tu peux y fixer un risque max par trade et réactiver ce que tu veux ; le parcours garde ses propres réglages pour y revenir.', 'Progression path: Backtest → Live 0.25 % → Live 0.5 % → 1 %. Each step unlocks on criteria (number of trades, discipline, expectancy, profit factor, max drawdown). Already experienced: pick your step, or “Custom”: your own rules, with no cap or criteria. The beginner guard rules are off there (0 = off) and your previous settings come back (daily max loss, max TP / SL, checklist, Scaling risk, even if you had applied the beginner plan). You can set a max risk per trade and turn back on what you want; the path keeps its own settings to return to.'],
      ['Discipline : un score par jour (stop prévu, checklist, erreurs, limites du jour, taille normale, pas de revanche) et ta série de jours « propres ». Les tailles anormales et trades de revanche sont signalés.', 'Discipline: a daily score (stop planned, checklist, mistakes, daily limits, normal size, no revenge) and your streak of “clean” days. Unusual sizes and revenge trades are flagged.'],
      ['Simulateur de risque de ruine : rejoue des milliers de suites de trades avec tes résultats pour voir combien risquer sans te mettre en danger.', 'Risk-of-ruin simulator: replays thousands of trade sequences with your results to see how much to risk without endangering your account.'],
      ['Plan de ton étape : la dernière partie de la page suit ton parcours. À chaque étape, ses règles en un clic (le plan débutant est aussi proposé au premier lancement) : risque ≤ plafond de l’étape, perte max du jour = 2 pertes d’affilée (au moins 1 %), stop après 2 pertes d’affilée. En « Personnalisé », pas de plan imposé : la partie devient « Mon plan personnalisé », le résumé de tes propres règles (avec une alerte si ton risque × tes pertes d’affilée dépasse ta perte max du jour). Le risque conseillé est toujours limité pour que tes pertes d’affilée permises tiennent dans ta perte max du jour (1 % ÷ 2 pertes = 0,5 %).', 'Plan for your step: the last part of the page follows your path. At each step, its rules in one click (the beginner plan is also offered at first launch): risk ≤ the step cap, daily max loss = 2 losses in a row (at least 1 %), stop after 2 losses in a row. In “Custom”, no imposed plan: the part becomes “My custom plan”, a summary of your own rules (with a warning if your risk × your losses in a row exceeds your daily max loss). The suggested risk is always limited so your allowed losses in a row fit within your daily max loss (1 % ÷ 2 losses = 0.5 %).']
    ] },
  { id: 'plan', page: 'plan', icon: '🧭', title: ['Plan de trading', 'Trading plan'],
    intro: ['Tes règles écrites, utilisées partout dans le journal.', 'Your written rules, used throughout the journal.'],
    items: [
      ['Checklist d’entrée (cochée dans chaque trade), filtres « ne pas trader si… », setups.', 'Entry checklist (ticked in each trade), “don’t trade if…” filters, setups.'],
      ['Limites du jour (nombre max de TP / SL) : reprises par le garde-fou du Dashboard quand tu les atteins ou les dépasses.', 'Daily limits (max number of TP / SL): picked up by the Dashboard guard when you reach or exceed them.'],
      ['Le lien « Garde-fou, plancher du capital et plan débutant » mène à la page Gestion du risque.', 'The “Guard, capital floor and beginner plan” link leads to the Risk management page.']
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
      ['Rapport mentor : un fichier à partager avec ton mentor sur la période choisie.', 'Mentor report: a file to share with your mentor for the chosen period.'],
      ['La sauvegarde inclut aussi tes réglages de Gestion du risque (garde-fou, étape du parcours, mode Personnalisé).', 'The backup also includes your Risk management settings (guard, path step, Custom mode).'],
      ['Sécurité : tout reste sur ton appareil. Un fichier importé est filtré (aucun code ne peut s’exécuter), le journal ne peut envoyer des données qu’aux sources de cours du Replay, et l’export CSV neutralise les formules Excel piégées. N’importe que tes propres fichiers et garde ta clé Twelve Data pour toi.', 'Security: everything stays on your device. An imported file is filtered (no code can run), the journal can only send data to the Replay price sources, and the CSV export neutralizes booby-trapped Excel formulas. Only import your own files and keep your Twelve Data key to yourself.']
    ] },
  { id: 'parametres', page: 'parametres', icon: '⚙️', title: ['Paramètres', 'Settings'],
    intro: ['Ton compte et l’apparence du journal.', 'Your account and the journal’s look.'],
    items: [
      ['Langue, comptes, solde de départ, perte journalière max, disposition du Dashboard.', 'Language, accounts, starting balance, daily max loss, Dashboard layout.'],
      ['Thèmes (dont Néon) et « Personnaliser mon thème » : couleurs, ambiance, formes et polices, graphiques, mes thèmes.', 'Themes (including Neon) and “Customize my theme”: colors, mood, shapes and fonts, charts, my themes.']
    ] },
  { id: 'guide', page: 'guide', icon: '📖', title: ['Guide', 'Guide'],
    intro: ['Cette page : le mode d’emploi du journal et tous les raccourcis clavier.', 'This page: the journal’s user manual and every keyboard shortcut.'],
    items: [
      ['Cherche un mot dans le guide, ou clique une section pour la déplier ; « Ouvrir la page » t’y emmène.', 'Search for a word in the guide, or click a section to expand it; “Open the page” takes you there.'],
      ['Les raccourcis clavier sont en bas de la page ; la touche ? affiche un aide-mémoire partout.', 'Keyboard shortcuts are at the bottom of the page; the ? key shows a cheat sheet anywhere.']
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
        ${s.page && s.page !== 'guide' ? (guideAvailable(s)
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
function guideJump(id) { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function openGuide(sectionId) {
  showPage('guide', document.querySelector('.nav-item[data-page="guide"]'));
  if (sectionId) { const d = document.getElementById('gd-' + sectionId); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
}
function openShortcutsPage() { closeShortcutsHelp(); showPage('guide', document.querySelector('.nav-item[data-page="guide"]')); setTimeout(() => guideJump('gd-keys-sec'), 30); }
