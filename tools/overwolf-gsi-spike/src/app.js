/* global overwolf */
'use strict';

// Dota 2 Overwolf game class id is commonly 7314 in Overwolf sample manifests.
// Verify on the target Windows machine via overwolf.games.getGameInfo().
const DOTA2_GAME_ID = 7314;
const REQUIRED_FEATURES = [
  'gep_internal',
  'game_state',
  'game_state_changed',
  'match_state_changed',
  'match_detected',
  'match_info',
  'roster',
  'bans',
  'draft',
  'hero_pool',
  'me',
  'game'
];

const state = {
  logs: [],
  info: {},
  summary: {
    gameId: DOTA2_GAME_ID,
    hasGamestateIntegrationLaunchOption: null,
    matchState: null,
    myTeam: null,
    draft: [],
    bans: [],
    roster: null,
    lastUpdateAt: null
  }
};

const $ = (id) => document.getElementById(id);
$('features').textContent = REQUIRED_FEATURES.join(', ');

function nowIso() { return new Date().toISOString(); }

function tryJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (lower.includes('steam') || lower.includes('account') || lower.includes('name')) {
      out[key] = '[redacted]';
    } else {
      out[key] = sanitize(tryJson(raw));
    }
  }
  return out;
}

function asArray(value) {
  const parsed = tryJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function setBadge(text, cls = 'muted') {
  const badge = $('runtime-badge');
  badge.textContent = text;
  badge.className = `badge ${cls}`;
}

function appendLog(kind, payload) {
  const entry = { at: nowIso(), kind, payload: sanitize(payload) };
  state.logs.push(entry);
  if (state.logs.length > 1000) state.logs.shift();
  $('log').textContent = state.logs.map(line => JSON.stringify(line)).join('\n');
  maybeBridge(entry);
}

function renderSummary() {
  $('summary').textContent = JSON.stringify(state.summary, null, 2);
}

async function maybeBridge(entry) {
  if (!$('bridge-enabled').checked) return;
  const url = $('bridge-url').value.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(entry)
    });
  } catch (error) {
    appendLocalOnly('bridge_error', { message: String(error) });
  }
}

function appendLocalOnly(kind, payload) {
  const entry = { at: nowIso(), kind, payload: sanitize(payload) };
  state.logs.push(entry);
  $('log').textContent = state.logs.map(line => JSON.stringify(line)).join('\n');
}

function normalizeInfoUpdates(event) {
  if (!event) return [];
  if (Array.isArray(event.info)) return event.info;
  if (event.category && event.key) return [event];

  // Overwolf examples commonly use { feature: 'me', info: { me: { team: 'radiant' } } }
  // or { feature: 'game', info: { game: { match_state: '...' } } }.
  if (event.info && typeof event.info === 'object') {
    const out = [];
    for (const [category, values] of Object.entries(event.info)) {
      if (values && typeof values === 'object' && !Array.isArray(values)) {
        for (const [key, value] of Object.entries(values)) {
          out.push({ feature: event.feature, category, key, value });
        }
      } else {
        out.push({ feature: event.feature, category, key: category, value: values });
      }
    }
    return out;
  }
  return [];
}

function updateSummaryFromInfoUpdate(update) {
  const category = update.category;
  const key = update.key;
  const value = tryJson(update.value);
  state.summary.lastUpdateAt = nowIso();

  if ((update.feature === 'draft' || category === 'draft' || key === 'draft') && Array.isArray(value)) {
    state.summary.draft = value.map(sanitize);
  }
  if ((update.feature === 'bans' || category === 'bans' || key === 'bans') && Array.isArray(value)) {
    state.summary.bans = value.map(sanitize);
  }
  if (update.feature === 'roster' || category === 'roster') {
    state.summary.roster = sanitize(value);
  }
  if (category === 'me' && key === 'team') state.summary.myTeam = value;
  if (category === 'game' && key === 'match_state') state.summary.matchState = value;

  renderSummary();
}

function handleInfoUpdates(event) {
  appendLog('info_updates', event);
  for (const update of normalizeInfoUpdates(event)) updateSummaryFromInfoUpdate(update);
}

function handleNewEvents(event) {
  appendLog('new_events', event);
  const events = event && Array.isArray(event.events) ? event.events : [];
  for (const ev of events) {
    const data = sanitize(tryJson(ev.data));
    if (ev.name === 'match_state_changed' && data && data.match_state) {
      state.summary.matchState = data.match_state;
      state.summary.lastUpdateAt = nowIso();
    }
  }
  renderSummary();
}

function getInfo() {
  if (!window.overwolf) {
    appendLog('error', { message: 'overwolf global is not available. Load this folder as an unpacked Overwolf app on Windows.' });
    setBadge('no overwolf runtime', 'bad');
    return;
  }
  overwolf.games.events.getInfo((result) => {
    appendLog('get_info', result);
    if (result && result.info) {
      for (const [feature, payload] of Object.entries(result.info)) {
        if (feature === 'draft') state.summary.draft = asArray(payload);
        if (feature === 'bans') state.summary.bans = asArray(payload);
        if (feature === 'roster') state.summary.roster = sanitize(tryJson(payload));
        if (feature === 'me') {
          const me = tryJson(payload);
          if (me && me.team) state.summary.myTeam = me.team;
        }
        if (feature === 'game') {
          const game = tryJson(payload);
          if (game && game.match_state) state.summary.matchState = game.match_state;
        }
      }
      state.summary.lastUpdateAt = nowIso();
      renderSummary();
    }
  });
}

function setFeatures() {
  if (!window.overwolf) {
    appendLog('error', { message: 'overwolf global is not available. Load this folder as an unpacked Overwolf app on Windows.' });
    setBadge('no overwolf runtime', 'bad');
    return;
  }
  overwolf.games.events.setRequiredFeatures(REQUIRED_FEATURES, (result) => {
    $('feature-status').textContent = JSON.stringify(result);
    appendLog('set_required_features', result);
    if (result && result.success) {
      setBadge('features subscribed', 'ok');
      getInfo();
    } else {
      setBadge('feature subscription failed', 'bad');
    }
  });
}

function checkGame() {
  if (!window.overwolf) {
    appendLog('error', { message: 'overwolf global is not available. Load this folder as an unpacked Overwolf app on Windows.' });
    return;
  }
  overwolf.games.getGameInfo((result) => {
    const sanitized = sanitize(result);
    appendLog('game_info', sanitized);
    const cmd = result && result.gameInfo && (result.gameInfo.commandLine || result.gameInfo.ProcessCommandLine || result.gameInfo.processCommandLine || '');
    state.summary.hasGamestateIntegrationLaunchOption = typeof cmd === 'string' ? cmd.includes('-gamestateintegration') : null;
    renderSummary();
  });
}

$('set-features').addEventListener('click', setFeatures);
$('get-info').addEventListener('click', getInfo);
$('check-game').addEventListener('click', checkGame);
$('clear-log').addEventListener('click', () => { state.logs = []; $('log').textContent = ''; });
$('copy-jsonl').addEventListener('click', async () => {
  const jsonl = state.logs.map(line => JSON.stringify(line)).join('\n');
  await navigator.clipboard.writeText(jsonl);
  appendLocalOnly('copied_jsonl', { lines: state.logs.length });
});

if (window.overwolf && overwolf.games && overwolf.games.events) {
  overwolf.games.events.onInfoUpdates2.addListener(handleInfoUpdates);
  overwolf.games.events.onNewEvents.addListener(handleNewEvents);
  setBadge('overwolf runtime detected', 'ok');
  checkGame();
  setFeatures();
} else {
  setBadge('open in Overwolf', 'muted');
  appendLocalOnly('startup', { message: 'Open this directory as an unpacked Overwolf app on Windows.' });
}
renderSummary();
