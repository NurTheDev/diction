import sharp from 'sharp';
import {decodedDataUrl} from '@/lib/achievement-workflow';
import type {StoredCard} from '@/schemas/achievement-record';
/** Decode and re-encode both images, rejecting malformed files and unexpected card dimensions. */
export async function sanitizeAchievementImages(input:{photo:string;png:string;card:StoredCard}){
 const photo=decodedDataUrl(input.photo,'image/jpeg',2_000_000),png=decodedDataUrl(input.png,'image/png',3_000_000);
 const p=sharp(photo,{limitInputPixels:25_000_000,failOn:'error'}),i=sharp(png,{limitInputPixels:3_000_000,failOn:'error'});
 const [pm,im]=await Promise.all([p.metadata(),i.metadata()]);const [w,h]=input.card.aspect==='1:1'?[1080,1080]:input.card.aspect==='4:5'?[1080,1350]:[1200,630];
 if(pm.format!=='jpeg'||im.format!=='png'||im.width!==w||im.height!==h||(pm.pages||1)>1||(im.pages||1)>1)throw Error('invalid');
 const [cleanPhoto,cleanPng]=await Promise.all([p.rotate().jpeg({quality:90}).toBuffer(),i.png().toBuffer()]);if(cleanPhoto.length+cleanPng.length>3_200_000)throw Error('too_large');return {cleanPhoto,cleanPng};
}
