// GitHub Pages hosts only a ciphertext JSON. The URL fragment contains the key;
// fragments are not sent to the HTTP server. No tracking / analytics.
const $ = id => document.getElementById(id);
const format = n => new Intl.NumberFormat('pl-PL').format(n);
let current;

function base64urlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return Uint8Array.from(bin, char => char.charCodeAt(0));
}

function keyFromFragment() {
  return new URLSearchParams(location.hash.slice(1)).get('k') || '';
}

async function decrypt(envelope, encodedKey) {
  const bytes = base64urlDecode(encodedKey);
  if (bytes.length !== 32) throw new Error('Nieprawidłowa długość klucza');
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64urlDecode(envelope.iv) }, key, base64urlDecode(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderMetrics(data) {
  const m = data.metrics;
  $('unique').textContent = format(m.uniquePersons);
  $('total').textContent = format(m.registrations);
  $('duplicates').textContent = format(m.duplicateRegistrations);
  $('last7').textContent = format(m.last7Registrations);
  $('today').textContent = format(m.todayRegistrations);
  $('goal-progress').style.width = `${Math.min(100, Math.max(0, 100 * m.uniquePersons / m.target))}%`;
  $('goal-description').textContent = `${(100 * m.uniquePersons / m.target).toFixed(1).replace('.', ',')}% celu · pozostało ${format(Math.max(0, m.target - m.uniquePersons))} osób`;
  $('updated').textContent = `Ostatnia aktualizacja: ${new Date(data.updatedAt).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'medium', timeStyle: 'short' })}`;
}

function renderTrend(data) {
  const days = data.daily;
  const width = 1000, height = 255, margin = { top: 25, right: 16, bottom: 45, left: 42 };
  const plotW = width - margin.left - margin.right, plotH = height - margin.top - margin.bottom;
  const maxValue = Math.max(1, ...days.map(d => Math.max(d.registrations, d.newUnique)));
  const maximum = Math.max(4, Math.ceil(maxValue / 4) * 4);
  const point = (d, i, key) => {
    const x = margin.left + plotW * i / Math.max(1, days.length - 1);
    const y = margin.top + plotH * (1 - d[key] / maximum);
    return [x, y];
  };
  const line = key => days.map((d, i) => `${i ? 'L' : 'M'} ${point(d, i, key).map(x => x.toFixed(1)).join(' ')}`).join(' ');
  const grid = Array.from({ length: 5 }, (_, i) => {
    const value = maximum - i * maximum / 4;
    const y = margin.top + i * plotH / 4;
    return `<line x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" stroke="#e7efed" stroke-width="1"/><text x="${margin.left - 9}" y="${y + 4}" fill="#93a6a9" font-size="12" text-anchor="end">${format(value)}</text>`;
  }).join('');
  const ticks = [0, 7, 14, 21, 29].map(i => {
    const x = margin.left + plotW * i / 29;
    const date = new Date(days[i].date + 'T12:00:00Z');
    return `<text x="${x}" y="${height - 13}" fill="#8098a2" font-size="12" text-anchor="middle">${date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</text>`;
  }).join('');
  $('trend').innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${grid}${ticks}<path d="${line('registrations')}" fill="none" stroke="#8aabae" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="${line('newUnique')}" fill="none" stroke="#119d8b" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  $('trend').setAttribute('aria-label', `Nowe osoby w 30 dni: ${days.reduce((sum, d) => sum + d.newUnique, 0)}. Wszystkie zgłoszenia w 30 dni: ${days.reduce((sum, d) => sum + d.registrations, 0)}.`);
}

function renderEvents(data) {
  $('events').innerHTML = data.events.map(e => `<div class="event-row"><div class="event-name">${escapeHtml(e.label)}</div><div><span class="event-language">${escapeHtml(e.language)}</span></div><div class="event-count">${format(e.registered)}</div></div>`).join('');
  const unassigned = data.metrics.unassignedRegistrations ?? 0;
  const notice = $('unassigned-events');
  notice.hidden = unassigned === 0;
  notice.textContent = `Zgłoszenia bez ustalonego terminu (${format(unassigned)}) wliczono do łącznych statystyk.`;
}

function bars(rows, key, target) {
  const meaningful = [...rows].filter(r => Number(r[key]) > 0).sort((a, b) => b[key] - a[key]);
  const source = meaningful.length ? meaningful : rows;
  const largest = Math.max(1, ...source.map(r => r[key]));
  $(target).innerHTML = source.map(r => `<div class="bar-row"><div class="bar-label">${escapeHtml(r.label)}</div><div class="bar-track"><div class="bar-fill" style="width:${(100 * r[key] / largest).toFixed(1)}%"></div></div><div class="bar-value">${format(r[key])}</div></div>`).join('');
}

function render(data) {
  if (!data?.metrics || !Array.isArray(data.daily) || !Array.isArray(data.events) || !Array.isArray(data.channels)) throw new Error('Niekompletne agregaty');
  current = data;
  renderMetrics(data);
  renderTrend(data);
  renderEvents(data);
  bars(data.channels, $('promo-mode').value, 'channels');
  bars(data.roles, 'count', 'roles');
  $('locked').hidden = true;
  $('dashboard').hidden = false;
}

async function load() {
  const encodedKey = keyFromFragment();
  if (!encodedKey) { $('locked').hidden = false; $('dashboard').hidden = true; return; }
  try {
    const response = await fetch(`./data.enc.json?refresh=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Brak opublikowanych statystyk');
    render(await decrypt(await response.json(), encodedKey));
    $('locked-message').textContent = '';
  } catch (error) {
    $('dashboard').hidden = true;
    $('locked').hidden = false;
    $('locked-message').textContent = 'Nie udało się odszyfrować danych. Sprawdź klucz lub poczekaj na pierwszą synchronizację.';
  }
}

$('key-form').addEventListener('submit', event => {
  event.preventDefault();
  const key = $('key-input').value.trim();
  if (!key) return;
  location.hash = `k=${encodeURIComponent(key)}`;
  load();
});
$('promo-mode').addEventListener('change', () => { if (current) bars(current.channels, $('promo-mode').value, 'channels'); });
$('copy-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); $('copy-link').textContent = 'Skopiowano link ✓'; }
  catch { $('copy-link').textContent = 'Skopiuj adres z paska przeglądarki'; }
});
window.addEventListener('hashchange', load);
load();
setInterval(() => { if (keyFromFragment()) load(); }, 2 * 60 * 1000);
