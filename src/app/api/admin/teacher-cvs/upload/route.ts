/**
 * R4 · Attaching a CV file or a candidate photo.
 *
 * The brief's three rules, and how each is kept here rather than in the form that posts to it:
 *
 *   • **PDF or image, up to 5 MB.** The magic bytes decide, not the filename and not the declared
 *     content type: a `.pdf` that is really a script is refused, and so is an image whose header lies.
 *   • **Metadata comes off.** A photo straight from a phone carries EXIF — including a GPS position,
 *     which is where a candidate was standing when they took it. Every image is decoded and re-encoded
 *     through sharp, which drops it; a PDF is uploaded as the bytes it is, because rewriting a PDF would
 *     rewrite the document the centre is keeping.
 *   • **Cloudinary holds the file; Mongo holds an address.** The response is a URL and a public id, and
 *     those two strings are all the CV row ever stores. A document full of other people's CVs is a
 *     document that has to be backed up, restored and purged, and the purge job can destroy a Cloudinary
 *     asset by its public id but cannot un-store bytes it was never given.
 *
 * Access is `requireAdmin()` — Super Admin and Admin only, the same door as the rest of the CV bank.
 * Teachers and staff never reach it, and an unauthenticated or cross-origin post never reaches a byte.
 */
import {NextResponse} from 'next/server';
import sharp from 'sharp';
import type {UploadApiResponse} from 'cloudinary';
import {requireAdmin} from '@/lib/admin/guard';
import {checkRateLimit} from '@/lib/rate-limit';
import {getCloudinary} from '@/lib/cloudinary';
import {audit} from '@/lib/admin/helpers';
import {noStore} from '@/lib/practice-security';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

const MAX_FILE=5*1024*1024;
const PDF_MAGIC='%PDF-';
const PNG_MAGIC=[137,80,78,71,13,10,26,10];

function sameOrigin(request:Request):boolean{
  const origin=request.headers.get('origin');
  const host=request.headers.get('host');
  const base=process.env.NEXTAUTH_URL;
  if(!origin||!host||!base)return false;
  try{return new URL(origin).origin===new URL(base).origin&&new URL(origin).host===host}
  catch{return false}
}

/** What the bytes say the file is. A filename is a claim; magic bytes are evidence. */
function kindOf(bytes:Buffer):'pdf'|'png'|'jpg'|'webp'|null{
  if(bytes.subarray(0,5).toString('latin1')===PDF_MAGIC)return 'pdf';
  if(bytes.subarray(0,8).equals(Buffer.from(PNG_MAGIC)))return 'png';
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'jpg';
  if(bytes.subarray(0,4).toString('latin1')==='RIFF'&&bytes.subarray(8,12).toString('latin1')==='WEBP')return 'webp';
  return null;
}

export async function POST(request:Request){
  let uploaded:UploadApiResponse|undefined;
  try{
    if(!sameOrigin(request))return NextResponse.json({ok:false,error:'forbidden'},{status:403,headers:noStore});
    let admin:{id:string;name:string;role:string};
    try{admin=await requireAdmin()}
    catch{return NextResponse.json({ok:false,error:'unauthorized'},{status:401,headers:noStore})}
    if(!await checkRateLimit(`teacher-cv-upload:${admin.id}`,20))return NextResponse.json({ok:false,error:'rate'},{status:429,headers:noStore});

    const type=request.headers.get('content-type')||'';
    if(!type.toLowerCase().startsWith('multipart/form-data;'))return NextResponse.json({ok:false,error:'invalid'},{status:400,headers:noStore});
    const limit=MAX_FILE+128*1024;
    const length=Number(request.headers.get('content-length')||0);
    if(Number.isFinite(length)&&length>limit)return NextResponse.json({ok:false,error:'too_large'},{status:413,headers:noStore});

    // The body is read by hand and bounded, so a 40 MB post is cut off before it is parsed.
    const reader=request.body?.getReader();
    if(!reader)return NextResponse.json({ok:false,error:'invalid'},{status:400,headers:noStore});
    const chunks:Uint8Array[]=[];
    let total=0;
    for(;;){
      const {value,done}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>limit){await reader.cancel();return NextResponse.json({ok:false,error:'too_large'},{status:413,headers:noStore})}
      chunks.push(value);
    }
    let form:FormData;
    try{form=await new Response(new Uint8Array(Buffer.concat(chunks)),{headers:{'content-type':type}}).formData()}
    catch{return NextResponse.json({ok:false,error:'invalid'},{status:400,headers:noStore})}

    const file=form.get('file');
    if(!(file instanceof File)||file.size<12||file.size>MAX_FILE){
      return NextResponse.json({ok:false,error:file instanceof File&&file.size>MAX_FILE?'too_large':'invalid'},{status:file instanceof File&&file.size>MAX_FILE?413:400,headers:noStore});
    }
    const which=String(form.get('kind')||'cv')==='photo'?'photo':'cv';
    const bytes=Buffer.from(await file.arrayBuffer());
    const kind=kindOf(bytes);
    if(!kind)return NextResponse.json({ok:false,error:'invalid'},{status:400,headers:noStore});
    // A photo is re-encoded (which strips EXIF, GPS included); a PDF is uploaded as the document it is.
    const isImage=kind!=='pdf';
    let payload=bytes;
    if(isImage){
      try{
        payload=await sharp(bytes,{limitInputPixels:25_000_000,failOn:'error'}).rotate()
          .resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
      }catch{return NextResponse.json({ok:false,error:'invalid'},{status:400,headers:noStore})}
      if(payload.length>MAX_FILE)return NextResponse.json({ok:false,error:'too_large'},{status:413,headers:noStore});
    }

    if(!process.env.CLOUDINARY_CLOUD_NAME||!process.env.CLOUDINARY_API_KEY||!process.env.CLOUDINARY_API_SECRET){
      // No storage configured: refuse rather than keep somebody's CV in the database or on local disk.
      return NextResponse.json({ok:false,error:'unavailable'},{status:503,headers:noStore});
    }
    const cloudinary=getCloudinary();
    const resource=isImage?'image':'raw';
    uploaded=await new Promise<UploadApiResponse>((resolve,reject)=>{
      const stream=cloudinary.uploader.upload_stream({
        folder:`dictioncoaching/teacher-cvs/${which}`,resource_type:resource,
        ...(isImage?{allowed_formats:['webp']}:{allowed_formats:['pdf']}),
      },(error,result)=>(error||!result?reject(error||new Error('Upload failed')):resolve(result)));
      stream.end(payload);
    });
    await audit(admin.id,`teacher-cv.upload.${which}`,String(uploaded.public_id));
    return NextResponse.json({ok:true,url:uploaded.secure_url,publicId:uploaded.public_id,kind:which,bytes:uploaded.bytes},{status:200,headers:noStore});
  }catch{
    // A half-uploaded asset is destroyed rather than left in the account with no row pointing at it.
    if(uploaded){
      try{await getCloudinary().uploader.destroy(uploaded.public_id,{resource_type:'raw'})}
      catch{console.error('Unable to clean up an orphaned CV file.')}
    }
    console.error('Teacher CV upload failed.');
    return NextResponse.json({ok:false,error:'unavailable'},{status:503,headers:noStore});
  }
}
