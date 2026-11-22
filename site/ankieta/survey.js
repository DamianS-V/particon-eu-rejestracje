import { readDashboard } from '../access.js';

const $ = id => document.getElementById(id);
const numbers = new Intl.NumberFormat('pl-PL');
const percent = new Intl.NumberFormat('pl-PL', { style: 'percent', maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'medium', timeStyle: 'short' });

function element(tag, className, text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function renderDimension(dimension, completed) {
  const card = element('article', 'card bars-card');
  card.append(element('h3', 'survey-dimension-title', dimension.label));
  if (dimension.note) card.append(element('p', 'section-note', dimension.note));
  const rows = [
    ...dimension.groups,
    { label: 'Poza przypisanymi kategoriami', count: dimension.unmapped },
    { label: 'Brak odpowiedzi', count: dimension.missing }
  ].filter(row => row.count > 0);
  if (!rows.length) card.append(element('p', 'section-note', 'Brak ukończonych formularzy.'));
  for (const { label, count } of rows) {
    const fraction = count / completed;
    const item = element('div', 'survey-bar');
    const heading = element('div', 'survey-bar-heading');
    heading.append(element('span', '', label), element('strong', '', `${numbers.format(count)} · ${percent.format(fraction)}`));
    const track = element('div', 'bar-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = element('div', 'bar-fill');
    fill.style.width = `${fraction * 100}%`;
    track.append(fill);
    item.append(heading, track);
    card.append(item);
  }
  return card;
}

let request = 0;
async function load() {
  const currentRequest = ++request;
  const key = new URLSearchParams(location.hash.slice(1)).get('k');
  let available = false;
  try {
    if (key) {
      const data = await readDashboard('./data.enc.json', key);
      if (currentRequest !== request) return;
      available = !data.unavailable;
      if (available) {
        $('updated').textContent = `Ostatnia aktualizacja · ${date.format(new Date(data.updatedAt))}`;
        $('completed').textContent = numbers.format(data.completed);
        $('incomplete').textContent = numbers.format(data.incomplete);
        $('screened-out').textContent = numbers.format(data.screenedOut);
        $('demographics').replaceChildren(...data.demographics.map(d => renderDimension(d, data.completed)));
      }
    }
    $('locked-message').textContent = '';
    $('locked').hidden = Boolean(key);
    $('dashboard').hidden = !available;
    $('unavailable').hidden = !key || available;
  } catch {
    if (currentRequest !== request) return;
    $('locked-message').textContent = 'Dane są niedostępne lub klucz jest nieprawidłowy.';
    $('locked').hidden = false;
    $('dashboard').hidden = true;
    $('unavailable').hidden = true;
  }
}

$('key-form').addEventListener('submit', event => {
  event.preventDefault();
  const key = $('key-input').value.trim();
  if (!key) return;
  const hash = `#k=${encodeURIComponent(key)}`;
  if (location.hash === hash) load();
  else location.hash = hash;
});
$('copy-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    $('copy-link').textContent = 'Skopiowano link';
  } catch {
    $('copy-link').textContent = 'Skopiuj adres z paska przeglądarki';
  }
});
window.addEventListener('hashchange', load);
load();
setInterval(load, 120_000);
