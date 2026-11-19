import { PrintButton } from "@/components/exams/print-button";
import { Link } from "@/i18n/navigation";
import { dashboardDigits } from "@/lib/admin/digits";
import { formatDate, formatDigits, formatNumber } from "@/lib/admin/format";
import { requireArchiverPage } from "@/lib/admin/guard";
import { monthNames, type MonthTable } from "@/lib/admin/months";
import { dhakaCalendar } from "@/lib/center/month-status";
import { loadDailyReport } from "@/lib/reports/collections-data";
import { typeLabelKey } from "@/lib/reports/vocab";
import { FileSpreadsheet, FileText } from "lucide-react";
import mongoose from "mongoose";
import { getTranslations } from "next-intl/server";
import "../../../../../daily-report.css";

export const dynamic = "force-dynamic";

/** `YYYY-MM-DD` that is also a real calendar day (rejects 2026-02-31). */
function isRealDay(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export default async function DailyReport({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string; operator?: string }>;
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
  const date = isRealDay(query.date)
    ? query.date
    : `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  const operator =
    query.operator && mongoose.isValidObjectId(query.operator)
      ? query.operator
      : null;

  const { breakdown, options } = await loadDailyReport({
    date,
    operatorId: operator,
    locale,
  });

  const money = (value: number) => `${currency}${formatNumber(value, digits)}`;
  const exportQuery = `kind=daily&date=${date}${operator ? `&operator=${operator}` : ""}`;

  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="section-tag">✦ {t("hub.title")}</span>
          <h1>{t("daily.title")}</h1>
          <p>{t("daily.desc")}</p>
        </div>
      </div>

      <form
        method="get"
        className="report-filters daily-filters"
        data-daily-filters>
        <label>
          {t("daily.dateLabel")}
          <input
            className="admin-input"
            type="date"
            name="date"
            defaultValue={date}
          />
        </label>
        <label>
          {t("daily.operatorLabel")}
          <select
            className="admin-input"
            name="operator"
            data-operator-filter
            defaultValue={operator || ""}>
            <option value="">{t("daily.operatorAll")}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <button className="admin-mini-button daily-apply" type="submit">
          {t("daily.apply")}
        </button>
      </form>

      <div className="report-toolbar daily-toolbar no-print">
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

      <section className="report-print daily-sheet" data-daily-report>
        <p className="report-brand">{common("brand")}</p>
        <p className="report-sheet-title">
          {t("daily.title")} ·{" "}
          {formatDate(date, digits, locale === "en" ? "en" : "bn")}
        </p>

        {breakdown.rows.length ? (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table admin-responsive-table daily-table">
                <thead>
                  <tr>
                    <th>{t("daily.receipt")}</th>
                    <th>{t("daily.student")}</th>
                    <th>{t("daily.class")}</th>
                    <th>{t("daily.type")}</th>
                    <th>{t("daily.month")}</th>
                    <th className="num">{t("daily.amount")}</th>
                    <th>{t("daily.operator")}</th>
                    <th>{t("daily.note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.rows.map((row) => (
                    <tr key={row.id} data-daily-row>
                      <td data-label={t("daily.receipt")}>
                        <span className="daily-receipt">
                          {formatDigits(row.receiptNo, digits) || "—"}
                        </span>
                      </td>
                      <td data-label={t("daily.student")}>
                        <span className="daily-student">{row.studentName}</span>{" "}
                        {row.studentId ? (
                          <span className="daily-student-id">
                            · {row.studentId}
                          </span>
                        ) : (
                          ""
                        )}
                      </td>
                      <td data-label={t("daily.class")}>
                        {row.classLabel || "—"}
                      </td>
                      <td data-label={t("daily.type")}>
                        <span className="daily-type">
                          {t(typeLabelKey(row.type))}
                        </span>
                      </td>
                      <td data-label={t("daily.month")}>
                        {row.monthKey
                          ? `${months[Number(row.monthKey.slice(5, 7)) - 1]} ${formatDigits(row.monthKey.slice(0, 4), digits)}`
                          : "—"}
                      </td>
                      <td className="num" data-label={t("daily.amount")}>
                        {money(row.amount)}
                      </td>
                      <td data-label={t("daily.operator")}>
                        {row.operatorName || "—"}
                      </td>
                      <td data-label={t("daily.note")}>{row.note || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="daily-total" data-daily-total>
              {t("daily.totalLine", {
                count: formatNumber(breakdown.count, digits),
                total: money(breakdown.total),
              })}
            </p>

            {breakdown.operators.length > 0 && (
              <ul className="daily-operators" data-daily-operators>
                {breakdown.operators.map((entry) => (
                  <li key={entry.id}>
                    {entry.name}: {formatNumber(entry.count, digits)} ·{" "}
                    {money(entry.total)}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="admin-empty daily-empty">{t("daily.empty")}</div>
        )}
      </section>
    </>
  );
}
