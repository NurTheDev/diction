import { Link } from "@/i18n/navigation";
import {
  formatClass,
  formatDate,
  formatNumber,
  formatTime,
  type Digits,
} from "@/lib/admin/format";
import {
  ArrowRight,
  CalendarCheck,
  CalendarX2,
  ClipboardList,
  FileX2,
  Inbox,
  UsersRound,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { CancelBooking } from "./forms";
import { CopyReference, OverviewDetail } from "./overview-detail";

type Item = {
  id: string;
  reference: string;
  studentName: string;
  grade: string;
  status: string;
  phone?: string;
  whatsapp?: string;
  date?: string;
  subject?: string;
  time?: string;
  fields?: [string, string][];
};
type OverviewData = {
  counts: [number | string, number | string, number | string, number | string];
  newToday?: number;
  admissions: Item[];
  bookings: Item[];
};

/** First letter of the name, for the avatar. Array.from keeps Bangla characters whole. */
const initial = (name: string) => Array.from(name.trim())[0] ?? "?";
const localizePhone = (phone: string, digits: Digits) =>
  phone.replace(/[0-9]/g, (n) => formatNumber(Number(n), digits));
const dialable = (phone: string) => phone.replace(/[^+\d]/g, "");

/**
 * The welcome line: whose morning it is, what day it is, and how much of today has already arrived.
 * Kept separate so the page can place the day's money / call-back tier between it and the panels.
 */
export async function OverviewHeading({
  name,
  digits,
  preview = false,
  newToday,
  todayBookings = 0,
}: {
  name: string;
  digits: Digits;
  preview?: boolean;
  newToday?: number;
  todayBookings?: number;
}) {
  const [t, a, locale] = await Promise.all([
    getTranslations("adminRedesign"),
    getTranslations("admin"),
    getLocale(),
  ]);
  const language = locale === "bn" ? "bn" : "en";
  const firstName = name.trim().split(/\s+/)[0] || name;

  // No counts = a role that may not see intake, so there is no summary to claim.
  let summary: string | null = null;
  if (preview) summary = a("previewText");
  else if (newToday !== undefined)
    summary =
      newToday || todayBookings
        ? t("summaryToday", {
            n: formatNumber(newToday || 0, digits),
            m: formatNumber(todayBookings, digits),
          })
        : t("summaryNone");

  return (
    <header className="ov-heading">
      <h1>{t("welcome", { name: firstName })}</h1>
      <p>
        <span className="ov-date">
          {formatDate(new Date(), digits, language)}
        </span>
        {summary && (
          <>
            <span className="ov-dot" aria-hidden="true" />
            <span>{summary}</span>
          </>
        )}
      </p>
    </header>
  );
}

export async function Overview({
  data,
  preview = false,
  name = "Admin",
  digits = "bn",
  withHeading = true,
}: {
  data: OverviewData;
  preview?: boolean;
  name?: string;
  digits?: Digits;
  withHeading?: boolean;
}) {
  const [t, a, c, locale] = await Promise.all([
    getTranslations("adminRedesign"),
    getTranslations("admin"),
    getTranslations("common"),
    getLocale(),
  ]);
  const language = locale === "bn" ? "bn" : "en";
  const periodLabel = (k: string) => c(`dayPeriod.${k}`);
  const time = (value?: string) =>
    value ? formatTime(value, digits, language, periodLabel) : "—";

  const kpis = [
    {
      label: t("newAdmissions"),
      icon: ClipboardList,
      href: "/admin/admissions?status=pending",
      tone: "amber",
      hint: data.admissions[0]?.studentName,
    },
    {
      label: t("todayBookings"),
      icon: CalendarCheck,
      href: "/admin/bookings",
      tone: "blue",
      hint: data.bookings[0]
        ? `${data.bookings[0].studentName} · ${time(data.bookings[0].time)}`
        : undefined,
    },
    {
      label: t("unreadMessages"),
      icon: Inbox,
      href: "/admin/messages",
      tone: "rose",
      hint: undefined,
    },
    {
      label: t("activeBatches"),
      icon: UsersRound,
      href: "/admin/batches",
      tone: "green",
      hint: undefined,
    },
  ] as const;

  const todayCount = typeof data.counts[1] === "number" ? data.counts[1] : 0;
  /* The pill is the TOTAL waiting, not the five rows shown: "5" beside twelve pending would mislead. */
  const admissionsTotal =
    typeof data.counts[0] === "number"
      ? data.counts[0]
      : data.admissions.length;
  const bookingsTotal =
    typeof data.counts[1] === "number" ? data.counts[1] : data.bookings.length;

  return (
    <div className="ov">
      {withHeading && (
        <OverviewHeading
          name={name}
          digits={digits}
          preview={preview}
          newToday={data.newToday || 0}
          todayBookings={todayCount}
        />
      )}

      <div className="ov-kpis">
        {kpis.map(({ label, icon: Icon, href, tone, hint }, i) => {
          const raw = data.counts[i];
          return (
            <Link href={href} className="ov-kpi" data-tone={tone} key={href}>
              <span className="ov-kpi-icon">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="ov-kpi-label">{label}</span>
              <strong
                className="ov-kpi-value"
                data-zero={raw === 0 || undefined}>
                {typeof raw === "number" ? formatNumber(raw, digits) : raw}
              </strong>
              <span className="ov-kpi-view">
                <span className="ov-sr">{t("view")}</span>
                <ArrowRight size={18} aria-hidden="true" />
              </span>
              {hint && <span className="ov-kpi-hint">{hint}</span>}
            </Link>
          );
        })}
      </div>

      <div className="ov-columns">
        {/* Recent admissions */}
        <section className="ov-panel" aria-labelledby="ov-adm-title">
          <div className="ov-panel-head">
            <h2 id="ov-adm-title">
              {t("recentAdmissions")}
              <span className="ov-count">
                {formatNumber(admissionsTotal, digits)}
              </span>
            </h2>
            <Link href="/admin/admissions" className="ov-link">
              {t("viewAll")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {data.admissions.length ? (
            <div className="ov-table-wrap">
              <table className="ov-table" aria-labelledby="ov-adm-title">
                <thead>
                  <tr>
                    <th>{t("student")}</th>
                    <th>{a("class")}</th>
                    <th>{t("guardianPhone")}</th>
                    <th>{t("date")}</th>
                    <th>{t("status")}</th>
                    <th>
                      <span className="ov-sr">{t("action")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.admissions.map((item) => (
                    <tr key={item.id}>
                      <td data-label={t("student")} className="ov-cell-main">
                        <span className="ov-avatar" aria-hidden="true">
                          {initial(item.studentName)}
                        </span>
                        <span className="ov-person">
                          <strong>{item.studentName}</strong>
                          <CopyReference
                            reference={item.reference}
                            digits={digits}
                          />
                        </span>
                      </td>
                      <td data-label={a("class")}>
                        {formatClass(item.grade, digits, language, a("class"))}
                      </td>
                      <td data-label={t("guardianPhone")}>
                        {item.phone ? (
                          <a
                            className="ov-phone"
                            href={`tel:${dialable(item.phone)}`}>
                            {localizePhone(item.phone, digits)}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-label={t("date")}>
                        {item.date
                          ? formatDate(item.date, digits, language)
                          : "—"}
                      </td>
                      <td data-label={t("status")}>
                        <span className={`admin-badge ${item.status}`}>
                          {a(item.status)}
                        </span>
                      </td>
                      <td data-label={t("action")} className="ov-cell-action">
                        <OverviewDetail
                          title={item.studentName}
                          fields={item.fields || []}
                          phone={item.phone}
                          whatsapp={item.whatsapp}
                          admissionId={item.id}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ov-empty">
              <FileX2 size={28} aria-hidden="true" />
              <strong>{t("emptyAdmissions")}</strong>
              <p>{t("emptyAdmissionsHelp")}</p>
            </div>
          )}
        </section>

        {/* Today's trial classes */}
        <section className="ov-panel" aria-labelledby="ov-book-title">
          <div className="ov-panel-head">
            <h2 id="ov-book-title">
              {t("todayTrial")}
              <span className="ov-count">
                {formatNumber(bookingsTotal, digits)}
              </span>
            </h2>
            <Link href="/admin/bookings" className="ov-link">
              {t("viewAll")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {data.bookings.length ? (
            <ul className="ov-timeline">
              {data.bookings.map((b) => (
                <li className="ov-booking" key={b.id}>
                  <span className="ov-time">{time(b.time)}</span>
                  <div className="ov-booking-main">
                    <strong>{b.studentName}</strong>
                    <span>
                      {[
                        formatClass(b.grade, digits, language, a("class")),
                        b.subject,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <span className={`admin-badge ${b.status}`}>
                    {a(b.status)}
                  </span>
                  <div className="ov-actions">
                    <OverviewDetail
                      title={b.studentName}
                      fields={b.fields || []}
                      phone={b.phone}
                      bookingId={b.id}
                    />
                    <CancelBooking id={b.id} compact />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="ov-empty">
              <CalendarX2 size={28} aria-hidden="true" />
              <strong>{t("emptyBookings")}</strong>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
