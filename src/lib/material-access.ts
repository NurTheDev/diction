import {Batch,Student} from '@/models/Academic';
import type {Types} from 'mongoose';
/** Authorization is evaluated against current roles and batch membership for each request. */
export async function canReadMaterial(user:{id:string;role:string},batch:Types.ObjectId,published:boolean){if(user.role==='admin'||user.role==='superadmin')return true;if(user.role==='teacher')return Boolean(await Batch.exists({_id:batch,teacher:user.id,active:true}));if(!published)return false;if(user.role==='student')return Boolean(await Student.exists({user:user.id,batches:batch}));if(user.role==='parent')return Boolean(await Student.exists({parent:user.id,batches:batch}));return false;}
