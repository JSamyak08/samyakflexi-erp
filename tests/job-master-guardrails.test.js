import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNKNOWN,
  JM_UNRESOLVED_LABEL,
  DEFAULT_GUARDRAIL_LIMITS,
  normalizeFilmType,
  densityForFilm,
  printingLayer,
  resolveJobMaster,
  expectedFilmKg,
  trimKgForWiderRoll,
  validateProductionEntry,
  decideGuardrailSave,
  dispatchReadyKg,
  netUsableForSave,
  rollSfgScrapIntoRecord,
  canOverrideFilmType,
  substrateMatchSummary,
  mergeGuardrailLimits
} from '../src/utils/jobMasterGuardrails.js';

const petJob = {
  id: 'JM-PET',
  skuCode: 'SKU-PET',
  jobName: 'Sugar 1kg',
  printWidthMm: 660,
  printWidthRecorded: true,
  wastagePct: 5,
  layers: [{ filmType: 'PET', micron: 12 }, { filmType: 'LDPE', micron: 40 }]
};

function baseEntry(overrides = {}) {
  return {
    orderId: 'ORD-1',
    jobMasterId: 'JM-PET',
    machineName: 'Press 1',
    operatorName: 'Asha',
    shift: 'Day',
    meters: 1000,
    durationMinutes: 10,
    ratedSpeedMpm: 250,
    ratedSpeedConfigured: true,
    printInputKg: 11.09,
    printedOutputKg: 11.5,
    printingScrapKg: 0.1,
    inputRolls: [{ filmType: 'PET Film', micron: 12, widthMm: 660, consumedKg: 11.09 }],
    orderQtyKg: 100,
    quantityKg: 11.5,
    goodKg: 11.5,
    scrapKg: 0.2,
    targetMeters: 900,
    ...overrides
  };
}

function run(entry, extra = {}) {
  return validateProductionEntry({
    context: extra.context || 'end-press',
    order: extra.order || { id: 'ORD-1', jobName: 'Sugar 1kg', orderQtyKg: 100 },
    jobMasters: extra.jobMasters || [petJob],
    entry,
    role: extra.role || 'Printing Operator'
  });
}

function rules(result, level) {
  const list = level === 'warn' ? result.warnings : level === 'film' ? result.filmTypeBlocks : result.blocks;
  return list.map((item) => item.rule);
}

test('film type normalisation treats PET Film as PET and leaves an unknown film without a density', () => {
  assert.equal(normalizeFilmType('PET Film'), 'PET');
  assert.equal(normalizeFilmType('Matte BOPP'), 'MATTEBOPP');
  assert.equal(normalizeFilmType('MATTEBOPP'), 'MATTEBOPP');
  assert.equal(densityForFilm('PET'), 1.40);
  assert.equal(densityForFilm('BOPP'), 0.91);
  assert.equal(densityForFilm('LDPE'), 0.93);
  assert.equal(densityForFilm('PE'), 0.93);
  assert.equal(densityForFilm('Mystery Film'), null);
  assert.equal(densityForFilm(''), null);
});

test('expected kg uses meters, millimetre width, micron and density', () => {
  const result = expectedFilmKg({ meters: 1000, widthMm: 1000, micron: 12, filmType: 'PET' });
  assert.equal(result.density, 1.40);
  assert.equal(result.kg, 16.8);
  assert.equal(expectedFilmKg({ meters: 1000, widthMm: 660, micron: 12, filmType: 'not-a-film' }).kg, null);
});

test('printing layer is layers[0] until a print role is set', () => {
  assert.equal(printingLayer(petJob).filmType, 'PET');
  assert.equal(printingLayer({ layers: [{ filmType: 'LDPE', micron: 40 }, { filmType: 'PET', micron: 12, role: 'print' }] }).filmType, 'PET');
});

test('Job Master resolution prefers id, then SKU, then one exact name', () => {
  const other = { ...petJob, id: 'JM-OTHER', skuCode: 'SKU-OTHER', jobName: 'Other' };
  const duplicateA = { id: 'JM-A', skuCode: 'SKU-A', jobName: 'Shared Name', printWidthMm: 500, layers: [{ filmType: 'BOPP', micron: 18 }] };
  const duplicateB = { id: 'JM-B', skuCode: 'SKU-B', jobName: 'Shared Name', printWidthMm: 700, layers: [{ filmType: 'PET', micron: 12 }] };
  const jobs = [other, petJob, duplicateA, duplicateB];

  assert.equal(resolveJobMaster({ order: { jobMasterId: 'JM-PET', jobName: 'Shared Name' }, jobMasters: jobs }).via, 'id');
  assert.equal(resolveJobMaster({ order: { skuCode: 'SKU-PET', jobName: 'Shared Name' }, jobMasters: jobs }).jobMaster.id, 'JM-PET');
  assert.equal(resolveJobMaster({ order: { jobCode: 'SKU-OTHER' }, jobMasters: jobs }).via, 'sku');
  assert.equal(resolveJobMaster({ order: { jobName: 'Sugar 1kg' }, jobMasters: jobs }).via, 'name');

  const ambiguous = resolveJobMaster({ order: { jobName: 'Shared Name' }, jobMasters: jobs });
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.jobMaster, null);
  assert.equal(ambiguous.message, JM_UNRESOLVED_LABEL);

  const missing = resolveJobMaster({ order: { jobName: 'No Such Job' }, jobMasters: jobs });
  assert.equal(missing.status, 'missing');
  assert.equal(missing.message, JM_UNRESOLVED_LABEL);

  const undefinedCode = resolveJobMaster({
    record: { jobCode: undefined, jobName: '' },
    jobMasters: jobs
  });
  assert.notEqual(undefinedCode.jobMaster, jobs[0]);
  assert.equal(undefinedCode.status, 'missing');
});

test('a matching end-press entry has no blocks or warnings', () => {
  const result = run(baseEntry());
  assert.deepEqual(rules(result, 'block'), []);
  assert.deepEqual(rules(result, 'film'), []);
  assert.deepEqual(rules(result, 'warn'), []);
  const decision = decideGuardrailSave(result, { role: 'Printing Operator' });
  assert.equal(decision.ok, true);
  assert.equal(decision.fields.jobMasterId, 'JM-PET');
  assert.equal(decision.fields.jobCode, 'SKU-PET');
  assert.equal(decision.fields.printFilmType, 'PET');
  assert.equal(decision.fields.printMicron, 12);
  assert.equal(decision.fields.printWidthMm, 660);
});

test('micron warn and block sit on either side of 0.5 and 2', () => {
  const warn = run(baseEntry({
    inputRolls: [{ filmType: 'PET', micron: 12.6, widthMm: 660, consumedKg: 16.8 }]
  }));
  assert.ok(rules(warn, 'warn').includes('micron'));
  assert.equal(rules(warn, 'block').includes('micron'), false);

  const atWarn = run(baseEntry({
    inputRolls: [{ filmType: 'PET', micron: 12.5, widthMm: 660, consumedKg: 16.8 }]
  }));
  assert.equal(rules(atWarn, 'warn').includes('micron'), false);

  const atBlock = run(baseEntry({
    inputRolls: [{ filmType: 'PET', micron: 14, widthMm: 660, consumedKg: 16.8 }]
  }));
  assert.equal(rules(atBlock, 'block').includes('micron'), false);
  assert.ok(rules(atBlock, 'warn').includes('micron'));

  const blocked = run(baseEntry({
    inputRolls: [{ filmType: 'PET', micron: 18, widthMm: 660, consumedKg: 16.8 }]
  }));
  assert.ok(rules(blocked, 'block').includes('micron'));

  const blank = run(baseEntry({
    inputRolls: [{ filmType: 'PET', micron: '', widthMm: 660, consumedKg: 16.8 }]
  }));
  assert.ok(rules(blank, 'block').includes('blank-roll'));
});

test('width blocks a narrower roll and warns when wider by more than 25 mm', () => {
  const narrow = run(baseEntry({
    inputRolls: [{ filmType: 'PET', micron: 12, widthMm: 510, consumedKg: 16.8 }]
  }));
  assert.ok(rules(narrow, 'block').includes('width'));

  const justWide = run(baseEntry({
    inputRolls: [{ filmType: 'PET', micron: 12, widthMm: 685, consumedKg: 16.8 }]
  }));
  assert.equal(rules(justWide, 'warn').includes('width'), false);

  const wide = run(baseEntry({
    inputRolls: [{ filmType: 'PET', micron: 12, widthMm: 700, consumedKg: 100 }]
  }));
  assert.ok(rules(wide, 'warn').includes('width'));
  const widthWarn = wide.warnings.find((item) => item.rule === 'width');
  assert.equal(widthWarn.trimKg, trimKgForWiderRoll({ inputKg: 100, inputWidthMm: 700, printWidthMm: 660 }));
  assert.ok(widthWarn.message.includes('kg'));

  const blank = run(baseEntry({
    inputRolls: [{ filmType: 'PET', micron: 12, widthMm: '', consumedKg: 16.8 }]
  }));
  assert.ok(rules(blank, 'block').includes('blank-roll'));
});

test('meters versus kg warns above 8 percent and blocks above 25 percent', () => {
  const expected = expectedFilmKg({ meters: 1000, widthMm: 660, micron: 12, filmType: 'PET' }).kg;
  const warnKg = roundAway(expected, DEFAULT_GUARDRAIL_LIMITS.metersKgWarnPct);
  const warn = run(baseEntry({
    printInputKg: warnKg,
    inputRolls: [{ filmType: 'PET', micron: 12, widthMm: 660, consumedKg: warnKg }]
  }));
  assert.ok(rules(warn, 'warn').includes('meters-kg'));
  assert.equal(rules(warn, 'block').includes('meters-kg'), false);

  const blockKg = roundAway(expected, DEFAULT_GUARDRAIL_LIMITS.metersKgBlockPct);
  const blocked = run(baseEntry({
    printInputKg: blockKg,
    inputRolls: [{ filmType: 'PET', micron: 12, widthMm: 660, consumedKg: blockKg }]
  }));
  assert.ok(rules(blocked, 'block').includes('meters-kg'));
});

test('press speed warns above rated speed, blocks above twice rated, and warns when rated speed is unset', () => {
  const above = run(baseEntry({ meters: 2600, durationMinutes: 10 }));
  assert.ok(rules(above, 'warn').includes('speed'));
  assert.equal(rules(above, 'block').includes('speed'), false);

  const atTwice = run(baseEntry({ meters: 5000, durationMinutes: 10 }));
  assert.equal(rules(atTwice, 'block').includes('speed'), false);

  const overTwice = run(baseEntry({ meters: 5001, durationMinutes: 10 }));
  assert.ok(rules(overTwice, 'block').includes('speed'));

  const unset = run(baseEntry({ ratedSpeedMpm: null, ratedSpeedConfigured: false, meters: 1000, durationMinutes: 10 }));
  assert.ok(unset.warnings.some((item) => item.rule === 'speed' && item.message.includes('not set')));
});

test('ink gain warns outside 0 to 4 g/m², blocks above 8, and blocks input lost with zero scrap', () => {
  const area = 1000 * (660 / 1000);
  const warnGsm = 4.1;
  const warnKg = (warnGsm * area) / 1000;
  const warn = run(baseEntry({
    meters: 1000,
    printInputKg: 100,
    printedOutputKg: 100 + warnKg,
    printingScrapKg: 0,
    inputRolls: [{ filmType: 'PET', micron: 12, widthMm: 660, consumedKg: 100 }]
  }));
  assert.ok(rules(warn, 'warn').includes('ink-gain'));

  const blockGsm = 8.1;
  const blockKg = (blockGsm * area) / 1000;
  const blocked = run(baseEntry({
    meters: 1000,
    printInputKg: 100,
    printedOutputKg: 100 + blockKg,
    printingScrapKg: 0,
    inputRolls: [{ filmType: 'PET', micron: 12, widthMm: 660, consumedKg: 100 }]
  }));
  assert.ok(rules(blocked, 'block').includes('ink-gain'));

  const lost = run(baseEntry({
    meters: 1000,
    printInputKg: 100,
    printedOutputKg: 98,
    printingScrapKg: 0,
    inputRolls: [{ filmType: 'PET', micron: 12, widthMm: 660, consumedKg: 100 }]
  }));
  assert.ok(rules(lost, 'block').includes('ink-gain'));

  const lostWithScrap = run(baseEntry({
    meters: 1000,
    printInputKg: 100,
    printedOutputKg: 98,
    printingScrapKg: 1,
    inputRolls: [{ filmType: 'PET', micron: 12, widthMm: 660, consumedKg: 100 }]
  }));
  assert.equal(rules(lostWithScrap, 'block').includes('ink-gain'), false);
  assert.ok(rules(lostWithScrap, 'warn').includes('ink-gain'));
});

test('lamination balance, order quantity and stage wastage use the approved boundaries', () => {
  const lamWarn = run(baseEntry({
    lamination: { printedKg: 100, substrateKg: 0, adhesiveKg: 0, outputKg: 104, scrapKg: 0 }
  }));
  assert.ok(rules(lamWarn, 'warn').includes('lamination'));
  assert.equal(rules(lamWarn, 'block').includes('lamination'), false);

  const lamBlock = run(baseEntry({
    lamination: { printedKg: 100, substrateKg: 0, adhesiveKg: 0, outputKg: 111, scrapKg: 0 }
  }));
  assert.ok(rules(lamBlock, 'block').includes('lamination'));

  const qtyWarn = run(baseEntry({ orderQtyKg: 100, quantityKg: 111 }));
  assert.ok(rules(qtyWarn, 'warn').includes('quantity'));
  const qtyAtLimit = run(baseEntry({ orderQtyKg: 100, quantityKg: 110 }));
  assert.equal(rules(qtyAtLimit, 'warn').includes('quantity'), false);
  const qtyBlock = run(baseEntry({ orderQtyKg: 100, quantityKg: 151 }));
  assert.ok(rules(qtyBlock, 'block').includes('quantity'));
  const qtyAtFactor = run(baseEntry({ orderQtyKg: 100, quantityKg: 150 }));
  assert.equal(rules(qtyAtFactor, 'block').includes('quantity'), false);

  const wasteWarn = run(baseEntry({ goodKg: 94, scrapKg: 6 }));
  assert.ok(rules(wasteWarn, 'warn').includes('wastage'));
  const wasteBlock = run(baseEntry({ goodKg: 69, scrapKg: 31 }));
  assert.ok(rules(wasteBlock, 'block').includes('wastage'));
  const wasteAtCeiling = run(baseEntry({ goodKg: 70, scrapKg: 30 }));
  assert.equal(rules(wasteAtCeiling, 'block').includes('wastage'), false);
});

test('negative values, a missing order, and an ambiguous name block the save', () => {
  const negative = run(baseEntry({ printedOutputKg: -1 }));
  assert.ok(rules(negative, 'block').includes('negative'));

  const noOrder = run(baseEntry({ orderId: '' }), { order: { id: '', jobName: 'Sugar 1kg' } });
  assert.ok(rules(noOrder, 'block').includes('order'));

  const ambiguous = run(baseEntry({ jobMasterId: '' }), {
    order: { id: 'ORD-1', jobName: 'Shared Name' },
    jobMasters: [
      { id: 'JM-A', skuCode: 'A', jobName: 'Shared Name', printWidthMm: 660, layers: [{ filmType: 'PET', micron: 12 }] },
      { id: 'JM-B', skuCode: 'B', jobName: 'Shared Name', printWidthMm: 660, layers: [{ filmType: 'PET', micron: 12 }] }
    ]
  });
  assert.ok(rules(ambiguous, 'block').includes('job-master'));
  const decision = decideGuardrailSave(ambiguous, { role: 'Admin', warningReason: 'noted', filmTypeOverrideReason: 'noted' });
  assert.equal(decision.ok, false);
  assert.match(decision.messages.join(' '), /not found \/ ambiguous/);
});

test('film type mismatch blocks unless a supervisor stores a reason, and warnings require a reason', () => {
  const mismatch = run(baseEntry({
    printInputKg: 7.21,
    printedOutputKg: 7.5,
    printingScrapKg: 0.05,
    quantityKg: 7.5,
    goodKg: 7.5,
    scrapKg: 0.1,
    inputRolls: [{ filmType: 'MATTEBOPP', micron: 12, widthMm: 660, consumedKg: 7.21 }]
  }));
  assert.ok(rules(mismatch, 'film').includes('film-type'));
  assert.equal(decideGuardrailSave(mismatch, { role: 'Printing Operator', filmTypeOverrideReason: 'ran the other film' }).ok, false);
  assert.equal(canOverrideFilmType('Production Manager'), true);

  const allowed = decideGuardrailSave(mismatch, {
    role: 'Plant Manager',
    filmTypeOverrideReason: 'Customer approved MATTEBOPP',
    overrideBy: 'Meera'
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.fields.filmTypeOverrideReason, 'Customer approved MATTEBOPP');
  assert.equal(allowed.fields.filmTypeOverrideBy, 'Meera');
  assert.equal(allowed.fields.printFilmType, 'PET');

  const short = run(baseEntry({ targetMeters: 1200 }));
  assert.ok(rules(short, 'warn').includes('meters-target'));
  assert.equal(decideGuardrailSave(short, { role: 'Printing Operator' }).ok, false);
  const withReason = decideGuardrailSave(short, { role: 'Printing Operator', warningReason: 'Customer stopped the run' });
  assert.equal(withReason.ok, true);
  assert.equal(withReason.fields.guardrailWarningReason, 'Customer stopped the run');
});

test('missing identity fields block and an unknown spec is not filled with PET or 12', () => {
  const missingIdentity = run(baseEntry({ machineName: '', operatorName: ' ', shift: '' }));
  assert.equal(rules(missingIdentity, 'block').filter((rule) => rule === 'identity').length, 3);

  const noWidth = {
    id: 'JM-NOW',
    skuCode: 'SKU-NOW',
    jobName: 'Bare',
    printWidthRecorded: false,
    printWidthMm: 1000,
    layers: [{ filmType: '', micron: null }]
  };
  const result = run(baseEntry({ jobMasterId: 'JM-NOW' }), {
    order: { id: 'ORD-1', jobName: 'Bare' },
    jobMasters: [noWidth]
  });
  assert.equal(result.spec.printWidthMm, null);
  assert.equal(result.spec.filmType, null);
  assert.equal(result.spec.micron, null);
  const summary = substrateMatchSummary({
    order: { id: 'ORD-1', jobName: 'Bare', jobMasterId: 'JM-NOW' },
    record: { inputRollsList: [{ filmType: 'PET', micron: 12, widthMm: 510, consumedWeightKg: 10 }] },
    jobMasters: [noWidth]
  });
  assert.match(summary.specLabel, /unknown/);
  assert.equal(summary.rows[0].status, 'fail');
  assert.equal(summary.rows[0].filmType, 'PET');
});

test('dispatch-ready kg ignores printing output and pouching pieces, and SFG scrap fills empty totals', () => {
  assert.equal(dispatchReadyKg({ qtyFirstPassL1: 400, totalProductionQtyKg: 400, printedOutputKg: 400 }), 0);
  assert.equal(dispatchReadyKg({ qtySlitting: 80, qtyPouchingPcs: 5000, printedOutputKg: 400 }), 80);
  assert.equal(dispatchReadyKg({ qtyPouching: 70, qtyPouchingPcs: 9000 }), 70);
  assert.equal(dispatchReadyKg({ qtyDispatch: 65, qtyPouching: 70 }), 65);
  assert.equal(netUsableForSave({
    deriveNetFromStages: true,
    printedOutputKg: 400,
    totalProductionQtyKg: 400,
    netUsableKg: 400
  }), 0);
  assert.equal(netUsableForSave({ netUsableKg: 80, printedOutputKg: 400 }), 80);

  const rolled = rollSfgScrapIntoRecord({
    printingWastageKg: 0,
    laminateWastageKg: 1,
    sfgConsumptions: [{ scrapBreakdown: { printingWastageKg: 8.6, laminateWastageKg: 4 } }]
  });
  assert.equal(rolled.printingWastageKg, 8.6);
  assert.equal(rolled.laminateWastageKg, 1);
  assert.equal(rolled.totalScrapQtyKg, 9.6);
});

test('limit overrides replace defaults without dropping the rest', () => {
  const limits = mergeGuardrailLimits({ micronBlock: 3, defaultRatedSpeedMpm: 180 });
  assert.equal(limits.micronBlock, 3);
  assert.equal(limits.defaultRatedSpeedMpm, 180);
  assert.equal(limits.metersKgWarnPct, 8);
});

function roundAway(expected, percent) {
  return Math.round((expected * (1 + (percent + 0.2) / 100)) * 100) / 100;
}
