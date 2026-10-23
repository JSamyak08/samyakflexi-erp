// Process stage names shared by the SFG form and the production-record updater.
// Printing (Pass 2) is the name that adds printing plain-setting scrap.

export const PROCESS_STAGES = [
  { id: 'LAMINATION_PASS_1', label: 'Lamination (Pass 1)' },
  { id: 'LAMINATION_PASS_2', label: 'Lamination (Pass 2)' },
  { id: 'SLITTING', label: 'Slitting & Rewinding' },
  { id: 'POUCHING', label: 'Pouching / Bag Making' },
  { id: 'DISPATCH_PACKING', label: 'Dispatch Packing' },
  { id: 'PRINTING_PASS_2', label: 'Printing (Pass 2)' },
  { id: 'QC_INSPECTION', label: 'QC Inspection & Rewinding' },
  { id: 'QC_HOLD', label: 'QC Hold Store' },
  { id: 'CUSTOM', label: 'Custom Stage' },
];

export const STAGE_LABEL = Object.fromEntries(PROCESS_STAGES.map(stage => [stage.id, stage.label]));

export function stageLabel(id) {
  return STAGE_LABEL[id] || '';
}
