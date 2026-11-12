import {connectDB} from '@/lib/db';
import {TeacherContent} from '@/models/PublicContent';
import {teachers} from '@/data/seed-content';
import {safeImage} from '@/lib/safe-image';
export type PublicTeacher={id:string;name:string;qualification:string;bio:string;director:boolean;photoUrl:string};
/** The seeded records are authoritative when present; local data is a fallback when unconfigured or unseeded. */
export async function getPublicFaculty(locale:string):Promise<PublicTeacher[]>{const lang=locale==='bn'?'bn':'en';const fallback=()=>teachers.filter(t=>t.published).sort((a,b)=>a.order-b.order).map(t=>({id:t.slug,name:t.name[lang],qualification:t.qualification[lang],bio:'',director:t.director,photoUrl:t.photoUrl}));if(!process.env.MONGODB_URI||!process.env.NEXTAUTH_SECRET||!process.env.NEXTAUTH_URL||(process.env.NODE_ENV!=='production'&&process.env.PREVIEW_WITHOUT_SERVICES==='1'))return fallback();try{await connectDB();const [all,published]=await Promise.all([TeacherContent.countDocuments(),TeacherContent.find({published:true}).sort({order:1,_id:1}).limit(200).lean()]);if(all===0)return fallback();return published.map(t=>({id:t.slug,name:t.name[lang],qualification:t.qualification[lang],bio:t.bio?.[lang]||'',director:t.director,photoUrl:safeImage(t.photoUrl||'')}));}catch{console.error('Public faculty database unavailable; showing an empty state.');return [];}}
