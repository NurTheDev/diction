import {cookies} from 'next/headers';
import type {Digits} from './format';
/** Per-account browser preference; presentation only, not account or auth state. */
export async function dashboardDigits(userId:string):Promise<Digits>{return (await cookies()).get(`diction_digits_${userId}`)?.value==='en'?'en':'bn'}
