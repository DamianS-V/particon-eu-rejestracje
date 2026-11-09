import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SURVEY_IDS, parseLimeSurveyJson, aggregate, confirmedHistoricalLabel, eventFromLabel } from '../scripts/aggregate.mjs';
import { seal, unseal } from '../scripts/crypto.mjs';

function allEmpty() { return Object.fromEntries(SURVEY_IDS.map(sid => [sid, { responses: [] }])); }
const record = (id, email, label, submitdate, extra = {}) => ({ id, EMAIL: email, CONFIRM: label, submitdate, ...extra });
const polishNov10 = '<p>10.11.2026, godz. 19:00&ndash;20:00 CET</p>';

test('obsługuje opakowany format JSON LimeSurvey', () => {
  assert.deepEqual(parseLimeSurveyJson({ responses: [{ '15': { id: '15', EMAIL: 'a@b.c' } }] }, '887516'), [{ id: '15', EMAIL: 'a@b.c' }]);
});

test('deduplikuje osoby między ankietami, ale zachowuje daty i seminaria', () => {
  const payload = allEmpty();
  payload['887516'] = { responses: [
    record('1', '  Ada@Example.Org ', polishNov10, '2026-11-09 08:00:00', { SOURCEFIRST: 'FB', ROLE: 'PRIV', 'SOURCEOTHER[IG]': 'Y' }),
    record('2', 'bea@example.org', '12 November 2026, 16:30–17:30 CET', '2026-11-09 09:00:00', { SOURCEFIRST: 'LI', ROLE: 'UNI' })
  ] };
  payload['798891'] = { responses: [record('3', 'ada@example.org', '10 November 2026, 19:00–20:00 CET', '2026-11-09 10:00:00', { SOURCEFIRST: 'IG' })] };
  payload['968655'] = { responses: [
    record('4', 'ADA@EXAMPLE.ORG', '17.11.2026, godz. 19:00–20:00 CET', '2026-11-10 12:00:00'),
    record('5', 'ada@example.org', polishNov10, '2026-11-09 11:00:00')
  ] };
  const result = aggregate(payload, new Date('2026-11-10T14:00:00.000Z'));
  assert.equal(result.metrics.uniquePersons, 2);
  assert.equal(result.metrics.registrations, 5);
  assert.equal(result.metrics.duplicateRegistrations, 3);
  assert.equal(result.metrics.unassignedRegistrations, 0);
  assert.equal(result.events.find(e => e.key === '2026-11-10T19:00|PL').registered, 1);
  assert.equal(result.events.find(e => e.key === '2026-11-10T19:00|PL').submissions, 3);
  assert.equal(result.events.find(e => e.key === '2026-11-17T19:00|PL').registered, 1);
  assert.equal(result.channels.find(c => c.code === 'FB').first, 1);
  assert.equal(result.channels.find(c => c.code === 'IG').first, 0);
  assert.equal(result.channels.find(c => c.code === 'IG').other, 1);
  assert.equal(result.daily.at(-1).newUnique, 0);
  assert.equal(result.daily.at(-2).newUnique, 2);
  assert.ok(!JSON.stringify(result).includes('example.org'), 'E-mail nie może znaleźć się w agregatach');
});

test('nie przypisuje terminu na podstawie samego kodu i zachowuje zgłoszenie w podsumowaniu', () => {
  const payload = allEmpty();
  payload['968655'] = { responses: [record('4', 'ada@example.org', 'NOV10', '2026-11-09 10:00:00')] };
  const result = aggregate(payload, new Date('2026-11-09T14:00:00Z'));
  assert.equal(result.metrics.uniquePersons, 1);
  assert.equal(result.metrics.unassignedRegistrations, 1);
  assert.ok(result.events.every(event => event.submissions === 0));
});

test('uwzględnia wcześniejszy termin z formularza anglojęzycznego', () => {
  const payload = allEmpty();
  payload['634562'] = { responses: [
    record('1', 'ada@example.org', '<p>3 November 2026, 17:00&ndash;18:30 CET</p>', '2026-11-02 09:00:00'),
    record('2', 'ada@example.org', '10.11.2026, godz. 18:00–19:00 CET', '2026-11-09 09:00:00')
  ] };
  const result = aggregate(payload, new Date('2026-11-09T14:00:00Z'));
  assert.equal(result.metrics.uniquePersons, 1);
  assert.equal(result.events.find(e => e.key === '2026-11-03T17:00|EN').registered, 1);
  assert.equal(result.events.find(e => e.key === '2026-11-10T18:00|EN').registered, 1);
});

test('odtwarza potwierdzoną etykietę NOV03 tylko przed rozpoczęciem pierwszego seminarium', () => {
  const row = { CONFIRM: 'NOV03', submitdate: '2026-11-03 16:59:59' };
  assert.equal(eventFromLabel(confirmedHistoricalLabel('634562', row)), '2026-11-03T17:00|EN');
  assert.equal(confirmedHistoricalLabel('634562', { ...row, submitdate: '2026-11-03 17:00:00' }), null);
  assert.equal(confirmedHistoricalLabel('634562', { ...row, CONFIRM: 'NOV10' }), null);
  assert.equal(confirmedHistoricalLabel('968655', row), null);
});

test('pomija wpis próbny tylko w formularzu wskazanym w wykluczeniu', () => {
  const payload = allEmpty();
  payload['968655'] = { responses: [record('2', 'test@example.org', 'NOV10', '2026-11-06 11:05:28')] };
  payload['634562'] = { responses: [record('2', 'ada@example.org', '3 November 2026, 17:00–18:30 CET', '2026-11-03 15:57:07')] };
  const result = aggregate(payload, new Date('2026-11-09T14:00:00Z'), new Set(['968655|2']));
  assert.equal(result.metrics.registrations, 1);
  assert.equal(result.metrics.uniquePersons, 1);
  assert.equal(result.metrics.unassignedRegistrations, 0);
  assert.equal(result.events.find(event => event.key === '2026-11-03T17:00|EN').registered, 1);
});

test('szyfrowanie AES-256-GCM odszyfrowuje się tylko prawidłowym kluczem', () => {
  const key = randomBytes(32);
  const summary = { metrics: { uniquePersons: 2 }, label: 'test' };
  const encrypted = seal(summary, key);
  assert.deepEqual(unseal(encrypted, key), summary);
  assert.throws(() => unseal(encrypted, randomBytes(32)));
  assert.ok(!JSON.stringify(encrypted).includes('uniquePersons'));
});
