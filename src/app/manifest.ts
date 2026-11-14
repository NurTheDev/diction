import type {MetadataRoute} from 'next';
// i18n-scan-allow-start — one manifest serves every locale, so it carries the brand's own name in the
// language it was registered in (`lang:'bn'`, `start_url:'/bn'`), not a sentence either page paints.
// i18n-scan-allow-end
export default function manifest():MetadataRoute.Manifest{return {name:'ডিকশন কোচিং সেন্টার',short_name:'ডিকশন',description:'২০১১ সাল থেকে যত্নে গড়ি আগামীর স্বপ্ন।',lang:'bn',start_url:'/bn',display:'standalone',background_color:'#F7F8FC',theme_color:'#2E3192',icons:[{src:'/brand/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/brand/icon-512.png',sizes:'512x512',type:'image/png'}]};}
