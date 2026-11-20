import { Link } from "@/i18n/navigation";
import { dashboardDigits } from "@/lib/admin/digits";
import { formatNumber } from "@/lib/admin/format";
import { requireAdminPage } from "@/lib/admin/guard";
import { CenterDueSnapshot } from "@/models/CenterRecords";
import mongoose from "mongoose";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Row = {
  student: mongoose.Types.ObjectId;
  studentId?: string;
  nameBn?: string;
  amountDue: number;
  monthsDetail?: { year: number; month: number; amount: number }[];
};

export default async function Snapshot({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const actor = await requireAdminPage(),
    { locale, id } = await params;
  if (!mongoose.isValidObjectId(id)) notFound();
  const data = await CenterDueSnapshot.findById(id)
    .select("takenAt rows classGroup")
    .lean<{
      takenAt: Date;
      classGroup: mongoose.Types.ObjectId;
      rows: Row[];
    }>();
  if (!data) notFound();
  const t = await getTranslations("dues"),
    bn = locale === "bn",
    digits = await dashboardDigits(actor.id),
    total = data.rows.reduce((a, r) => a + r.amountDue, 0);

  return (
    <div className="dq-page">
      <header className="dq-head">
        <Link
          href={`/admin/students/dues?class=${data.classGroup}`}
          className="dq-back">
          ← {t("snapshot.crumb.dues")}
        </Link>
        <h1 className="dq-title">{t("snapshot.title")}</h1>
        <p className="dq-desc">
          {new Intl.DateTimeFormat(bn ? "bn-BD" : "en-GB", {
            timeZone: "Asia/Dhaka",
            dateStyle: "long",
            timeStyle: "short",
          }).format(data.takenAt)}{" "}
          · {t("snapshot.scopeNote")}
        </p>
      </header>

      <section className="dq-card">
        <div className="dq-card-head">
          <h2 className="dq-card-title">{t("snapshot.recordedHeading")}</h2>
          <span className="dq-stat dq-stat-due">
            {formatNumber(data.rows.length, digits)} ·{" "}
            {formatNumber(total, digits)} {t("snapshot.takaUnit")}
          </span>
        </div>
        <div className="dq-table-wrap">
          <table className="dq-table">
            <thead>
              <tr>
                <th>{t("snapshot.studentColumn")}</th>
                <th>{t("snapshot.monthsColumn")}</th>
                <th className="dq-num">{t("snapshot.overdueColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={String(r.student)}>
                  <td className="dq-name">
                    <span className="dq-strong">{r.nameBn || "—"}</span>
                    <span className="dq-sub">{r.studentId || "—"}</span>
                  </td>
                  <td data-label={t("snapshot.monthsColumn")}>
                    {(r.monthsDetail || []).length > 0 ? (
                      <span className="dq-months">
                        {(r.monthsDetail || []).map((m) => (
                          <span
                            key={`${m.year}-${m.month}`}
                            className="dq-month">
                            {formatNumber(m.month, digits)}/
                            {formatNumber(m.year, digits)}:{" "}
                            {formatNumber(m.amount, digits)}
                          </span>
                        ))}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    className="dq-num dq-due"
                    data-label={t("snapshot.overdueColumn")}>
                    {formatNumber(r.amountDue, digits)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.rows.length && (
          <div className="dq-card-body">
            <p className="dq-empty">{t("snapshot.none")}</p>
          </div>
        )}
      </section>
    </div>
  );
}
