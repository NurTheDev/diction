import {NextIntlClientProvider} from 'next-intl';
import {getMessages} from 'next-intl/server';
import {clientMessages} from '@/i18n/client-namespaces';
import {notFound} from 'next/navigation';
import {AdminShell} from '@/components/admin/shell';
import {Overview} from '@/components/admin/overview';
export const dynamic='force-dynamic';
/** A data-free design preview, never available outside explicit development preview mode. */
export default async function Preview({params}:{params:Promise<{locale:string}>}){if(process.env.NODE_ENV==='production'||process.env.PREVIEW_WITHOUT_SERVICES!=='1')notFound();const {locale}=await params;const messages=clientMessages(await getMessages());return <NextIntlClientProvider messages={messages}><AdminShell name="Admin" locale={locale} preview><Overview preview data={{counts:['—','—','—','—'],admissions:[],bookings:[]}}/></AdminShell></NextIntlClientProvider>}
