import { BanglaDate } from "@/components/admin/bangla-date";
import { dayHeaders, type Language } from "@/components/admin/list-dates";
import { RoutineDailySheet } from "@/components/admin/routine-daily";
import {
  RoutineDispatch,
  type DispatchTeacher,
} from "@/components/admin/routine-dispatch";
import { Link } from "@/i18n/navigation";
import { dashboardDigits } from "@/lib/admin/digits";
import { formatDate, formatNumber } from "@/lib/admin/format";
import { requireArchiverPage } from "@/lib/admin/guard";
import { dhakaDay } from "@/lib/admin/today";
import { classShiftWords } from "@/lib/classes/shift-words";
import {
  classDispatchText,
  messengerHref,
  teacherDispatchText,
  whatsappHref,
} from "@/lib/routine/dispatch";
import {
  dailySheet,
  jointOptions,
  knownRooms,
  printNotice,
  routineClasses,
  shiftsForClass,
  teacherOptions,
} from "@/lib/routine/read";
import { dayHeading, rangeWord } from "@/lib/routine/time";
import { getTranslations } from "next-intl/server";
export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayAt = (offset: number): string =>
  dhakaDay(new Date(Date.now() + offset * 86400000));

/**
 * R9 · the daily working sheet: one date, filled from the week, changed for that date alone.
 *
 * The week is a promise; the day is what actually happened. A teacher is ill, a room is taken, the centre
 * closes for a holiday — and none of that belongs in the master routine, because next Tuesday should look
 * like next Tuesday. So this page opens on Dhaka's today, copies the week's periods into it, and writes
 * every change to the date.
 *
 * What the page is careful about:
 *
 *   • **Today is Dhaka's today, never the server's.** The date is read in Asia/Kolkata-free `Asia/Dhaka`
 *     (UTC+6), and the picker is the house's own three-select `BanglaDate` — a native date input would
 *     hand a Bangladeshi operator an mm/dd/yyyy box that reads wrong.
 *   • **A past date is not a locked one.** It can be walked back to and fixed, and it carries a badge
 *     saying it has passed rather than a refusal.
 *   • **Nothing is stored that the week already says.** A day identical to the master costs no document,
 *     and the sheet reports which of the two happened — that is the Atlas storage rule made visible to
 *     the person who benefits from it.
 */
export default async function RoutineDailyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ classId?: string; shift?: string; date?: string }>;
}) {
  const admin = await requireArchiverPage();
  const { locale } = await params,
    query = await searchParams;
  const language: Language = locale === "en" ? "en" : "bn";
  const t = await getTranslations("routine");
  const digits = await dashboardDigits(admin.id);
  const canWrite = admin.role === "admin" || admin.role === "superadmin";
  const classes = await routineClasses(language);
  const asked = String(query.classId || "");
  const chosen =
    classes.find((group) => group.id === asked) || classes[0] || null;
  const today = dayAt(0);
  const date = DAY.test(String(query.date || "")) ? String(query.date) : today;

  const heading = (
    <>
      <div className="admin-heading" data-routine-daily={chosen?.id || "none"}>
        <div>
          <span className="section-tag">✦ &nbsp; {t("daily.title")}</span>
          <h1 data-daily-heading>{t("daily.title")}</h1>
          <p className="admin-help">{t("daily.sub")}</p>
          <p className="admin-help" data-daily-date>
            {formatDate(new Date(`${date}T00:00:00+06:00`), digits, language)}
          </p>
        </div>
        <div className="center-student-actions">
          {chosen && (
            <Link
              href={`/admin/routine/master?classId=${chosen.id}`}
              className="admin-mini-button"
              data-daily-to-master>
              {t("daily.toMaster")}
            </Link>
          )}
        </div>
      </div>
      {/* Yesterday and tomorrow are one tap, because "what ran last Tuesday" and "what runs tomorrow" are
        the two questions asked most often after today's. */}
      <nav className="admin-quick-actions routine-quick-days" data-daily-quick>
        {[
          { offset: -1, key: "yesterday", label: t("daily.yesterday") },
          { offset: 0, key: "today", label: t("daily.today") },
          { offset: 1, key: "tomorrow", label: t("daily.tomorrow") },
        ].map((jump) => (
          <Link
            key={jump.key}
            className="admin-mini-button"
            data-daily-jump={jump.key}
            href={`/admin/routine/daily?date=${dayAt(jump.offset)}${chosen ? `&classId=${chosen.id}` : ""}`}>
            {jump.label}
          </Link>
        ))}
      </nav>
    </>
  );

  if (!chosen)
    return (
      <>
        {heading}
        <section className="admin-panel" data-daily-empty>
          <div className="admin-panel-body">
            <strong>{t("master.noClasses")}</strong>
            <p className="admin-help">{t("master.noClassesHelp")}</p>
            {canWrite && (
              <Link
                className="button button-navy"
                href="/admin/students/classes">
                {t("master.createClass")}
              </Link>
            )}
          </div>
        </section>
      </>
    );

  const shiftLabels = await classShiftWords();
  const shifts = await shiftsForClass(chosen, shiftLabels);
  const askedShift = String(query.shift || "");
  const shift = shifts.includes(askedShift)
    ? askedShift
    : shifts[0] || chosen.shift || "";
  const sheet = await dailySheet(chosen.id, shift, date, language);
  const [teachers, rooms, joints, notice] = sheet
    ? await Promise.all([
        teacherOptions(),
        knownRooms(),
        jointOptions(sheet.weekday),
        printNotice(date, language),
      ])
    : [[], [], [], null];

  /* Slice 2 · the day going out. The messages are written here, on the server, from the sheet and from the
     catalogs — so the text the operator copies is already in the screen's own language and their own
     digits, and the same builder serves the class group and every teacher who takes a period today. */
  const say = (key: string, params?: Record<string, string | number>): string =>
    String(t(key, params));
  const dispatch = sheet
    ? (() => {
        const classText = classDispatchText(
          {
            date: sheet.date,
            className: sheet.className,
            shift: sheet.shift,
            periods: sheet.periods.map((period) => ({
              start: period.start,
              end: period.end,
              subjectBn: period.subjectBn,
              subjectEn: period.subjectEn,
              teacherName: period.teacherName,
              room: period.room,
            })),
            language,
            digits,
          },
          say,
        );
        const held = new Map<
          string,
          {
            name: string;
            rows: {
              start: string;
              end: string;
              className: string;
              room: string;
            }[];
          }
        >();
        for (const period of sheet.periods) {
          if (!period.teacherId) continue;
          const entry = held.get(period.teacherId) || {
            name: period.teacherName,
            rows: [],
          };
          entry.rows.push({
            start: period.start,
            end: period.end,
            className: sheet.className,
            room: period.room,
          });
          held.set(period.teacherId, entry);
        }
        const teachersOut: DispatchTeacher[] = [...held.entries()]
          .map(([id, entry]) => {
            const text = teacherDispatchText(
              {
                date: sheet.date,
                teacherName: entry.name,
                rows: entry.rows,
                language,
                digits,
              },
              say,
            );
            return {
              id,
              name: entry.name,
              text,
              whatsapp: whatsappHref(text),
              messenger: messengerHref(text),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        return {
          classText,
          whatsapp: whatsappHref(classText),
          messenger: messengerHref(classText),
          teachers: teachersOut,
        };
      })()
    : null;

  return (
    <>
      {heading}
      <section className="admin-panel" data-daily-filters>
        <div className="admin-panel-head">
          <h2>{t("daily.pickDate")}</h2>
        </div>
        <div className="admin-panel-body">
          <form
            method="get"
            className="admin-filter report-filters"
            data-daily-form-filters>
            <label>
              <span>{t("daily.classLabel")}</span>
              <select
                className="admin-select"
                name="classId"
                data-daily-class-select
                defaultValue={chosen.id}>
                <option value="">{t("master.chooseClass")}</option>
                {classes.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("daily.shiftLabel")}</span>
              <select
                className="admin-select"
                name="shift"
                data-daily-shift-select
                defaultValue={shift}>
                {(shifts.length ? shifts : [shift])
                  .filter(Boolean)
                  .map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                {!shifts.length && (
                  <option value="">{t("master.noShift")}</option>
                )}
              </select>
            </label>
            <label>
              <span>{t("daily.dateLabel")}</span>
              <BanglaDate name="date" defaultValue={date} />
            </label>
            <button
              type="submit"
              className="button button-navy"
              data-daily-show>
              {t("daily.show")}
            </button>
          </form>
        </div>
      </section>

      {sheet ? (
        <section className="admin-panel" data-daily-sheet-panel>
          <div className="admin-panel-head">
            <h2 data-daily-sheet-class>{chosen.name}</h2>
            <span className="admin-help" data-daily-sheet-date>
              {formatDate(new Date(`${date}T00:00:00+06:00`), digits, language)}
            </span>
          </div>
          <div className="admin-panel-body">
            {/* The shift inside the body rather than in the head: it is the owner's own word, often written
              in Bangla, and the panel head is read by the two-language sweep on an English address. */}
            <p className="admin-help" data-daily-shift-line>
              {t("daily.shiftLabel")}: {shift || t("master.noShift")}
            </p>
            <RoutineDailySheet
              sheet={sheet}
              teachers={teachers}
              rooms={rooms}
              joints={joints}
              weekdays={dayHeaders(language)}
              digits={digits}
              language={language}
              canEdit={canWrite}
              canDelete={canWrite}
            />
          </div>
        </section>
      ) : (
        <section className="admin-panel" data-daily-unavailable>
          <div className="admin-panel-body">
            <p className="admin-help">{t("daily.noSheet")}</p>
          </div>
        </section>
      )}

      {sheet && dispatch && (
        <RoutineDispatch
          classId={sheet.classId}
          shift={sheet.shift}
          date={sheet.date}
          className={sheet.className}
          classText={dispatch.classText}
          whatsapp={dispatch.whatsapp}
          messenger={dispatch.messenger}
          teachers={dispatch.teachers}
          sent={sheet.sent}
          sentAt={sheet.sentAt}
          sentByName={sheet.sentByName}
          changedSinceSent={sheet.changedSinceSent}
          digits={digits}
          language={language}
          canEdit={canWrite}
        />
      )}

      {/* The paper sheet for the notice board: today's routine across every class, hidden on screen and
        laid out for print. One print stylesheet, one button, and what comes out is what actually runs —
        a date's own sheet speaks for its class, and the week speaks where no sheet does. */}
      {notice && (
        <section
          className="routine-notice print-hidden"
          data-print-notice
          data-print-sheet
          aria-hidden={true}>
          <h1 data-notice-title>{t("dispatch.printTitle")}</h1>
          <p className="notice-date" data-notice-date>
            {dayHeading(date, digits, language)}
          </p>
          {notice.classes.length === 0 ? (
            <p className="notice-empty" data-notice-none>
              {t("dispatch.noClasses")}
            </p>
          ) : (
            notice.classes.map((entry) => (
              <div
                className="notice-class"
                key={`${entry.classId}:${entry.shift}`}
                data-notice-class={entry.classId}
                data-notice-shift={entry.shift}>
                <h2 data-notice-class-name>
                  {entry.className}
                  {entry.shift ? ` · ${entry.shift}` : ""}
                </h2>
                {entry.status === "holiday" ? (
                  <p className="notice-holiday" data-notice-holiday>
                    {t("dispatch.holiday", { reason: entry.holidayReason })}
                  </p>
                ) : entry.periods.length === 0 ? (
                  <p className="notice-empty" data-notice-empty>
                    {t("dispatch.noPeriods")}
                  </p>
                ) : (
                  <table className="notice-table" data-notice-table>
                    <tbody>
                      {entry.periods.map((period) => (
                        <tr key={period.id} data-notice-period={period.id}>
                          <td data-notice-time>
                            {rangeWord(period.start, period.end, digits)}
                          </td>
                          <td data-notice-subject>
                            {language === "en"
                              ? period.subjectEn || period.subjectBn
                              : period.subjectBn}
                          </td>
                          <td data-notice-teacher>{period.teacherName}</td>
                          <td data-notice-room>{period.room}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {entry.notes && (
                  <p className="notice-notes" data-notice-notes>
                    {entry.notes}
                  </p>
                )}
              </div>
            ))
          )}
          <p className="notice-count" data-notice-count>
            {t("dispatch.noticeCount", {
              count: formatNumber(notice.classes.length, digits),
            })}
          </p>
        </section>
      )}
    </>
  );
}
