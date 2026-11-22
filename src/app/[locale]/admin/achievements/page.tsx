import { AchievementEditor } from "@/components/achievements/editor";
import { achievementWorkflowEnabled } from "@/lib/achievement-flags";
import { requireAdminPage } from "@/lib/admin/guard";
import { getPublicSettings } from "@/lib/content/settings";
export default async function AchievementsAdmin({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await requireAdminPage();
  const { locale } = await params;
  const s = await getPublicSettings(locale);
  return (
    <AchievementEditor
      workflow={achievementWorkflowEnabled()}
      settings={{
        website: s.website,
        taglineBn: s.taglineBn,
        logoUrl: s.logoUrl,
      }}
    />
  );
}
