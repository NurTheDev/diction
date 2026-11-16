import {model,models,Schema,type Types} from 'mongoose';

/**
 * R3 · Visitor import — the register of whole-file imports.
 *
 * The leads themselves carry `importBatch`, but a batch that was undone would vanish from a history
 * derived from leads, and "undo the last batch" needs to know which batch is the last one that still
 * stands. So the batch keeps its own row: what the file was called, what its hash was (a second upload
 * of the same bytes is a re-import, and the preview says so), what it wrote, and when it was undone
 * and why. Nothing here is personal data — the names and numbers stay on the leads.
 */
export interface ILeadImportBatch{
  batch:string;
  fileLabel:string;
  hash:string;
  rows:number;
  created:number;
  matched:number;
  skipped:number;
  blocked:number;
  siblings:number;
  actor:Types.ObjectId;
  actorName:string;
  at:Date;
  undoneAt:Date|null;
  undoBy:Types.ObjectId|null;
  undoReason:string;
}

const schema=new Schema<ILeadImportBatch>({
  batch:{type:String,required:true,unique:true,maxlength:64},
  fileLabel:{type:String,required:true,maxlength:200},
  hash:{type:String,required:true,index:true,maxlength:80},
  rows:{type:Number,default:0,min:0},
  created:{type:Number,default:0,min:0},
  matched:{type:Number,default:0,min:0},
  skipped:{type:Number,default:0,min:0},
  blocked:{type:Number,default:0,min:0},
  siblings:{type:Number,default:0,min:0},
  actor:{type:Schema.Types.ObjectId,ref:'User',required:true},
  actorName:{type:String,required:true,maxlength:120},
  at:{type:Date,required:true},
  undoneAt:{type:Date,default:null},
  undoBy:{type:Schema.Types.ObjectId,ref:'User',default:null},
  undoReason:{type:String,default:'',maxlength:300},
},{timestamps:true});

schema.index({at:-1});

export const LeadImportBatch=models.LeadImportBatch||model<ILeadImportBatch>('LeadImportBatch',schema);
