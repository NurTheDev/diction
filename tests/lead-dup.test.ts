/**
 * R3.10 · Duplicate phones: the plan, with no database.
 *
 * A merge is the one write in this milestone that touches fields somebody else filled in, so its rules
 * are proven here on their own: a merge only FILLS, it MOVES every phone, note and flag the target does
 * not already hold, it keeps the target's family key and re-points the source's, and it refuses a source
 * that became an admission, a trial or a student. The sibling and separate keys are proven here too,
 * because "separate" must NOT echo the holder's key back — that echo is exactly how two unrelated
 * people sharing a shop's number would end up listed as one family.
 */
import assert from 'node:assert/strict';
import {keyForSeparate,keyForSibling,planLeadMerge,tieFamilyKeys,type LeadDupDoc} from '../src/lib/leads/lead-dup';
import {familyKeyFromPhones} from '../src/lib/leads/vocab';

const AT=new Date('2026-03-04T09:00:00Z');
function doc(over:Partial<LeadDupDoc>={}):LeadDupDoc{
  return {
    id:'64b0000000000000000000a1',leadId:'V-2026-0001',studentName:'রাহুল',
    guardianName:'',school:'',classLabel:'',classGroup:null,newSession:false,exam:null,examYear:null,
    interestedIn:'',phones:[],notes:[],flags:[],familyKey:null,converted:false,binned:false,...over,
  };
}

function run(){
  // 1. A merge only FILLS: what the target has stays, what it lacks is taken.
  const target=doc({guardianName:'মা',school:'',classGroup:null,classLabel:'',interestedIn:''});
  const source=doc({id:'64b0000000000000000000a2',leadId:'V-2026-0002',guardianName:'বাবা',school:'মডেল স্কুল',
    classLabel:'৯',classGroup:9,newSession:true,exam:'ssc',examYear:2027,interestedIn:'বিজ্ঞান'});
  const plan=planLeadMerge(target,source);
  assert.equal(plan.ok,true);
  if(plan.ok!==true)return;
  assert.equal(plan.fieldPatch.guardianName,undefined,'a guardian the target already has is not overwritten');
  assert.equal(plan.fieldPatch.school,'মডেল স্কুল','an empty school is filled from the source');
  assert.equal(plan.fieldPatch.classGroup,9,'and an empty class comes with its label and exam batch');
  assert.equal(plan.fieldPatch.classLabel,'৯');
  assert.equal(plan.fieldPatch.newSession,true);
  assert.equal(plan.fieldPatch.exam,'ssc');
  assert.equal(plan.fieldPatch.examYear,2027);
  assert.equal(plan.fieldPatch.interestedIn,'বিজ্ঞান');
  const filled=planLeadMerge(doc({school:'আগের স্কুল',classGroup:5,classLabel:'২'}),source);
  assert.equal(filled.ok,true);
  if(filled.ok===true){
    assert.deepEqual(Object.keys(filled.fieldPatch).filter(key=>key.startsWith('class')),[],'a class the target has is kept, even when the source knows a newer one');
    assert.equal(filled.fieldPatch.school,undefined,'and so is a school');
  }
  // A label with no group still travels when the target has neither.
  const labelOnly=planLeadMerge(doc({}),doc({id:'64b0000000000000000000a3',classLabel:'XI',classGroup:null}));
  assert.equal(labelOnly.ok,true);
  if(labelOnly.ok===true)assert.equal(labelOnly.fieldPatch.classLabel,'XI','a raw label with no group still fills an empty label');

  // 2. Phones move by NORMALIZED number; a shared spelling stays the target's.
  const withPhones=planLeadMerge(
    doc({phones:[{normalized:'01712817090',original:'01712817090'}]}),
    doc({id:'64b0000000000000000000a4',phones:[
      {normalized:'01712817090',original:'০৭১২৮১৭০৯০'},
      {normalized:'01811223344',original:'01811223344'},
    ]}),
  );
  assert.equal(withPhones.ok,true);
  if(withPhones.ok===true){
    assert.equal(withPhones.movedPhones,1,'the shared number is not added twice');
    assert.deepEqual(withPhones.phonesToAdd,[{normalized:'01811223344',original:'01811223344'}]);
    assert.ok(!withPhones.phonesToAdd.some(phone=>phone.original.includes('০')),'the target keeps its own spelling of a number it already holds');
  }

  // 3. Notes move whole, with their writers and their moments; flags move unless the target quotes the same cell.
  const note={at:AT,text:'কল করা হয়েছিল',outcome:'no_answer',by:'64b0000000000000000000b1'};
  const flag={field:'phones',code:'short',original:'0171281',messageBn:'ছোট',messageEn:'short',suggested:''};
  const moved=planLeadMerge(doc({flags:[flag]}),doc({id:'64b0000000000000000000a5',notes:[note],flags:[flag,{...flag,code:'two'}]}));
  assert.equal(moved.ok,true);
  if(moved.ok===true){
    assert.deepEqual(moved.notesToMove,[note],'every note moves, unwritten-by-nobody never happens');
    assert.equal(moved.movedNotes,1);
    assert.equal(moved.flagsToAdd.length,1,'a flag quoting the same raw cell is not doubled');
    assert.equal(moved.flagsToAdd[0].code,'two');
  }

  // 4. The family key: the target's key wins and the source's is re-pointed; a keyless target adopts;
  //    two keyless leads stay keyless.
  const keys=planLeadMerge(doc({familyKey:'fam:01712817090'}),doc({id:'64b0000000000000000000a6',familyKey:'fam:01611998877'}));
  assert.equal(keys.ok,true);
  if(keys.ok===true){
    assert.equal(keys.familyKey,'fam:01712817090','the surviving lead keeps its own key');
    assert.equal(keys.repointFrom,'fam:01611998877','and the source family is re-pointed to it');
    assert.equal(keys.repointTo,'fam:01712817090');
  }
  const adopts=planLeadMerge(doc({}),doc({id:'64b0000000000000000000a7',familyKey:'fam:01611998877'}));
  assert.equal(adopts.ok,true);
  if(adopts.ok===true){
    assert.equal(adopts.familyKey,'fam:01611998877','a target with no key adopts the source family instead of splitting it');
    assert.equal(adopts.repointFrom,null,'with nothing wearing a second key, nothing is re-pointed');
  }
  const none=planLeadMerge(doc({}),doc({id:'64b0000000000000000000a8'}));
  assert.equal(none.ok,true);
  if(none.ok===true)assert.equal(none.familyKey,null,'two leads with no key invent none');

  // 5. Refusals: a converted source, a binned either side, and a lead merged into itself.
  const converted=planLeadMerge(doc({}),doc({id:'64b0000000000000000000a9',converted:true}));
  assert.equal(converted.ok,false);
  if(converted.ok===false)assert.equal(converted.code,'SOURCE_CONVERTED','a lead that became an admission is refused by name, not by reference count');
  assert.equal(planLeadMerge(doc({binned:true}),doc({id:'64b0000000000000000000aa'})).ok,false,'a binned target is a missing target');
  assert.equal(planLeadMerge(doc({}),doc({id:'64b0000000000000000000ab',binned:true})).ok,false,'and so is a binned source');
  const same=doc({});
  const self=planLeadMerge(same,same);
  assert.equal(self.ok,false);
  if(self.ok===false)assert.equal(self.code,'SAME_LEAD');

  // 6. The three answers to the duplicate question, as keys.
  assert.equal(keyForSibling('fam:01712817090',['01611998877']),'fam:01712817090','a sibling inherits the holder key even though its own smallest number is smaller');
  assert.equal(keyForSibling(null,['01811223344','01712817090']),familyKeyFromPhones(['01811223344','01712817090']),'a holder with no key yet gets the computed one');
  assert.equal(keyForSeparate(['01712817090']),null,'separate means NO family key: computing one from the shared number would echo the holder family back');

  // 7. Tying two leads that stay two: the smaller key wins and the other is re-pointed; one key is
  //    adopted; no key anywhere is computed from the union of both leads' numbers.
  const tie=tieFamilyKeys(doc({familyKey:'fam:01811223344'}),doc({id:'64b0000000000000000000ac',familyKey:'fam:01611998877'}));
  assert.equal(tie.familyKey,'fam:01611998877');
  assert.equal(tie.repointFrom,'fam:01811223344');
  const one=tieFamilyKeys(doc({familyKey:'fam:01611998877'}),doc({id:'64b0000000000000000000ad'}));
  assert.equal(one.familyKey,'fam:01611998877');
  assert.equal(one.repointFrom,null);
  const neither=tieFamilyKeys(doc({phones:[{normalized:'01811223344',original:'01811223344'}]}),doc({id:'64b0000000000000000000ae',phones:[{normalized:'01712817090',original:'01712817090'}]}));
  assert.equal(neither.familyKey,'fam:01712817090','with no key on either side the union computes one, once, now');

  console.log('Duplicate-phone planning: a merge fills only what the target left empty and never overwrites a guardian, a school or a class; it moves every phone the target does not hold (matched on the normalized number, keeping the target spelling of a shared one), every note with its writer and its moment, and every flag the target does not already quote; it keeps the target family key and re-points the source family to it, adopts a key when the target has none and invents none when neither has one; it refuses a converted source by name and a binned lead on either side; a sibling inherits the holder key even against its own smallest number while "separate" carries no key at all; and tying two leads that stay two adopts the smaller of their keys and re-points the other.');
}

run();
