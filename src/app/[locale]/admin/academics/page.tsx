import {
  BatchForm,
  EnrollmentForm,
  ExamForm,
  PortalAccountForm,
  PublicationForm,
} from "@/components/admin/academic-forms";
import { RowControls } from "@/components/admin/row-controls";
import { Link } from "@/i18n/navigation";
import { requireListAccessPage } from "@/lib/admin/guard";
import { Batch, Exam, Student } from "@/models/Academic";
import { User } from "@/models/User";
import {
  ClipboardList,
  GraduationCap,
  Layers,
  Users,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

type Option = { id: string; name: string };

const withEmail = (u: {
  _id: unknown;
  name?: string;
  email?: string;
}): Option => ({
  id: String(u._id),
  name: `${u.name} (${u.email || "—"})`,
});

export default async function Academics({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [viewer, { locale }, t] = await Promise.all([
    requireListAccessPage("exams"),
    params,
    getTranslations("academic"),
  ]);
  const canDelete = viewer.role === "admin" || viewer.role === "superadmin";
  const canArchive = ["superadmin", "admin", "staff"].includes(viewer.role);

  const [
    users,
    teachers,
    batches,
    exams,
    studentCount,
    userCount,
    batchCount,
    examCount,
  ] = await Promise.all([
    User.find({ role: { $in: ["student", "parent"] }, active: true })
      .select("name email role")
      .sort({ name: 1 })
      .limit(1000)
      .lean(),
    User.find({ role: "teacher", active: true })
      .select("name email")
      .sort({ name: 1 })
      .limit(1000)
      .lean(),
    Batch.find({ active: true })
      .select("titleBn titleEn grade")
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean(),
    Exam.find()
      .select("titleBn titleEn batch maxMarks published")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    Student.countDocuments(),
    User.countDocuments({
      role: { $in: ["teacher", "student", "parent"] },
      active: true,
    }),
    Batch.countDocuments({ active: true }),
    Exam.countDocuments(),
  ]);

  const studentOptions: Option[] = [];
  const parentOptions: Option[] = [];
  for (const u of users) {
    if (u.role === "student") studentOptions.push(withEmail(u));
    else if (u.role === "parent") parentOptions.push(withEmail(u));
  }
  const teacherOptions = teachers.map(withEmail);

  const batchOptions: Option[] = batches.map((b) => ({
    id: String(b._id),
    name: `${locale === "bn" ? b.titleBn : b.titleEn} · ${t("class")} ${b.grade}`,
  }));
  const batchNames = new Map(batchOptions.map((b) => [b.id, b.name]));

  const kpis: {
    key: string;
    label: string;
    value: number;
    Icon: LucideIcon;
  }[] = [
    { key: "users", label: t("existingUsers"), value: userCount, Icon: Users },
    { key: "batch", label: t("batch"), value: batchCount, Icon: Layers },
    {
      key: "enrolled",
      label: t("enrolled"),
      value: studentCount,
      Icon: GraduationCap,
    },
    {
      key: "exams",
      label: t("exams"),
      value: examCount,
      Icon: ClipboardList,
    },
  ];

  return (
    <div className="academics-page">
      <header className="academics-hero">
        <span className="section-tag">✦ {t("overview")}</span>
        <h1>{t("academic")}</h1>
        <p>{t("academicDesc")}</p>
      </header>

      <div className="notice-box">{t("setupNote")}</div>

      <div className="academics-kpis">
        {kpis.map(({ key, label, value, Icon }) => (
          <div key={key} className="academics-kpi" data-kpi={key}>
            <span className="academics-kpi-icon" aria-hidden="true">
              <Icon size={22} />
            </span>
            <div className="academics-kpi-text">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="academics-forms">
        <section className="academics-card">
          <div className="academics-card-head">
            <h2>
              <span className="academics-step">1</span>
              {t("createUser")}
            </h2>
          </div>
          <div className="academics-card-body">
            <PortalAccountForm />
          </div>
        </section>

        <section className="academics-card">
          <div className="academics-card-head">
            <h2>
              <span className="academics-step">2</span>
              {t("createBatch")}
            </h2>
            <Link className="academics-link" href="/admin/batches">
              {t("manageBatches")}
            </Link>
          </div>
          <div className="academics-card-body">
            <BatchForm teachers={teacherOptions} />
          </div>
        </section>

        <section className="academics-card">
          <div className="academics-card-head">
            <h2>
              <span className="academics-step">3</span>
              {t("linkStudent")}
            </h2>
          </div>
          <div className="academics-card-body">
            <EnrollmentForm
              students={studentOptions}
              parents={parentOptions}
              batches={batchOptions}
            />
          </div>
        </section>

        <section className="academics-card">
          <div className="academics-card-head">
            <h2>
              <span className="academics-step">4</span>
              {t("createExam")}
            </h2>
          </div>
          <div className="academics-card-body">
            <ExamForm batches={batchOptions} />
          </div>
        </section>
      </div>

      <section className="academics-card academics-exams">
        <div className="academics-card-head">
          <h2>
            {t("exams")}
            <span className="academics-count">{examCount}</span>
          </h2>
        </div>
        {exams.length ? (
          <div className="academics-table-wrap">
            <table className="academics-table">
              <thead>
                <tr>
                  <th>{t("exam")}</th>
                  <th>{t("batch")}</th>
                  <th className="num">{t("maxMarks")}</th>
                  <th>{t("status")}</th>
                  <th aria-hidden="true"></th>
                </tr>
              </thead>
              <tbody>
                {exams.map((e) => {
                  const id = String(e._id);
                  return (
                    <tr key={id}>
                      <td className="title">
                        {locale === "bn" ? e.titleBn : e.titleEn}
                      </td>
                      <td>{batchNames.get(String(e.batch)) || "—"}</td>
                      <td className="num">{e.maxMarks}</td>
                      <td>
                        <span
                          className={`academics-badge ${e.published ? "is-published" : "is-draft"}`}>
                          {t(e.published ? "published" : "draft")}
                        </span>
                      </td>
                      <td>
                        <div className="academics-actions">
                          <PublicationForm id={id} published={e.published} />
                          <RowControls
                            kind="exam"
                            id={id}
                            name={e.titleBn || e.titleEn}
                            canDelete={canDelete}
                            canArchive={canArchive}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="academics-empty">
            <ClipboardList size={32} aria-hidden="true" />
            <p>{t("noExams")}</p>
          </div>
        )}
      </section>
    </div>
  );
}
