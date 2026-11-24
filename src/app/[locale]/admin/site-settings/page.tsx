import { SettingsScreen } from "@/components/admin/settings-screen";
import { siteSettings } from "@/data/seed-content";
import { requireAdminPage } from "@/lib/admin/guard";
import { binnedMilestones, liveMilestones } from "@/lib/admin/proof-bin";
import { SiteSettingsContent } from "@/models/PublicContent";
import { emptySocialProof, socialProofSchema } from "@/schemas/social-proof";
import { DEFAULT_THEME, safeThemeColor } from "@/schemas/theme";
import { getTranslations } from "next-intl/server";
export default async function Settings() {
  await requireAdminPage();
  const t = await getTranslations("siteSettings"),
    m = await getTranslations("adminModules");
  const current = await SiteSettingsContent.findOne({ key: "main" }).lean();
  const s = current || siteSettings;
  const live = current?.proof
    ? {
        ...current.proof,
        milestones: liveMilestones(current.proof.milestones || []),
      }
    : current?.proof;
  const proof = socialProofSchema.safeParse(live);
  const binned = binnedMilestones(current?.proof?.milestones || []);
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>{t("title")}</h1>
          <p>{m("settingsDesc")}</p>
        </div>
      </div>
      <div className="notice-box">{t("limitations")}</div>
      <SettingsScreen
        values={{
          nameBn: s.name.bn,
          nameEn: s.name.en,
          phone: s.phone || siteSettings.phone,
          addressBn: s.address.bn,
          addressEn: s.address.en,
          logoUrl: s.logoUrl,
          facebook: s.social.facebook,
          youtube: s.social.youtube,
          website: current?.website || "",
          taglineBn: current?.taglineBn || "পড়ালেখার প্রিয় প্রাঙ্গণ" /* i18n-scan-allow: the saved default Bangla tagline — stored content, not interface text */,
        }}
        proof={proof.success ? proof.data : emptySocialProof}
        binned={binned}
        primary={
          safeThemeColor(s.theme?.primary || "")
            ? s.theme.primary
            : DEFAULT_THEME.primary
        }
        action={
          safeThemeColor(s.theme?.action || "")
            ? s.theme.action
            : DEFAULT_THEME.action
        }
      />
    </>
  );
}
