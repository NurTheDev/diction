import type {ClientSession} from 'mongoose';
import {User} from '@/models/User';
/** Recheck the teacher's live role and session version and serialize against account changes. */
export async function lockTeacherAccount(user:{id:string;sessionVersion:number},session:ClientSession){const version=user.sessionVersion===0?{$or:[{sessionVersion:0},{sessionVersion:{$exists:false}}]}:{sessionVersion:user.sessionVersion};const locked=await User.updateOne({_id:user.id,role:'teacher',active:true,...version},{$inc:{authMutationRevision:1}},{session,timestamps:false});if(!locked.matchedCount)throw new Error('UNAUTHORIZED_TEACHER');}
