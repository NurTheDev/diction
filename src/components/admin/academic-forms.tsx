"use client";
import {
  createBatch,
  createExam,
  createPortalAccount,
  enrollStudent,
  publishExam,
} from "@/actions/academic";
import type { ActionState } from "@/actions/admin";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { StudentSearchPicker } from "./student-search-picker";

type Option = { id: string; name: string };

const initial: ActionState = { status: "idle" };
const GRADES = Array.from({ length: 9 }, (_, i) => i + 4);

function Feedback({
  state,
  duplicateEmail = false,
}: {
  state: ActionState;
  duplicateEmail?: boolean;
}) {
  const t = useTranslations("academic");
  if (state.status === "idle") return null;
  return (
    <p
      role="status"
      className={`admin-feedback ${state.status !== "ok" ? "error" : ""}`}>
      {state.status === "ok"
        ? t("saved")
        : state.status === "conflict" && duplicateEmail
          ? t("duplicateEmail")
          : t("error")}
    </p>
  );
}

function Button({
  pending,
  disabled = false,
}: {
  pending: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("academic");
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className="button button-navy">
      {pending ? t("saving") : t("save")}
    </button>
  );
}

function Options({ items }: { items: Option[] }) {
  const t = useTranslations("academic");
  return (
    <>
      <option value="">{t("choose")}</option>
      {items.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </>
  );
}

function Grade() {
  return (
    <select className="admin-select" name="grade">
      {GRADES.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

export function PortalAccountForm() {
  const t = useTranslations("academic");
  const [state, action, pending] = useActionState(createPortalAccount, initial);
  return (
    <form className="academic-form admin-edit" action={action}>
      <p className="admin-help">{t("createUserHelp")}</p>
      <div className="admin-slot-grid">
        <label>
          {t("name")}
          <input
            className="admin-input"
            name="name"
            minLength={2}
            maxLength={120}
            required
          />
        </label>
        <label>
          {t("email")}
          <input
            className="admin-input"
            name="email"
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>
        <label>
          {t("password")}
          <input
            className="admin-input"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
          />
        </label>
        <label>
          {t("role")}
          <select className="admin-select" name="role" defaultValue="teacher">
            <option value="student">{t("student")}</option>
            <option value="teacher">{t("teacher")}</option>
            <option value="parent">{t("parent")}</option>
          </select>
        </label>
      </div>
      <div className="academic-form-foot">
        <Button pending={pending} />
        <Feedback state={state} duplicateEmail />
      </div>
    </form>
  );
}

export function BatchForm({ teachers }: { teachers: Option[] }) {
  const t = useTranslations("academic");
  const [state, action, pending] = useActionState(createBatch, initial);
  const noTeachers = teachers.length === 0;
  return (
    <form className="academic-form admin-edit" action={action}>
      <p className="admin-help">
        {t("teacherAccountHelp")}{" "}
        {noTeachers && (
          <span className="academic-form-warn">{t("noTeacherAccount")}</span>
        )}
      </p>
      <div className="admin-slot-grid">
        <label>
          {t("titleBn")}
          <input
            className="admin-input"
            name="titleBn"
            required
            minLength={2}
            maxLength={120}
          />
        </label>
        <label>
          {t("titleEn")}
          <input
            className="admin-input"
            name="titleEn"
            required
            minLength={2}
            maxLength={120}
          />
        </label>
        <label>
          {t("class")}
          <Grade />
        </label>
        <label>
          {t("teacher")}
          <select className="admin-select" name="teacher" required>
            <Options items={teachers} />
          </select>
        </label>
        <label>
          {t("scheduleBn")}
          <input className="admin-input" name="scheduleBn" maxLength={200} />
        </label>
        <label>
          {t("scheduleEn")}
          <input className="admin-input" name="scheduleEn" maxLength={200} />
        </label>
      </div>
      <div className="academic-form-foot">
        <Button pending={pending} disabled={noTeachers} />
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function EnrollmentForm({
  students,
  parents,
  batches,
}: {
  students: Option[];
  parents: Option[];
  batches: Option[];
}) {
  const t = useTranslations("academic");
  const [state, action, pending] = useActionState(enrollStudent, initial);
  return (
    <form className="academic-form admin-edit" action={action}>
      <div className="admin-slot-grid">
        <label>
          {t("student")}
          <StudentSearchPicker name="user" items={students} />
        </label>
        <label>
          {t("parentOptional")}
          <select className="admin-select" name="parent">
            <Options items={parents} />
          </select>
        </label>
        <label>
          {t("class")}
          <Grade />
        </label>
        <label>
          {t("school")}
          <input className="admin-input" name="school" maxLength={160} />
        </label>
        <label>
          {t("batch")}
          <select className="admin-select" name="batch" required>
            <Options items={batches} />
          </select>
        </label>
      </div>
      <small className="academic-form-note">{t("parentHelp")}</small>
      <div className="academic-form-foot">
        <Button pending={pending} />
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function ExamForm({ batches }: { batches: Option[] }) {
  const t = useTranslations("academic");
  const [state, action, pending] = useActionState(createExam, initial);
  return (
    <form className="academic-form admin-edit" action={action}>
      <div className="admin-slot-grid">
        <label>
          {t("titleBn")}
          <input
            className="admin-input"
            name="titleBn"
            required
            minLength={2}
            maxLength={120}
          />
        </label>
        <label>
          {t("titleEn")}
          <input
            className="admin-input"
            name="titleEn"
            required
            minLength={2}
            maxLength={120}
          />
        </label>
        <label>
          {t("batch")}
          <select className="admin-select" name="batch" required>
            <Options items={batches} />
          </select>
        </label>
        <label>
          {t("maxMarks")}
          <input
            className="admin-input"
            name="maxMarks"
            type="number"
            min="1"
            max="1000"
            step="0.01"
            defaultValue="100"
            required
          />
        </label>
      </div>
      <div className="academic-form-foot">
        <Button pending={pending} />
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function PublicationForm({
  id,
  published,
}: {
  id: string;
  published: boolean;
}) {
  const t = useTranslations("academic");
  const [state, action, pending] = useActionState(publishExam, initial);
  return (
    <form
      className="academic-inline-form"
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            published ? t("unpublishConfirm") : t("publishConfirm"),
          )
        )
          e.preventDefault();
      }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="published" value={String(!published)} />
      <button
        type="submit"
        className="admin-mini-button"
        data-state={published ? "unpublish" : "publish"}
        aria-busy={pending}
        disabled={pending}>
        {published ? t("unpublish") : t("publish")}
      </button>
      <Feedback state={state} />
    </form>
  );
}
