import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateSurvey, SURVEY_EXPORT_FIELDS } from '../scripts/survey.mjs';

const response = {
  submitdate: '2026-11-21 10:00:00',
  SCREENOUT: '0', AGEOUT: '0', COUNTRYOUT: '0',
  RESCOUNTRY: 'PL', SETTLEMENT: 'P1K', NUTS2: 'PL91',
  AGEGROUP: 1, GENDER: 'F', EMPLOYMENT: 'EMP'
};

test('stosuje kryteria kwalifikacji i wspólne kategorie metryczki ankiety', () => {
  const summary = aggregateSurvey({ responses: [
    { id: 1, ...response },
    { id: 2, ...response, RESCOUNTRY: 'IT', SETTLEMENT: 'P1K5K', NUTS2: 'ITI4' },
    { id: 3, ...response, RESCOUNTRY: 'FR', SETTLEMENT: 'wpis lokalny', NUTS2: 'FRF1' },
    { id: 4, ...response, SETTLEMENT: '', NUTS2: 'PL92' },
    { id: 5, ...response, submitdate: 'N', SETTLEMENT: 'P500K' },
    { id: 6, ...response, submitdate: null, AGEOUT: 1 },
    { id: 7, ...response, COUNTRYOUT: '1', RESCOUNTRY: 'OTHER' },
    { id: 8, ...response, submitdate: null, SCREENOUT: '1' }
  ] });
  assert.equal(summary.completed, 4);
  assert.equal(summary.incomplete, 1);
  assert.equal(summary.screenedOut, 3);
  const byLabel = Object.fromEntries(summary.demographics.map(dimension => [dimension.label, dimension]));
  assert.deepEqual(byLabel['Kraj zamieszkania'].groups, [
    { label: 'Polska', count: 2 }, { label: 'Włochy', count: 1 }, { label: 'Francja', count: 1 }
  ]);
  assert.deepEqual(byLabel['Wielkość miejscowości'].groups, [
    { label: 'Poniżej 5 tys. mieszkańców', count: 2 }
  ]);
  assert.equal(byLabel['Wielkość miejscowości'].missing, 1);
  assert.equal(byLabel['Wielkość miejscowości'].unmapped, 1);
  assert.deepEqual(byLabel['Region zamieszkania'].groups, [
    { label: 'Region obejmujący stolicę kraju', count: 2 },
    { label: 'Pozostałe regiony', count: 2 }
  ]);
  assert.deepEqual(byLabel['Grupa wieku'].groups, [{ label: '18–24', count: 4 }]);
  assert.ok(!JSON.stringify(summary).includes('wpis lokalny'));
});

test('pusty eksport ma zerowe liczniki, a eksport bez kolumn sygnalizuje błąd', () => {
  assert.equal(aggregateSurvey({ responses: [] }).completed, 0);
  assert.throws(() => aggregateSurvey({ responses: [{ id: 1, submitdate: '' }] }), /wymaganych kolumn/);
  assert.deepEqual(SURVEY_EXPORT_FIELDS.slice(0, 2), ['id', 'submitdate']);
  assert.equal(new Set(SURVEY_EXPORT_FIELDS).size, 11);
});
