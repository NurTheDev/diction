import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
export default async function NotFound(){const t=await getTranslations('common'),nav=await getTranslations('nav');return <section className="plain wrap not-found-page"><h1>404</h1><p>{t('notFound')}</p><Link className="button button-navy" href="/">{nav('home')}</Link></section>}
