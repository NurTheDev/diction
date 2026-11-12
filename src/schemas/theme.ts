import {z} from 'zod';
/** Minimum 5:1 against white leaves margin for the site's pale near-white surfaces. */
export function contrastOnWhite(hex:string){if(!/^#[0-9a-f]{6}$/i.test(hex))return 0;const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);const luminance=0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2];return 1.05/(luminance+0.05)}
export function safeThemeColor(value:string){return /^#[0-9a-f]{6}$/i.test(value)&&contrastOnWhite(value)>=5}
const color=z.string().refine(safeThemeColor,'Choose a darker color');
export const themeSchema=z.object({primary:color,action:color});
export const DEFAULT_THEME={primary:'#2E3192',action:'#C51920'} as const;
