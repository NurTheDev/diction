import { LeadSmsBar, LeadSmsPicker } from "@/components/admin/lead-sms";
import { LeadQuickAdd, LeadSearch } from "@/components/admin/leads-ui";
import { listTableClass } from "@/components/admin/list-class";
import { FilterToggle } from "@/components/admin/list-pattern";
import { Pagination } from "@/components/admin/pagination";
import {
  FilterDayField,
  LeadFilters,
} from "@/components/admin/visitors-filters";
import { LeadBulkBar, VisitorRows } from "@/components/admin/visitors-row";
import { Link } from "@/i18n/navigation";
import { dashboardDigits } from "@/lib/admin/digits";
import { formatClass, formatNumber } from "@/lib/admin/format";
import { getArchiver } from "@/lib/admin/guard";
import { pageNumber } from "@/lib/admin/helpers";
import { visitorSmsDialogData } from "@/lib/center/sms-dialog-data";
import {
  groupLabel,
  mediumLabel,
  rowView,
  shiftLabel,
  sourceLabel,
  statusLabel,
  type LeadListFiltersShape,
} from "@/lib/leads/lead-ui";
import { leadStatusCounts, listLeads } from "@/lib/leads/leads";
import {
  LEAD_GROUPS,
  LEAD_MEDIUMS,
  LEAD_SHIFTS,
  LEAD_SOURCES,
  LEAD_STATUSES,
  leadListQuery,
} from "@/lib/leads/vocab";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

type Query = {
  q?: string | string[];
  status?: string | string[];
  classGroup?: string | string[];
  group?: string | string[];
  shift?: string | string[];
  medium?: string | string[];
  source?: string | string[];
  followUp?: string | string[];
  from?: string | string[];
  to?: string | string[];
  page?: string | string[];
  new?: string | string[];
  closed?: string | string[];
  stale?: string | string[];
};

const first = (val: string | string[] | undefined): string | undefined =>
  Array.isArray(val) ? val[0] : val;

const one = (value: string | undefined, allowed: readonly string[]): string =>
  value && allowed.includes(value) ? value : "";

const day = (value: string | undefined): string =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";

export default async function Leads({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  const user = await getArchiver();
  if (!user) redirect(`/${locale}/admin`);

  const language = locale === "bn" ? "bn" : "en";

  // Concurrent loading of translations, digits, and query params
  const [digits, t, query] = await Promise.all([
    dashboardDigits(user.id),
    getTranslations("leads"),
    searchParams,
  ]);

  const q = (first(query.q) || "").trim().slice(0, 80);
  const status = one(first(query.status), LEAD_STATUSES);
  const group = one(first(query.group), LEAD_GROUPS);
  const shift = one(first(query.shift), LEAD_SHIFTS);
  const medium = one(first(query.medium), LEAD_MEDIUMS);
  const source = one(first(query.source), LEAD_SOURCES);
  const followUp = one(first(query.followUp), ["today", "overdue", "none"]) as
    | ""
    | "today"
    | "overdue"
    | "none";
  const classGroup = one(first(query.classGroup), [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
  ]);
  const from = day(first(query.from));
  const to = day(first(query.to));
  const showClosed = first(query.closed) === "1";
  const stale = first(query.stale) === "1";
  const page = pageNumber(first(query.page));
  const openQuickAdd = first(query.new) === "1";

  const maySendSms =
    user.role === "admin" ||
    user.role === "superadmin" ||
    user.role === "staff";

  const now = new Date();

  // Concurrent data fetching for list, counts, and SMS kit
  const [result, counts, sms] = await Promise.all([
    listLeads(
      {
        q,
        status,
        classGroup,
        group,
        shift,
        medium,
        source,
        followUp: followUp || undefined,
        from,
        to,
        page,
        perPage: 20,
        showClosed,
        stale,
      },
      now,
    ),
    leadStatusCounts(),
    maySendSms ? visitorSmsDialogData(user.role) : Promise.resolve(null),
  ]);

  const canDelete = user.role === "admin" || user.role === "superadmin";
  const canArchive = ["superadmin", "admin", "staff"].includes(user.role);
  const seesNumbers = canArchive;

  const items = result.rows.map((row) => ({
    row: rowView(row),
    fullPhone: seesNumbers ? row.phones?.[0]?.normalized || "" : "",
  }));

  const smsRows = result.rows.map((row) => ({
    id: row.id,
    studentName: row.studentName,
    contactable: row.contactable,
    hasPhone: (row.phones || []).length > 0,
  }));

  const current: LeadListFiltersShape = {
    q: q || undefined,
    status: status || undefined,
    classGroup: classGroup || undefined,
    group: group || undefined,
    shift: shift || undefined,
    medium: medium || undefined,
    source: source || undefined,
    followUp: followUp || undefined,
    from: from || undefined,
    to: to || undefined,
    closed: showClosed || undefined,
    stale: stale || undefined,
  };

  const hrefOf = (overrides: Partial<LeadListFiltersShape>): string =>
    leadListQuery({ locale: "bn", ...current, ...overrides }).href.replace(
      /^\/bn/,
      "",
    );

  const everyLead = counts.reduce((sum, entry) => sum + entry.count, 0);
  const activeFilters =
    [
      status,
      classGroup,
      group,
      shift,
      medium,
      source,
      followUp,
      from,
      to,
      q,
    ].filter(Boolean).length +
    (showClosed ? 1 : 0) +
    (stale ? 1 : 0);

  const queryRecord: Record<string, string> = {};
  for (const [key, value] of Object.entries(current))
    if (value) queryRecord[key] = value === true ? "1" : String(value);

  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>
            {followUp === "today"
              ? t("dueToday")
              : followUp === "overdue"
                ? t("overdue")
                : t("title")}
          </h1>
          <p>{t("desc")}</p>
        </div>
      </div>

      <div className="lead-tools">
        <LeadQuickAdd open={openQuickAdd} language={language} digits={digits} />
        <LeadSearch language={language} digits={digits} current={current} />
      </div>

      {result.refusedPhone && (
        <p className="admin-feedback error" role="status">
          {t("searchNumberHelp")}
        </p>
      )}

      <nav className="lead-chips" aria-label={t("colStatus")}>
        <Link
          href={hrefOf({ status: undefined })}
          className={status ? "" : "selected"}>
          {t("all")} <span>{formatNumber(everyLead, digits)}</span>
        </Link>
        {counts.map((entry) => (
          <Link
            key={entry.status}
            href={hrefOf({ status: entry.status })}
            className={status === entry.status ? "selected" : ""}>
            {statusLabel(t, entry.status)}{" "}
            <span>{formatNumber(entry.count, digits)}</span>
          </Link>
        ))}
      </nav>

      <LeadFilters
        label={t("filters")}
        active={activeFilters ? formatNumber(activeFilters, digits) : ""}>
        <form method="get" className="list-filter">
          {q && !result.refusedPhone && (
            <input type="hidden" name="q" value={q} />
          )}

          <label>
            {t("colStatus")}
            <select
              className="admin-select"
              name="status"
              defaultValue={status}>
              <option value="">{t("all")}</option>
              {LEAD_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {statusLabel(t, option)}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("classGroup")}
            <select
              className="admin-select"
              name="classGroup"
              defaultValue={classGroup}>
              <option value="">{t("all")}</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map(
                (value) => (
                  <option key={value} value={String(value)}>
                    {formatClass(value, digits, language, t("colClass"))}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            {t("group")}
            <select className="admin-select" name="group" defaultValue={group}>
              <option value="">{t("all")}</option>
              {LEAD_GROUPS.map((option) => (
                <option key={option} value={option}>
                  {groupLabel(t, option)}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("shift")}
            <select className="admin-select" name="shift" defaultValue={shift}>
              <option value="">{t("all")}</option>
              {LEAD_SHIFTS.map((option) => (
                <option key={option} value={option}>
                  {shiftLabel(t, option)}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("medium")}
            <select
              className="admin-select"
              name="medium"
              defaultValue={medium}>
              <option value="">{t("all")}</option>
              {LEAD_MEDIUMS.map((option) => (
                <option key={option} value={option}>
                  {mediumLabel(t, option)}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("source")}
            <select
              className="admin-select"
              name="source"
              defaultValue={source}>
              <option value="">{t("all")}</option>
              {LEAD_SOURCES.map((option) => (
                <option key={option} value={option}>
                  {sourceLabel(t, option)}
                </option>
              ))}
            </select>
          </label>

          <FilterToggle
            name="closed"
            label={t("showClosed")}
            defaultChecked={showClosed}
          />

          <FilterToggle
            name="stale"
            label={t("staleOnly")}
            defaultChecked={stale}
          />

          <label>
            {t("colFollowUp")}
            <select
              className="admin-select"
              name="followUp"
              defaultValue={followUp}>
              <option value="">{t("all")}</option>
              <option value="today">{t("dueToday")}</option>
              <option value="overdue">{t("overdue")}</option>
              <option value="none">{t("followUpNone")}</option>
            </select>
          </label>

          <label>
            {t("from")}
            <FilterDayField
              name="from"
              value={from}
              placeholder={t("from")}
              clearLabel={t("reset")}
              digits={digits}
              language={language}
            />
          </label>

          <label>
            {t("to")}
            <FilterDayField
              name="to"
              value={to}
              placeholder={t("to")}
              clearLabel={t("reset")}
              digits={digits}
              language={language}
            />
          </label>

          <div className="lead-form-foot">
            <button type="submit" className="button button-navy">
              {t("apply")}
            </button>
            <Link
              className="admin-mini-button"
              href={hrefOf({
                q: undefined,
                status: undefined,
                classGroup: undefined,
                group: undefined,
                shift: undefined,
                medium: undefined,
                source: undefined,
                followUp: undefined,
                from: undefined,
                to: undefined,
                closed: undefined,
                stale: undefined,
              })}>
              {t("reset")}
            </Link>
          </div>
        </form>
      </LeadFilters>

      <LeadSmsPicker
        rows={smsRows}
        kit={sms}
        digits={digits}
        language={language}>
        <section className="admin-panel list-panel">
          <div className="admin-panel-head">
            <h2>
              {followUp === "today"
                ? t("dueToday")
                : followUp === "overdue"
                  ? t("overdue")
                  : t("title")}
            </h2>
            <span className="admin-help">
              {t("totalLeads", { count: formatNumber(result.total, digits) })}
            </span>
            <LeadSmsBar digits={digits} />
            <LeadBulkBar
              canDelete={canDelete}
              canArchive={canArchive}
              digits={digits}
              language={language}
            />
          </div>

          {result.rows.length ? (
            <div className="admin-table-wrap visitor-wrap">
              <table
                className={`${listTableClass("visitor")} admin-responsive-table`}>
                <thead>
                  <tr>
                    {sms && (
                      <th
                        className="visitor-check list-check"
                        aria-label={t("row.bulk")}></th>
                    )}
                    <th className="visitor-who list-who">{t("colVisitor")}</th>
                    <th className="visitor-call list-call">
                      {t("colContact")}
                    </th>
                    <th className="visitor-status list-status">
                      {t("colStatus")}
                    </th>
                    <th className="visitor-follow list-follow">
                      {t("colFollowUp")}
                    </th>
                    <th className="visitor-note list-note">{t("lastNote")}</th>
                    <th className="visitor-act list-act">{t("colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  <VisitorRows
                    items={items}
                    canDelete={canDelete}
                    canArchive={canArchive}
                    sms={sms}
                    language={language}
                    digits={digits}
                    hasCheck={Boolean(sms)}
                  />
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty">
              <p>{activeFilters || q ? t("emptyFilter") : t("empty")}</p>
              <span className="admin-help">{t("emptyHelp")}</span>
            </div>
          )}

          <div className="admin-panel-body">
            <Pagination
              path="/admin/leads"
              page={result.page}
              totalPages={result.pages}
              query={queryRecord}
              digits={digits}
            />
            {stale && (
              <p className="admin-help" data-stale-hint="">
                {t("staleHint")}
              </p>
            )}
          </div>
        </section>
      </LeadSmsPicker>
    </>
  );
}
