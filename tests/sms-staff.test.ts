/**
 * R3.11 · The owner's two staff decisions, as rules with no database in them.
 *
 * A staff account may thank a visitor and may not do anything else with the SMS money: no other
 * source, no other template, no free text, no retry of somebody else's batch, and never a send that
 * was not ticked by hand. Those refusals live in one pure function because the button being hidden is
 * presentation and the server answering 403 is the rule — and a rule that needs a database to be read
 * is a rule nobody reads. The per-user daily ceiling is proven here for the same reason: its number,
 * its default when a settings row predates the field, and the Bangla sentence the operator gets when
 * it stops them are all arithmetic and wording, so all of it is checkable without a collection.
 */
import assert from 'node:assert/strict';
import {
  DAILY_LIMIT_ROLES,DEFAULT_DAILY_SMS_LIMIT,STAFF_SMS_SOURCES,STAFF_SMS_TEMPLATE,
  dailyLimitApplies,dailyLimitLine,dailyLimitReachedMessage,dailySmsLimitOf,smsSendPolicyRefusal,
} from '../src/lib/center/sms-staff';
import {SMS_TEMPLATE_DEFAULTS} from '../src/lib/center/sms-templates';
import {visitorTemplateFits} from '../src/lib/leads/lead-sms';

/** A refusal must be readable in the language the operator reads, and in both. */
function refusalOf(role:string,input:Record<string,unknown>,code:string){
  const refusal=smsSendPolicyRefusal(role,input);
  assert.ok(refusal,`${role} ${JSON.stringify(input)} must be refused`);
  assert.equal(refusal!.code,code);
  assert.ok(refusal!.messageBn.trim().length>10,'the Bangla sentence says what is not allowed');
  assert.ok(refusal!.messageEn.trim().length>10,'and the English one agrees');
  assert.ok(!/[{}]/.test(refusal!.messageBn),'no unrendered chip reaches an operator');
  return refusal!;
}

function run(){
  // 1. Admin and Super Admin keep everything the dialog has always offered — this is the half of the
  //    decision that is a NON-change, so it is asserted first and asserted loudly.
  for(const role of ['admin','superadmin']){
    assert.equal(smsSendPolicyRefusal(role,{mode:'send',source:'dues',templateKey:'due_reminder'}),null);
    assert.equal(smsSendPolicyRefusal(role,{mode:'send',source:'leads',templateKey:'custom',text:'নিজের লেখা বার্তা'}),null,'free text stays theirs');
    assert.equal(smsSendPolicyRefusal(role,{mode:'retry',batchId:'64b0000000000000000000a1'}),null,'retrying a failed batch stays theirs');
    assert.equal(smsSendPolicyRefusal(role,{mode:'send',source:'lead',id:'64b0000000000000000000a1',templateKey:STAFF_SMS_TEMPLATE}),null);
  }

  // 2. What a staff send may look like: the visitor source, the thank-you, and nothing riding along.
  assert.deepEqual([...STAFF_SMS_SOURCES],['lead','leads'],'one visitor or a selection of them');
  assert.equal(smsSendPolicyRefusal('staff',{mode:'send',source:'lead',id:'64b0000000000000000000a1',templateKey:STAFF_SMS_TEMPLATE}),null);
  assert.equal(smsSendPolicyRefusal('staff',{mode:'send',source:'leads',ids:['64b0000000000000000000a1'],templateKey:STAFF_SMS_TEMPLATE}),null);
  assert.equal(smsSendPolicyRefusal('staff',{mode:'preview',source:'leads',ids:['64b0000000000000000000a1'],templateKey:STAFF_SMS_TEMPLATE}),null,'counting recipients is not spending money');
  assert.equal(smsSendPolicyRefusal('staff',{source:'lead',id:'64b0000000000000000000a1',templateKey:STAFF_SMS_TEMPLATE,text:'   '}),null,'whitespace is not free text');

  // 3. Every other source is refused — the fee screens, the class screens, a receipt: staff never see
  //    a number that is not a visitor's, and never spend money on a dues reminder.
  for(const source of ['dues','class','student','students','receipt']){
    refusalOf('staff',{mode:'send',source,templateKey:STAFF_SMS_TEMPLATE},'STAFF_SOURCE');
  }

  // 4. Every other template is refused, INCLUDING no template at all: an unnamed template is the
  //    dialog's own "custom" path, which is the one thing this decision takes away.
  for(const templateKey of ['custom','due_reminder','payment_receipt','notice','']){
    refusalOf('staff',{mode:'send',source:'leads',ids:['64b0000000000000000000a1'],templateKey},'STAFF_TEMPLATE');
  }
  // And the thank-you's NAME cannot smuggle free text in: buildSmsPlan() honours any non-empty
  // customText and ignores the template, so a request that carries both is custom text in disguise.
  const smuggled=refusalOf('staff',{mode:'send',source:'lead',id:'64b0000000000000000000a1',templateKey:STAFF_SMS_TEMPLATE,text:'আপনার ছেলেকে টাকা পাঠান'},'STAFF_TEMPLATE');
  assert.ok(smuggled.messageBn.includes('ধন্যবাদ'),'the refusal names the one template they do have');

  // 5. Retrying a failed batch is an admin's job: it re-sends money somebody else already spent, and
  //    the row it reads was not ticked by the person pressing the button.
  refusalOf('staff',{mode:'retry',batchId:'64b0000000000000000000a1',source:'leads',templateKey:STAFF_SMS_TEMPLATE},'STAFF_RETRY');

  // 6. A role that was never given the SMS page at all is refused before any of the above is read, so
  //    the answer it gets is about its role and not about a template it may not send either.
  for(const role of ['content_editor','exam_manager','','student']){
    refusalOf(role,{mode:'send',source:'leads',ids:['64b0000000000000000000a1'],templateKey:STAFF_SMS_TEMPLATE},'ROLE');
  }

  // 7. The ceiling: 30 unless the centre wrote a number, 0 meaning the owner turned it off, and a
  //    nonsense value falling back to the default rather than to "unlimited".
  assert.equal(DEFAULT_DAILY_SMS_LIMIT,30);
  assert.equal(dailySmsLimitOf({}),30,'a settings row that predates the field gets the default');
  assert.equal(dailySmsLimitOf({dailySmsLimitPerUser:null}),30);
  assert.equal(dailySmsLimitOf({dailySmsLimitPerUser:12}),12);
  assert.equal(dailySmsLimitOf({dailySmsLimitPerUser:0}),0,'zero is the off switch, not a typo for thirty');
  assert.equal(dailySmsLimitOf({dailySmsLimitPerUser:-5}),30,'a negative ceiling cannot mean unlimited');
  assert.equal(dailySmsLimitOf({dailySmsLimitPerUser:7.9}),7,'a fraction of a message is not sent');
  assert.equal(dailySmsLimitOf({dailySmsLimitPerUser:Number.NaN}),30);

  // 8. Who the ceiling counts, and who it never does: an automatic send is the centre's own message,
  //    so a cron can never be stopped by one operator's allowance.
  assert.deepEqual([...DAILY_LIMIT_ROLES],['staff','admin','superadmin']);
  assert.equal(dailyLimitApplies('staff'),true);
  assert.equal(dailyLimitApplies('content_editor'),false);
  assert.equal(dailyLimitApplies(''),false,'no role means no operator, which means no allowance spent');

  // 9. The two sentences an operator reads, in the digits they read: what is left before a send, and
  //    the refusal when nothing is. Both carry the number, because "limit reached" without the limit
  //    is a message that cannot be argued with or planned around.
  assert.ok(dailyLimitLine(30,20,'bn').includes('৩০')&&dailyLimitLine(30,20,'bn').includes('২০'),'Bangla digits for a Bangla screen');
  assert.ok(dailyLimitLine(30,20,'en').includes('20')&&dailyLimitLine(30,20,'en').includes('30'));
  assert.ok(dailyLimitLine(30,0,'bn').includes('০'),'an exhausted allowance still says its number');
  const reachedBn=dailyLimitReachedMessage(30,'bn');
  assert.ok(reachedBn.includes('সীমা')&&reachedBn.includes('৩০'),'the Bangla refusal names the ceiling');
  assert.ok(reachedBn.includes('আগামীকাল'),'and says when it comes back');
  assert.ok(dailyLimitReachedMessage(30,'en').includes('30')&&/tomorrow/i.test(dailyLimitReachedMessage(30,'en')));

  // 10. The one template staff keep has to be one a visitor can actually fill, or the decision would
  //     hand them a button that skips everybody.
  const thanks=SMS_TEMPLATE_DEFAULTS.find(row=>row.key===STAFF_SMS_TEMPLATE);
  assert.ok(thanks,'visitor_thanks is in the shipped catalog');
  assert.equal(visitorTemplateFits(thanks!.variables),true,'its chips are all chips a visitor supplies');

  console.log('Staff SMS policy: admin and super admin keep every source, every template, free text and the retry of a failed batch; a staff send may name only a visitor or a selection of visitors and only the thank-you template, with no text riding along — so an unnamed template, a custom one and "the thank-you plus my own words" are all refused with a Bangla sentence that names the one template they do have; retrying and every fee or class source is refused; a role that never had the SMS page is refused as a role before anything else is read; the daily ceiling is 30 unless the centre wrote a number, 0 turns it off, a negative or fractional value falls back rather than meaning unlimited; it counts staff, admin and super admin and never an automatic send; and both of its sentences — what is left and the refusal — carry the number in the digits the operator reads.');
}

run();
