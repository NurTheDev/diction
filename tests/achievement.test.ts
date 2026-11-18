import assert from 'node:assert/strict';
import {achievementSchema} from '../src/schemas/achievement';
import {Achievement} from '../src/models/Achievement';
const record={title:{bn:'প্রথম স্থান',en:'First place'},caption:{bn:'অভিনন্দন',en:'Congratulations'},studentName:{bn:'নমুনা নাম',en:'Sample Name'},className:'৮',batch:'',subject:'',rank:'1st' as const,prizeType:'',achievementDate:'2026-01-01',originalPhoto:{url:'https://res.cloudinary.com/example/image/upload/example.jpg',publicId:'sample'},cardImage:'https://example.test/card.png',ogImage:'https://example.test/og.png',template:'champion' as const,aspectRatio:'1:1' as const,slug:'sample',status:'published' as const,featured:false,order:0,consent:{parentConsent:false,consentNote:''},firstNameOnly:false,shareCount:0,facebookPostId:''};
assert(!achievementSchema.safeParse(record).success);assert(achievementSchema.safeParse({...record,status:'draft'}).success);assert(achievementSchema.safeParse({...record,consent:{...record.consent,parentConsent:true}}).success);assert(!achievementSchema.safeParse({...record,achievementDate:'2026-02-31'}).success);assert(!achievementSchema.safeParse({...record,caption:{...record.caption,bn:'ক'.repeat(201)}}).success);const d=new Achievement({...record,createdBy:'507f1f77bcf86cd799439011'});d.validate().then(()=>{throw new Error('Model accepted publication without consent')},e=>{assert(e.errors['consent.parentConsent']);console.log('Achievement validation and model consent guard passed.')});
import {achievementDateBn} from '../src/lib/achievement-date';
import {monthNames,type MonthTable} from '../src/lib/admin/months';
import bnCatalog from '../src/messages/bn.json';
/* F-18: the month on the card is a word from the catalog, and the card reads its words from the
   provider it is under rather than importing the catalog itself (a client component that imported it
   would ship all four thousand sentences to the browser). So this test reads the same file the
   provider ships and hands the formatter the same twelve words. */
const MONTHS=monthNames(bnCatalog.common.months as MonthTable);
assert.equal(achievementDateBn('2026-01-01',MONTHS),'১ জানুয়ারি ২০২৬');
assert.equal(achievementDateBn('2026-02-31',MONTHS),'');
(async()=>{
 const id='507f1f77bcf86cd799439011';
 for(const op of [()=>Achievement.updateOne({_id:id},{$set:{status:'published'}}),()=>Achievement.updateMany({},{$set:{'consent.parentConsent':false}}),()=>Achievement.findOneAndUpdate({_id:id},{$set:{status:'published'}}),()=>Achievement.replaceOne({_id:id},{}),()=>Achievement.findOneAndReplace({_id:id},{}),()=>Achievement.bulkWrite([{updateOne:{filter:{_id:id},update:{$set:{status:'published'}}}}])]){
  await assert.rejects(Promise.resolve(op()),/query updates are disabled/);
 }
 console.log('Unsafe achievement query and bulk writes fail closed.');
})().catch(e=>{console.error(e);process.exitCode=1});
