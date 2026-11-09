import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aggregate, SURVEY_IDS } from './aggregate.mjs';
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

async function exportSurvey(sessionKey, sid) {
  const result = await rpc('export_responses', [sessionKey, Number(sid), 'json', null, 'complete', 'code', 'short']);
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

async function main() {
  const username = mandatory('LIMESURVEY_USERNAME');
  const password = mandatory('LIMESURVEY_PASSWORD');
  const key = decodeKey(mandatory('DASHBOARD_ENCRYPTION_KEY'));
  const sessionResult = await rpc('get_session_key', [username, password]);
  if (typeof sessionResult !== 'string' || !sessionResult) {
    throw new Error('Logowanie do LimeSurvey API nie powiodło się. Sprawdź nazwę użytkownika i hasło.');
  }
  let exportsBySurvey;
  try {
    exportsBySurvey = {};
    for (const sid of SURVEY_IDS) exportsBySurvey[sid] = await exportSurvey(sessionResult, sid);
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
