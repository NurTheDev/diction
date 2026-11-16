/**
 * R5 slice 2 · How many families a published result would reach — asked *before* publishing.
 *
 * The publish prompt offers a checkbox and a count, and a count that disagrees with the send that follows
 * it is worse than no count: an operator who ticked a box saying "212 messages" and then reads 40 on the
 * batch has been told a lie by their own software. So this counts the same way the send does — the same
 * candidates, the same per-student values, the same recipient rules and the same effective template body,
 * including an operator's stored edit of it — and the only difference is that nothing is written.
 *
 * It reads the rows with the publication gate lifted, because at prompt time the exam is still a draft.
 * The gate itself is not lifted anywhere else: `autoSendClassResults` reads the published-only version.
 */
import 'server-only';
import mongoose from 'mongoose';
import {CenterExam,CenterSettings} from '@/models/CenterRecords';
import {resultMessagesIgnoringStatus} from '@/lib/exams/exam-view';
import {resolveSmsSource} from './sms-source';
import {resolveRecipients} from './sms-recipients';
import {smsTemplateBody} from './sms-send';
import {createSmsProvider} from './sms-provider';
import {templateVariablesOf} from './sms-templates';

export interface ResultSmsAudience{
  /** Messages that would go out, counted the way `buildSmsPlan` counts recipients. */
  messages:number;
  /** Children whose own result would be quoted — one per message, since siblings are never merged. */
  students:number;
  classes:number;
  /** False when sending could not happen at all, with the reason an operator can be told. */
  possible:boolean;
  reason:'NO_TEMPLATE'|'SMS_DISABLED'|'NO_PROVIDER'|null;
  /** True when the automatic-result setting is on, which is the checkbox's starting state. */
  defaultOn:boolean;
}

const empty=(over:Partial<ResultSmsAudience>={}):ResultSmsAudience=>({
  messages:0,students:0,classes:0,possible:false,reason:null,defaultOn:false,...over,
});

export async function resultSmsAudience(examId:string,now=new Date()):Promise<ResultSmsAudience>{
  if(!mongoose.isValidObjectId(examId))return empty({reason:null});
  const exam=await CenterExam.findById(examId).select('classGroups status').lean<{classGroups:mongoose.Types.ObjectId[];status:string}>();
  if(!exam)return empty();
  const settings=await CenterSettings.findOne({key:'main'}).lean<{autoResult?:boolean}|null>();
  const defaultOn=!!settings?.autoResult;
  const template=await smsTemplateBody('exam_result');
  if(!template)return empty({defaultOn,reason:'NO_TEMPLATE'});
  /* What makes a send possible depends on the provider in use: the real one refuses unless the write gate
     is open, the mock one never asks. Asking the configured provider rather than the environment keeps the
     prompt honest in test mode, where the gate is closed and a send still works because nothing leaves. */
  const provider=createSmsProvider();
  const gateOpen=process.env.CENTER_SMS_WRITE_ENABLED==='true';
  const possible=provider.configured&&(provider.name!=='bulksmsbd'||gateOpen);
  const rows=await resultMessagesIgnoringStatus(examId);
  const required=templateVariablesOf(template.body);
  const classGroups=exam.classGroups||[];
  let messages=0,students=0;
  for(const classGroup of classGroups){
    const resolved=await resolveSmsSource({source:'class',classGroup:String(classGroup)},now);
    if(!resolved.candidates.length)continue;
    const valuesBy=new Map(rows.filter(row=>row.classId===String(classGroup)).map(row=>[row.studentId,row.values]));
    const candidates=resolved.candidates.map(candidate=>{
      const values=valuesBy.get(candidate.id);
      return values?{...candidate,values:{...candidate.values,...values}}:candidate;
    });
    const {recipients}=resolveRecipients(candidates,{audience:'guardian',feeMessage:false,onePerPhone:true,now});
    for(const recipient of recipients){
      // The same rule the plan applies: a chip with no value behind it means this family gets nothing.
      const missing=required.filter(chip=>{
        const raw=recipient.values[chip];
        return raw===undefined||raw===null||String(raw).trim()==='';
      });
      if(missing.length)continue;
      messages++;
      students+=recipient.studentIds.length;
    }
  }
  return {
    messages,students,classes:classGroups.length,possible,
    reason:!provider.configured?'NO_PROVIDER':possible?null:'SMS_DISABLED',
    defaultOn,
  };
}
