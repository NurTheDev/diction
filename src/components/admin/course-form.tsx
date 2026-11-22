"use client";

import type { ActionState } from "@/actions/admin";
import { deleteCourse, saveCourse } from "@/actions/course";
import { subjectValues } from "@/schemas/intake";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { ActionFeedback } from "./action-feedback";
import { ConfirmSubmit } from "./confirm-submit";

export type CourseValue = {
  id: string;
  slug: string;
  grade: string;
  subject: string;
  titleBn: string;
  titleEn: string;
  descriptionBn: string;
  descriptionEn: string;
  scheduleBn: string;
  scheduleEn: string;
  feeBn: string;
  feeEn: string;
  order: number;
  published: boolean;
};

export function CourseForm({ item }: { item?: CourseValue }) {
  const t = useTranslations("courseCms"),
    a = useTranslations("admin"),
    p = useTranslations("pages");
  const names = p.raw("subjects") as string[];
  const [state, action, pending] = useActionState(saveCourse, {
    status: "idle",
  } as ActionState);
  const [del, deleteAction, deleting] = useActionState(deleteCourse, {
    status: "idle",
  } as ActionState);

  return (
    <div className="cf">
      <form className="cf-form" action={action}>
        {item && <input type="hidden" name="id" value={item.id} />}
        <input type="hidden" name="slug" value={item?.slug || ""} />

        {/* Settings */}
        <section className="cf-card">
          <div className="cf-settings-grid">
            <label className="cf-field">
              <span className="cf-label">{p("class")}</span>
              <select
                className="cf-select"
                name="grade"
                defaultValue={item?.grade || "4"}>
                {Array.from({ length: 9 }, (_, i) => i + 4).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <label className="cf-field">
              <span className="cf-label">{p("subject")}</span>
              <select
                className="cf-select"
                name="subject"
                defaultValue={item?.subject || "math"}>
                {subjectValues.map((v, i) => (
                  <option value={v} key={v}>
                    {names[i]}
                  </option>
                ))}
              </select>
            </label>

            <label className="cf-field">
              <span className="cf-label">{a("teacherOrder")}</span>
              <input
                className="cf-input"
                name="order"
                type="number"
                min="0"
                max="10000"
                defaultValue={item?.order || 0}
                required
              />
            </label>
          </div>

          <label className="cf-toggle">
            <input
              type="checkbox"
              name="published"
              defaultChecked={item?.published ?? false}
            />
            <span>{a("published")}</span>
          </label>
        </section>

        {/* Bangla + English */}
        <div className="cf-grid">
          <section className="cf-card" data-lang="bn">
            <label className="cf-field">
              <span className="cf-label">{t("titleBn")}</span>
              <input
                className="cf-input"
                name="titleBn"
                defaultValue={item?.titleBn || ""}
                required
                minLength={2}
                maxLength={300}
              />
            </label>
            <label className="cf-field">
              <span className="cf-label">{t("descriptionBn")}</span>
              <textarea
                className="cf-textarea"
                name="descriptionBn"
                defaultValue={item?.descriptionBn || ""}
                required
                minLength={2}
                maxLength={300}
              />
            </label>
            <label className="cf-field">
              <span className="cf-label">{t("scheduleBn")}</span>
              <input
                className="cf-input"
                name="scheduleBn"
                defaultValue={item?.scheduleBn || ""}
                maxLength={500}
              />
            </label>
            <label className="cf-field">
              <span className="cf-label">{t("feeBn")}</span>
              <input
                className="cf-input"
                name="feeBn"
                defaultValue={item?.feeBn || ""}
                maxLength={500}
              />
            </label>
          </section>

          <section className="cf-card" data-lang="en">
            <label className="cf-field">
              <span className="cf-label">{t("titleEn")}</span>
              <input
                className="cf-input"
                name="titleEn"
                defaultValue={item?.titleEn || ""}
                required
                minLength={2}
                maxLength={300}
              />
            </label>
            <label className="cf-field">
              <span className="cf-label">{t("descriptionEn")}</span>
              <textarea
                className="cf-textarea"
                name="descriptionEn"
                defaultValue={item?.descriptionEn || ""}
                required
                minLength={2}
                maxLength={300}
              />
            </label>
            <label className="cf-field">
              <span className="cf-label">{t("scheduleEn")}</span>
              <input
                className="cf-input"
                name="scheduleEn"
                defaultValue={item?.scheduleEn || ""}
                maxLength={500}
              />
            </label>
            <label className="cf-field">
              <span className="cf-label">{t("feeEn")}</span>
              <input
                className="cf-input"
                name="feeEn"
                defaultValue={item?.feeEn || ""}
                maxLength={500}
              />
            </label>
          </section>
        </div>

        <small className="cf-hint">{t("optional")}</small>

        <div className="cf-actions">
          <button
            type="submit"
            className="cf-btn"
            data-pending={pending ? "" : undefined}
            disabled={pending}>
            {pending ? a("saving") : a("save")}
          </button>
          <div className="cf-feedback">
            <ActionFeedback
              state={state}
              success={a("saved")}
              conflict={a("errorConflict")}
              error={a("failure")}
            />
          </div>
        </div>
      </form>

      {item && (
        <form className="cf-danger" action={deleteAction}>
          <input type="hidden" name="id" value={item.id} />
          <ConfirmSubmit
            label={t("delete")}
            disabled={deleting}
            itemName={item?.titleBn}
          />
          {del.status === "error" && (
            <span className="cf-danger-err" role="alert">
              {a("failure")}
            </span>
          )}
        </form>
      )}
    </div>
  );
}
