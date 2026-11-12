/**
 * Written confirmation, as tests: which operations the auto-hide rule covers, which opt out on
 * purpose, and which record types are deliberately never hidden (owner request, 2026-11-12).
 */
import assert from 'node:assert/strict';
import {Editorial} from '../src/models/Editorial';
import {Course} from '../src/models/Course';
import {LearningMaterial} from '../src/models/LearningMaterial';
import {MediaFile} from '../src/models/MediaFile';
import {PortalNotice} from '../src/models/PortalNotice';
import {FAQContent,FacilityContent} from '../src/models/PublicContent';
import {AchievementRecord} from '../src/models/AchievementRecord';
import {PracticeTest} from '../src/models/PracticeTest';
import {PublicSheet} from '../src/models/PublicSheet';
import {CenterClassGroup,CenterExam,CenterStudent,CenterPayment,CenterFeeWaiver,CenterActivityLog,CenterSmsLog,CenterSmsBatch,CenterDueSnapshot,CenterImportBatch,CenterWorkbookBatch,CenterExamResult} from '../src/models/CenterRecords';
import {User} from '../src/models/User';
import {Admission,ContactMessage,Slot,TrialBooking} from '../src/models/Intake';
import {HeroBanner} from '../src/models/HeroBanner';
import {TeacherContent,SiteSettingsContent} from '../src/models/PublicContent';
import {Exam,Result,Attendance,Student as AcademicStudent} from '../src/models/Academic';
import {ModelTest,TestAttempt} from '../src/models/ModelTest';
import {AdminAudit} from '../src/models/AdminAudit';
import {recycleKinds,archivableKinds,canArchiveKind} from '../src/lib/admin/recycle-kinds';
import {recycleRegistry} from '../src/lib/admin/recycle';
import {kindSchema} from '../src/lib/admin/recycle-kinds';

// 1. The twenty-one schemas that carry deletedAt / deletedBy / purgeAt.
const participating=[['Editorial',Editorial],['Course',Course],['LearningMaterial',LearningMaterial],['MediaFile',MediaFile],['PortalNotice',PortalNotice],['FAQContent',FAQContent],['FacilityContent',FacilityContent],['AchievementRecord',AchievementRecord],['PracticeTest',PracticeTest],['PublicSheet',PublicSheet],['CenterClassGroup',CenterClassGroup],['CenterExam',CenterExam],['Admission',Admission],['Slot',Slot],['TrialBooking',TrialBooking],['ContactMessage',ContactMessage],['HeroBanner',HeroBanner],['TeacherContent',TeacherContent],['User',User],['Exam',Exam],['ModelTest',ModelTest]] as const;
assert.equal(participating.length,21);
for(const [name,model] of participating){
  assert.ok((model.schema as any).path('deletedAt'),`${name} has deletedAt`);
  assert.ok((model.schema as any).path('purgeAt'),`${name} has purgeAt`);
}
assert.deepEqual(participating.map(([n])=>n).sort(),recycleRegistry.map(entry=>({editorial:'Editorial',course:'Course',material:'LearningMaterial',media:'MediaFile',portalNotice:'PortalNotice',faq:'FAQContent',facility:'FacilityContent',achievementRecord:'AchievementRecord',practiceTest:'PracticeTest',publicSheet:'PublicSheet',classGroup:'CenterClassGroup',centerExam:'CenterExam',slot:'Slot',trialBooking:'TrialBooking',admission:'Admission',contactMessage:'ContactMessage',heroBanner:'HeroBanner',teacher:'TeacherContent',portalAccount:'User',exam:'Exam',modelTest:'ModelTest'}[entry.kind])).sort(),'the registry and the schemas are the same twenty-one types');

// 2. Financial, audit and student records are NOT auto-hidden: they have no deletedAt at all, so
//    the rule cannot touch them. Students keep their own removed status; payments are voided.
//    (Portal accounts — the User schema — joined the bin in the §E6 second wave, with staff-role
//    accounts reference-blocked; every other auth-adjacent or money-adjacent type stays outside.)
for(const [name,model] of [['CenterStudent',CenterStudent],['CenterPayment',CenterPayment],['CenterFeeWaiver',CenterFeeWaiver],['CenterActivityLog',CenterActivityLog],['AdminAudit',AdminAudit],['CenterSmsLog',CenterSmsLog],['CenterSmsBatch',CenterSmsBatch],['CenterDueSnapshot',CenterDueSnapshot],['CenterImportBatch',CenterImportBatch],['CenterWorkbookBatch',CenterWorkbookBatch],['CenterExamResult',CenterExamResult],['AcademicStudent',AcademicStudent],['Result',Result],['Attendance',Attendance],['TestAttempt',TestAttempt]] as const){
  assert.equal((model.schema as any).path('deletedAt'),undefined,`${name} must never be auto-hidden`);
}

// 3. Every query shape the rule covers, read off the registered middleware.
const pres=(Editorial.schema as any).s.hooks._pres as Map<string,unknown[]>;
for(const hook of ['find','findOne','countDocuments','distinct','findOneAndUpdate','findOneAndReplace','findOneAndDelete','updateOne','updateMany','deleteOne','deleteMany','aggregate','bulkWrite']){
  assert.ok(pres.has(hook),`auto-hide covers ${hook}`);
}
// Deliberately not covered: estimatedDocumentCount cannot carry a filter. Its only caller is the
// database-usage card, where counting stored rows (bin included) is the correct number.
assert.ok(!pres.has('estimatedDocumentCount'),'estimatedDocumentCount is intentionally unfiltered');
// populate needs no hook of its own: it runs a find on the referenced model, so the referenced
// model's hook hides binned documents (proved against a live database in recycle-bin.integration).

// 4. Public kinds know their routes, so delete/restore/purge can revalidate them.
for(const kind of ['editorial','course','faq','facility','achievementRecord','practiceTest','publicSheet','slot','heroBanner','teacher'] as const){
  const def=recycleRegistry.find(entry=>entry.kind===kind)!;
  assert.equal(typeof def.publicPaths,'function',`${kind} revalidates its public routes`);
}
for(const kind of ['material','media','portalNotice','classGroup','centerExam','trialBooking','admission','contactMessage','portalAccount','exam','modelTest'] as const){
  const def=recycleRegistry.find(entry=>entry.kind===kind)!;
  assert.equal(def.publicPaths,undefined,`${kind} has no public page to revalidate`);
}

// 5. The client-safe vocabulary matches the server registry, so the UI never offers an Archive
//    button for a kind that has no archive path.
assert.deepEqual([...recycleKinds],recycleRegistry.map(def=>def.kind),'recycleKinds lists exactly the registered kinds');
assert.deepEqual([...archivableKinds],recycleRegistry.filter(def=>def.archiveSet).map(def=>def.kind),'archivableKinds lists exactly the kinds with an archiveSet');

// 6. The server actions validate the kind against the shared vocabulary, not a hand-copied list.
//    The second wave first shipped with a twelve-kind enum in src/actions/recycle.ts, which answered
//    {status:'error'} to all nine new kinds; CI caught it on the slot flow. This is the guard.
for(const kind of recycleKinds)assert.ok(kindSchema.safeParse(kind).success,`the server actions accept ${kind}`);
assert.equal(kindSchema.safeParse('nope').success,false,'the server actions refuse an unknown kind');

// 7. Exempt types carry no auto-hide middleware at all, so every report, total and export over
//    them sees every row — the rule cannot filter what it has no hook on. The social-proof
//    milestones, which bin inside their document, carry the bin fields instead.
for(const [name,model] of [['CenterPayment',CenterPayment],['CenterStudent',CenterStudent],['AdminAudit',AdminAudit],['CenterSmsLog',CenterSmsLog]] as const){
  const pres=(model.schema as any).s.hooks._pres as Map<string,unknown[]>;
  for(const hook of ['find','findOne','countDocuments','aggregate','bulkWrite'])assert.ok(!pres.has(hook),`${name} must have no auto-hide ${hook} hook`);
}
const milestonePath=(SiteSettingsContent.schema as any).path('proof.milestones');
assert.ok(milestonePath?.schema?.path('deletedAt'),'milestones carry deletedAt');
assert.ok(milestonePath?.schema?.path('purgeAt'),'milestones carry purgeAt');
for(const kind of archivableKinds)assert.equal(canArchiveKind(kind),true,`${kind} can be archived`);
for(const kind of recycleKinds.filter(k=>!(archivableKinds as readonly string[]).includes(k)))assert.equal(canArchiveKind(kind),false,`${kind} has no archive path`);

console.log('Recycle coverage: 21 schemas carry the bin fields; 15 financial/audit/student types cannot be hidden; find/findOne/count/distinct/findOneAnd*/update*/delete*/aggregate/bulkWrite are covered; estimatedDocumentCount is the documented exception; public kinds revalidate their routes; the client kind lists match the registry.');
