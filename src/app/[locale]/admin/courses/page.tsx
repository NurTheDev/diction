import {
  BulkDeleteBar,
  BulkSelectAll,
} from "@/components/admin/bulk-delete-bar";
import { CourseForm } from "@/components/admin/course-form";
import { Pagination } from "@/components/admin/pagination";
import { RowControls } from "@/components/admin/row-controls";
import { Link } from "@/i18n/navigation";
import { requireArchiverPage } from "@/lib/admin/guard";
import { pageNumber } from "@/lib/admin/helpers";
import { literalSearch } from "@/lib/admin/literal-search";
import { Course } from "@/models/Course";
import { idSchema } from "@/schemas/admin";
import { getTranslations } from "next-intl/server";

export default async function CoursesAdmin({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    grade?: string;
    page?: string;
    new?: string;
    edit?: string;
  }>;
}) {
  const user = await requireArchiverPage(),
    canDelete = user.role === "admin" || user.role === "superadmin";
  const { locale } = await params,
    query = await searchParams,
    t = await getTranslations("courseCms"),
    m = await getTranslations("adminModules"),
    p = await getTranslations("pages");
  const subjects = p.raw("subjects") as string[];
  const { subjectValues } = await import("@/schemas/intake");

  const q = (query.q || "").trim().slice(0, 80),
    status = ["published", "hidden"].includes(query.status || "")
      ? query.status || ""
      : "",
    grade = /^(?:[4-9]|10|11|12)$/.test(query.grade || "")
      ? query.grade || ""
      : "",
    page = pageNumber(query.page),
    id = idSchema.safeParse(query.edit);
  const editing = id.success ? await Course.findById(id.data).lean() : null,
    formOpen = canDelete && (query.new === "1" || !!editing);

  const filter: Record<string, unknown> = {};
  if (q) {
    const re = literalSearch(q);
    filter.$or = [{ "title.bn": re }, { "title.en": re }];
  }
  if (status) filter.published = status === "published";
  if (grade) filter.grade = grade;

  const [total, items] = await Promise.all([
    Course.countDocuments(filter),
    Course.find(filter)
      .sort({ order: 1, _id: 1 })
      .skip((page - 1) * 20)
      .limit(20)
      .lean(),
  ]);

  const value = editing
    ? {
        id: String(editing._id),
        slug: editing.slug,
        grade: editing.grade,
        subject: editing.subject,
        titleBn: editing.title.bn,
        titleEn: editing.title.en,
        descriptionBn: editing.description.bn,
        descriptionEn: editing.description.en,
        scheduleBn: editing.schedule?.bn || "",
        scheduleEn: editing.schedule?.en || "",
        feeBn: editing.fee?.bn || "",
        feeEn: editing.fee?.en || "",
        order: editing.order,
        published: editing.published,
      }
    : undefined;

  const nf = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en");

  return (
    <div className="crs">
      <header className="crs-head">
        <div className="crs-head-text">
          <h1>
            {formOpen
              ? editing
                ? m("editCourse")
                : m("newCourse")
              : t("adminTitle")}
          </h1>
          <p>{m("coursesDesc")}</p>
        </div>
        {formOpen ? (
          <Link className="crs-btn-ghost" href="/admin/courses">
            {m("back")}
          </Link>
        ) : (
          canDelete && (
            <Link className="crs-btn" href="/admin/courses?new=1">
              {m("new")}
            </Link>
          )
        )}
      </header>

      {formOpen ? (
        <CourseForm item={value} />
      ) : (
        <>
          <form className="crs-filter">
            <input
              name="q"
              className="crs-search"
              defaultValue={q}
              placeholder={m("search")}
              aria-label={m("search")}
            />
            <select
              name="status"
              className="crs-select"
              defaultValue={status}
              aria-label={m("status")}>
              <option value="">{m("all")}</option>
              <option value="published">{m("published")}</option>
              <option value="hidden">{m("hidden")}</option>
            </select>
            <select
              name="grade"
              className="crs-select"
              defaultValue={grade}
              aria-label={m("class")}>
              <option value="">
                {m("class")} — {m("all")}
              </option>
              {Array.from({ length: 9 }, (_, i) => i + 4).map((n) => (
                <option key={n} value={n}>
                  {nf.format(n)}
                </option>
              ))}
            </select>
            <button type="submit" className="crs-btn">
              {m("search")}
            </button>
          </form>

          {canDelete && <BulkDeleteBar kind="course" />}

          <section className="crs-panel">
            {items.length ? (
              <div className="crs-scroll">
                <table className="crs-table">
                  <thead>
                    <tr>
                      {canDelete && (
                        <th className="crs-th-check">
                          <BulkSelectAll kind="course" label={m("action")} />
                        </th>
                      )}
                      <th>{m("course")}</th>
                      <th>{m("class")}</th>
                      <th>{m("subject")}</th>
                      <th>{m("status")}</th>
                      <th className="crs-th-act">{m("action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((x) => {
                      const title = locale === "bn" ? x.title.bn : x.title.en;
                      return (
                        <tr key={String(x._id)}>
                          {canDelete && (
                            <td className="crs-td-check">
                              <input
                                type="checkbox"
                                className="crs-check"
                                name="ids"
                                data-kind="course"
                                value={String(x._id)}
                                aria-label={title}
                              />
                            </td>
                          )}
                          <td className="crs-td-title" data-label={m("course")}>
                            <strong className="crs-title">{title}</strong>
                          </td>
                          <td data-label={m("class")}>
                            <span className="crs-chip">
                              {nf.format(Number(x.grade))}
                            </span>
                          </td>
                          <td data-label={m("subject")}>
                            <span className="crs-subject">
                              {subjects[subjectValues.indexOf(x.subject)] ||
                                x.subject}
                            </span>
                          </td>
                          <td data-label={m("status")}>
                            <span
                              className={`crs-badge ${
                                x.published ? "crs-badge-on" : "crs-badge-off"
                              }`}>
                              {m(x.published ? "published" : "hidden")}
                            </span>
                          </td>
                          <td className="crs-td-act" data-label={m("action")}>
                            <div className="crs-actions">
                              {canDelete && (
                                <Link
                                  className="crs-btn-sm"
                                  href={`/admin/courses?edit=${String(x._id)}`}>
                                  {m("edit")}
                                </Link>
                              )}
                              <RowControls
                                kind="course"
                                id={String(x._id)}
                                name={title}
                                canDelete
                                canArchive
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
              <div className="crs-empty">
                <p>
                  {q || status || grade ? m("noResults") : m("emptyCourses")}
                </p>
                <Link className="crs-btn" href="/admin/courses?new=1">
                  {m("new")}
                </Link>
              </div>
            )}

            <div className="crs-pager">
              <Pagination
                path="/admin/courses"
                page={page}
                totalPages={Math.ceil(total / 20)}
                query={{ q, status, grade }}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
