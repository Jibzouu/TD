# Architecture des données — prête pour une version en ligne

Le journal fonctionne aujourd'hui sans serveur. Tout est déjà organisé pour brancher plus tard des comptes et une synchronisation dans le cloud **sans réécrire le journal**.

## Les 4 couches

1. **Stockage local** — `src/boot/db.js`
   - Clé → valeur, chargé en mémoire au démarrage, écrit dans IndexedDB en arrière-plan.
   - Chiffrement optionnel (code de verrouillage) avec `src/boot/crypto.js` : AES-GCM, clé PBKDF2.
2. **Trades** — `TradeStore` dans `src/js/00c-store.js`
   - Seul point d'écriture des trades : ajout, modification, suppression, import, fusion.
   - Chaque trade a un identifiant universel (`uid`), une date de création et de modification (`createdAt`, `updatedAt`).
   - Une suppression laisse une trace (`tombstones`) pour qu'elle se propage à l'autre appareil.
3. **Réglages datés** — `settingsSnapshot()` / `mergeSettingsMeta()` dans `src/js/00c-store.js` et `src/js/14-export-backup.js`
   - Chaque réglage synchronisé (`SYNCED_SETTINGS`) garde sa date de modification ; le plus récent gagne.
4. **Synchronisation** — `Sync` dans `src/js/45-sync.js`
   - `Sync.snapshot()` : l'état complet du compte ouvert.
   - `Sync.apply(état)` : fusionne un état venu d'ailleurs.
   - `Sync.sync(adaptateur)` : aller-retour complet (charger → fusionner → renvoyer).

## Brancher un serveur : écrire un adaptateur

Un adaptateur n'a que deux méthodes asynchrones :

```js
const supabaseAdapter = {
  async load(journalId) { /* lire le dernier état enregistré pour cet utilisateur et ce compte, ou null */ },
  async save(journalId, snapshot) { /* enregistrer l'état fusionné */ }
};
await Sync.sync(supabaseAdapter);
```

`memorySyncAdapter()` (même fichier) est l'exemple de référence, utilisé par les tests.

### Exemple avec Supabase (à faire le jour de la version en ligne)

- Table `snapshots` : `user_id`, `journal_id`, `data` (jsonb), `updated_at`, avec une règle d'accès « chaque utilisateur ne voit que ses lignes » (Row Level Security).
- `load` : `select data from snapshots where user_id = auth.uid() and journal_id = $1`.
- `save` : `upsert` de la ligne.
- Déclencher `Sync.sync()` à l'ouverture du journal, après chaque modification (avec un délai de quelques secondes) et à la fermeture.
- Plus tard, pour de gros journaux : une ligne par trade (`uid` comme clé) au lieu d'un état complet ; la fusion reste la même (le plus récent gagne, traces de suppression).

### Captures d'écran

Elles sont rangées à part (`ImageStore`, identifiants `i…`) et référencées par les trades. Pour le cloud : les envoyer dans un stockage de fichiers (Supabase Storage) et ne synchroniser que leurs identifiants.

### Code de verrouillage et cloud

Pour que le serveur ne puisse jamais lire les journaux, l'état peut être chiffré avant `save` avec la même méthode que les sauvegardes protégées (`JTC.sealText`). C'est un argument de vente : « même nous ne pouvons pas lire ton journal ».
