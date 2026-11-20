import { PrintButton } from "@/components/exams/print-button";
import { Link } from "@/i18n/navigation";
import { dashboardDigits } from "@/lib/admin/digits";
import { formatNumber } from "@/lib/admin/format";
import { requireArchiverPage } from "@/lib/admin/guard";
import { monthNames, type MonthTable } from "@/lib/admin/months";
import { dhakaCalendar } from "@/lib/center/month-status";
import { loadMonthlyReport } from "@/lib/reports/collections-data";
import { typeLabelKey } from "@/lib/reports/vocab";
import { FileSpreadsheet, FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";

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

export default async function MonthlyReport({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
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

  const months = monthNames(common.raw("months") as MonthTable);
  const currency = common("currency");
  const today = dhakaCalendar(new Date());
  const year = intInRange(query.year, 1900, 2200, today.year);
  const month = intInRange(query.month, 1, 12, today.month);

  const { matrix } = await loadMonthlyReport({ year, month, locale });

  const money = (value: number) =>
    value ? `${currency}${formatNumber(value, digits)}` : "";
  const exportQuery = `kind=monthly&year=${year}&month=${month}`;

  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="section-tag">✦ {t("hub.title")}</span>
          <h1>{t("monthly.title")}</h1>
          <p>{t("monthly.desc")}</p>
        </div>
      </div>

      <form
        method="get"
        className="report-filters monthly-filters"
        data-monthly-filters>
        <label>
          {t("monthly.yearLabel")}
          <input
            className="admin-input"
            type="number"
            name="year"
            min={1900}
            max={2200}
            defaultValue={String(year)}
          />
        </label>
        <label>
          {t("monthly.monthLabel")}
          <select
            className="admin-input"
            name="month"
            data-month-filter
            defaultValue={String(month)}>
            {months.map((name, index) => (
              <option key={index} value={String(index + 1)}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button className="admin-mini-button monthly-apply" type="submit">
          {t("monthly.apply")}
        </button>
      </form>

      <div className="report-toolbar monthly-toolbar no-print">
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

      <section className="report-print monthly-sheet" data-monthly-matrix>
        <p className="report-brand">{common("brand")}</p>
        <p className="report-sheet-title">
          {t("monthly.title")} · {months[month - 1]}{" "}
          {formatNumber(year, digits)}
        </p>

        {matrix.grand || matrix.classLabels.length ? (
          <>
            <div className="admin-table-wrap monthly-scroll">
              <table className="admin-table matrix-table monthly-table">
                <thead>
                  <tr>
                    <th className="mx-class">{t("monthly.classColumn")}</th>
                    {Array.from({ length: matrix.daysInMonth }, (_, index) => (
                      <th key={index} scope="col" className="mx-day">
                        {formatNumber(index + 1, digits)}
                      </th>
                    ))}
                    <th className="mx-total">{t("monthly.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.classLabels.map((label, classIndex) => (
                    <tr key={label}>
                      <td className="mx-class">{label || "—"}</td>
                      {matrix.cells[classIndex].map((cell, day) => (
                        <td
                          key={day}
                          className="mx-day"
                          data-mx-cell={cell ? String(cell) : undefined}>
                          {money(cell)}
                        </td>
                      ))}
                      <td
                        className="mx-total"
                        data-mx-class-total={String(
                          matrix.classTotals[classIndex],
                        )}>
                        {currency}
                        {formatNumber(matrix.classTotals[classIndex], digits)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr data-mx-day-totals>
                    <td className="mx-class">{t("monthly.total")}</td>
                    {matrix.dayTotals.map((cell, day) => (
                      <td key={day} className="mx-day">
                        {money(cell)}
                      </td>
                    ))}
                    <td
                      className="mx-total"
                      data-mx-grand={String(matrix.grand)}>
                      {currency}
                      {formatNumber(matrix.grand, digits)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="monthly-grand" data-mx-grand-line>
              {t("monthly.grand")}: {currency}
              {formatNumber(matrix.grand, digits)}
            </p>

            {matrix.typeTotals.length > 0 && (
              <ul className="monthly-types" data-monthly-types>
                <li className="monthly-types-title">
                  <strong>{t("monthly.typesTitle")}</strong>
                </li>
                {matrix.typeTotals.map((entry) => (
                  <li key={entry.type}>
                    {t(typeLabelKey(entry.type))}: {currency}
                    {formatNumber(entry.total, digits)}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="admin-empty monthly-empty">{t("monthly.empty")}</div>
        )}
      </section>
    </>
  );
}
