import { DueSnapshotForm } from "@/components/admin/center-due-snapshot";
import SmsDialogHost from "@/components/admin/sms-dialog-host";
import { Link } from "@/i18n/navigation";
import { dashboardDigits } from "@/lib/admin/digits";
import { formatNumber } from "@/lib/admin/format";
import { requireAdminPage } from "@/lib/admin/guard";
import {
  liveClassDues,
  liveClassDueSummary,
  type ClassDueSummaryRow,
} from "@/lib/center/dues-query";
import { CenterClassGroup, CenterDueSnapshot } from "@/models/CenterRecords";
import mongoose from "mongoose";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

type Group = {
  _id: mongoose.Types.ObjectId;
  name: { bn: string; en: string };
  academicYear: number;
  shift?: string;
};

export default async function Dues({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string }>;
}) {
  const ts = await getTranslations("sms"),
    t = await getTranslations("dues");
  const actor = await requireAdminPage();
  const { locale } = await params,
    q = await searchParams,
    bn = locale === "bn",
    digits = await dashboardDigits(actor.id),
    groups = await CenterClassGroup.find({ active: true })
      .select("name academicYear shift")
      .sort({ academicYear: -1, order: 1 })
      .limit(200)
      .lean<Group[]>(),
    selected = groups.find((g) => String(g._id) === q.class);
  let snapshots: {
    _id: mongoose.Types.ObjectId;
    takenAt: Date;
    rows: { amountDue: number }[];
  }[] = [];
  let data: Awaited<ReturnType<typeof liveClassDues>> | undefined,
    error = false;
  if (selected)
    try {
      data = await liveClassDues(String(selected._id));
      snapshots = await CenterDueSnapshot.find({ classGroup: selected._id })
        .select("takenAt rows.amountDue")
        .sort({ takenAt: -1 })
        .limit(20)
        .lean<typeof snapshots>();
    } catch {
      error = true;
    }

  /* Group 3 · the All-Class Due Summary: what the whole centre is owed, one line per class, before the
     picker that opens one class. It is read once for the page rather than once per class, and a class
     the engine could not read all the way says so instead of showing a total that is quietly short. */
  let summary: {
      rows: ClassDueSummaryRow[];
      total: number;
      asOf: Date;
    } | null = null,
    summaryFailed = false;
  try {
    summary = await liveClassDueSummary();
  } catch {
    summaryFailed = true;
  }

  return (
    <div className="dq-page">
      <header className="dq-head">
        <Link href="/admin/students" className="dq-back">
          ← {t("list.crumb.students")}
        </Link>
        <h1 className="dq-title">{t("list.title")}</h1>
        <p className="dq-desc">{t("list.legacyNote")}</p>
      </header>

      <section className="dq-card" data-dues-summary>
        <div className="dq-card-head">
          <h2 className="dq-card-title">{t("summary.title")}</h2>
          {summary && (
            <span className="dq-stat dq-stat-due" data-dues-summary-total>
              {formatNumber(summary.total, digits)} {t("list.takaUnit")}
            </span>
          )}
        </div>
        <div className="dq-card-body">
          <p className="dq-help">{t("summary.help")}</p>
          {summaryFailed && (
            <p className="dq-alert" role="alert">
              {t("summary.failed")}
            </p>
          )}
          {summary && summary.rows.length > 0 && (
            <div className="dq-table-wrap">
              <table className="dq-table" data-dues-summary-table>
                <caption className="dq-caption">{t("summary.caption")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("summary.col.class")}</th>
                    <th scope="col" className="dq-num">
                      {t("summary.col.active")}
                    </th>
                    <th scope="col" className="dq-num">
                      {t("summary.col.owing")}
                    </th>
                    <th scope="col" className="dq-num">
                      {t("summary.col.fee")}
                    </th>
                    <th scope="col" className="dq-num">
                      {t("summary.col.total")}
                    </th>
                    <th scope="col" className="dq-act">
                      {t("summary.col.action")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => (
                    <tr key={row.classId} data-dues-summary-row={row.classId}>
                      <th scope="row" className="dq-name">
                        <Link
                          href={`/admin/students/classes/${row.classId}`}
                          className="dq-link">
                          {(bn ? row.name.bn : row.name.en) || row.name.bn}
                        </Link>
                        <span className="dq-sub">
                          {row.shift ? `${row.shift} · ` : ""}
                          {formatNumber(row.academicYear, digits)}
                        </span>
                      </th>
                      <td
                        className="dq-num"
                        data-label={t("summary.col.active")}>
                        {formatNumber(row.active, digits)}
                      </td>
                      <td
                        className={`dq-num ${row.owing > 0 ? "dq-due" : "dq-zero"}`}
                        data-label={t("summary.col.owing")}>
                        {formatNumber(row.owing, digits)}
                      </td>
                      <td className="dq-num" data-label={t("summary.col.fee")}>
                        {row.monthlyFee > 0
                          ? formatNumber(row.monthlyFee, digits)
                          : "—"}
                      </td>
                      <td
                        className={`dq-num ${row.total > 0 ? "dq-due" : "dq-zero"}`}
                        data-label={t("summary.col.total")}>
                        {formatNumber(row.total, digits)}
                        {row.partial && (
                          <span className="dq-partial">
                            {t("summary.partial")}
                          </span>
                        )}
                      </td>
                      <td className="dq-act">
                        <Link
                          href={`/admin/students/dues?class=${row.classId}`}
                          className="dq-btn dq-btn-ghost"
                          data-dues-summary-view={row.classId}>
                          {t("summary.viewClass")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {summary && !summary.rows.length && !summaryFailed && (
            <p className="dq-empty">{t("summary.none")}</p>
          )}
        </div>
      </section>

      <section className="dq-card">
        <div className="dq-card-body">
          <form method="get" className="dq-filter">
            <label className="dq-filter-field">
              <span className="dq-filter-label">{t("list.classLabel")}</span>
              {/* Group 3: the summary's "open this class" link arrives here with the class
                  in the address, and a `defaultValue` is a word for the mount only — on a same-route navigation
                  React keeps the box it already painted and the picker would sit empty above the very list it
                  names. A key that changes with the address makes the box the page the address describes. */}
              <select
                name="class"
                required
                key={selected ? String(selected._id) : "none"}
                defaultValue={selected ? String(selected._id) : ""}>
                <option value="">{t("list.chooseClass")}</option>
                {groups.map((g) => (
                  <option key={String(g._id)} value={String(g._id)}>
                    {(bn ? g.name.bn : g.name.en) || g.name.bn} {g.shift || ""}{" "}
                    · {formatNumber(g.academicYear, digits)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="dq-btn dq-btn-primary">
              {t("list.show")}
            </button>
          </form>
          <p className="dq-help">{t("list.windowNote")}</p>
        </div>
      </section>

      {selected && (
        <section className="dq-card">
          <div className="dq-card-head">
            <h2 className="dq-card-title">{t("list.overdueHeading")}</h2>
            {data && (
              <div className="dq-tools">
                <span className="dq-stat">
                  {formatNumber(data.rows.length, digits)}{" "}
                  {t("list.studentsUnit")} · {formatNumber(data.total, digits)}{" "}
                  {t("list.takaUnit")}
                </span>
                <a
                  className="dq-btn dq-btn-ghost"
                  href={`/api/admin/center/dues-export?class=${selected._id}`}>
                  {t("list.downloadCsv")}
                </a>
                {data.rows.length > 0 && (
                  <SmsDialogHost
                    request={{
                      source: "dues",
                      classGroup: String(selected._id),
                    }}
                    title={ts("titles.dues")}
                    label={ts("labels.reminder")}
                    defaultTemplateKey="due_reminder"
                  />
                )}
              </div>
            )}
          </div>
          {error ? (
            <div className="dq-card-body">
              <p className="dq-alert" role="alert">
                {t("list.partialNote")}
              </p>
            </div>
          ) : (
            data && (
              <>
                <div className="dq-table-wrap">
                  <table className="dq-table">
                    <thead>
                      <tr>
                        <th>{t("list.studentColumn")}</th>
                        <th>{t("list.monthsColumn")}</th>
                        <th className="dq-num">{t("list.totalColumn")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r) => (
                        <tr key={String(r.student._id)}>
                          <td className="dq-name">
                            <Link
                              href={`/admin/students/${r.student._id}`}
                              className="dq-link">
                              {(bn ? r.student.name.bn : r.student.name.en) ||
                                r.student.name.bn}
                            </Link>
                            <span className="dq-sub">
                              {r.student.studentId}
                            </span>
                          </td>
                          <td data-label={t("list.monthsColumn")}>
                            <span className="dq-months">
                              {r.months.map((m) => (
                                <span
                                  key={`${m.year}-${m.month}`}
                                  className="dq-month">
                                  {formatNumber(m.month, digits)}/
                                  {formatNumber(m.year, digits)}:{" "}
                                  {formatNumber(m.due, digits)}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td
                            className="dq-num dq-due"
                            data-label={t("list.totalColumn")}>
                            {formatNumber(r.total, digits)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!data.rows.length && (
                  <div className="dq-card-body">
                    <p className="dq-empty">{t("list.none")}</p>
                  </div>
                )}

                <div className="dq-card-body dq-snap-zone">
                  <div className="dq-snapform">
                    <DueSnapshotForm
                      classId={String(selected._id)}
                      enabled={
                        process.env.CENTER_DUE_SNAPSHOT_WRITE_ENABLED === "true"
                      }
                    />
                  </div>
                  <h3 className="dq-subtitle">{t("list.snapshotsHeading")}</h3>
                  {snapshots.length > 0 && (
                    <ul className="dq-snaps">
                      {snapshots.map((s) => (
                        <li key={String(s._id)} className="dq-snap">
                          <Link
                            href={`/admin/students/dues/snapshot/${s._id}`}
                            className="dq-link">
                            {new Intl.DateTimeFormat(bn ? "bn-BD" : "en-GB", {
                              timeZone: "Asia/Dhaka",
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(s.takenAt)}
                          </Link>
                          <span className="dq-snap-meta">
                            {formatNumber(s.rows.length, digits)}{" "}
                            {t("list.studentsUnit")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="dq-help">{t("list.timezoneNote")}</p>
                </div>
              </>
            )
          )}
        </section>
      )}
    </div>
  );
}
