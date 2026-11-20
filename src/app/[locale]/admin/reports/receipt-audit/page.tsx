import { PrintButton } from "@/components/exams/print-button";
import { Link } from "@/i18n/navigation";
import { dashboardDigits } from "@/lib/admin/digits";
import { formatDate, formatDigits, formatNumber } from "@/lib/admin/format";
import { requireArchiverPage } from "@/lib/admin/guard";
import { loadReceiptAudit } from "@/lib/reports/receipt-audit-data";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function ReceiptAudit({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const admin = await requireArchiverPage();

  // None of these depends on another, so they resolve together.
  const [{ locale }, t, common, digits, audit] = await Promise.all([
    params,
    getTranslations("reports"),
    getTranslations("common"),
    dashboardDigits(admin.id),
    loadReceiptAudit(),
  ]);

  const language = locale === "en" ? "en" : "bn";
  const currency = common("currency");
  const clean = audit.duplicates.length === 0 && audit.gaps.length === 0;

  const day = (value: Parameters<typeof formatDate>[0] | null | undefined) =>
    value ? formatDate(value, digits, language) : "";

  const review = (studentId: string) => (
    <Link
      className="text-link audit-review"
      data-audit-review
      href={`/admin/reports/statement/${studentId}`}>
      {t("audit.review")}
      <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );

  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="section-tag">✦ {t("hub.title")}</span>
          <h1>{t("audit.title")}</h1>
          <p>{t("audit.desc")}</p>
        </div>
      </div>

      <div className="report-toolbar audit-toolbar no-print">
        <PrintButton label={t("export.print")} />
        <Link
          className="admin-mini-button"
          data-export-csv
          href="/admin/reports/export?kind=audit&format=csv">
          <FileText size={16} aria-hidden="true" />
          {t("export.csv")}
        </Link>
        <Link
          className="admin-mini-button"
          data-export-xlsx
          href="/admin/reports/export?kind=audit&format=xlsx">
          <FileSpreadsheet size={16} aria-hidden="true" />
          {t("export.xlsx")}
        </Link>
      </div>

      <section className="report-print audit-sheet" data-receipt-audit>
        <div className="audit-sheet-head">
          <p className="report-brand">{common("brand")}</p>
          <p className="report-sheet-title">{t("audit.title")}</p>
          <div className="audit-meta">
            <p data-audit-scanned>
              {t("audit.scanned", {
                count: formatNumber(audit.scanned, digits),
              })}
            </p>
            {audit.smallest !== null && audit.largest !== null && (
              <p data-audit-range>
                {t("audit.range", {
                  from: formatNumber(audit.smallest, digits),
                  to: formatNumber(audit.largest, digits),
                })}
              </p>
            )}
          </div>
        </div>

        {clean ? (
          <div className="admin-empty audit-clean" data-audit-clean>
            <CheckCircle2 size={44} aria-hidden="true" />
            <strong>{t("audit.clean")}</strong>
            <p>{t("audit.cleanHelp")}</p>
          </div>
        ) : (
          <div className="audit-grid">
            <section
              className="admin-panel audit-panel"
              data-accent="duplicates"
              data-audit-duplicates>
              <div className="admin-panel-head">
                <h2>{t("audit.duplicates")}</h2>
                <span className="audit-count">{audit.duplicates.length}</span>
              </div>
              <div className="admin-panel-body">
                <p className="audit-help">{t("audit.duplicatesHelp")}</p>
                {audit.duplicates.length ? (
                  audit.duplicates.map((duplicate) => (
                    <div
                      className="notice-box audit-issue"
                      key={duplicate.receiptNo}
                      data-audit-duplicate>
                      <strong>
                        {t("audit.receipt")}{" "}
                        {formatDigits(duplicate.receiptNo, digits)} ·{" "}
                        {t("audit.times", {
                          count: formatNumber(duplicate.count, digits),
                        })}
                      </strong>
                      <ul className="audit-rows">
                        {duplicate.rows.map((row) => (
                          <li key={row.id}>
                            <span className="audit-row-text">
                              {row.studentName} · {day(row.paidOn)} · {currency}
                              {formatNumber(row.amount, digits)}
                            </span>{" "}
                            {review(row.studentId)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <div className="admin-empty audit-none">
                    {t("audit.clean")}
                  </div>
                )}
              </div>
            </section>

            <section
              className="admin-panel audit-panel"
              data-accent="gaps"
              data-audit-gaps>
              <div className="admin-panel-head">
                <h2>{t("audit.gaps")}</h2>
                <span className="audit-count">{audit.gaps.length}</span>
              </div>
              <div className="admin-panel-body">
                <p className="audit-help">{t("audit.gapsHelp")}</p>
                {audit.gaps.length ? (
                  audit.gaps.map((gap, index) => (
                    <div
                      className="notice-box audit-issue"
                      key={index}
                      data-audit-gap>
                      <strong>
                        {t("audit.gapMissing", {
                          from: formatNumber(gap.from, digits),
                          to: formatNumber(gap.to, digits),
                          count: formatNumber(gap.missingCount, digits),
                        })}
                      </strong>
                      <p className="audit-between">
                        {t("audit.between", {
                          before: formatDigits(gap.after.receiptNo, digits),
                          after: formatDigits(gap.before.receiptNo, digits),
                        })}
                      </p>
                      <ul className="audit-rows">
                        <li>
                          <span className="audit-row-text">
                            {gap.after.studentName} · {day(gap.after.paidOn)}
                          </span>{" "}
                          {review(gap.after.studentId)}
                        </li>
                        <li>
                          <span className="audit-row-text">
                            {gap.before.studentName} · {day(gap.before.paidOn)}
                          </span>{" "}
                          {review(gap.before.studentId)}
                        </li>
                      </ul>
                    </div>
                  ))
                ) : (
                  <div className="admin-empty audit-none">
                    {t("audit.clean")}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {audit.unsequenced.length > 0 && (
          <section
            className="admin-panel audit-panel"
            data-accent="unsequenced"
            data-audit-unsequenced>
            <div className="admin-panel-head">
              <h2>
                <AlertTriangle size={18} aria-hidden="true" />
                {t("audit.unsequenced")}
              </h2>
              <span className="audit-count">{audit.unsequenced.length}</span>
            </div>
            <div className="admin-panel-body">
              <p className="audit-help">{t("audit.unsequencedHelp")}</p>
              <ul className="audit-rows audit-rows-flat">
                {audit.unsequenced.map((row) => (
                  <li key={row.id}>
                    <span className="audit-row-text">
                      {row.receiptNo} · {row.studentName} · {day(row.paidOn)}
                    </span>{" "}
                    {review(row.studentId)}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </section>
    </>
  );
}
