"use client";
import type { ActionState } from "@/actions/admin";
import { saveFaculty } from "@/actions/faculty";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { ActionFeedback } from "./action-feedback";
import { PhotoPicker } from "./photo-picker";

export type FacultyFormValue = {
  id: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  qualificationBn: string;
  qualificationEn: string;
  bioBn: string;
  bioEn: string;
  director: boolean;
  published: boolean;
  order: number;
  photoUrl: string;
};

export function FacultyForm({ teacher }: { teacher?: FacultyFormValue }) {
  const t = useTranslations("admin");
  const [state, action, pending] = useActionState(saveFaculty, {
    status: "idle",
  } as ActionState);
  const [image, setImage] = useState(teacher?.photoUrl || "");
  const [uploading, setUploading] = useState(false);
  const busy = pending || uploading;

  return (
    <form
      className="ff-form"
      action={action}
      aria-busy={busy}
      onSubmit={(e) => {
        if (uploading) e.preventDefault();
      }}>
      {teacher && <input type="hidden" name="id" value={teacher.id} />}
      <input type="hidden" name="slug" value={teacher?.slug || ""} />

      <div className="ff-langs">
        <section className="ff-card" data-lang="bn">
          <label className="ff-field">
            <span className="ff-label">{t("teacherNameBn")}</span>
            <input
              name="nameBn"
              defaultValue={teacher?.nameBn || ""}
              required
              minLength={2}
              maxLength={120}
            />
          </label>
          <label className="ff-field">
            <span className="ff-label">{t("qualificationBn")}</span>
            <textarea
              name="qualificationBn"
              defaultValue={teacher?.qualificationBn || ""}
              required
              minLength={2}
              maxLength={1000}
            />
          </label>
          <label className="ff-field">
            <span className="ff-label">{t("teacherBioBn")}</span>
            <textarea
              className="ff-tall"
              name="bioBn"
              defaultValue={teacher?.bioBn || ""}
              maxLength={3000}
            />
          </label>
        </section>

        <section className="ff-card" data-lang="en">
          <label className="ff-field">
            <span className="ff-label">{t("teacherNameEn")}</span>
            <input
              name="nameEn"
              defaultValue={teacher?.nameEn || ""}
              required
              minLength={2}
              maxLength={120}
            />
          </label>
          <label className="ff-field">
            <span className="ff-label">{t("qualificationEn")}</span>
            <textarea
              name="qualificationEn"
              defaultValue={teacher?.qualificationEn || ""}
              required
              minLength={2}
              maxLength={1000}
            />
          </label>
          <label className="ff-field">
            <span className="ff-label">{t("teacherBioEn")}</span>
            <textarea
              className="ff-tall"
              name="bioEn"
              defaultValue={teacher?.bioEn || ""}
              maxLength={3000}
            />
          </label>
        </section>
      </div>

      <p className="ff-help">{t("teacherBioHelp")}</p>

      <section className="ff-card ff-settings">
        <div className="ff-photo">
          <PhotoPicker
            name="photoUrl"
            value={image}
            onChange={setImage}
            onPendingChange={setUploading}
          />
        </div>
        <div className="ff-side">
          <label className="ff-field ff-order">
            <span className="ff-label">{t("teacherOrder")}</span>
            <input
              name="order"
              type="number"
              min="0"
              max="10000"
              defaultValue={teacher?.order || 0}
              required
            />
          </label>
          <div className="ff-toggles">
            <label className="ff-toggle">
              <input
                name="director"
                type="checkbox"
                defaultChecked={teacher?.director || false}
              />
              <span>{t("director")}</span>
            </label>
            <label className="ff-toggle" data-kind="published">
              <input
                name="published"
                type="checkbox"
                defaultChecked={teacher?.published ?? true}
              />
              <span>{t("published")}</span>
            </label>
          </div>
        </div>
      </section>

      <div className="ff-actions">
        <button type="submit" className="ff-btn" disabled={busy}>
          {pending && <span className="ff-spinner" aria-hidden="true" />}
          {pending ? t("saving") : t("save")}
        </button>
        <div className="ff-feedback" aria-live="polite">
          <ActionFeedback
            state={state}
            success={t("saved")}
            conflict={t("errorConflict")}
            error={t("failure")}
          />
        </div>
      </div>
    </form>
  );
}
