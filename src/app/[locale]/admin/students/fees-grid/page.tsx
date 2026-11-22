import { CenterPrintButton } from "@/components/admin/center-print-button";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/admin/format";
import { requireAdminPage } from "@/lib/admin/guard";
import { monthNames, type MonthTable } from "@/lib/admin/months";
import { dhakaCalendar } from "@/lib/center/month-status";
import { getCenterSheet } from "@/lib/center/sheet-view";
import { CenterClassGroup } from "@/models/CenterRecords";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

/* A stored month status is data; the reader gets the word from the catalog. Checked by tests/i18n-catalog.test.ts. */
const names: Record<string, string> = {
  NOT_APPLICABLE: "statusLabels.notApplicable",
  HELD: "statusLabels.held",
  WAIVED: "statusLabels.waived",
  UPCOMING: "statusLabels.upcoming",
  PAID: "statusLabels.paid",
  PARTIAL: "statusLabels.partial",
  PENDING: "statusLabels.pending",
  DUE: "statusLabels.due",
};

/* Order of the colour legend above the table. */
const legend = [
  "PAID",
  "PARTIAL",
  "PENDING",
  "DUE",
  "UPCOMING",
  "HELD",
  "WAIVED",
  "NOT_APPLICABLE",
];

export default async function Grid({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string; year?: string }>;
}) {
  await requireAdminPage();
  const months = monthNames(
      (await getTranslations("common")).raw("monthsShort") as MonthTable,
    ),
    daily = await getTranslations("daily"),
    t = await getTranslations("center");
  const { locale } = await params,
    q = await searchParams,
    groups = await CenterClassGroup.find({ active: true })
      .select("name academicYear shift")
      .sort({ academicYear: -1, order: 1, "name.bn": 1 })
      .limit(200)
      .lean<
        {
          _id: unknown;
          name: { bn: string };
          academicYear: number;
          shift: string;
        }[]
      >(),
    year =
      Number(q.year) ||
      groups.find((g) => String(g._id) === q.class)?.academicYear ||
      dhakaCalendar(new Date()).year;
  let sheet: Awaited<ReturnType<typeof getCenterSheet>> | null = null,
    error = "";
  if (q.class)
    try {
      sheet = await getCenterSheet(q.class, year);
    } catch {
      error = t("grid.loadError");
    }
  const numLocale = locale === "en" ? "en" : "bn";
  const totalPaid = sheet ? sheet.rows.reduce((a, r) => a + r.paid, 0) : 0;
  const totalDue = sheet ? sheet.rows.reduce((a, r) => a + r.due, 0) : 0;

  return (
    <div className="fg">
      <header className="fg-head">
        <h1>{t("grid.title")}</h1>
        <p>{t("grid.scopeNote")}</p>
      </header>

      <form method="get" className="fg-filter">
        <label className="fg-field fg-field-class">
          {t("grid.classLabel")}
          <select
            className="fg-select"
            name="class"
            defaultValue={q.class || ""}
            required>
            <option value="">{t("grid.chooseClass")}</option>
            {groups.map((g) => (
              <option key={String(g._id)} value={String(g._id)}>
                {g.name.bn} · {formatNumber(g.academicYear, numLocale)}
                {g.shift ? ` · ${g.shift}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="fg-field fg-field-year">
          {t("grid.yearLabel")}
          <input
            className="fg-input"
            name="year"
            inputMode="numeric"
            defaultValue={year}
          />
        </label>

        <button type="submit" className="fg-btn">
          {t("grid.viewButton")}
        </button>

        {sheet && (
          <a
            className="fg-btn-ghost"
            href={`/${locale}/admin/students/fees-grid/export?class=${encodeURIComponent(sheet.groupId)}&year=${year}`}>
            {t("grid.downloadExcel")}
          </a>
        )}
      </form>

      {error && (
        <p role="alert" className="fg-alert">
          {error}
        </p>
      )}

      {sheet && (
        <section className="fg-panel sheet-print">
          <div className="fg-panel-head">
            <div className="fg-panel-title">
              <h2>
                {sheet.groupName} · {formatNumber(sheet.year, numLocale)}
              </h2>
              <ul className="fg-stats">
                <li className="fg-stat fg-stat-paid">
                  {t("grid.paidColumn")}
                  <b>{totalPaid}</b>
                </li>
                <li className="fg-stat fg-stat-due">
                  {t("grid.dueColumn")}
                  <b>{totalDue}</b>
                </li>
              </ul>
            </div>
            <div className="fg-panel-actions">
              <CenterPrintButton />
            </div>
          </div>

          <ul className="fg-legend" aria-hidden="true">
            {legend.map((s) => (
              <li key={s} data-status={s}>
                <i />
                {daily(names[s])}
              </li>
            ))}
          </ul>

          <div className="fg-scroll">
            <table className="fg-table">
              <thead>
                <tr>
                  <th className="fg-th-no">{t("serialShort")}</th>
                  <th className="fg-th-name">{t("grid.namePhoneColumn")}</th>
                  <th>{t("grid.admissionColumn")}</th>
                  {months.map((m) => (
                    <th key={m}>{m}</th>
                  ))}
                  <th>{t("grid.paidColumn")}</th>
                  <th>{t("grid.dueColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="fg-no">{i + 1}</td>
                    <td className="fg-name">
                      <Link href={`/admin/students/${r.id}`}>{r.name}</Link>
                      <small>{r.phone || "—"}</small>
                    </td>
                    <td className="fg-adm">
                      <Link
                        href={`/admin/students/collect?student=${r.id}&year=${year}&fee=admission`}>
                        <small
                          className={
                            r.admission.receipts.length
                              ? "fg-rcpt"
                              : "fg-rcpt fg-empty"
                          }>
                          {r.admission.receipts.join(", ") || "—"}
                        </small>
                        <strong
                          className={
                            r.admission.amount ? "fg-amt" : "fg-amt fg-empty"
                          }>
                          {r.admission.amount || "—"}
                        </strong>
                      </Link>
                    </td>
                    {r.cells.map((c, j) => (
                      <td className="fg-cell" data-status={c.status} key={j}>
                        <Link
                          href={`/admin/students/collect?student=${r.id}&year=${year}&month=${j + 1}`}>
                          <small
                            className={
                              c.receipts.length ? "fg-rcpt" : "fg-rcpt fg-empty"
                            }>
                            {c.receipts.join(", ") || "—"}
                          </small>
                          <strong
                            className={c.paid ? "fg-amt" : "fg-amt fg-empty"}>
                            {c.paid || "—"}
                          </strong>
                          <small className="fg-st">
                            {daily(names[c.status] || c.status)}
                          </small>
                        </Link>
                      </td>
                    ))}
                    <td className="fg-sum fg-sum-paid">{r.paid}</td>
                    <td className="fg-sum fg-sum-due">{r.due}</td>
                  </tr>
                ))}
                <tr className="fg-total">
                  <th colSpan={2} className="fg-total-label">
                    {t("grid.monthlyTotals")}
                  </th>
                  <th>{sheet.admissionTotal}</th>
                  {sheet.totals.map((n, i) => (
                    <th key={i}>{n}</th>
                  ))}
                  <th>{totalPaid}</th>
                  <th>{totalDue}</th>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
