import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {requireAdmin} from '@/lib/admin/guard';
import {Slot} from '@/models/Intake';
import {intakeEnabled} from '@/lib/service-status';
export const dynamic='force-dynamic';
export default async function IntakeSetup(){await requireAdmin();const t=await getTranslations('aiSetup');const enabled=intakeEnabled();const slots=await Slot.countDocuments({enabled:true,startAt:{$gt:new Date()},$expr:{$lt:['$booked','$capacity']}});return <><div className="admin-heading"><div><span className="section-tag">✦ &nbsp; {t('tag')}</span><h1>{t('intakeTitle')}</h1><p>{t('intakeDescription')}</p></div></div><section className="admin-panel"><div className="admin-panel-head"><h2>{t('intakeStatus')}</h2><span className={`admin-badge ${enabled?'enabled':'pending'}`}>{enabled?t('configured'):t('notConfigured')}</span></div><div className="admin-panel-body"><p>{enabled?t('intakeOn'):t('intakeOff')}</p><p>{t('slotsAvailable',{count:slots})}</p><p>{t('intakeSafety')}</p><div className="ai-chat-controls"><Link href="/admin/slots" className="button button-navy">{t('manageSlots')}</Link><Link href="/admin/admissions" className="button button-white">{t('manageAdmissions')}</Link><Link href="/admin/bookings" className="button button-white">{t('manageBookings')}</Link></div></div></section></>}
