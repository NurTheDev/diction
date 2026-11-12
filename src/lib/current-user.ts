import {auth} from '@/lib/auth';
import {connectDB} from '@/lib/db';
import {User} from '@/models/User';
import mongoose from 'mongoose';
/** JWTs only identify the account: every sensitive read verifies current database status and version. */
export async function getCurrentUser(){if(!process.env.NEXTAUTH_SECRET)return null;const session=await auth();const sessionUser=session?.user as {id?:string;sessionVersion?:number}|undefined;const id=sessionUser?.id,version=sessionUser?.sessionVersion;if(!id||!mongoose.isValidObjectId(id)||!Number.isSafeInteger(version)||version!<0)return null;await connectDB();const user=await User.findOne({_id:id,active:true}).select('_id name role sessionVersion').lean();if(!user||(user.sessionVersion??0)!==version)return null;return {id:String(user._id),name:user.name,role:user.role,sessionVersion:version!};}
