// ── SYNCHRONISATION : un seul point d'entrée ───────────────────────────
// Tout échange de données avec l'extérieur passe par Sync :
//   Sync.snapshot()  → l'état complet du compte ouvert (trades + captures + suppressions + réglages datés), le même
//                      objet que le backup ;
//   Sync.apply(snap) → fusionne un état venu d'ailleurs : pour chaque trade et chaque réglage, la version modifiée le
//                      plus récemment gagne ; une suppression d'un côté s'applique de l'autre (traces de suppression).
// Un « adaptateur » sait seulement lire et écrire un état quelque part : fichier aujourd'hui, mémoire pour les tests,
// serveur (Supabase, Firebase…) demain — sans toucher au reste du journal. Voir docs/architecture-sync.md.
const Sync = {
  snapshot() { return backupData(); },
  apply(data) {
    if (!data || !isValidTradesArray(data.trades)) return null;
    const imgs = data.images && typeof data.images === 'object' && !Array.isArray(data.images) ? data.images : null;
    const st = TradeStore.merge(data.trades, imgs, data.tombstones);
    if (!st) return null;
    const ns = mergeSettingsMeta(data.settingsMeta);
    if (ns) {
      watchData = loadJSON(JP + 'watch', watchData);
      planData = loadJSON(JP + 'plan', planData);
      restorePlaybookImages(imgs);
      applyRestoredSettings();
    } else renderAll();
    DB.setItem(JP + 'last_sync', Date.now());
    return Object.assign({}, st, { settings: ns });
  },
  // Aller-retour complet avec un adaptateur : on récupère l'état distant, on le fusionne ici, puis on renvoie l'état
  // fusionné (les deux côtés sont alors identiques).
  async sync(adapter) {
    const remote = await adapter.load(JOURNAL_ID);
    const res = remote ? this.apply(remote) : { added: 0, updated: 0, deleted: 0, settings: 0 };
    await adapter.save(JOURNAL_ID, this.snapshot());
    return res;
  }
};
// Adaptateur en mémoire : sert aux tests et d'exemple pour écrire celui du serveur (mêmes deux méthodes, asynchrones).
function memorySyncAdapter(store) {
  store = store || {};
  return {
    store,
    async load(journalId) { return store[journalId] ? JSON.parse(store[journalId]) : null; },
    async save(journalId, snap) { store[journalId] = JSON.stringify(snap); }
  };
}
