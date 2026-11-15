/**
 * R6 slice 1 — stored codes to catalog paths. A payment row stores `exam_fee`; a screen reads a word in
 * the account's language. The map is literal on both sides so `tests/i18n-catalog.test.ts` can see every
 * path — a concatenated key is a key the test cannot check.
 */
export const TYPE_LABEL_KEYS:Record<string,string>={
  monthly:'types.monthly',
  admission:'types.admission',
  exam_fee:'types.examFee',
  other:'types.other',
};
export const typeLabelKey=(code:string)=>TYPE_LABEL_KEYS[code]||'types.other';

export const LEDGER_KIND_LABEL_KEYS:Record<string,string>={
  assessment:'statement.kinds.assessment',
  waiver:'statement.kinds.waiver',
  hold:'statement.kinds.hold',
  payment:'statement.kinds.payment',
  extra:'statement.kinds.extra',
};
export const ledgerKindLabelKey=(kind:string)=>LEDGER_KIND_LABEL_KEYS[kind]||'statement.kinds.extra';

export const STUDENT_STATUS_LABEL_KEYS:Record<string,string>={
  active:'statement.statuses.active',
  on_hold:'statement.statuses.onHold',
  removed:'statement.statuses.removed',
};
export const studentStatusLabelKey=(status:string)=>STUDENT_STATUS_LABEL_KEYS[status]||'statement.statuses.removed';
