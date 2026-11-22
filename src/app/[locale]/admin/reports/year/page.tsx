import { PrintButton } from "@/components/exams/print-button";
import { Link } from "@/i18n/navigation";
import { dashboardDigits } from "@/lib/admin/digits";
import { formatNumber } from "@/lib/admin/format";
import { requireArchiverPage } from "@/lib/admin/guard";
import { dhakaCalendar } from "@/lib/center/month-status";
import { loadYearSummary } from "@/lib/reports/year-summary-data";
import { FileSpreadsheet, FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

/** Bangla digits to ASCII, then an integer inside [min, max] or the fallback. */
function intInRange(
  raw: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const ascii = String(raw || "").replace(/[\u09e6-\u09ef]/g, (c) =>
    String(c.charCodeAt(0) - 0x09e6),
  );
  const value = Number(ascii);
  return Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

/** Collected as a whole percent of expected, kept inside 0 to 100. */
const percent = (collected: number, expected: number): number =>
  expected > 0
    ? Math.min(100, Math.max(0, Math.round((collected / expected) * 100)))
    : 0;

export default async function YearSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const admin = await requireArchiverPage();

  // Independent of each other, so they resolve together.
  const [{ locale }, query, t, common, digits] = await Promise.all([
    params,
    searchParams,
    getTranslations("reports"),
    getTranslations("common"),
    dashboardDigits(admin.id),
  ]);

  const currency = common("currency");
  const today = dhakaCalendar(new Date());
  const year = intInRange(query.year, 1900, 2200, today.year);

  const summary = await loadYearSummary(year, locale);

  const money = (value: number) => `${currency}${formatNumber(value, digits)}`;
  const exportQuery = `kind=year&year=${year}`;

  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="section-tag">✦ {t("hub.title")}</span>
          <h1>{t("year.title")}</h1>
          <p>{t("year.desc")}</p>
        </div>
      </div>

      <form
        method="get"
        className="report-filters year-filters"
        data-year-filters>
        <label>
          {t("year.yearLabel")}
          <input
            className="admin-input"
            type="number"
            name="year"
            min={1900}
            max={2200}
            defaultValue={String(year)}
          />
        </label>
        <button className="admin-mini-button year-apply" type="submit">
          {t("year.apply")}
        </button>
      </form>

      <div className="report-toolbar year-toolbar no-print">
        <PrintButton label={t("export.print")} />
        <Link
          className="admin-mini-button"
          data-export-csv
          href={`/admin/reports/export?${exportQuery}&format=csv`}>
          <FileText size={16} aria-hidden="true" />
          {t("export.csv")}
        </Link>
        <Link
          className="admin-mini-button"
          data-export-xlsx
          href={`/admin/reports/export?${exportQuery}&format=xlsx`}>
          <FileSpreadsheet size={16} aria-hidden="true" />
          {t("export.xlsx")}
        </Link>
      </div>

      <section className="report-print year-sheet" data-year-report>
        <p className="report-brand">{common("brand")}</p>
        <p className="report-sheet-title">
          {t("year.title")} · {formatNumber(year, digits)}
        </p>

        {summary.classes.length ? (
          <>
            <div className="admin-table-wrap year-scroll">
              <table className="admin-table admin-responsive-table year-table">
                <thead>
                  <tr>
                    <th>{t("year.classColumn")}</th>
                    <th className="num">{t("year.students")}</th>
                    <th className="num">{t("year.expected")}</th>
                    <th className="num">{t("year.collected")}</th>
                    <th className="num">{t("year.outstanding")}</th>
                    <th className="num">{t("year.pending")}</th>
                    <th className="num">{t("year.waived")}</th>
                    <th className="num">{t("year.extras")}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.classes.map((row) => (
                    <tr key={row.classLabel} data-year-row>
                      <td
                        className="year-class"
                        data-label={t("year.classColumn")}>
                        {row.classLabel || "—"}
                      </td>
                      <td className="num" data-label={t("year.students")}>
                        {formatNumber(row.students, digits)}
                      </td>
                      <td className="num" data-label={t("year.expected")}>
                        {money(row.expected)}
                      </td>
                      <td
                        className="num year-collected"
                        data-label={t("year.collected")}>
                        {money(row.collected)}
                        <span
                          className="year-bar"
                          aria-hidden="true"
                          style={
                            {
                              "--pct": `${percent(row.collected, row.expected)}%`,
                            } as CSSProperties
                          }
                        />
                      </td>
                      <td
                        className={`num year-outstanding${row.outstanding > 0 ? " is-due" : ""}`}
                        data-label={t("year.outstanding")}>
                        {money(row.outstanding)}
                      </td>
                      <td className="num" data-label={t("year.pending")}>
                        {money(row.pending)}
                      </td>
                      <td className="num" data-label={t("year.waived")}>
                        {money(row.waived)}
                      </td>
                      <td className="num" data-label={t("year.extras")}>
                        {money(row.extras)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr data-year-totals>
                    <td className="year-class">{t("year.totals")}</td>
                    <td className="num" data-label={t("year.students")}>
                      {formatNumber(summary.totals.students, digits)}
                    </td>
                    <td className="num" data-label={t("year.expected")}>
                      {money(summary.totals.expected)}
                    </td>
                    <td className="num" data-label={t("year.collected")}>
                      {money(summary.totals.collected)}
                    </td>
                    <td
                      className={`num year-outstanding${summary.totals.outstanding > 0 ? " is-due" : ""}`}
                      data-label={t("year.outstanding")}>
                      {money(summary.totals.outstanding)}
                    </td>
                    <td className="num" data-label={t("year.pending")}>
                      {money(summary.totals.pending)}
                    </td>
                    <td className="num" data-label={t("year.waived")}>
                      {money(summary.totals.waived)}
                    </td>
                    <td className="num" data-label={t("year.extras")}>
                      {money(summary.totals.extras)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="notice-box year-help">{t("year.help")}</p>
          </>
        ) : (
          <div className="admin-empty year-empty">{t("year.empty")}</div>
        )}
      </section>
    </>
  );
}
