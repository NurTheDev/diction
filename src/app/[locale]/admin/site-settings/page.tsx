import {getTranslations} from 'next-intl/server';
import {requireAdmin} from '@/lib/admin/guard';
import {SiteSettingsContent} from '@/models/PublicContent';
import {siteSettings} from '@/data/seed-content';
import {SettingsScreen} from '@/components/admin/settings-screen';
import {socialProofSchema,emptySocialProof} from '@/schemas/social-proof';
import {binnedMilestones,liveMilestones} from '@/lib/admin/proof-bin';
import {safeThemeColor,DEFAULT_THEME} from '@/schemas/theme';
export default async function Settings(){await requireAdmin();const t=await getTranslations('siteSettings'),m=await getTranslations('adminModules');const current=await SiteSettingsContent.findOne({key:'main'}).lean();const s=current||siteSettings;const live=current?.proof?{...current.proof,milestones:liveMilestones(current.proof.milestones||[])}:current?.proof;
const proof=socialProofSchema.safeParse(live);const binned=binnedMilestones(current?.proof?.milestones||[]);return <><div className="admin-heading"><div><h1>{t('title')}</h1><p>{m('settingsDesc')}</p></div></div><div className="notice-box">{t('limitations')}</div><SettingsScreen values={{nameBn:s.name.bn,nameEn:s.name.en,addressBn:s.address.bn,addressEn:s.address.en,logoUrl:s.logoUrl,facebook:s.social.facebook,youtube:s.social.youtube,website:current?.website||'',taglineBn:current?.taglineBn||'যত্নে গড়ি আগামীর স্বপ্ন'}} proof={proof.success?proof.data:emptySocialProof} binned={binned} primary={safeThemeColor(s.theme?.primary||'')?s.theme.primary:DEFAULT_THEME.primary} action={safeThemeColor(s.theme?.action||'')?s.theme.action:DEFAULT_THEME.action}/></>} // i18n-scan-allow: taglineBn is the stored Bangla tagline — sample content in the design preview, the saved default in settings; data, not interface.
