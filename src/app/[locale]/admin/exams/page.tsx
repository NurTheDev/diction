import {redirect} from '@/i18n/navigation';

export const dynamic='force-dynamic';

/**
 * O1 · `/admin/exams` is the address the menu's one exam link is read as, and the exam hub is
 * `/admin/center-exams` — the screen that holds every exam, its marks grid and its results. Two
 * addresses for one screen is a habit rather than a choice: bookmarks, a note in a WhatsApp group and
 * an operator's memory all say "exams", and an address that 404s is a door that opens onto a wall.
 *
 * So this page holds no screen of its own. It sends the reader to the hub, in the language they arrived
 * in, and the hub keeps its own address so that the menu's "current page" highlight — which is matched
 * against the address bar — still lights the right item on the exam detail pages below it.
 */
export default async function ExamsRedirect({params}:{params:Promise<{locale:string}>}){
  const {locale}=await params;
  redirect({href:'/admin/center-exams',locale});
}
