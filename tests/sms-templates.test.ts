/**
 * R2 · SMS templates. Pure module, no database: proves the shipped Bangla defaults are byte-for-byte
 * the wording in docs/SPEC.md, and that variable substitution never silently invents a value.
 */
import assert from 'node:assert/strict';
import {SMS_TEMPLATE_DEFAULTS,SMS_VARIABLES,defaultTemplate,hasUnknownChip,isSmsTemplateKey,renderSmsTemplate,templateVariablesOf} from '../src/lib/center/sms-templates';

function run(){
  // 1. The exact bodies the owner's spec lists. A wording drift here changes what families read.
  const expected:Record<string,string>={
    payment_receipt:'ডিকশন কোচিং: {student_name} এর {month} মাসের {amount} টাকা পেয়েছি। রসিদ নং {receipt_no}। ধন্যবাদ।',
    due_reminder:'ডিকশন কোচিং: প্রিয় অভিভাবক, {student_name} এর {month} মাসের {due_amount} টাকা বকেয়া আছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন। যোগাযোগ: {institute_phone}',
    pending_reminder:'ডিকশন কোচিং: {student_name} এর {month} মাসের {amount} টাকা আগামী {due_date} তারিখের মধ্যে দিলে ভালো হয়। ধন্যবাদ।',
    visitor_thanks:'ডিকশন কোচিং-এ আসার জন্য ধন্যবাদ। ভর্তি সংক্রান্ত তথ্যের জন্য যোগাযোগ করুন: {institute_phone}',
    teacher_opening:'ডিকশন কোচিং: আমাদের {subject} বিষয়ে শিক্ষক প্রয়োজন। আগ্রহী হলে যোগাযোগ করুন: {institute_phone}',
  };
  for(const [key,body] of Object.entries(expected)){
    assert.equal(defaultTemplate(key)?.body,body,`the ${key} default must match the spec wording`);
  }

  // 2. Every chip the dialog offers is a real variable, and every default only uses known chips.
  assert.deepEqual([...SMS_VARIABLES],['student_name','class','month','due_amount','receipt_no','amount','due_date','institute_phone','subject']);
  for(const template of SMS_TEMPLATE_DEFAULTS){
    assert.equal(hasUnknownChip(template.body),false,`${template.key} must not contain an unknown chip`);
    for(const variable of template.variables)assert.ok(SMS_VARIABLES.includes(variable),`${template.key} lists an unknown variable`);
  }
  assert.ok(isSmsTemplateKey('due_reminder')&&!isSmsTemplateKey('nope'),'the key guard rejects invented keys');

  // 3. Substitution: known chips fill, empty values become empty, unknown chips stay visible.
  const rendered=renderSmsTemplate(defaultTemplate('due_reminder')!.body,{student_name:'রহিম',month:'মার্চ ২০২৬',due_amount:1200,institute_phone:'01711000000'});
  assert.equal(rendered,'ডিকশন কোচিং: প্রিয় অভিভাবক, রহিম এর মার্চ ২০২৬ মাসের 1200 টাকা বকেয়া আছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন। যোগাযোগ: 01711000000');
  assert.equal(renderSmsTemplate('{student_name} {receipt_no}',{student_name:'করিম',receipt_no:null}),'করিম ','a null value renders empty rather than the word null');
  assert.equal(renderSmsTemplate('{student_name} {bogus_chip}',{student_name:'করিম'}),'করিম {bogus_chip}','an unknown chip is left in place so the operator sees the typo');
  assert.equal(hasUnknownChip('{student_name} {bogus}'),true);

  // 4. Chips in first-appearance order, deduped, restricted to the known set.
  assert.deepEqual(templateVariablesOf('{month} {student_name} {month} {bogus}'),['month','student_name']);
  assert.deepEqual(templateVariablesOf('no chips here'),[]);

  // 5. Fee-relatedness drives the held-student rule, so it must be declared per template.
  assert.equal(defaultTemplate('due_reminder')!.feeRelated,true);
  assert.equal(defaultTemplate('payment_receipt')!.feeRelated,true);
  assert.equal(defaultTemplate('pending_reminder')!.feeRelated,true);
  assert.equal(defaultTemplate('visitor_thanks')!.feeRelated,false);
  assert.equal(defaultTemplate('teacher_opening')!.feeRelated,false);
  assert.equal(defaultTemplate('exam_result')!.feeRelated,false);

  // 6. Auto-send is offered for exactly three templates, and the spec ships every toggle OFF.
  assert.deepEqual(SMS_TEMPLATE_DEFAULTS.filter(t=>t.autoSendKey).map(t=>t.autoSendKey).sort(),['autoDue','autoReceipt','autoResult']);

  console.log('SMS templates: the five spec bodies match byte-for-byte, chips substitute without inventing values, an unknown chip stays visible, and fee-relatedness and auto-send keys are declared per template.');
}

run();
