/**
 * No persistent raw records: the exported LimeSurvey responses only live in
 * the memory of a single GitHub Actions job. Published output is aggregate-only.
 */
export const SURVEY_IDS = ['887516', '798891', '634562', '968655'];

export const EVENTS = [
  { key: '2026-11-03T17:00|EN', label: '3 November, 17:00', language: 'EN', date: '2026-11-03' },
  { key: '2026-11-10T19:00|PL', label: '10 listopada, 19:00', language: 'PL', date: '2026-11-10' },
  { key: '2026-11-10T18:00|EN', label: '10 November, 18:00', language: 'EN', date: '2026-11-10' },
  { key: '2026-11-12T16:30|PL', label: '12 listopada, 16:30', language: 'PL', date: '2026-11-12' },
  { key: '2026-11-17T19:00|PL', label: '17 listopada, 19:00', language: 'PL', date: '2026-11-17' },
  { key: '2026-11-19T16:30|PL', label: '19 listopada, 16:30', language: 'PL', date: '2026-11-19' }
];

// Two Polish registration forms point to the same 10 November seminar.
export const EVENT_MAP = {
  '887516|NOV10': '2026-11-10T19:00|PL',
  '798891|NOV10': '2026-11-10T19:00|PL',
  '887516|NOV12': '2026-11-12T16:30|PL',
  '634562|NOV3': '2026-11-03T17:00|EN',
  '634562|NOV03': '2026-11-03T17:00|EN',
  '634562|NOV10': '2026-11-10T18:00|EN',
  '968655|NO17': '2026-11-17T19:00|PL',
  '968655|NO19': '2026-11-19T16:30|PL'
};

export const CHANNEL_NAMES = {
  FB: 'Facebook', IG: 'Instagram', LI: 'LinkedIn', SOC: 'Media społecznościowe (inne)',
  PROJ: 'Kanały projektu', WEB: 'Strona WWW', EMAIL: 'Wiadomość e-mail',
  NGO: 'Organizacja pozarządowa', UNI: 'Uczelnia', PUB: 'Instytucja publiczna',
  PERS: 'Znajomi / polecenie', MEDIA: 'Media', OTHER: 'Inne', DK: 'Nie pamiętam'
};

export const ROLE_NAMES = {
  PRIV: 'Osoba prywatna', NGO: 'Organizacja pozarządowa',
  PUB: 'Sektor publiczny', UNI: 'Środowisko akademickie',
  ORG: 'Inna organizacja', OTHER: 'Inne'
};

const clean = value => value === null || value === undefined ? '' : String(value).trim();
const normalizeKey = key => key.toLowerCase().replace(/[^a-z0-9]/g, '');

export function field(row, name) {
  if (Object.hasOwn(row, name)) return clean(row[name]);
  const wanted = normalizeKey(name);
  for (const [key, value] of Object.entries(row)) {
    if (normalizeKey(key) === wanted) return clean(value);
  }
  return '';
}

export function parseLimeSurveyJson(json, sid) {
  const payload = typeof json === 'string' ? JSON.parse(json.replace(/^\uFEFF/, '')) : json;
  const set = Array.isArray(payload) ? payload : payload?.responses;
  if (!set || (typeof set !== 'object')) throw new Error(`Niepoprawny eksport ankiety ${sid}`);
  const records = Array.isArray(set) ? set : Object.values(set);
  return records.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Błędny rekord ankiety ${sid}`);
    if (Object.hasOwn(raw, 'id')) return raw;
    const nested = Object.values(raw);
    if (nested.length === 1 && nested[0] && typeof nested[0] === 'object' && !Array.isArray(nested[0])) return nested[0];
    throw new Error(`Nie rozpoznano rekordu ankiety ${sid}`);
  });
}

export function normalizeRegistration(sid, row) {
  const submitted = field(row, 'submitdate');
  if (!submitted) return null; // completed responses only
  const id = field(row, 'id');
  const email = field(row, 'EMAIL').toLowerCase();
  if (!id || !/^\S+@\S+\.\S+$/.test(email)) throw new Error(`Ukończona odpowiedź ${sid} ma nieprawidłowe id/e-mail`);
  const submittedDay = submitted.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(submittedDay)) throw new Error(`Nieprawidłowa data odpowiedzi ${sid}`);
  const code = field(row, 'CONFIRM');
  const event = EVENT_MAP[`${sid}|${code}`];
  if (!event) throw new Error(`Nieznany termin w ankiecie ${sid}. Sprawdź EVENT_MAP.`);
  const other = [];
  for (const channel of Object.keys(CHANNEL_NAMES)) {
    const flag = field(row, `SOURCEOTHER[${channel}]`) || field(row, `SOURCEOTHER_${channel}`);
    if (['Y', '1', 'TRUE'].includes(flag.toUpperCase())) other.push(channel);
  }
  return {
    sid, id, email, submittedDay, submitted,
    event,
    first: field(row, 'SOURCEFIRST'),
    decide: field(row, 'SOURCEDECIDE'),
    role: field(row, 'ROLE'),
    other
  };
}

function dateOffset(day, delta) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function tally(obj, key) {
  if (key && Object.hasOwn(obj, key)) obj[key]++;
}

export function aggregate(exportsBySurvey, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const rows = [];
  const seenResponseKeys = new Set();
  for (const sid of SURVEY_IDS) {
    if (!Object.hasOwn(exportsBySurvey, sid)) throw new Error(`Brak eksportu ankiety ${sid}`);
    for (const raw of parseLimeSurveyJson(exportsBySurvey[sid], sid)) {
      const record = normalizeRegistration(sid, raw);
      if (!record) continue;
      const responseKey = `${sid}|${record.id}`;
      if (seenResponseKeys.has(responseKey)) throw new Error(`Duplikat odpowiedzi w ankiecie ${sid}`);
      seenResponseKeys.add(responseKey);
      rows.push(record);
    }
  }
  rows.sort((a, b) => a.submitted.localeCompare(b.submitted) || a.sid.localeCompare(b.sid) || Number(a.id) - Number(b.id));

  const firstByEmail = new Map();
  const perEvent = new Map(EVENTS.map(e => [e.key, { emails: new Set(), submissions: 0 }]));
  const bySubmissionDate = new Map();
  for (const row of rows) {
    if (!firstByEmail.has(row.email)) firstByEmail.set(row.email, row);
    const event = perEvent.get(row.event);
    event.submissions++;
    event.emails.add(row.email);
    bySubmissionDate.set(row.submittedDay, (bySubmissionDate.get(row.submittedDay) || 0) + 1);
  }

  const firstByDay = new Map();
  const first = Object.fromEntries(Object.keys(CHANNEL_NAMES).map(k => [k, 0]));
  const decide = Object.fromEntries(Object.keys(CHANNEL_NAMES).map(k => [k, 0]));
  const other = Object.fromEntries(Object.keys(CHANNEL_NAMES).map(k => [k, 0]));
  const roles = Object.fromEntries(Object.keys(ROLE_NAMES).map(k => [k, 0]));
  for (const profile of firstByEmail.values()) {
    firstByDay.set(profile.submittedDay, (firstByDay.get(profile.submittedDay) || 0) + 1);
    tally(first, profile.first);
    tally(decide, profile.decide);
    tally(roles, profile.role);
    for (const key of profile.other) tally(other, key);
  }
  const daily = Array.from({ length: 30 }, (_, n) => {
    const date = dateOffset(today, n - 29);
    return { date, registrations: bySubmissionDate.get(date) || 0, newUnique: firstByDay.get(date) || 0 };
  });
  const events = EVENTS.map(e => ({
    key: e.key, label: e.label, language: e.language, date: e.date,
    registered: perEvent.get(e.key).emails.size,
    submissions: perEvent.get(e.key).submissions
  }));
  const last7 = dateOffset(today, -6);
  return {
    schema: 1,
    updatedAt: now.toISOString(),
    metrics: {
      uniquePersons: firstByEmail.size,
      registrations: rows.length,
      duplicateRegistrations: rows.length - firstByEmail.size,
      todayRegistrations: bySubmissionDate.get(today) || 0,
      last7Registrations: rows.filter(row => row.submittedDay >= last7 && row.submittedDay <= today).length,
      target: 300
    },
    events, daily,
    channels: Object.keys(CHANNEL_NAMES).map(code => ({ code, label: CHANNEL_NAMES[code], first: first[code], decide: decide[code], other: other[code] })),
    roles: Object.keys(ROLE_NAMES).map(code => ({ code, label: ROLE_NAMES[code], count: roles[code] }))
  };
}
