import {
  SlotControls,
  SlotCreator,
  SlotEditor,
} from "@/components/admin/forms";
import { Pagination } from "@/components/admin/pagination";
import { RowControls } from "@/components/admin/row-controls";
import { Link } from "@/i18n/navigation";
import { requireArchiverPage } from "@/lib/admin/guard";
import { formatDate, pageNumber } from "@/lib/admin/helpers";
import { Slot } from "@/models/Intake";
import { subjectValues } from "@/schemas/intake";
import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";

export default async function Slots({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string;
    new?: string;
    grade?: string;
    status?: string;
  }>;
}) {
  const viewer = await requireArchiverPage(),
    canDelete = viewer.role === "admin" || viewer.role === "superadmin";
  const { locale } = await params,
    query = await searchParams,
    page = pageNumber(query.page),
    t = await getTranslations("admin"),
    m = await getTranslations("adminModules"),
    p = await getTranslations("pages");
  const subjects = p.raw("subjects") as string[];
  const grade = /^(?:[4-9]|10|11|12)$/.test(query.grade || "")
      ? query.grade || ""
      : "",
    status = ["enabled", "disabled"].includes(query.status || "")
      ? query.status || ""
      : "";
  const filter: Record<string, unknown> = {};
  if (grade) filter.grade = grade;
  if (status) filter.enabled = status === "enabled";

  const dhaka = (date: Date) =>
    new Date(date.getTime() + 21600000).toISOString().slice(0, 16);

  const [total, slots] = await Promise.all([
    Slot.countDocuments(filter),
    Slot.find(filter)
      .sort({ startAt: -1 })
      .skip((page - 1) * 20)
      .limit(20)
      .lean(),
  ]);

  const creating = query.new === "1";
  const nf = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en");

  return (
    <div className="sl">
      <header className="sl-head">
        <div className="sl-head-text">
          <h1>{creating ? t("createSlot") : t("slots")}</h1>
          <p>{t("slotsDesc")}</p>
        </div>
        {creating ? (
          <Link className="sl-btn-ghost" href="/admin/slots">
            {m("back")}
          </Link>
        ) : (
          <Link className="sl-btn" href="/admin/slots?new=1">
            {m("new")}
          </Link>
        )}
      </header>

      {creating ? (
        <SlotCreator />
      ) : (
        <>
          <form className="sl-filter">
            <select
              name="grade"
              className="sl-select"
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
            <select
              name="status"
              className="sl-select"
              defaultValue={status}
              aria-label={m("status")}>
              <option value="">{m("all")}</option>
              <option value="enabled">{t("enabled")}</option>
              <option value="disabled">{t("disabled")}</option>
            </select>
            <button type="submit" className="sl-btn">
              {t("apply")}
            </button>
          </form>

          <section className="sl-panel">
            {slots.length ? (
              <div className="sl-scroll">
                <table className="sl-table">
                  <thead>
                    <tr>
                      <th>
                        {t("class")} / {t("subject")}
                      </th>
                      <th>{t("start")}</th>
                      <th>{t("end")}</th>
                      <th>{t("seats")}</th>
                      <th>{t("status")}</th>
                      <th className="sl-th-act">{t("action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((s) => {
                      const pct = s.capacity
                        ? Math.min(
                            100,
                            Math.round((s.booked / s.capacity) * 100),
                          )
                        : 0;
                      const level =
                        pct >= 100 ? "full" : pct >= 80 ? "high" : "ok";
                      return (
                        <tr key={String(s._id)}>
                          <td data-label={`${t("class")} / ${t("subject")}`}>
                            <span className="sl-slot">
                              <span className="sl-grade">{s.grade}</span>
                              <span className="sl-subject">
                                {subjects[subjectValues.indexOf(s.subject)] ||
                                  s.subject}
                              </span>
                            </span>
                          </td>
                          <td data-label={t("start")}>
                            <span className="sl-when sl-when-start">
                              {formatDate(s.startAt, locale)}
                            </span>
                          </td>
                          <td data-label={t("end")}>
                            <span className="sl-when sl-when-end">
                              {formatDate(s.endAt, locale)}
                            </span>
                          </td>
                          <td data-label={t("seats")}>
                            <div
                              className="sl-seats"
                              data-level={level}
                              style={{ "--p": pct } as CSSProperties}>
                              <span className="sl-seats-text">
                                <b>{s.booked}</b> / {s.capacity}
                              </span>
                              <span className="sl-meter" aria-hidden="true" />
                            </div>
                          </td>
                          <td data-label={t("status")}>
                            <span
                              className={`sl-badge ${
                                s.enabled ? "sl-badge-on" : "sl-badge-off"
                              }`}>
                              {t(s.enabled ? "enabled" : "disabled")}
                            </span>
                          </td>
                          <td className="sl-td-act" data-label={t("action")}>
                            <div className="sl-actions">
                              <RowControls
                                kind="slot"
                                id={String(s._id)}
                                name={[
                                  s.grade,
                                  s.subject,
                                  new Date(s.startAt)
                                    .toISOString()
                                    .slice(0, 10),
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                                canDelete={canDelete}
                                canArchive
                              />
                              <SlotControls
                                id={String(s._id)}
                                enabled={s.enabled}
                                capacity={s.capacity}
                              />
                              <SlotEditor
                                id={String(s._id)}
                                grade={s.grade}
                                subject={s.subject}
                                start={dhaka(s.startAt)}
                                end={dhaka(s.endAt)}
                                capacity={s.capacity}
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
              <div className="sl-empty">
                <p>{t("emptySlots")}</p>
                <Link className="sl-btn" href="/admin/slots?new=1">
                  {m("new")}
                </Link>
              </div>
            )}

            <div className="sl-pager">
              <Pagination
                path="/admin/slots"
                page={page}
                totalPages={Math.ceil(total / 20)}
                query={{ grade, status }}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
