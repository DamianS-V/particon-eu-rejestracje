import { readDashboard } from '../access.js';

const $ = id => document.getElementById(id);
const numbers = new Intl.NumberFormat('pl-PL');
const percent = new Intl.NumberFormat('pl-PL', { style: 'percent', maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'medium', timeStyle: 'short' });
const unknownLabel = 'Poza kategoriami';
const missingLabel = 'Brak odpowiedzi';
const comparisonColors = ['#184b58', '#297c79', '#43a995', '#8cbd8c', '#c7d77e', '#ac8154', '#7b6b9d'];
let comparison;

function element(tag, className, text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function distributionRows(dimension) {
  return [
    ...dimension.groups,
    { label: unknownLabel, count: dimension.unmapped },
    { label: missingLabel, count: dimension.missing }
  ].filter(row => row.count > 0);
}

function renderDimension(dimension, completed) {
  const card = element('article', 'card bars-card');
  card.append(element('h3', 'survey-dimension-title', dimension.label));
  if (dimension.note) card.append(element('p', 'section-note', dimension.note));
  const rows = distributionRows(dimension);
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

function renderComparison() {
  const metric = comparison.metrics.find(({ code }) => code === $('comparison-metric').value);
  const countries = comparison.countries.map(({ label, total, distributions }) => ({
    label, total, counts: new Map(distributionRows(distributions[metric.code]).map(row => [row.label, row.count]))
  }));
  const labels = [...metric.categories, unknownLabel, missingLabel]
    .filter(label => countries.some(({ counts }) => counts.has(label)));
  const color = label => {
    if (label === unknownLabel) return '#7a8990';
    if (label === missingLabel) return '#d7e1e1';
    return comparisonColors[metric.categories.indexOf(label)];
  };
  $('comparison-note').hidden = !metric.note;
  $('comparison-note').textContent = metric.note ?? '';
  $('comparison-unassigned').hidden = !comparison.unassigned;
  $('comparison-unassigned').textContent = `Poza zestawieniem krajów · ${numbers.format(comparison.unassigned)} ukończonych ankiet z innym lub nieustalonym krajem zamieszkania`;
  $('comparison-legend').replaceChildren(...labels.map(label => {
    const item = element('span', 'comparison-key');
    const swatch = element('span', 'comparison-swatch');
    swatch.style.backgroundColor = color(label);
    item.append(swatch, document.createTextNode(label));
    return item;
  }));
  $('comparison-chart').replaceChildren(...countries.map(({ label, total, counts }) => {
    const row = element('div', 'comparison-row');
    const caption = element('div', 'comparison-caption');
    caption.append(element('strong', '', label), element('span', '', `n = ${numbers.format(total)}`));
    const track = element('div', 'comparison-track');
    track.setAttribute('role', 'img');
    const values = [];
    for (const category of labels) {
      const count = counts.get(category);
      if (!count) continue;
      const value = `${category} · ${numbers.format(count)} (${percent.format(count / total)})`;
      const segment = element('span', 'comparison-segment');
      segment.style.backgroundColor = color(category);
      segment.style.width = `${100 * count / total}%`;
      segment.title = value;
      values.push(value);
      track.append(segment);
    }
    track.setAttribute('aria-label', values.join(', ') || 'Brak ukończonych ankiet');
    row.append(caption, track);
    return row;
  }));

  const table = element('table', '');
  const header = table.createTHead().insertRow();
  for (const label of ['Kraj', 'Ukończone', ...labels]) {
    const cell = element('th', '', label);
    cell.scope = 'col';
    header.append(cell);
  }
  const body = table.createTBody();
  for (const { label, total, counts } of countries) {
    const row = body.insertRow();
    const country = element('th', '', label);
    country.scope = 'row';
    row.append(country, element('td', '', numbers.format(total)));
    for (const category of labels) {
      const count = counts.get(category) ?? 0;
      row.append(element('td', '', total ? `${numbers.format(count)} · ${percent.format(count / total)}` : '—'));
    }
  }
  $('comparison-values').replaceChildren(table);
}

function renderImportance(groups) {
  const available = groups?.length && groups.every(group => Array.isArray(group.bins));
  $('importance-panel').hidden = !available;
  if (!available) return;
  $('importance-details').hidden = !groups.some(group => group.count);

  const colors = ['#168777', '#405b83'];
  const legend = element('ul', 'histogram-legend');
  groups.forEach(({ label, count }, index) => {
    const item = element('li', 'comparison-key');
    const swatch = element('span', 'comparison-swatch');
    swatch.style.backgroundColor = colors[index];
    item.append(swatch, document.createTextNode(`${label} · n = ${numbers.format(count)}`));
    legend.append(item);
  });
  if (!groups.some(group => group.count)) {
    $('importance').replaceChildren(legend, element('p', 'section-note', 'Brak odpowiedzi na oba pytania.'));
    return;
  }

  const share = (group, index) => group.count ? group.bins[index] / group.count : 0;
  const maxShare = Math.max(...groups.flatMap(group => group.bins.map((_, index) => share(group, index))));
  const tickStep = Math.max(1, Math.ceil(maxShare * 5)) / 20;
  const limit = tickStep * 4;
  const figure = element('figure', 'histogram');
  figure.setAttribute('aria-label', 'Histogram ocen znaczenia konstytucji. Dokładne wartości zawiera tabela poniżej.');
  const plot = element('div', 'histogram-plot');
  plot.setAttribute('aria-hidden', 'true');
  for (let index = 0; index <= 4; index++) {
    const tick = element('div', 'histogram-tick');
    tick.style.bottom = `${index * 25}%`;
    tick.append(element('span', '', percent.format(index * tickStep)));
    plot.append(tick);
  }

  const table = element('table', '');
  const header = table.createTHead().insertRow();
  for (const label of ['Ocena', ...groups.map(group => group.label)]) {
    const cell = element('th', '', label);
    cell.scope = 'col';
    header.append(cell);
  }
  const body = table.createTBody();
  const bins = groups[0].bins;
  bins.forEach((_, index) => {
    const bin = element('div', 'histogram-bin');
    const lower = index * 10;
    const upper = lower + 10;
    const range = `${lower}–${upper === 100 ? '' : '<'}${upper}`;
    const row = body.insertRow();
    const heading = element('th', '', range);
    heading.scope = 'row';
    row.append(heading);
    groups.forEach((group, series) => {
      const value = `${numbers.format(group.bins[index])} · ${percent.format(share(group, index))}`;
      const bar = element('div', 'histogram-bar');
      bar.style.height = `${100 * share(group, index) / limit}%`;
      bar.style.backgroundColor = colors[series];
      bar.title = `${range} · ${group.label} · ${value}`;
      bin.append(bar);
      row.append(element('td', '', group.count ? value : '—'));
    });
    plot.append(bin);
  });

  const axis = element('div', 'histogram-axis');
  axis.setAttribute('aria-hidden', 'true');
  for (let score = 0; score <= 100; score += 10) {
    const tick = element('span', '', String(score));
    tick.style.left = `${score}%`;
    axis.append(tick);
  }
  figure.append(plot, axis, element('figcaption', 'histogram-caption', 'Ocena znaczenia konstytucji'));
  $('importance').replaceChildren(legend, figure);
  $('importance-table').replaceChildren(table);
}

function renderProfile(data) {
  comparison = data.comparison;
  for (const id of ['comparison-heading', 'comparison-panel', 'background-panel', 'importance-panel']) {
    $(id).hidden = !comparison;
  }
  if (!comparison) {
    $('demographics').replaceChildren(...data.demographics.map(d => renderDimension(d, data.completed)));
    $('demographics-more').parentElement.hidden = true;
    return;
  }
  $('demographics-more').parentElement.hidden = false;
  const select = $('comparison-metric');
  const selected = select.value;
  select.replaceChildren(...comparison.metrics.map(({ code, label }) => new Option(label, code)));
  if (comparison.metrics.some(({ code }) => code === selected)) select.value = selected;
  renderComparison();

  const featured = ['INCOMESUBJ', 'LAWBACKGROUND'];
  const background = ['EDUCATION', 'BIRTHCOUNTRY', 'PARENTSABROAD'];
  const cards = { demographics: [], 'demographics-background': [], 'demographics-more': [] };
  for (const dimension of data.demographics) {
    let target = 'demographics-more';
    if (featured.includes(dimension.code)) target = 'demographics';
    if (background.includes(dimension.code)) target = 'demographics-background';
    cards[target].push(renderDimension(dimension, data.completed));
  }
  for (const [id, nodes] of Object.entries(cards)) $(id).replaceChildren(...nodes);
  renderImportance(data.importance);
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
        renderProfile(data);
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
$('comparison-metric').addEventListener('change', renderComparison);
window.addEventListener('hashchange', load);
load();
setInterval(load, 120_000);
