import {model,models,Schema,type Types} from 'mongoose';

/**
 * R4 · Teacher CV import — the register of whole-file imports.
 *
 * The CVs themselves carry `importSource` and `importBatch`, but a batch that was undone would vanish
 * from a history derived from CVs, and "undo the last import" has to know which batch is the last one
 * that still stands. So the batch keeps its own row: what the file was called, what its bytes hashed
 * to (a second upload of the same file is a re-import and the preview says so), what it wrote, and when
 * it was undone and why.
 *
 * `items` is what makes undo honest rather than approximate: every created CV is listed so undo can bin
 * exactly those, and every updated CV keeps the fields it had before (`before`) so undo can put them
 * back instead of guessing what "the old value" was. The snapshot holds no phone digits of its own —
 * the normalized numbers already live on the CVs, and undo reads them from there.
 */
export interface ITeacherImportItem{
  row:number;
  candidate:Types.ObjectId|null;
  action:'created'|'updated'|'skipped';
  before:Record<string,unknown>|null;
}

export interface ITeacherImportBatch{
  batch:string;
  fileLabel:string;
  hash:string;
  rows:number;
  created:number;
  updated:number;
  skipped:number;
  flagged:number;
  items:ITeacherImportItem[];
  actor:Types.ObjectId;
  actorName:string;
  at:Date;
  undoneAt:Date|null;
  undoBy:Types.ObjectId|null;
  undoReason:string;
}

const itemSchema=new Schema<ITeacherImportItem>({
  row:{type:Number,required:true,min:0},
  candidate:{type:Schema.Types.ObjectId,ref:'TeacherCandidate',default:null},
  action:{type:String,enum:['created','updated','skipped'],required:true},
  before:{type:Schema.Types.Mixed,default:null},
},{_id:false});

const teacherImportBatchSchema=new Schema<ITeacherImportBatch>({
  batch:{type:String,required:true,unique:true,maxlength:64},
  fileLabel:{type:String,required:true,maxlength:200},
  hash:{type:String,required:true,index:true,maxlength:80},
  rows:{type:Number,default:0,min:0},
  created:{type:Number,default:0,min:0},
  updated:{type:Number,default:0,min:0},
  skipped:{type:Number,default:0,min:0},
  flagged:{type:Number,default:0,min:0},
  items:{type:[itemSchema],default:[]},
  actor:{type:Schema.Types.ObjectId,ref:'User',required:true},
  actorName:{type:String,required:true,maxlength:120},
  at:{type:Date,required:true},
  undoneAt:{type:Date,default:null},
  undoBy:{type:Schema.Types.ObjectId,ref:'User',default:null},
  undoReason:{type:String,default:'',maxlength:300},
},{timestamps:true});

teacherImportBatchSchema.index({at:-1});

export const TeacherImportBatch=models.TeacherImportBatch||model<ITeacherImportBatch>('TeacherImportBatch',teacherImportBatchSchema);
