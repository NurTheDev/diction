import {requireAdmin} from '@/lib/admin/guard';
import {getPublicSettings} from '@/lib/content/settings';
import {achievementWorkflowEnabled} from '@/lib/achievement-flags';
import {AchievementEditor} from '@/components/achievements/editor';
export default async function AchievementsAdmin({params}:{params:Promise<{locale:string}>}){await requireAdmin();const {locale}=await params;const s=await getPublicSettings(locale);return <AchievementEditor workflow={achievementWorkflowEnabled()} settings={{website:s.website,taglineBn:s.taglineBn,logoUrl:s.logoUrl}}/>}
