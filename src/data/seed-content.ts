/** Supplied institute facts only. No sample students, results or unverified contact details. */
import bn from '@/messages/bn.json';
import en from '@/messages/en.json';
const teacherSlugs=['sarek-chowdhury','atia','md-yeasir-arafat','shuvo-das','md-nayan','mehenaj-uddin-siam','md-naymur-rahman'];
export const teachers=teacherSlugs.map((slug,i)=>({slug,name:{bn:bn.pages.names[i],en:en.pages.names[i]},qualification:{bn:bn.pages.qualifications[i],en:en.pages.qualifications[i]},director:i===0,published:true,order:i,photoUrl:''}));
export const facilities=[...bn.pages.facilityNames.map((title,i)=>({key:`facility-${i+1}`,kind:'facility' as const,title:{bn:title,en:en.pages.facilityNames[i]},description:{bn:bn.pages.facilityDescs[i],en:en.pages.facilityDescs[i]},published:true,order:i})),...bn.pages.activities.map((title,i)=>({key:`activity-${i+1}`,kind:'activity' as const,title:{bn:title,en:en.pages.activities[i]},description:{bn:'',en:''},published:true,order:i}))];
export const faqs=bn.pages.faqs.map((faq,i)=>({key:`faq-${i+1}`,question:{bn:faq.q,en:en.pages.faqs[i].q},answer:{bn:faq.a,en:en.pages.faqs[i].a},published:true,order:i}));
export const siteSettings={key:'main',name:{bn:bn.common.brand,en:en.common.brand},address:{bn:bn.footer.addressText,en:en.footer.addressText},logoUrl:'/brand/logo.png',social:{youtube:'https://www.youtube.com/@DictionCoaching',facebook:'https://www.facebook.com/Dictioncoachingcenter'},theme:{primary:'#2E3192',action:'#ED1C24',success:'#00A651',info:'#00AEEF'}};
