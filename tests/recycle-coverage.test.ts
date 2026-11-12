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
import {AdminAudit} from '../src/models/AdminAudit';
import {recycleKinds,archivableKinds,canArchiveKind} from '../src/lib/admin/recycle-kinds';
import {recycleRegistry} from '../src/lib/admin/recycle';

// 1. The twelve schemas that carry deletedAt / deletedBy / purgeAt.
const participating=[['Editorial',Editorial],['Course',Course],['LearningMaterial',LearningMaterial],['MediaFile',MediaFile],['PortalNotice',PortalNotice],['FAQContent',FAQContent],['FacilityContent',FacilityContent],['AchievementRecord',AchievementRecord],['PracticeTest',PracticeTest],['PublicSheet',PublicSheet],['CenterClassGroup',CenterClassGroup],['CenterExam',CenterExam]] as const;
assert.equal(participating.length,12);
for(const [name,model] of participating){
  assert.ok((model.schema as any).path('deletedAt'),`${name} has deletedAt`);
  assert.ok((model.schema as any).path('purgeAt'),`${name} has purgeAt`);
}
assert.deepEqual(participating.map(([n])=>n).sort(),recycleRegistry.map(entry=>({editorial:'Editorial',course:'Course',material:'LearningMaterial',media:'MediaFile',portalNotice:'PortalNotice',faq:'FAQContent',facility:'FacilityContent',achievementRecord:'AchievementRecord',practiceTest:'PracticeTest',publicSheet:'PublicSheet',classGroup:'CenterClassGroup',centerExam:'CenterExam'}[entry.kind])).sort(),'the registry and the schemas are the same twelve types');

// 2. Financial, audit and student records are NOT auto-hidden: they have no deletedAt at all, so
//    the rule cannot touch them. Students keep their own removed status; payments are voided.
for(const [name,model] of [['CenterStudent',CenterStudent],['CenterPayment',CenterPayment],['CenterFeeWaiver',CenterFeeWaiver],['CenterActivityLog',CenterActivityLog],['AdminAudit',AdminAudit],['CenterSmsLog',CenterSmsLog],['CenterSmsBatch',CenterSmsBatch],['CenterDueSnapshot',CenterDueSnapshot],['CenterImportBatch',CenterImportBatch],['CenterWorkbookBatch',CenterWorkbookBatch],['CenterExamResult',CenterExamResult],['User',User]] as const){
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
for(const kind of ['editorial','course','faq','facility','achievementRecord','practiceTest','publicSheet'] as const){
  const def=recycleRegistry.find(entry=>entry.kind===kind)!;
  assert.equal(typeof def.publicPaths,'function',`${kind} revalidates its public routes`);
}
for(const kind of ['material','media','portalNotice','classGroup','centerExam'] as const){
  const def=recycleRegistry.find(entry=>entry.kind===kind)!;
  assert.equal(def.publicPaths,undefined,`${kind} has no public page to revalidate`);
}

// 5. The client-safe vocabulary matches the server registry, so the UI never offers an Archive
//    button for a kind that has no archive path.
assert.deepEqual([...recycleKinds],recycleRegistry.map(def=>def.kind),'recycleKinds lists exactly the registered kinds');
assert.deepEqual([...archivableKinds],recycleRegistry.filter(def=>def.archiveSet).map(def=>def.kind),'archivableKinds lists exactly the kinds with an archiveSet');
for(const kind of archivableKinds)assert.equal(canArchiveKind(kind),true,`${kind} can be archived`);
for(const kind of recycleKinds.filter(k=>!(archivableKinds as readonly string[]).includes(k)))assert.equal(canArchiveKind(kind),false,`${kind} has no archive path`);

console.log('Recycle coverage: 12 schemas carry the bin fields; 12 financial/audit/student types cannot be hidden; find/findOne/count/distinct/findOneAnd*/update*/delete*/aggregate/bulkWrite are covered; estimatedDocumentCount is the documented exception; public kinds revalidate their routes; the client kind lists match the registry.');
