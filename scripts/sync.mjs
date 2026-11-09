import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aggregate, eventFromLabel, field, parseLimeSurveyJson, SURVEY_IDS } from './aggregate.mjs';
import { decodeKey, seal } from './crypto.mjs';

const ENDPOINT = 'https://particon-eu.limesurvey.net/admin/remotecontrol';

function mandatory(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Brak wymaganej zmiennej ${name}. Skonfiguruj ją jako GitHub Actions Secret.`);
  return value;
}

async function rpc(method, params) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `${method}-${Date.now()}`, method, params }),
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`LimeSurvey HTTP ${response.status} podczas ${method}`);
  let json;
  try { json = await response.json(); }
  catch { throw new Error(`LimeSurvey zwrócił nieprawidłowy JSON podczas ${method}`); }
  if (json.error) throw new Error(`LimeSurvey odmówił wykonania ${method}; sprawdź uprawnienia do API`);
  return json.result;
}

async function exportSurvey(sessionKey, sid, language = null) {
  const params = [sessionKey, Number(sid), 'json', language, 'complete', 'code', language ? 'long' : 'short'];
  const result = await rpc('export_responses', params);
  if (typeof result === 'object' && result !== null) {
    if (result.error_code === 'ERR_NO_DATA' || /^no data$/i.test(result.status || '')) {
      return { responses: [] };
    }
    throw new Error(`LimeSurvey nie zwrócił eksportu ankiety ${sid}; sprawdź dostęp i status ankiety`);
  }
  if (typeof result !== 'string') throw new Error(`Nieobsługiwany format eksportu ankiety ${sid}`);
  const decoded = Buffer.from(result, 'base64').toString('utf8');
  try { return JSON.parse(decoded.replace(/^\uFEFF/, '')); }
  catch { throw new Error(`Eksport JSON ankiety ${sid} jest nieprawidłowy`); }
}

function archivedLabels() {
  const source = process.env.LIMESURVEY_ARCHIVED_LABELS;
  if (!source) return {};
  try {
    const labels = JSON.parse(source);
    if (!labels || typeof labels !== 'object' || Array.isArray(labels)) throw new Error();
    for (const [sid, entries] of Object.entries(labels)) {
      if (!SURVEY_IDS.includes(sid) || !entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error();
      for (const [id, label] of Object.entries(entries)) {
        if (!/^\d+$/.test(id) || typeof label !== 'string' || !eventFromLabel(label)) throw new Error();
      }
    }
    return labels;
  } catch {
    throw new Error('LIMESURVEY_ARCHIVED_LABELS zawiera nieprawidłowe identyfikatory lub etykiety terminów.');
  }
}

async function registrationsWithLabels(sessionKey, sid, archived) {
  const records = parseLimeSurveyJson(await exportSurvey(sessionKey, sid), sid);
  if (!records.some(row => field(row, 'submitdate'))) return { responses: records };
  const labelsByLanguage = Object.create(null);
  for (const language of ['pl', 'en']) {
    const rows = parseLimeSurveyJson(await exportSurvey(sessionKey, sid, language), sid);
    if (!rows.some(row => Object.hasOwn(row, 'CONFIRM'))) {
      throw new Error(`Eksport pełnych odpowiedzi ankiety ${sid} nie zawiera pola CONFIRM (${language}).`);
    }
    labelsByLanguage[language] = new Map(rows.map(row => [field(row, 'id'), field(row, 'CONFIRM')]));
  }

  const responses = records.map(row => {
    const id = field(row, 'id');
    const language = field(row, 'startlanguage').toLowerCase();
    const pl = labelsByLanguage.pl.get(id);
    const en = labelsByLanguage.en.get(id);
    const plTerm = eventFromLabel(pl);
    const sameTerm = plTerm && plTerm === eventFromLabel(en);
    const liveLabel = labelsByLanguage[language]?.get(id) ?? (sameTerm ? pl : '');
    const archivedLabel = Object.hasOwn(archived, id) ? archived[id] : null;
    return { ...row, CONFIRM: archivedLabel ?? liveLabel };
  });
  return { responses };
}

async function main() {
  const username = mandatory('LIMESURVEY_USERNAME');
  const password = mandatory('LIMESURVEY_PASSWORD');
  const key = decodeKey(mandatory('DASHBOARD_ENCRYPTION_KEY'));
  const archive = archivedLabels();
  const sessionResult = await rpc('get_session_key', [username, password]);
  if (typeof sessionResult !== 'string' || !sessionResult) {
    throw new Error('Logowanie do LimeSurvey API nie powiodło się. Sprawdź nazwę użytkownika i hasło.');
  }
  let exportsBySurvey;
  try {
    exportsBySurvey = {};
    for (const sid of SURVEY_IDS) exportsBySurvey[sid] = await registrationsWithLabels(sessionResult, sid, archive[sid] ?? {});
  } finally {
    try { await rpc('release_session_key', [sessionResult]); } catch { /* best effort */ }
  }

  const summary = aggregate(exportsBySurvey);
  const envelope = seal(summary, key);
  await mkdir('dist', { recursive: true });
  for (const filename of ['index.html', 'styles.css', 'app.js']) {
    await copyFile(join('site', filename), join('dist', filename));
  }
  await writeFile(join('dist', 'data.enc.json'), `${JSON.stringify(envelope)}\n`, { mode: 0o644 });
  console.log('Dashboard zaktualizowany. Dane do publikacji zostały zaszyfrowane.');
}

main().catch(error => {
  // Never print LimeSurvey response bodies, API session keys or other secrets.
  console.error(`Synchronizacja nie powiodła się: ${error.message}`);
  process.exitCode = 1;
});
