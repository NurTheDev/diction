/**
 * R3.9 · Visitor leads as the SMS pipeline sees them. Pure module, no database.
 *
 * The send engine was built for students in R2 and is deliberately unchanged: what a lead entry point
 * adds is one translation (`leadCandidates`), one narrowed catalog (`visitorTemplateFits`) and one count
 * the screen says out loud (`leadSmsTally`). This suite proves that translation from both ends — the lead
 * side and the pipeline side — because the failure it exists to prevent is a visitor being texted who
 * asked not to be, or a send that quietly covers fewer people than the operator picked.
 */
import assert from 'node:assert/strict';
import {SMS_SKIP_LABEL_KEYS,resolveRecipients} from '../src/lib/center/sms-recipients';
import bn from '../src/messages/bn.json';
const catalogValue=(catalog:Record<string,unknown>,dotted:string):string=>dotted.split('.').reduce<unknown>((node,part)=>((node||{}) as Record<string,unknown>)[part],catalog) as string;
const skipLabel=(reason:keyof typeof SMS_SKIP_LABEL_KEYS):string=>catalogValue(bn,`sms.${SMS_SKIP_LABEL_KEYS[reason]}`);
import {SMS_TEMPLATE_DEFAULTS,SMS_VARIABLES,defaultTemplate,hasUnknownChip,renderSmsTemplate} from '../src/lib/center/sms-templates';
import {VISITOR_SMS_CHIPS,leadCandidates,leadSmsTally,visitorTemplateFits} from '../src/lib/leads/lead-sms';
import type {LeadSmsRow} from '../src/lib/leads/leads';

const PHONE='01712817090';
const OTHER='01811223344';

function row(over:Partial<LeadSmsRow>={}):LeadSmsRow{
  return {id:'64b0000000000000000000a1',leadId:'V-2026-0001',studentName:'রাহুল',phone:PHONE,contactable:true,status:'new',...over};
}

/** The way a Visitors screen asks the pipeline for recipients. */
function resolve(rows:LeadSmsRow[],onePerPhone=false){
  return resolveRecipients(leadCandidates(rows),{audience:'guardian',feeMessage:false,onePerPhone,globalValues:{institute_phone:'01711000000'}});
}

function run(){
  // 1. The translation: a lead becomes a candidate that is always `active`, carries ONE number and no
  //    per-lead chips — and its "do not contact" mark becomes the pipeline's own opt-out switch, so the
  //    exclusion is decided by the rule the R2 recipient resolver already enforces, not by a new one.
  const [candidate]=leadCandidates([row()]);
  assert.equal(candidate.id,'64b0000000000000000000a1','the candidate carries the lead id, never a made-up student id');
  assert.equal(candidate.nameBn,'রাহুল');
  assert.equal(candidate.status,'active','a visitor is never given a student fee state');
  assert.equal(candidate.guardianPhone,PHONE,'the first number on the sheet is the one number a lead has');
  assert.equal(candidate.studentPhone,'','a lead has no second number to offer');
  assert.equal(candidate.altPhone,'','so a thank-you can never go out twice to one family');
  assert.deepEqual(candidate.holds,[],'no fee holds exist for somebody who was never enrolled');
  assert.deepEqual(candidate.values,{},'no chip is invented for a lead');
  assert.equal(candidate.smsOptOut,false);
  assert.equal(leadCandidates([row({contactable:false})])[0].smsOptOut,true,'"do not contact" becomes the opt-out switch');

  // 2. Exclusion, through the pipeline rather than around it: a blocked lead and a lead with no number
  //    produce NO recipient and each carries its own reason, which the dialog prints by name.
  const mixed=resolve([row(),row({id:'64b0000000000000000000a2',studentName:'বাদ পড়া',contactable:false,status:'do_not_contact'}),row({id:'64b0000000000000000000a3',studentName:'নাম্বারহীন',phone:''})]);
  assert.equal(mixed.recipients.length,1,'only the contactable lead with a number is sent to');
  assert.equal(mixed.recipients[0].phone,PHONE);
  const reasons=mixed.skipped.map(skip=>[skip.studentName,skip.reason]);
  assert.deepEqual(reasons,[['বাদ পড়া','opted_out'],['নাম্বারহীন','missing_phone']],'each exclusion names the visitor and the reason');
  assert.ok(skipLabel('opted_out').includes('যোগাযোগ করবেন না'),`the operator reads the lead's own rule in the skip label, got ${skipLabel('opted_out')}`);
  assert.ok(skipLabel('missing_phone').trim()&&catalogValue(bn,'sms.skip.missing_phone').trim());

  // 3. A fee rule cannot reach a visitor. `visitor_thanks` is not fee-related, but even if a caller
  //    claimed it was, a lead has no holds and no `removed` state to be dropped by.
  const asFee=resolveRecipients(leadCandidates([row()]),{audience:'guardian',feeMessage:true,globalValues:{institute_phone:'01711000000'}});
  assert.equal(asFee.recipients.length,1,'no fee rule can exclude a visitor');
  assert.deepEqual(asFee.skipped,[]);
  assert.ok(!leadCandidates([row()]).some(c=>c.status==='removed'||c.status==='on_hold'));

  // 4. Two leads sharing one number: one message when the operator asked for one per number, two when
  //    they did not — and grouping a pair of visitors is never refused, because a refusal exists for
  //    ambiguous amounts and classes, and a thank-you has neither.
  const shared=[row(),row({id:'64b0000000000000000000a4',leadId:'V-2026-0002',studentName:'রাহুলের বোন'})];
  const grouped=resolve(shared,true);
  assert.equal(grouped.recipients.length,1,'one number, one message');
  assert.equal(grouped.recipients[0].studentIds.length,2,'and it covers both visitors');
  assert.equal(grouped.recipients[0].grouped,true);
  assert.deepEqual(grouped.groupingRefused,[],'grouping visitors is never ambiguous');
  assert.equal(resolve(shared,false).recipients.length,2,'without the tick the same number is texted twice — which is why the tick exists');

  // 5. The catalog a Visitors screen offers: only templates whose chips a lead can fill. Everything else
  //    could only end in the dialog's own "a value did not render" refusal, after the operator had
  //    already picked people and read a preview.
  assert.deepEqual([...VISITOR_SMS_CHIPS],['institute_phone','subject']);
  for(const chip of VISITOR_SMS_CHIPS){
    assert.ok((SMS_VARIABLES as readonly string[]).includes(chip),`${chip} must be a real chip`);
    assert.ok(!['student_name','class','month','due_amount','amount','receipt_no','due_date'].includes(chip),`${chip} is per-student and a lead cannot fill it`);
  }
  const fits=(key:string):boolean=>visitorTemplateFits(defaultTemplate(key)?.variables||[]);
  assert.equal(fits('visitor_thanks'),true,'the spec’s visitor template is always offered');
  assert.equal(fits('custom'),true,'an operator’s own words need no chip');
  assert.equal(fits('notice'),true);
  assert.equal(fits('teacher_opening'),true);
  assert.equal(fits('due_reminder'),false,'a due reminder to somebody who owes nothing is not offered');
  assert.equal(fits('payment_receipt'),false);
  assert.equal(fits('pending_reminder'),false);
  assert.equal(fits('exam_result'),false);
  const offered=SMS_TEMPLATE_DEFAULTS.filter(template=>visitorTemplateFits(template.variables)).map(template=>template.key);
  assert.ok(offered.includes('visitor_thanks')&&!offered.includes('due_reminder'),`the narrowed catalog is ${offered.join(',')}`);
  assert.equal(visitorTemplateFits([]),true,'a template with no chips fits');
  assert.equal(visitorTemplateFits(['bogus_chip' as never]),false,'an unknown chip is not waved through');

  // 6. The default visitor body renders with the center's own number and leaves no chip behind — the one
  //    value it needs is a global, so no lead has to supply anything for the message to be complete.
  const thanks=defaultTemplate('visitor_thanks');
  assert.ok(thanks,'visitor_thanks ships as a default');
  assert.equal(thanks!.feeRelated,false,'a thank-you is not a fee message');
  assert.equal(thanks!.purpose,'visitor_thanks','and it is the batch purpose the log stores');
  const rendered=renderSmsTemplate(thanks!.body,{institute_phone:'01711000000'});
  assert.ok(rendered.includes('01711000000'),'the center number is substituted');
  assert.ok(!rendered.includes('{'),'nothing is left unrendered');
  assert.equal(hasUnknownChip(rendered),false);

  // 7. The tally a screen prints before anybody presses send: blocked is counted apart from phoneless,
  //    because one is a promise made to a person and the other is a gap somebody can still fill in.
  const tally=leadSmsTally([
    {contactable:true,hasPhone:true},{contactable:true,hasPhone:true},
    {contactable:false,hasPhone:true},{contactable:false,hasPhone:false},
    {contactable:true,hasPhone:false},
  ]);
  assert.deepEqual(tally,{sendable:2,blocked:2,withoutPhone:1},'a blocked lead is never also counted as phoneless');
  assert.deepEqual(leadSmsTally([]),{sendable:0,blocked:0,withoutPhone:0});
  assert.equal(leadSmsTally([{contactable:true,hasPhone:true}]).sendable+leadSmsTally([{contactable:false,hasPhone:true}]).blocked,2,'the three counts add up to the rows on screen');

  // 8. An empty selection resolves to nobody rather than to everybody — the shape every entry point in
  //    this pipeline refuses the same way.
  assert.deepEqual(leadCandidates([]),[]);
  assert.equal(resolve([]).recipients.length,0);
  assert.equal(resolve([row({phone:OTHER})]).recipients[0].phone,OTHER,'a different lead is reached on its own number');

  console.log('Visitor SMS rules: a lead becomes a candidate that is always active, carries one number and no invented chips, its “do not contact” mark becomes the pipeline’s own opt-out so a blocked visitor is skipped by name with the reason printed in Bangla, a lead with no number is reported rather than dropped, no fee rule can exclude a visitor, two leads on one number are one message when the operator asks and never an ambiguous grouping, the catalog offered to a Visitors screen is only the templates a lead can actually fill (visitor_thanks among them, due reminders not) and its body renders with the center’s own number leaving no chip behind, blocked and phoneless are counted apart and add up to the rows on screen, and an empty selection resolves to nobody.');
}

run();
