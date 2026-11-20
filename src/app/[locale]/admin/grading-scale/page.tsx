import { GradingScaleForm } from "@/components/admin/center-exam-forms";
import { Link } from "@/i18n/navigation";
import { dashboardDigits } from "@/lib/admin/digits";
import { formatNumber } from "@/lib/admin/format";
import { getExamScope } from "@/lib/exams/exam-actor";
import { DEFAULT_GRADING_RANGES } from "@/lib/exams/vocab";
import { CenterGradingScale } from "@/models/CenterRecords";
import mongoose from "mongoose";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * R5 · The centre's grading scales.
 *
 * The brief asks for a configurable scale, and the model for one has existed unread since the
 * experimental exam work; this is the screen that makes it real. Two rules keep it honest:
 *
 *   • **Only the owner edits it** (`scope.scale` — Super Admin and Admin). An exam manager runs exams but
 *     does not decide what an A+ is worth centre-wide, and a teacher certainly does not.
 *   • **Editing a scale never rewrites a result.** An exam snapshots the bands it was created with, so the
 *     scales listed here are the choices for the NEXT exam. The one exception is deliberate: changing an
 *     exam's own bands recomputes that exam's stored grades, because a grade is derived from a mark and a
 *     mark is not derived from anything.
 */
export default async function GradingScalePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scale?: string }>;
}) {
  const t = await getTranslations("exams");
  const scope = await getExamScope();
  if (!scope || !scope.scale) notFound();
  const { scale } = await searchParams;
  // The owner's own digit preference: a band boundary on a Bangla screen is a Bangla number.
  const digits = await dashboardDigits(scope.userId);
  const scales = await CenterGradingScale.find({})
    .sort({ active: -1, name: 1 })
    .limit(20)
    .lean<
      {
        _id: mongoose.Types.ObjectId;
        name: string;
        ranges: { min: number; max: number; grade: string; point: number }[];
        active: boolean;
      }[]
    >();
  const options = scales.map((entry) => ({
    id: String(entry._id),
    name: entry.name,
    active: entry.active,
    ranges: entry.ranges.map((range) => ({
      min: range.min,
      max: range.max,
      grade: range.grade,
      point: range.point,
    })),
  }));
  const current =
    scale && mongoose.isValidObjectId(scale)
      ? options.find((entry) => entry.id === scale)
      : null;

  return (
    <div className="gs">
      <header className="gs-head">
        <Link href="/admin/center-exams" className="gs-back">
          ← {t("scale.crumbExams")}
        </Link>
        <h1>{t("scale.title")}</h1>
        <p>{t("scale.desc")}</p>
      </header>

      <section className="gs-panel">
        <div className="gs-panel-head">
          <h2>{current ? t("scale.editHeading") : t("scale.newHeading")}</h2>
        </div>
        <div className="gs-panel-body">
          <GradingScaleForm
            scale={
              current
                ? {
                    id: current.id,
                    name: current.name,
                    ranges: current.ranges,
                    active: current.active,
                  }
                : null
            }
            scales={options}
          />
        </div>
      </section>

      <section className="gs-panel">
        <div className="gs-panel-head">
          <h2>{t("scale.savedHeading")}</h2>
          <span className="gs-count" data-scale-count>
            {formatNumber(options.length, digits)}
          </span>
        </div>
        {options.length > 0 && (
          <div className="gs-scroll">
            <table className="gs-table" data-scale-list>
              <thead>
                <tr>
                  <th>{t("scale.col.name")}</th>
                  <th>{t("scale.col.status")}</th>
                  <th>{t("scale.col.ranges")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {options.map((entry) => (
                  <tr key={entry.id} data-scale-row={entry.id}>
                    <td>
                      <span className="gs-name">{entry.name}</span>
                    </td>
                    <td>
                      <span
                        className={`gs-badge ${entry.active ? "gs-badge-on" : "gs-badge-off"}`}>
                        {entry.active ? t("scale.active") : t("scale.inactive")}
                      </span>
                    </td>
                    <td>
                      <div className="gs-chips">
                        {entry.ranges.map((range, index) => (
                          <span
                            className="gs-chip"
                            key={`${range.grade}-${index}`}>
                            <b>{range.grade}</b>
                            {` ${range.min}–${range.max} (${range.point})`}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Link
                        className="gs-mini"
                        href={`/admin/grading-scale?scale=${entry.id}`}>
                        {t("scale.edit")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!options.length && <p className="gs-empty">{t("scale.empty")}</p>}
      </section>

      <section className="gs-panel">
        <div className="gs-panel-head">
          <h2>{t("scale.defaultHeading")}</h2>
        </div>
        <div className="gs-panel-body">
          <p className="gs-help">{t("scale.defaultHelp")}</p>
          <div className="gs-scroll">
            <table className="gs-table" data-scale-default>
              <thead>
                <tr>
                  <th>{t("scale.col.grade")}</th>
                  <th>{t("scale.col.from")}</th>
                  <th>{t("scale.col.to")}</th>
                  <th>{t("scale.col.point")}</th>
                </tr>
              </thead>
              <tbody>
                {DEFAULT_GRADING_RANGES.map((range) => (
                  <tr key={range.grade}>
                    <td>
                      <span className="gs-grade">{range.grade}</span>
                    </td>
                    <td>
                      <span className="gs-num">{range.min}</span>
                    </td>
                    <td>
                      <span className="gs-num">{range.max}</span>
                    </td>
                    <td>
                      <span className="gs-num">{range.point}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
