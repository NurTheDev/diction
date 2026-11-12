import {randomBytes} from 'node:crypto';
/** Stable once saved. A random suffix avoids guessing uniqueness or racing a database pre-check. */
export function createSlug(title:unknown,prefix='item'){const base=(typeof title==='string'?title:'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60).replace(/-+$/,'');const safePrefix=prefix.replace(/[^a-z0-9]+/gi,'-').toLowerCase().replace(/^-+|-+$/g,'')||'item';return `${base||safePrefix}-${randomBytes(6).toString('hex')}`}
