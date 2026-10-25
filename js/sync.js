// Synchronisatie tussen apparaten. Bron, in volgorde van voorkeur:
//   1. het ingelogde account (Supabase)           -> account.js
//   2. een privé GitHub Gist met een eigen token   -> hieronder
// Beide werken met dezelfde samenvoeg-logica (per vraag wint de nieuwste poging).

import { exportData, mergeRemote, onChange } from './store.js';
import * as account from './account.js';

const SK = 'flic.sync';
const FILE = 'f-licentie-voortgang.json';
const DESC = 'F-licentie oefenapp – voortgang (niet verwijderen)';
const API = 'https://api.github.com';

const listeners = new Set();
let timer = null, busy = false, dirty = false;

export const getCfg = () => { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch { return {}; } };
const setCfg = c => localStorage.setItem(SK, JSON.stringify(c));
export const isConnected = () => !!getCfg().token;          // Gist gekoppeld?
export const onSyncStatus = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = s => listeners.forEach(fn => fn(s));

// ---------------------------------------------------------------- Gist-provider
async function gh(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + getCfg().token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401) throw Object.assign(new Error('Token ongeldig of verlopen.'), { code: 401 });
  if (res.status === 404) throw Object.assign(new Error('Niet gevonden.'), { code: 404 });
  if (!res.ok) throw new Error('GitHub antwoordde met status ' + res.status);
  return res.json();
}

async function readGistFile(gist) {
  const f = gist.files && gist.files[FILE];
  if (!f) return null;
  if (f.truncated && f.raw_url) return JSON.parse(await (await fetch(f.raw_url)).text());
  return JSON.parse(f.content);
}

async function findGist() {
  for (let page = 1; page <= 5; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`);
    const hit = list.find(g => g.files && g.files[FILE]);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  return null;
}

const gistProvider = {
  async pull() {
    const cfg = getCfg();
    if (!cfg.gistId) { cfg.gistId = await findGist(); setCfg(cfg); }
    if (!cfg.gistId) return null;
    try { return await readGistFile(await gh('/gists/' + cfg.gistId)); }
    catch (e) { if (e.code === 404) { cfg.gistId = null; setCfg(cfg); return null; } throw e; }
  },
  async push(data) {
    const cfg = getCfg();
    const files = { [FILE]: { content: JSON.stringify(data) } };
    if (cfg.gistId) {
      await gh('/gists/' + cfg.gistId, { method: 'PATCH', body: JSON.stringify({ description: DESC, files }) });
    } else {
      const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: DESC, public: false, files }) });
      cfg.gistId = g.id; setCfg(cfg);
    }
  },
};

const activeProvider = () => {
  if (account.enabled() && account.loggedIn()) return { kind: 'account', ...account.provider };
  if (isConnected()) return { kind: 'gist', ...gistProvider };
  return null;
};
export const isActive = () => !!activeProvider();
export const activeKind = () => (activeProvider() || {}).kind || null;

/** Koppelt dit apparaat aan een Gist (zoekt een bestaande of maakt een nieuwe). */
export async function connect(token) {
  setCfg({ token: token.trim() });
  try { return await syncNow(); }
  catch (e) { localStorage.removeItem(SK); throw e; }
}
export function disconnect() { localStorage.removeItem(SK); emit({ state: 'off' }); }

/** Ophalen -> samenvoegen -> terugschrijven. */
export async function syncNow() {
  const prov = activeProvider();
  if (!prov) return null;
  if (busy) { dirty = true; return null; }
  busy = true; dirty = false;
  emit({ state: 'busy' });
  try {
    const remote = await prov.pull();
    const result = remote ? mergeRemote(remote) : { changed: false };
    await prov.push(exportData());
    const last = Date.now();
    if (prov.kind === 'account') account.setLastSync(last);
    else setCfg({ ...getCfg(), last });
    emit({ state: 'ok', last, changed: result.changed, kind: prov.kind });
    return result;
  } catch (e) {
    emit({ state: 'error', message: e.message });
    throw e;
  } finally {
    busy = false;
    if (dirty) schedule(2000);
  }
}

export function lastSync() {
  return activeKind() === 'account' ? account.lastSync() : (getCfg().last || 0);
}

export function schedule(ms = 1200) {
  if (!isActive()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; syncNow().catch(() => {}); }, ms);
}

/** Automatisch synchroniseren: bij wijzigingen, bij terugkeren naar de tab, bij weer online en bij opstarten. */
export function startAutoSync() {
  onChange(() => { emit({ state: 'pending' }); schedule(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(300);
    else if (timer) { clearTimeout(timer); timer = null; syncNow().catch(() => {}); }
  });
  // Pagina sluiten/wegzwiepen: meteen wegschrijven (pagehide werkt op iOS/Safari betrouwbaarder dan visibilitychange).
  window.addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); timer = null; syncNow().catch(() => {}); } });
  window.addEventListener('online', () => schedule(500));
  if (isActive()) schedule(200);
}
