import {cache} from 'react';
import {connectDB} from '@/lib/db';
import {SiteSettingsContent} from '@/models/PublicContent';
import {siteSettings} from '@/data/seed-content';
import {safeImage} from '@/lib/safe-image';
import {validSocial,validWebsite} from '@/schemas/site-settings';
import {safeThemeColor,DEFAULT_THEME} from '@/schemas/theme';
import {socialProofSchema,type SocialProof} from '@/schemas/social-proof';
export type PublicSettings={website:string;taglineBn:string;name:string;address:string;logoUrl:string;facebook:string;youtube:string;themePrimary:string;themeAction:string;proof:SocialProof|null};
// i18n-scan-allow: the stored tagline's own default — site content, in the language it is written in,
// not a sentence this interface chooses.
export const getPublicSettings=cache(async(locale:string):Promise<PublicSettings>=>{const lang=locale==='bn'?'bn':'en';const fallback={website:'',taglineBn:'যত্নে গড়ি আগামীর স্বপ্ন'/* i18n-scan-allow: stored default tagline seeded into the database on first run, not interface text*/,name:siteSettings.name[lang],address:siteSettings.address[lang],logoUrl:siteSettings.logoUrl,facebook:siteSettings.social.facebook,youtube:siteSettings.social.youtube,themePrimary:DEFAULT_THEME.primary,themeAction:DEFAULT_THEME.action,proof:null};if(!process.env.MONGODB_URI||!process.env.NEXTAUTH_SECRET||!process.env.NEXTAUTH_URL||(process.env.NODE_ENV!=='production'&&process.env.PREVIEW_WITHOUT_SERVICES==='1'))return fallback;try{await connectDB();const data=await SiteSettingsContent.findOne({key:'main'}).lean();if(!data)return fallback;const liveProof=data.proof?{...data.proof,milestones:(data.proof.milestones||[]).filter((milestone:{deletedAt?:Date})=>!milestone.deletedAt)}:data.proof;
   const proof=socialProofSchema.safeParse(liveProof);return {website:data.website&&validWebsite(data.website)?data.website:'',taglineBn:data.taglineBn||fallback.taglineBn,proof:proof.success&&proof.data.published?proof.data:null,name:data.name?.[lang]||fallback.name,address:data.address?.[lang]||fallback.address,logoUrl:safeImage(data.logoUrl)||fallback.logoUrl,facebook:validSocial(data.social?.facebook||'','facebook')?data.social.facebook:fallback.facebook,youtube:validSocial(data.social?.youtube||'','youtube')?data.social.youtube:fallback.youtube,themePrimary:safeThemeColor(data.theme?.primary||'')?data.theme.primary:fallback.themePrimary,themeAction:safeThemeColor(data.theme?.action||'')?data.theme.action:fallback.themeAction}}catch{console.error('Site settings unavailable; using bundled defaults.');return fallback}});
