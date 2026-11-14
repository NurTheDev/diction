import {notFound} from 'next/navigation';
import {getMessages} from 'next-intl/server';
import {NextIntlClientProvider} from 'next-intl';
import {clientMessages} from '@/i18n/client-namespaces';
import {AdminShell} from '@/components/admin/shell';
import {AchievementEditor} from '@/components/achievements/editor';
export const dynamic='force-dynamic';
/** Isolated sample with no real student data, unavailable outside explicit local preview. */
export default async function AchievementPreview({params}:{params:Promise<{locale:string}>}){if(process.env.NODE_ENV==='production'||process.env.PREVIEW_WITHOUT_SERVICES!=='1')notFound();const {locale}=await params;return <NextIntlClientProvider messages={clientMessages(await getMessages())}><AdminShell name="Admin" locale={locale} preview><AchievementEditor sample settings={{website:'',taglineBn:'যত্নে গড়ি আগামীর স্বপ্ন',logoUrl:'/brand/logo.png'}}/></AdminShell></NextIntlClientProvider>} // i18n-scan-allow: taglineBn is the stored Bangla tagline — sample content in the design preview, the saved default in settings; data, not interface.
