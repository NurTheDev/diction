import {Schema,model,models,type Model,Types} from 'mongoose';
import {addRecycleFields} from './recycle';
/* Namespaced model names avoid collisions with the existing portal Student, Exam and FeePayment models.
   No existing data is migrated or deleted merely by defining these schemas. */
const month={year:{type:Number,required:true,min:1900,max:2200,validate:Number.isSafeInteger},month:{type:Number,required:true,min:1,max:12,validate:Number.isSafeInteger}};
const ym=()=>new Schema(month,{_id:false});
const text={bn:{type:String,required:true,trim:true,maxlength:200},en:{type:String,default:'',trim:true,maxlength:200}};
const money={type:Number,required:true,min:0,max:100000000,validate:Number.isSafeInteger};
const ref=(name:string)=>({type:Schema.Types.ObjectId,ref:name,required:true});
const groupSchema=new Schema({name:text,level:{type:String,trim:true,maxlength:80,default:''},shift:{type:String,trim:true,maxlength:100,default:''},academicYear:{type:Number,required:true,min:1900,max:2200,validate:Number.isSafeInteger},active:{type:Boolean,default:true},order:{type:Number,default:0,min:0,max:10000,validate:Number.isSafeInteger}},{timestamps:true});addRecycleFields(groupSchema);
groupSchema.index({academicYear:1,active:1,order:1});
groupSchema.index({'name.bn':1,academicYear:1,shift:1},{unique:true});
const history=new Schema({effectiveFrom:{type:ym(),required:true},amount:money},{_id:false});
const hold=new Schema({start:{type:ym(),required:true},end:{type:ym(),default:undefined},reason:{type:String,required:true,trim:true,maxlength:500},recordedBy:ref('User'),endedBy:{type:Schema.Types.ObjectId,ref:'User'},createdAt:{type:Date,default:Date.now}},{_id:false});
const studentSchema=new Schema({revision:{type:Number,default:0,min:0,validate:Number.isSafeInteger},studentId:{type:String,required:true,unique:true,trim:true,maxlength:40},name:text,classGroup:ref('CenterClassGroup'),roll:{type:String,trim:true,maxlength:40,default:''},school:{type:String,trim:true,maxlength:160,default:''},guardianName:{type:String,default:'',trim:true,maxlength:120},guardianPhone:{type:String,default:'',match:/^(?:|01[3-9]\d{8})$/},studentPhone:{type:String,default:'',match:/^(?:|01[3-9]\d{8})$/},altPhone:{type:String,default:'',match:/^(?:|01[3-9]\d{8})$/},address:{type:String,default:'',trim:true,maxlength:500},photo:{type:String,default:'',maxlength:1000,validate:(v:string)=>!v||/^https:\/\/res\.cloudinary\.com\//.test(v)},admissionDate:{type:String,default:'',match:/^(?:|\d{4}-\d{2}-\d{2})$/},startMonth:{type:ym(),required:true},feeHistory:{type:[history],required:true,validate:(v:unknown[])=>v.length>0},classHistory:[{classGroup:ref('CenterClassGroup'),effectiveFrom:{type:ym(),required:true}}],holds:{type:[hold],default:[]},status:{type:String,enum:['active','on_hold','removed'],default:'active'},smsOptOut:{type:Boolean,default:false},notes:{type:String,default:'',trim:true,maxlength:3000},removal:{removedAt:Date,removedBy:{type:Schema.Types.ObjectId,ref:'User'},reason:String,leaveDate:String,purgeAt:Date},removalHistory:{type:[Schema.Types.Mixed],default:[]},importSource:{sheet:String,row:Number,fileHash:String,batch:{type:Schema.Types.ObjectId,ref:'CenterImportBatch'}}},{timestamps:true});
studentSchema.index({classGroup:1,status:1,'name.bn':1});studentSchema.index({guardianPhone:1});studentSchema.index({'name.bn':1});studentSchema.index({'name.en':1});studentSchema.index({'removal.purgeAt':1},{sparse:true});
const paymentSchema=new Schema({revision:{type:Number,default:0,min:0,validate:Number.isSafeInteger},student:ref('CenterStudent'),classGroupAtPayment:ref('CenterClassGroup'),type:{type:String,required:true,enum:['monthly','admission','exam_fee','other']},otherLabel:{type:String,default:'',trim:true,maxlength:100},academicYear:{type:Number,required:true,min:1900,max:2200,validate:Number.isSafeInteger},month:{type:Number,min:1,max:12,validate:Number.isSafeInteger,required:function(this:{type:string}){return this.type==='monthly'}},amount:{...money,min:1},receiptKey:{type:String,trim:true,maxlength:120},receiptNo:{type:String,trim:true,maxlength:120,required:function(this:{importSource?:{batch?:unknown;noReceiptReason?:string}}){return !(this.importSource?.batch&&this.importSource?.noReceiptReason)}},paidOn:{type:String,match:/^\d{4}-\d{2}-\d{2}$/,required:function(this:{importSource?:{batch?:unknown}}){return !this.importSource?.batch}},importSource:{batch:{type:Schema.Types.ObjectId,ref:'CenterImportBatch'},sheet:String,row:Number,noReceiptReason:{type:String,maxlength:500},dateUnknown:{type:Boolean,default:false},importedBy:{type:Schema.Types.ObjectId,ref:'User'}},receivedBy:{type:Schema.Types.ObjectId,ref:'User',required:function(this:{importSource?:{batch?:unknown}}){return !this.importSource?.batch}},note:{type:String,default:'',maxlength:2000},groupId:{type:String,required:true,maxlength:80},status:{type:String,enum:['valid','void'],default:'valid'},voidReason:String,voidedBy:{type:Schema.Types.ObjectId,ref:'User'},voidedAt:Date},{timestamps:true});
paymentSchema.index({student:1,academicYear:1,month:1,status:1});paymentSchema.index({receiptNo:1});paymentSchema.index({receiptKey:1});paymentSchema.index({paidOn:-1,status:1});paymentSchema.index({groupId:1});
const waiverSchema=new Schema({student:ref('CenterStudent'),year:{type:Number,required:true,min:1900,max:2200},month:{type:Number,required:true,min:1,max:12},reason:{type:String,required:true,trim:true,maxlength:500},status:{type:String,enum:['valid','void'],default:'valid'},importBatch:{type:Schema.Types.ObjectId,ref:'CenterWorkbookBatch'},voidReason:String},{timestamps:true});waiverSchema.index({student:1,year:1,month:1},{unique:true});
const subject=new Schema({name:text,fullMarks:{...money,min:1,max:10000},passMarks:{...money,max:10000}},{_id:true});
const examSchema=new Schema({requestId:{type:String,match:/^[a-f0-9-]{36}$/},createdBy:{type:Schema.Types.ObjectId,ref:'User'},gradeBands:[{min:{type:Number,min:0,max:100,required:true},label:{type:String,required:true,maxlength:20}}],name:text,type:{type:String,required:true,enum:['monthly','model_test','term','class_test','other']},date:{type:String,required:true,match:/^\d{4}-\d{2}-\d{2}$/},classGroups:[ref('CenterClassGroup')],subjects:[subject],status:{type:String,enum:['draft','published'],default:'draft'}},{timestamps:true});examSchema.index({classGroups:1,date:-1});examSchema.index({requestId:1},{unique:true,partialFilterExpression:{requestId:{$type:'string'}}});addRecycleFields(examSchema);
const resultSchema=new Schema({revision:{type:Number,default:0,min:0,validate:Number.isSafeInteger},exam:ref('CenterExam'),student:ref('CenterStudent'),classGroup:ref('CenterClassGroup'),marks:[{subject:Schema.Types.ObjectId,obtained:{type:Number,default:null},absent:{type:Boolean,default:false}}],total:{...money,default:0},fullTotal:{...money,default:0},percentage:{type:Number,min:0,max:100,default:0},grade:String,position:{type:Number,min:1},recordedBy:ref('User')},{timestamps:true});resultSchema.index({exam:1,student:1},{unique:true});resultSchema.index({student:1,createdAt:-1});
const gradingSchema=new Schema({name:{type:String,required:true,maxlength:100},ranges:[{min:{type:Number,min:0,max:100,required:true},max:{type:Number,min:0,max:100,required:true},grade:{type:String,required:true,maxlength:30},point:{type:Number,min:0,max:5,required:true}}],active:{type:Boolean,default:true}},{timestamps:true});
const templateSchema=new Schema({key:{type:String,required:true,unique:true,maxlength:80},name:{type:String,required:true,maxlength:120},body:{bn:{type:String,required:true,maxlength:2000}},variables:[String],active:{type:Boolean,default:true}},{timestamps:true});
const smsBatchSchema=new Schema({requestId:{type:String,match:/^[0-9a-f-]{36}$/},purpose:{type:String,required:true,enum:['payment_receipt','due_reminder','exam_result','visitor_thanks','teacher_opening','notice','custom']},createdBy:{type:Schema.Types.ObjectId,ref:'User'},trigger:{type:String,enum:['manual','auto_receipt','auto_due','auto_result'],default:'manual'},templateKey:String,audience:{type:String,enum:['guardian','student','both'],default:'guardian'},recipientCount:{...money,default:0},segmentCount:{...money,default:0},estimatedCost:{type:Number,min:0,default:0},sentCount:{...money,default:0},failedCount:{...money,default:0},skippedCount:{...money,default:0},status:{type:String,enum:['queued','sending','done','partial','failed'],default:'queued'},scheduledFor:Date,quiet:{type:Boolean,default:false}},{timestamps:true});smsBatchSchema.index({createdAt:-1});
// R2 idempotency: one batch per requestId, so a double-click or a refresh cannot send twice. The
// unique index is partial because pre-R2 batches and system-generated ones carry no requestId.
smsBatchSchema.index({requestId:1},{unique:true,partialFilterExpression:{requestId:{$type:'string'}}});
smsBatchSchema.index({status:1,scheduledFor:1});
// batch and student are CONTEXT, not required refs: a connection test to the operator's own number
// and a visitor/teacher message have neither, and the durable facts are the phone, the text, the
// segments and the cost. Real sends always set both (src/lib/center/sms-send.ts).
const smsLogSchema=new Schema({batch:{type:Schema.Types.ObjectId,ref:'CenterSmsBatch'},student:{type:Schema.Types.ObjectId,ref:'CenterStudent'},lead:{type:Schema.Types.ObjectId,ref:'Lead'},phone:{type:String,required:true},message:{type:String,required:true,maxlength:2000},segments:{type:Number,required:true,min:1},cost:{type:Number,min:0,default:0},templateKey:String,month:String,providerCode:String,providerMessage:String,status:{type:String,enum:['sent','failed','skipped','queued'],required:true},reason:String,sentAt:Date},{timestamps:true});smsLogSchema.index({student:1,createdAt:-1});smsLogSchema.index({batch:1,status:1});smsLogSchema.index({createdAt:1});
// R2: the 24-hour "same template/student/month was already sent" warning reads this index.
smsLogSchema.index({templateKey:1,student:1,month:1,createdAt:-1});
// R3.9: the same warning for a visitor send, which points at the lead and never at a student. One row
// carries one subject or the other, so a `ref:'CenterStudent'` field is never asked to hold a lead id —
// a reference that populates as null is a lie that only shows up in somebody's report.
smsLogSchema.index({templateKey:1,lead:1,month:1,createdAt:-1});

/**
 * An automatic send that did not go out. All three auto-sends are best-effort ON PURPOSE — a message
 * that cannot be sent must never turn a saved payment or a published result into an error for the
 * operator — which also means a failure has nowhere to surface unless it is stored. So it is stored
 * here, with the context needed to run it again, and the SMS page and Overview show it.
 *
 * `key` folds one repeating problem into one row (`attempts` counts the tries) instead of piling up a
 * row per payment, and its unique index is partial on `resolved:false`, so a problem that was fixed
 * can come back later as a new row. `createdBy` is deliberately absent: nobody asked for this.
 */
const smsAutoProblemSchema=new Schema({
  key:{type:String,required:true,maxlength:64},
  trigger:{type:String,required:true,enum:['auto_receipt','auto_due','auto_result']},
  /** The failure in the operator's own words — never a stack trace, never a credential. */
  messageBn:{type:String,required:true,maxlength:300},
  messageEn:{type:String,required:true,maxlength:300},
  /** A provider code or a short internal reason, for the technical reader. */
  code:{type:String,maxlength:40},
  /** Which receipt / class / exam this was, as one line the card can show. */
  who:{type:String,maxlength:200},
  /** JSON: exactly what retryAutoSmsProblem has to run again. */
  context:{type:String,required:true,maxlength:2000},
  batch:{type:Schema.Types.ObjectId,ref:'CenterSmsBatch'},
  student:{type:Schema.Types.ObjectId,ref:'CenterStudent'},
  classGroup:{type:Schema.Types.ObjectId,ref:'CenterClassGroup'},
  attempts:{type:Number,min:1,default:1},
  lastAttemptAt:Date,
  resolved:{type:Boolean,default:false},
  resolvedAt:Date,
  resolvedBy:{type:Schema.Types.ObjectId,ref:'User'},
},{timestamps:true});
smsAutoProblemSchema.index({resolved:1,createdAt:-1});
smsAutoProblemSchema.index({key:1},{unique:true,partialFilterExpression:{resolved:false}});
const snapshotSchema=new Schema({requestId:{type:String,match:/^[a-f0-9-]{36}$/},classGroup:{type:Schema.Types.ObjectId,ref:'CenterClassGroup'},month:{type:Number,required:true,min:1,max:12},year:{type:Number,required:true,min:1900,max:2200},takenAt:{type:Date,required:true},takenBy:ref('User'),rows:{type:[{student:ref('CenterStudent'),classGroup:ref('CenterClassGroup'),studentId:String,nameBn:String,amountDue:money,monthsDue:[Number],monthsDetail:[{year:Number,month:Number,amount:Number}]}],immutable:true}},{timestamps:true});snapshotSchema.index({year:1,month:1,takenAt:-1});snapshotSchema.index({requestId:1},{unique:true,partialFilterExpression:{requestId:{$type:'string'}}});snapshotSchema.index({classGroup:1,takenAt:-1});
// Application-level immutability; database administrators can still bypass Mongoose.
for(const operation of ['updateOne','updateMany','findOneAndUpdate','replaceOne','deleteOne','deleteMany','findOneAndDelete'] as const)snapshotSchema.pre(operation,function(){throw Error('SNAPSHOT_IMMUTABLE')});snapshotSchema.pre('save',function(){if(!this.isNew)throw Error('SNAPSHOT_IMMUTABLE')});snapshotSchema.pre('deleteOne',{document:true,query:false},function(){throw Error('SNAPSHOT_IMMUTABLE')});
const settingsSchema=new Schema({key:{type:String,default:'main',unique:true},dueDay:{type:Number,min:1,max:31,default:10},smsUnitCost:{type:Number,min:0,default:0},quietStart:{type:String,default:'21:00'},quietEnd:{type:String,default:'07:00'},autoReceipt:{type:Boolean,default:false},autoResult:{type:Boolean,default:false},autoDue:{type:Boolean,default:false},autoDueDay:{type:Number,min:1,max:31,default:10},disabledRoles:{type:[String],default:[]},institutePhone:{type:String,default:''},dailySmsLimitPerUser:{type:Number,min:0,default:30},purgeRetentionDays:{type:Number,min:1,default:365},logRetentionMonths:{type:Number,min:1,default:12}},{timestamps:true});
const cashBatchSchema=new Schema({requestId:{type:String,required:true,unique:true,match:/^[0-9a-f-]{36}$/},planHash:{type:String,required:true,match:/^[a-f0-9]{64}$/},student:ref('CenterStudent'),receiptNo:{type:String,required:true,maxlength:120},receiptKey:{type:String,required:true,maxlength:120},paidOn:{type:String,required:true},actor:ref('User'),paymentIds:[ref('CenterPayment')],status:{type:String,enum:['valid','void'],default:'valid'},voidReason:{type:String,maxlength:500},voidedBy:{type:Schema.Types.ObjectId,ref:'User'},voidedAt:Date},{timestamps:true});cashBatchSchema.index({student:1,createdAt:-1});cashBatchSchema.index({receiptKey:1});
const importLockSchema=new Schema({_id:{type:String,required:true,maxlength:100},revision:{type:Number,default:0}},{timestamps:true});
const importBatchSchema=new Schema({sourceKey:{type:String,required:true,match:/^[a-f0-9]{64}$/},planHash:{type:String,required:true,match:/^[a-f0-9]{64}$/},approvalId:{type:String,required:true,match:/^[a-f0-9]{32}$/},fileHash:{type:String,required:true,match:/^[a-f0-9]{64}$/},sheet:{type:String,required:true,maxlength:100},year:{type:Number,required:true},classGroup:ref('CenterClassGroup'),actor:ref('User'),active:{type:Boolean,default:true},status:{type:String,enum:['completed','undone'],required:true},items:[{row:Number,student:ref('CenterStudent'),studentRevision:Date,studentVersion:Number,evidence:Schema.Types.Mixed,identity:ref('CenterImportIdentity'),payments:[{payment:ref('CenterPayment'),revision:Date,version:Number}]}],undoReason:{type:String,maxlength:500},undoneBy:{type:Schema.Types.ObjectId,ref:'User'},undoneAt:Date},{timestamps:true});importBatchSchema.index({sourceKey:1},{unique:true,partialFilterExpression:{active:true}});importBatchSchema.index({createdAt:-1});importBatchSchema.index({approvalId:1,sourceKey:1});
const importIdentitySchema=new Schema({identityKey:{type:String,required:true},sourceRowKey:{type:String,required:true},student:ref('CenterStudent'),batch:ref('CenterImportBatch'),active:{type:Boolean,default:true}},{timestamps:true});importIdentitySchema.index({identityKey:1},{unique:true,partialFilterExpression:{active:true}});importIdentitySchema.index({sourceRowKey:1},{unique:true,partialFilterExpression:{active:true}});
const workbookBatchSchema=new Schema({approvalId:{type:String,required:true,match:/^[a-f0-9]{32}$/},fileHash:{type:String,required:true,match:/^[a-f0-9]{64}$/},planHash:{type:String,required:true,match:/^[a-f0-9]{64}$/},actor:ref('User'),status:{type:String,enum:['completed','undone'],required:true},active:{type:Boolean,default:true},report:{type:Schema.Types.Mixed,required:true},choices:{type:Schema.Types.Mixed,required:true},mapping:{type:Schema.Types.Mixed,required:true},items:{type:[Schema.Types.Mixed],default:[]},undoReason:String,undoneBy:{type:Schema.Types.ObjectId,ref:'User'},undoneAt:Date},{timestamps:true});workbookBatchSchema.index({fileHash:1},{unique:true,partialFilterExpression:{active:true}});workbookBatchSchema.index({createdAt:-1,_id:-1});
const legacyLinkSchema=new Schema({legacyStudent:{type:Schema.Types.ObjectId,ref:'Student',required:true},centerStudent:ref('CenterStudent'),linkedBy:ref('User'),confirmation:{type:String,required:true,maxlength:500}},{timestamps:true});
legacyLinkSchema.index({legacyStudent:1},{unique:true});legacyLinkSchema.index({centerStudent:1},{unique:true});
const activitySchema=new Schema({actor:ref('User'),action:{type:String,required:true,maxlength:100},target:{type:Schema.Types.ObjectId},before:{type:Schema.Types.Mixed},after:{type:Schema.Types.Mixed}},{timestamps:true});activitySchema.index({target:1,createdAt:-1});activitySchema.index({createdAt:1});
export const CenterClassGroup=models.CenterClassGroup||model('CenterClassGroup',groupSchema);
export const CenterStudent=models.CenterStudent||model('CenterStudent',studentSchema);
export const CenterPayment=models.CenterPayment||model('CenterPayment',paymentSchema);
export const CenterFeeWaiver=models.CenterFeeWaiver||model('CenterFeeWaiver',waiverSchema);
export const CenterExam=models.CenterExam||model('CenterExam',examSchema);
export const CenterExamResult=models.CenterExamResult||model('CenterExamResult',resultSchema);
export const CenterGradingScale=models.CenterGradingScale||model('CenterGradingScale',gradingSchema);
export const CenterSmsTemplate=models.CenterSmsTemplate||model('CenterSmsTemplate',templateSchema);
export const CenterSmsBatch=models.CenterSmsBatch||model('CenterSmsBatch',smsBatchSchema);
export const CenterSmsLog=models.CenterSmsLog||model('CenterSmsLog',smsLogSchema);
export const CenterSmsAutoProblem=models.CenterSmsAutoProblem||model('CenterSmsAutoProblem',smsAutoProblemSchema);
export const CenterDueSnapshot=models.CenterDueSnapshot||model('CenterDueSnapshot',snapshotSchema);
export const CenterSettings=models.CenterSettings||model('CenterSettings',settingsSchema);
export const CenterCashBatch=models.CenterCashBatch||model('CenterCashBatch',cashBatchSchema);
export const CenterImportLock=models.CenterImportLock||model('CenterImportLock',importLockSchema);
export const CenterImportBatch=models.CenterImportBatch||model('CenterImportBatch',importBatchSchema);
export const CenterImportIdentity=models.CenterImportIdentity||model('CenterImportIdentity',importIdentitySchema);
export const CenterWorkbookBatch=models.CenterWorkbookBatch||model('CenterWorkbookBatch',workbookBatchSchema);
export const CenterLegacyLink=models.CenterLegacyLink||model('CenterLegacyLink',legacyLinkSchema);
export const CenterActivityLog=models.CenterActivityLog||model('CenterActivityLog',activitySchema);
export type CenterId=Types.ObjectId;
