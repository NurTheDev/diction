import { Link } from "@/i18n/navigation";
import { getAdmin } from "@/lib/admin/guard";
import { CenterSettings } from "@/models/CenterRecords";
import { getTranslations } from "next-intl/server";
/**
 * R6 slice 2 — the monthly reminder: a backup nobody took is a backup nobody has, so the Overview says
 * so when the last export is older than a month, or has never happened. Only the Super Admin sees it —
 * the reminder is addressed to the one role that can act on it.
 */
export async function BackupReminder() {
  const admin = await getAdmin();
  if (admin?.role !== "superadmin") return null;
  const settings = await CenterSettings.findOne({ key: "main" })
    .select("lastBackupAt")
    .lean<{ lastBackupAt?: Date } | null>();
  const last = settings?.lastBackupAt;
  const stale = !last || Date.now() - last.getTime() > 30 * 24 * 60 * 60 * 1000;
  if (!stale) return null;
  const t = await getTranslations("center");
  return (
    <div className="notice-box" role="status" data-backup-reminder>
      <strong>{t("backup.reminder")}</strong>
      <p>{t("backup.reminderHelp")}</p>
      <Link className="admin-mini-button" href="/admin/backup">
        {t("backup.title")}
      </Link>
    </div>
  );
}
