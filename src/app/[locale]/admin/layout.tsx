import {cookies} from 'next/headers';
import {NextIntlClientProvider} from 'next-intl';
import {getMessages} from 'next-intl/server';
import {clientMessages} from '@/i18n/client-namespaces';
import {redirect} from 'next/navigation';
import {getStaff} from '@/lib/admin/guard';
import {AdminShell} from '@/components/admin/shell';
import {RecycleToastHost} from '@/components/admin/recycle-toast-host';
import {Admission,TrialBooking,ContactMessage,Slot} from '@/models/Intake';
import {dhakaToday} from '@/lib/admin/today';
import {followUpBoard} from '@/lib/leads/leads';
export const dynamic='force-dynamic';
export default async function Layout({children,params}:{children:React.ReactNode;params:Promise<{locale:string}>}){const {locale}=await params;const admin=await getStaff();if(!admin)redirect(`/${locale}/login?callbackUrl=/${locale}/admin`);const messages=clientMessages(await getMessages());const digits=(await cookies()).get(`diction_digits_${admin.id}`)?.value==='en'?'en':'bn';let counts:Record<string,number>|undefined;if(admin.role==='admin'||admin.role==='superadmin'){try{const {start,end}=dhakaToday();const [admissions,messages,slots,followUps]=await Promise.all([Admission.countDocuments({status:'pending'}),ContactMessage.countDocuments({read:false}),Slot.find({startAt:{$gte:start,$lt:end}}).select('_id').lean(),followUpBoard(new Date(),0)]);const bookings=await TrialBooking.countDocuments({slot:{$in:slots.map(s=>s._id)},status:'booked'});// The badge on “Follow-ups” is the queue itself: due today plus the promises whose day has passed.
counts={admissions,messages,bookings,followUps:followUps.today+followUps.overdue}}catch{/* No badge is safer than a misleading zero. */}}return <NextIntlClientProvider messages={messages}><AdminShell name={admin.name} locale={locale} superadmin={admin.role==='superadmin'} staffRole={admin.role} counts={counts} userId={admin.id} digits={digits}>{children}<RecycleToastHost/></AdminShell></NextIntlClientProvider>}
