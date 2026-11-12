import {connectDB} from '@/lib/db';
import {FAQContent,FacilityContent} from '@/models/PublicContent';
import {faqs,facilities} from '@/data/seed-content';
export type PublicFaq={key:string;question:string;answer:string};
export type PublicFacility={key:string;kind:'facility'|'activity';title:string;description:string};
const unconfigured=()=>!process.env.MONGODB_URI||!process.env.NEXTAUTH_SECRET||!process.env.NEXTAUTH_URL||(process.env.NODE_ENV!=='production'&&process.env.PREVIEW_WITHOUT_SERVICES==='1');
export async function getPublicFaqs(locale:string):Promise<PublicFaq[]>{const lang=locale==='bn'?'bn':'en';if(unconfigured())return faqs.filter(x=>x.published).map(x=>({key:x.key,question:x.question[lang],answer:x.answer[lang]}));try{await connectDB();const rows=await FAQContent.find({published:true}).sort({order:1,_id:1}).limit(200).lean();return rows.map(x=>({key:x.key,question:x.question[lang],answer:x.answer[lang]}))}catch{console.error('Public FAQ data unavailable.');return []}}
export async function getPublicFacilities(locale:string):Promise<PublicFacility[]>{const lang=locale==='bn'?'bn':'en';if(unconfigured())return facilities.filter(x=>x.published).map(x=>({key:x.key,kind:x.kind,title:x.title[lang],description:x.description[lang]}));try{await connectDB();const rows=await FacilityContent.find({published:true}).sort({order:1,_id:1}).limit(200).lean();return rows.map(x=>({key:x.key,kind:x.kind,title:x.title[lang],description:x.description?.[lang]||''}))}catch{console.error('Public facilities data unavailable.');return []}}
