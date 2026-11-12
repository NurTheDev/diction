import {redirect} from 'next/navigation';
export default async function OldCollect({params}:{params:Promise<{id:string;locale:string}>}){const {id,locale}=await params;redirect(`/${locale}/admin/students/collect?student=${encodeURIComponent(id)}`)}
