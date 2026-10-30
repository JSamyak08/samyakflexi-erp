import test from 'node:test';
import assert from 'node:assert/strict';

import { getLayerMetallocenePct, formatOcnFilmName } from '../src/utils/ocnAmendment.js';
import { isMetalloceneEligibleFilm } from '../src/factoryStore.js';

test('isMetalloceneEligibleFilm identifies metallocene films and Natural GP LD', () => {
  assert.equal(isMetalloceneEligibleFilm('Natural LD Metallocene Film'), true);
  assert.equal(isMetalloceneEligibleFilm('Milky LD Metallocene Film'), true);
  assert.equal(isMetalloceneEligibleFilm('NMET'), true);
  assert.equal(isMetalloceneEligibleFilm('MMET'), true);
  assert.equal(isMetalloceneEligibleFilm('Natural GP LD'), true);
  assert.equal(isMetalloceneEligibleFilm('PET'), false);
  assert.equal(isMetalloceneEligibleFilm('METPET'), false);
  assert.equal(isMetalloceneEligibleFilm('BOPP Natural'), false);
});

test('getLayerMetallocenePct extracts metallocene % from layer directly', () => {
  const layer = {
    filmType: 'Natural GP LD',
    micron: 35,
    metallocenePct: '5%'
  };

  const pct = getLayerMetallocenePct(layer, 0, {}, {});
  assert.equal(pct, '5%');
});

test('getLayerMetallocenePct formats bare numeric percentages with percent sign', () => {
  const layer = {
    filmType: 'Natural LD Metallocene Film',
    micron: 40,
    metallocenePct: '10'
  };

  const pct = getLayerMetallocenePct(layer, 0, {}, {});
  assert.equal(pct, '10%');
});

test('getLayerMetallocenePct falls back to ocn or calculationData layers', () => {
  const layerWithoutPct = {
    filmType: 'Natural GP LD',
    micron: 35
  };

  const ocn = {
    layers: [
      { filmType: 'PET', micron: 12 },
      { filmType: 'METPET', micron: 12 },
      { filmType: 'Natural GP LD', micron: 35, metallocenePct: '7%' }
    ]
  };

  const pct = getLayerMetallocenePct(layerWithoutPct, 2, {}, ocn);
  assert.equal(pct, '7%');
});

test('getLayerMetallocenePct resolves job-level metallocenePct for eligible films', () => {
  const ldLayer = {
    filmType: 'Natural GP LD',
    micron: 35
  };

  const ocnWithJobMetallocene = {
    metallocenePct: '5%'
  };

  const pct = getLayerMetallocenePct(ldLayer, 2, {}, ocnWithJobMetallocene);
  assert.equal(pct, '5%');

  const petLayer = {
    filmType: 'PET',
    micron: 12
  };
  const petPct = getLayerMetallocenePct(petLayer, 0, {}, ocnWithJobMetallocene);
  assert.equal(petPct, null, 'PET should not receive LD metallocene percentage');
});

test('formatOcnFilmName places metallocene percentage in front of the film description', () => {
  assert.equal(formatOcnFilmName('Natural GP LD', '5%'), 'Natural GP LD (5% Metallocene)');
  assert.equal(formatOcnFilmName('Natural LD Metallocene Film', '10%'), 'Natural LD Metallocene Film (10%)');
  assert.equal(formatOcnFilmName('PET', null), 'PET');
});
