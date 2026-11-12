import type {Metadata} from 'next';
import localFont from 'next/font/local';
import {NextIntlClientProvider,hasLocale} from 'next-intl';
import {setRequestLocale,getTranslations,getMessages} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {routing} from '@/i18n/routing';
import {Header} from '@/components/layout/header';
import {Footer} from '@/components/layout/footer';
import {PwaRegister} from '@/components/layout/pwa-register';
import {PublicEnhancements} from '@/components/layout/public-enhancements';
import {SessionSplash} from '@/components/public/session-splash';
import {getPublicSettings} from '@/lib/content/settings';
import '../globals.css';
const bengali=localFont({src:[{path:'../../fonts/hind-siliguri-bengali-400-normal.woff2',weight:'400'},{path:'../../fonts/hind-siliguri-bengali-500-normal.woff2',weight:'500'},{path:'../../fonts/hind-siliguri-bengali-600-normal.woff2',weight:'600'}],variable:'--font-bengali',display:'swap',preload:false});
const bengaliDisplay=localFont({src:'../../fonts/hind-siliguri-bengali-700-normal.woff2',weight:'700',variable:'--font-bengali-display',display:'swap'});
const inter=localFont({src:'../../fonts/inter-latin-wght-normal.woff2',variable:'--font-inter',display:'swap'});
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;const t=await getTranslations({locale,namespace:'seo'});const site=await getPublicSettings(locale);const nav=await getTranslations({locale,namespace:'nav'});const title=`${site.name} | ${nav('since')}`;return {metadataBase:new URL(process.env.NEXTAUTH_URL||'http://localhost:3000'),title:{default:title,template:`%s | ${site.name}`},description:t('description'),icons:{icon:'/brand/icon-192.png'},openGraph:{title,description:t('description'),locale:locale==='bn'?'bn_BD':'en_US',images:[{url:'/brand/og.png',width:1200,height:630}]}};}
export function generateStaticParams(){return routing.locales.map(locale=>({locale}));}
export default async function LocaleLayout({children,params}:{children:React.ReactNode;params:Promise<{locale:string}>}){const {locale}=await params;if(!hasLocale(routing.locales,locale))notFound();setRequestLocale(locale);const allMessages=await getMessages();const clientNamespaces=['nav','pages','quickChat','courseCms','channelVideo','editorial','forms','recovery','study','academic','modelTest','fees','portalNotices','materials','common','splash'] as const;const clientMessages=Object.fromEntries(clientNamespaces.map(key=>[key,allMessages[key]]));const nav=await getTranslations('nav');const site=await getPublicSettings(locale);return <html lang={locale} data-scroll-behavior="smooth" className={`${bengali.variable} ${bengaliDisplay.variable} ${inter.variable}`} style={{'--brand-primary':site.themePrimary,'--brand-action':site.themeAction} as React.CSSProperties}><body><NextIntlClientProvider messages={clientMessages}><a className="skip-link" href="#main-content">{nav('skip')}</a><noscript><div className="noscript-note" role="status">{nav('noJavascript')}</div></noscript><PwaRegister/><SessionSplash logo={site.logoUrl}/><Header site={site}/><main id="main-content" tabIndex={-1}><PublicEnhancements>{children}</PublicEnhancements></main><Footer site={site}/></NextIntlClientProvider></body></html>}
