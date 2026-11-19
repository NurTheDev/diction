import { BackupReminder } from "@/components/admin/backup-reminder";
import { CenterDatabaseUsage } from "@/components/admin/center-database-usage";
import { DailyOperations } from "@/components/admin/daily-operations";
import { LeadFollowUps } from "@/components/admin/lead-follow-ups";
import { Overview, OverviewHeading } from "@/components/admin/overview";
import { SiteManagement } from "@/components/admin/site-management";
import { SmsAutoProblems } from "@/components/admin/sms-auto-problems";
import { loadDailyOperations } from "@/lib/admin/daily-operations";
import {
  formatClass,
  formatDate,
  formatTime,
  type Digits,
} from "@/lib/admin/format";
import { getStaff, requireAdmin } from "@/lib/admin/guard";
import { overviewScope } from "@/lib/admin/overview-access";
import { dhakaToday } from "@/lib/admin/today";
import { Batch } from "@/models/Academic";
import { Editorial } from "@/models/Editorial";
import { Admission, ContactMessage, Slot, TrialBooking } from "@/models/Intake";
import { SiteSettingsContent, TeacherContent } from "@/models/PublicContent";
import { subjectValues } from "@/schemas/intake";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** Per-user digit preference (Bangla by default), stored in a cookie keyed by the user id. */
const readDigits = (
  store: Awaited<ReturnType<typeof cookies>>,
  id: string,
): Digits => (store.get(`diction_digits_${id}`)?.value === "en" ? "en" : "bn");

export default async function AdminHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [staff, { locale }] = await Promise.all([getStaff(), params]);
  if (staff?.role === "content_editor") redirect(`/${locale}/admin/content`);
  if (staff?.role === "exam_manager")
    redirect(`/${locale}/admin/practice-tests`);

  /* R3.11 (owner decision): the front desk's Overview is the visitor queue — today's follow-ups and the count of promises whose day has passed, which is exactly what LeadFollowUps renders. Nothing else on this page is theirs: the intake counters, the auto-SMS problems and the database usage all stay behind requireAdmin(), so a staff session returns here rather than falling into it and being refused. */
  const scope = overviewScope(staff?.role || "");
  const cookieStore = await cookies();
  const language = locale === "bn" ? "bn" : "en";

  if (scope.followUps && !scope.intake) {
    const sDigits = readDigits(cookieStore, staff?.id || "");
    return (
      <div className="ov-page">
        <div className="ov-block">
          <OverviewHeading name={staff?.name || ""} digits={sDigits} />
        </div>
        <div className="ov-block">
          <LeadFollowUps digits={sDigits} language={language} />
        </div>
      </div>
    );
  }

  const admin = await requireAdmin();
  const digits = readDigits(cookieStore, admin.id);
  const [t, a, p, c] = await Promise.all([
    getTranslations("adminRedesign"),
    getTranslations("admin"),
    getTranslations("pages"),
    getTranslations("common"),
  ]);
  const subjects = p.raw("subjects") as string[];
  const subject = (s: string) =>
    subjects[subjectValues.indexOf(s as (typeof subjectValues)[number])] ||
    s ||
    "";

  const { start, end } = dhakaToday();
  const slots = await Slot.find({ startAt: { $gte: start, $lt: end } })
    .select("_id startAt")
    .lean();
  const bookedToday = {
    slot: { $in: slots.map((s) => s._id) },
    status: "booked",
  };

  /* The day's four numbers ride in the same pass as the intake counters: one round trip, not two. */
  const [
    pending,
    newToday,
    booked,
    unread,
    batches,
    admissions,
    bookings,
    settings,
    teacher,
    notice,
    anySlot,
    ops,
  ] = await Promise.all([
    Admission.countDocuments({ status: "pending" }),
    Admission.countDocuments({
      status: "pending",
      createdAt: { $gte: start, $lt: end },
    }),
    TrialBooking.countDocuments(bookedToday),
    ContactMessage.countDocuments({ read: false }),
    Batch.countDocuments({ active: true }),
    Admission.find({ status: "pending" })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    TrialBooking.find(bookedToday).sort({ createdAt: -1 }).limit(5).lean(),
    SiteSettingsContent.exists({
      key: "main",
      "name.bn": { $type: "string", $ne: "" },
      "address.bn": { $type: "string", $ne: "" },
    }),
    TeacherContent.exists({ photoUrl: { $type: "string", $ne: "" } }),
    Editorial.exists({ kind: "notice", published: true }),
    Slot.exists({ enabled: true }),
    loadDailyOperations(language),
  ]);

  const times = new Map(slots.map((s) => [String(s._id), s.startAt]));
  const f = (k: string, v: unknown): [string, string] => [
    t(`fieldNames.${k}`),
    String(v || ""),
  ];

  return (
    <div className="ov-page">
      <div className="ov-block">
        <BackupReminder />
      </div>

      <div className="ov-block">
        <OverviewHeading
          name={admin.name}
          digits={digits}
          newToday={newToday}
          todayBookings={booked}
        />
      </div>

      {/* G2 · tier 1: what came in today, who is running and what they owe, who is waiting for a call, and whether a message can still go out — with the four verbs of a morning under them. */}
      <div className="ov-block">
        <DailyOperations
          data={ops}
          digits={digits}
          role={admin.role}
          currency={c("currency")}
        />
      </div>

      {/* R3: the visitor queue the owner asked to see first thing — today's follow-ups, and the promises whose day has passed. */}
      <div className="ov-block">
        <LeadFollowUps digits={digits} language={language} />
      </div>

      <div className="ov-block">
        <Overview
          name={admin.name}
          digits={digits}
          withHeading={false}
          data={{
            counts: [pending, booked, unread, batches],
            newToday,
            admissions: admissions.map((x) => ({
              id: String(x._id),
              reference: x.reference,
              studentName: x.studentName,
              grade: x.grade,
              status: x.status,
              phone: x.phone,
              whatsapp: x.whatsapp,
              date: x.createdAt.toISOString(),
              fields: [
                f("reference", x.reference),
                f("student", x.studentName),
                f("grade", formatClass(x.grade, digits, language, a("class"))),
                f("guardian", x.guardianName),
                f("phone", x.phone),
                f("email", x.email),
                f("dob", x.dob),
                f("gender", x.gender),
                f("relation", x.relation),
                f("school", x.school),
                f("medium", x.medium),
                f("previous", x.previousResult),
                f("course", x.courseType),
                f("subjects", (x.subjects || []).map(subject).join(", ")),
                f("package", x.packageName),
                f("preference", x.batchPreference),
                f("status", a(x.status)),
                f("notes", x.notes),
                f("date", formatDate(x.createdAt, digits, language)),
              ],
            })),
            bookings: bookings.map((x) => {
              const time = times.get(String(x.slot));
              return {
                id: String(x._id),
                reference: x.reference,
                studentName: x.studentName,
                grade: x.grade || "",
                phone: x.phone,
                status: x.status,
                subject: subject(x.subject),
                time: time?.toISOString(),
                fields: [
                  f("reference", x.reference),
                  f("student", x.studentName),
                  f(
                    "grade",
                    formatClass(x.grade || "", digits, language, a("class")),
                  ),
                  f("subjects", subject(x.subject)),
                  f("phone", x.phone),
                  f("email", x.email),
                  f(
                    "time",
                    time
                      ? formatTime(time, digits, language, (k) =>
                          c(`dayPeriod.${k}`),
                        )
                      : "",
                  ),
                  f("status", a(x.status)),
                ],
              };
            }),
          }}
        />
      </div>

      {/* G2 · tier 2: the public site's own work — banner, testimonials, the lecture sheet, the blog — folded under one heading below the day's work, because it is real work that is not today's. */}
      <div className="ov-block">
        <SiteManagement
          role={admin.role}
          digits={digits}
          userId={admin.id}
          checklist={[!!settings, !!teacher, !!notice, !!anySlot]}
        />
      </div>

      {scope.smsProblems && (
        <div className="ov-block">
          <SmsAutoProblems digits={digits} />
        </div>
      )}
      {scope.database && admin.role === "superadmin" && (
        <div className="ov-block">
          <CenterDatabaseUsage digits={digits} />
        </div>
      )}
    </div>
  );
}
