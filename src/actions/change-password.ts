'use server';
import bcrypt from 'bcryptjs';
import {getCurrentUser} from '@/lib/current-user';
import {checkRateLimit} from '@/lib/rate-limit';
import {User} from '@/models/User';
import {audit} from '@/lib/admin/helpers';
import {changePasswordSchema} from '@/schemas/recovery';
import type {RecoveryState} from './recovery';
/** Compare-and-swap ensures simultaneous recovery, deactivation or password changes cannot be overwritten. */
export async function changePassword(_:RecoveryState,form:FormData):Promise<RecoveryState>{const v=changePasswordSchema.safeParse(Object.fromEntries(form.entries()));if(!v.success)return {status:'invalid'};try{const current=await getCurrentUser();if(!current)return {status:'unavailable'};if(!await checkRateLimit(`password-change:${current.id}`,8))return {status:'invalid'};const versionFilter=current.sessionVersion===0?{$or:[{sessionVersion:0},{sessionVersion:{$exists:false}}]}:{sessionVersion:current.sessionVersion};const user=await User.findOne({_id:current.id,active:true,...versionFilter}).select('+passwordHash').lean();if(!user||!await bcrypt.compare(v.data.current,user.passwordHash))return {status:'invalid'};const hash=await bcrypt.hash(v.data.password,12);const updated=await User.updateOne({_id:current.id,active:true,passwordHash:user.passwordHash,...versionFilter},{$set:{passwordHash:hash},$inc:{sessionVersion:1},$unset:{resetTokenHash:1,resetExpiresAt:1}});if(updated.modifiedCount)await audit(current.id,'account.password_change',current.id);return {status:updated.modifiedCount?'success':'invalid'};}catch{console.error('Password change failed.');return {status:'error'};}}
