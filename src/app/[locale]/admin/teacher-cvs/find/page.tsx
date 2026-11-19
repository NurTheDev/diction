import { Pagination } from "@/components/admin/pagination";
import {
  CvDetailDrawer,
  CvNeedForm,
  CvNeedRow,
  CvRowControls,
  CvSmsBar,
  CvSmsCheck,
  CvSmsPicker,
} from "@/components/admin/teacher-cvs-ui";
import { Link } from "@/i18n/navigation";
import { dashboardDigits } from "@/lib/admin/digits";
import { formatDate, formatNumber } from "@/lib/admin/format";
import { getAdmin } from "@/lib/admin/guard";
import { teacherSmsDialogData } from "@/lib/center/sms-dialog-data";
import { listCandidates } from "@/lib/teachers/candidates";
import {
  candidateListView,
  candidateRowView,
  ratingBadge,
  ratingLabel,
  shiftLabel,
  statusBadge,
  statusLabel,
  subjectLabel,
} from "@/lib/teachers/cv-ui";
import { listNeeds, needMatches } from "@/lib/teachers/needs";
import {
  TEACHER_CLASS_LEVELS,
  TEACHER_RATINGS,
  TEACHER_SHIFTS,
  TEACHER_STATUSES,
  TEACHER_SUBJECTS,
  teacherListQuery,
} from "@/lib/teachers/vocab";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  MessageCircle,
  Phone,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import "@/teacher-find.css";

type Query = {
  subject?: string;
  classLevel?: string;
  shift?: string;
  status?: string;
  rating?: string;
  availability?: string;
  q?: string;
  need?: string;
  page?: string;
};

/**
 * R4 · Find a teacher.
 *
 * The list answers "who is on file"; this screen answers "who can teach class 9 maths in the evening".
 * It shares the filters, row controls and drawer with the list instead of carrying a second copy:
 *
 *   • A saved teaching need is a question written down once; its count and matches come from the same
 *     filter (`teacherListFilter`) a hand-set search uses, so the two can never disagree.
 *   • One table either way: opening a need renders the same full rows as a filtered search.
 *   • Rows are dialable, WhatsApp-able and SMS-able in place, and can be ticked and texted together
 *     through the app's one SMS dialog (`teacher_opening` template).
 *   • A number is a mask on screen and a `tel:` / WhatsApp destination in the link.
 */
export default async function FindTeacher({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  // Super Admin and Admin only; a role that may not see CVs is sent away rather than shown an error panel.
  const user = await getAdmin();
  if (!user) redirect(`/${locale}/admin`);

  const language = locale === "bn" ? "bn" : "en";
  const [digits, t, query] = await Promise.all([
    dashboardDigits(user.id),
    getTranslations("teacherCvs"),
    searchParams,
  ]);

  const checked = teacherListQuery({ ...query, review: "", from: "", to: "" });
  const needId = (query.need || "").trim();
  const page = Math.max(1, Number(query.page) || 1);
  const now = new Date();

  const [result, needs, matched, sms] = await Promise.all([
    needId
      ? Promise.resolve(null)
      : listCandidates({ ...checked, page, perPage: 25 }, now),
    listNeeds(),
    needId ? needMatches(needId, 50, now) : Promise.resolve([]),
    teacherSmsDialogData(),
  ]);

  const need = needs.find((entry) => entry.id === needId) || null;
  const view = result ? candidateListView(result) : null;
  const rows = (need ? matched.map(candidateRowView) : view?.rows) || [];
  const total = need ? rows.length : view?.total || 0;

  const smsRows = rows.map((row) => ({
    id: row.id,
    name: row.name,
    hasPhone: row.phones.length > 0,
  }));

  const active = [
    checked.subject,
    checked.classLevel,
    checked.shift,
    checked.status,
    checked.rating,
    checked.availability,
    checked.q,
  ].filter(Boolean).length;

  const queryRecord: Record<string, string> = {};
  for (const [key, value] of Object.entries(checked))
    if (value) queryRecord[key] = String(value);

  const initial = (name: string) => Array.from(name.trim())[0] || "?";

  return (
    <div className="cvf-page">
      {/* ───────────── Header ───────────── */}
      <header className="cvf-head">
        <div className="cvf-head-text">
          <span className="cvf-head-icon" aria-hidden="true">
            <GraduationCap size={22} />
          </span>
          <div>
            <h1>{t("findTitle")}</h1>
            <p>{t("findDesc")}</p>
          </div>
        </div>
        <Link className="cvf-btn cvf-btn-ghost" href="/admin/teacher-cvs">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("backToList")}
        </Link>
      </header>

      {/* ───────────── Saved needs ───────────── */}
      <div className="cvf-need-form">
        <CvNeedForm digits={digits} />
      </div>

      <section className="cvf-saved" aria-label={t("needs.title")}>
        <div className="cvf-saved-head">
          <ClipboardList size={18} aria-hidden="true" />
          <h2 className="cvf-sr">{t("needs.title")}</h2>
          <span className="cvf-pill" data-cv-needs-count="">
            {formatNumber(needs.length, digits)}
          </span>
        </div>

        {needs.length ? (
          <ul className="cv-needs cvf-needs" data-cv-needs="">
            {needs.map((entry) => (
              <CvNeedRow
                key={entry.id}
                need={entry}
                digits={digits}
                matchesHref={`/admin/teacher-cvs/find?need=${entry.id}`}
              />
            ))}
          </ul>
        ) : (
          <p className="cvf-muted-box" data-cv-needs-empty="">
            {t("needs.empty")}
          </p>
        )}
      </section>

      {/* ───────────── Filters ───────────── */}
      <details className="cvf-filters" open={active > 0 || undefined}>
        <summary>
          <span className="cvf-filters-label">
            <SlidersHorizontal size={17} aria-hidden="true" />
            {t("filters.title")}
          </span>
          {active > 0 && (
            <span className="cvf-pill cvf-pill-accent">
              {formatNumber(active, digits)}
            </span>
          )}
        </summary>

        <form method="get" className="cvf-filter-form" data-cv-find-filters="">
          <label className="cvf-field">
            <span>{t("filters.subject")}</span>
            <select
              name="subject"
              defaultValue={checked.subject}
              data-cv-find-subject="">
              <option value="">{t("filters.all")}</option>
              {TEACHER_SUBJECTS.map((option) => (
                <option key={option} value={option}>
                  {subjectLabel(t, option)}
                </option>
              ))}
            </select>
          </label>

          <label className="cvf-field">
            <span>{t("filters.classLevel")}</span>
            <select
              name="classLevel"
              defaultValue={checked.classLevel}
              data-cv-find-class="">
              <option value="">{t("filters.all")}</option>
              {TEACHER_CLASS_LEVELS.map((option) => (
                <option key={option} value={option}>
                  {formatNumber(Number(option), digits)}
                </option>
              ))}
            </select>
          </label>

          <label className="cvf-field">
            <span>{t("filters.shift")}</span>
            <select
              name="shift"
              defaultValue={checked.shift}
              data-cv-find-shift="">
              <option value="">{t("filters.all")}</option>
              {TEACHER_SHIFTS.map((option) => (
                <option key={option} value={option}>
                  {shiftLabel(t, option)}
                </option>
              ))}
            </select>
          </label>

          <label className="cvf-field">
            <span>{t("filters.status")}</span>
            <select name="status" defaultValue={checked.status}>
              <option value="">{t("filters.all")}</option>
              {TEACHER_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {statusLabel(t, option)}
                </option>
              ))}
            </select>
          </label>

          <label className="cvf-field">
            <span>{t("filters.rating")}</span>
            <select name="rating" defaultValue={checked.rating}>
              <option value="">{t("filters.all")}</option>
              {TEACHER_RATINGS.map((option) => (
                <option key={option} value={option}>
                  {ratingLabel(t, option)}
                </option>
              ))}
            </select>
          </label>

          <label className="cvf-field">
            <span>{t("filters.availability")}</span>
            <input
              name="availability"
              defaultValue={checked.availability}
              placeholder={t("filters.availabilityPlaceholder")}
              data-cv-find-availability=""
            />
          </label>

          <label className="cvf-field cvf-field-wide">
            <span>{t("fields.university")}</span>
            <input
              type="search"
              name="q"
              defaultValue={checked.q}
              placeholder={t("filters.qPlaceholder")}
              data-cv-find-q=""
            />
          </label>

          <div className="cvf-filter-foot">
            <button
              type="submit"
              className="cvf-btn cvf-btn-primary"
              data-cv-find-apply="">
              <Search size={16} aria-hidden="true" />
              {t("filters.apply")}
            </button>
            <Link
              className="cvf-btn cvf-btn-ghost"
              href="/admin/teacher-cvs/find">
              <RotateCcw size={15} aria-hidden="true" />
              {t("filters.reset")}
            </Link>
          </div>
        </form>
      </details>

      {/* ───────────── Open need banner ───────────── */}
      {need && (
        <p className="cvf-banner" role="status" data-cv-need-open="">
          <ClipboardList size={18} aria-hidden="true" />
          <span>
            <strong>
              {need.subject ? subjectLabel(t, need.subject) : t("filters.all")}
            </strong>
            {need.classLevels.length > 0
              ? ` · ${need.classLevels.map((level) => formatNumber(Number(level), digits)).join(", ")}`
              : ""}
            {need.shift ? ` · ${shiftLabel(t, need.shift)}` : ""}
            {need.note ? ` · ${need.note}` : ""} —{" "}
            <em>
              {rows.length > 0
                ? t("needs.matches", {
                    count: formatNumber(rows.length, digits),
                  })
                : t("needs.matchesNone")}
            </em>
          </span>
        </p>
      )}

      {/* ───────────── Results ───────────── */}
      <CvSmsPicker rows={smsRows} kit={sms} digits={digits} language={language}>
        <section className="cvf-card cvf-results">
          <div className="cvf-card-head cvf-results-head">
            <h2 className="cvf-card-title">
              <Users size={18} aria-hidden="true" />
              {need ? t("needs.showMatches") : t("findTitle")}
            </h2>
            <span className="cvf-pill" data-cv-find-total="">
              {t("total", { count: formatNumber(total, digits) })}
            </span>
            <div className="cvf-sms-bar">
              <CvSmsBar digits={digits} />
            </div>
          </div>

          {rows.length ? (
            <div className="cvf-table-wrap">
              <table className="cvf-table" data-cv-find-rows="">
                <thead>
                  <tr>
                    <th className="cvf-col-select">{t("select")}</th>
                    <th>{t("columns.name")}</th>
                    <th>{t("columns.subjects")}</th>
                    <th>{t("columns.free")}</th>
                    <th>{t("columns.contact")}</th>
                    <th>{t("columns.rating")}</th>
                    <th>{t("columns.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id} data-cv-row="" data-status={row.status}>
                      <td className="cvf-col-select" data-label={t("select")}>
                        <CvSmsCheck
                          row={smsRows[index]}
                          noPhone={t("noPhone")}
                        />
                      </td>

                      {/* Name */}
                      <td data-label={t("columns.name")}>
                        <div className="cvf-person">
                          <span className="cvf-avatar" aria-hidden="true">
                            {initial(row.name)}
                          </span>
                          <div className="cvf-person-text">
                            <strong>{row.name}</strong>
                            <span className="cvf-id">{row.candidateId}</span>
                            {row.university && (
                              <span className="cvf-sub">{row.university}</span>
                            )}
                            {row.department && (
                              <span className="cvf-sub">{row.department}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Subjects */}
                      <td data-label={t("columns.subjects")}>
                        <div className="cvf-stack">
                          {row.subjects.length ? (
                            <div className="cvf-chips">
                              {row.subjects.map((subject) => (
                                <span key={subject} className="cvf-chip">
                                  {subjectLabel(t, subject)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="cvf-sub">
                              {t("noSubjectRead")}
                            </span>
                          )}
                          {row.subjectsText && (
                            <span className="cvf-sub">{row.subjectsText}</span>
                          )}
                          {row.classLevels.length > 0 && (
                            <span className="cvf-sub">
                              {t("columns.classes")}:{" "}
                              <b>
                                {row.classLevels
                                  .map((level) =>
                                    formatNumber(Number(level), digits),
                                  )
                                  .join(", ")}
                              </b>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Availability */}
                      <td data-label={t("columns.free")}>
                        <div className="cvf-stack">
                          <span>{row.availabilityText || "—"}</span>
                          {row.shifts.length > 0 && (
                            <div className="cvf-chips">
                              {row.shifts.map((shift) => (
                                <span
                                  key={shift}
                                  className="cvf-chip cvf-chip-info">
                                  {shiftLabel(t, shift)}
                                </span>
                              ))}
                            </div>
                          )}
                          {row.expectedSalary !== null && (
                            <span className="cvf-sub">
                              {t("columns.salary")}:{" "}
                              <b>{formatNumber(row.expectedSalary, digits)}</b>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Contact */}
                      <td data-label={t("columns.contact")}>
                        <div className="cvf-stack">
                          {row.phones.length ? (
                            row.phones.map((phone, phoneIndex) => (
                              <div key={phoneIndex} className="cvf-phone">
                                {/* The mask is what is printed; the number exists only as a dial or WhatsApp destination. */}
                                <span className="cvf-mask" data-cv-mask="">
                                  {phone.masked}
                                </span>
                                <a
                                  className="cvf-btn cvf-btn-call cvf-btn-sm"
                                  href={phone.tel}
                                  data-cv-call="">
                                  <Phone size={14} aria-hidden="true" />
                                  {t("call")}
                                </a>
                                <a
                                  className="cvf-btn cvf-btn-wa cvf-btn-sm"
                                  href={phone.whatsapp}
                                  target="_blank"
                                  rel="noreferrer"
                                  data-cv-whatsapp="">
                                  <MessageCircle size={14} aria-hidden="true" />
                                  {t("whatsapp")}
                                </a>
                              </div>
                            ))
                          ) : (
                            <span className="cvf-sub">{t("noPhone")}</span>
                          )}
                        </div>
                      </td>

                      {/* Status / rating */}
                      <td data-label={t("columns.rating")}>
                        <div className="cvf-stack">
                          <div className="cvf-chips">
                            <span
                              className={`admin-badge cvf-badge ${statusBadge(row.status)}`}
                              data-cv-status="">
                              {statusLabel(t, row.status)}
                            </span>
                            <span
                              className={`admin-badge cvf-badge ${ratingBadge(row.rating)}`}
                              data-cv-rating="">
                              {ratingLabel(t, row.rating)}
                            </span>
                          </div>
                          <span className="cvf-date">
                            <CalendarDays size={13} aria-hidden="true" />
                            {formatDate(row.receivedDate, digits, language)}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td data-label={t("columns.actions")}>
                        <div className="cvf-actions">
                          <CvDetailDrawer
                            seed={{
                              id: row.id,
                              candidateId: row.candidateId,
                              name: row.name,
                            }}
                            language={language}
                            digits={digits}
                            kit={sms}
                          />
                          <CvRowControls
                            row={row}
                            kit={sms}
                            language={language}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="cvf-empty" data-cv-empty="">
              <span className="cvf-empty-icon" aria-hidden="true">
                <Search size={26} />
              </span>
              <p>{active || need ? t("emptyFilter") : t("empty")}</p>
              <span>{t("emptyHelp")}</span>
            </div>
          )}

          <div className="cvf-card-foot">
            {view ? (
              <Pagination
                path="/admin/teacher-cvs/find"
                page={view.page}
                totalPages={view.pages}
                query={queryRecord}
                digits={digits}
              />
            ) : (
              <Link
                className="cvf-btn cvf-btn-ghost"
                href="/admin/teacher-cvs/find">
                <RotateCcw size={15} aria-hidden="true" />
                {t("filters.reset")}
              </Link>
            )}
            <p className="cvf-hint">{t("sms.hint")}</p>
          </div>
        </section>
      </CvSmsPicker>
    </div>
  );
}
