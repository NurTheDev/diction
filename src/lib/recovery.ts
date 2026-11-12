import {createHash,randomBytes} from 'node:crypto';
import {authServicesConfigured} from './service-status';
import {mailConfigured} from './mail';
export function recoveryEnabled(){return process.env.PASSWORD_RESET_ENABLED==='true'&&authServicesConfigured()&&mailConfigured()}
export function newResetToken(){return randomBytes(32).toString('hex')}
export function hashResetToken(token:string){return createHash('sha256').update(token).digest('hex')}
export function resetUrl(locale:'bn'|'en',token:string){const base=new URL(process.env.NEXTAUTH_URL!);if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))throw new Error('Recovery requires a HTTPS canonical origin');return `${base.origin}/${locale}/reset-password#token=${token}`}
