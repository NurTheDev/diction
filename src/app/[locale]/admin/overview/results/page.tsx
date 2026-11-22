import {redirect} from '@/i18n/navigation';

export const dynamic='force-dynamic';

/**
 * O1 · The legacy results address, closed rather than left open.
 *
 * Results used to live under an "academic information" screen of their own, and the menu carried two
 * doors to the same numbers — one of them named ফলাফল, the other পরীক্ষা ও ফলাফল. Two doors is how a
 * centre ends up with two screens disagreeing about a grade. The menu now carries one, and this page
 * exists so that an old bookmark, an old link in a message thread or an old habit lands on that one
 * instead of on a screen nobody maintains.
 *
 * It holds nothing and renders nothing: it sends the reader to `/admin/exams`, which is the exam hub's
 * own front door, in the language they arrived in.
 */
export default async function LegacyResultsRedirect({params}:{params:Promise<{locale:string}>}){
  const {locale}=await params;
  redirect({href:'/admin/exams',locale});
}
