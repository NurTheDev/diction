"use client";
/**
 * R9 · who teaches what: the teaching assignments beside the week they are written into.
 *
 * An assignment is the standing answer to "who takes গণিত in নবম শ্রেণি, and how many periods a week?" —
 * the list a master routine is built from and a substitute is chosen against. It sits on the routine
 * screen rather than on a settings screen because it is read while the week is being written.
 *
 * The row follows the house policy exactly: a visible Edit button, a ⋯ menu with Archive for staff and
 * Delete for an administrator, and a delete that goes to the Recycle Bin for thirty days with Undo. The
 * only fields nobody can write are the system's own — the id, the timestamps and who created the row.
 *
 * Styling lives in `routine-board.css` (everything here is `ra-*`, and the drawer form shares `rm-form`).
 */
import {
  saveAssignmentAction,
  type RoutineActionState,
} from "@/actions/routine";
import { formatNumber, type Digits } from "@/lib/admin/format";
import type {
  AssignmentView,
  RoutineClass,
  RoutineTeacher,
} from "@/lib/routine/read";
import { BookOpen, GraduationCap, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { RoutineDrawer } from "./routine-drawer";
import { RowControls } from "./row-controls";

import "@/routine-board.css";

const idle: RoutineActionState = { status: "idle" };

export interface RoutineAssignmentsProps {
  assignments: AssignmentView[];
  teachers: RoutineTeacher[];
  classes: RoutineClass[];
  classId: string;
  digits: Digits;
  canEdit: boolean;
  canDelete: boolean;
}

interface AssignmentDraft {
  id: string;
  teacherId: string;
  classId: string;
  subjectBn: string;
  subjectEn: string;
  periodsPerWeek: number;
  active: boolean;
  note: string;
}

const emptyDraft = (classId: string): AssignmentDraft => ({
  id: "",
  teacherId: "",
  classId,
  subjectBn: "",
  subjectEn: "",
  periodsPerWeek: 1,
  active: true,
  note: "",
});

const draftOf = (assignment: AssignmentView): AssignmentDraft => ({
  id: assignment.id,
  teacherId: assignment.teacherId,
  classId: assignment.classId,
  subjectBn: assignment.subjectBn,
  subjectEn: assignment.subjectEn,
  periodsPerWeek: assignment.periodsPerWeek,
  active: assignment.active,
  note: assignment.note,
});

const initialOf = (name: string): string => Array.from(name.trim())[0] || "?";

function AssignmentDrawer({
  target,
  onClose,
  props,
}: {
  target: AssignmentDraft | null;
  onClose: () => void;
  props: RoutineAssignmentsProps;
}) {
  const t = useTranslations("routine");
  const router = useRouter();
  const [draft, setDraft] = useState<AssignmentDraft | null>(target);
  const [state, action, pending] = useActionState(saveAssignmentAction, idle);

  useEffect(() => {
    if (state.status !== "ok") return;
    onClose();
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const write = (patch: Partial<AssignmentDraft>): void =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  return (
    <RoutineDrawer
      open={!!target}
      onClose={onClose}
      title={draft?.id ? t("assignment.edit") : t("assignment.add")}>
      {draft && (
        <form
          action={action}
          className="rm-form"
          data-assignment-form={draft.id || "new"}
          onReset={(event) => event.preventDefault()}>
          <input type="hidden" name="assignmentId" value={draft.id} />

          <label className="rm-field">
            {t("assignment.teacher")} *
            <select
              className="admin-select"
              name="teacherId"
              required
              data-assignment-teacher
              value={draft.teacherId}
              onChange={(event) => write({ teacherId: event.target.value })}>
              <option value="" disabled>
                {t("assignment.teacher")}
              </option>
              {props.teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
            {props.teachers.length === 0 && (
              <small className="rm-help">{t("assignment.noTeachers")}</small>
            )}
          </label>

          <div className="rm-two">
            <label className="rm-field">
              {t("assignment.subjectBn")} *
              <input
                className="admin-input"
                name="subjectBn"
                required
                maxLength={200}
                data-assignment-subject-bn
                value={draft.subjectBn}
                onChange={(event) => write({ subjectBn: event.target.value })}
              />
            </label>
            <label className="rm-field">
              {t("assignment.subjectEn")}
              <input
                className="admin-input"
                name="subjectEn"
                maxLength={200}
                value={draft.subjectEn}
                onChange={(event) => write({ subjectEn: event.target.value })}
              />
            </label>
          </div>

          <div className="rm-two">
            <label className="rm-field">
              {t("assignment.class")} *
              <select
                className="admin-select"
                name="classId"
                required
                data-assignment-class
                value={draft.classId}
                onChange={(event) => write({ classId: event.target.value })}>
                {props.classes.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="rm-field">
              {t("assignment.periodsPerWeek")} *
              <input
                className="admin-input"
                name="periodsPerWeek"
                required
                inputMode="numeric"
                maxLength={2}
                data-assignment-periods
                value={String(draft.periodsPerWeek)}
                onChange={(event) =>
                  write({
                    periodsPerWeek:
                      Number(event.target.value.replace(/\D/g, "")) || 0,
                  })
                }
              />
            </label>
          </div>

          <label className="rm-field">
            {t("assignment.note")}
            <textarea
              className="admin-textarea"
              name="note"
              maxLength={300}
              value={draft.note}
              onChange={(event) => write({ note: event.target.value })}
            />
          </label>

          <label className="rm-toggle">
            <input
              type="checkbox"
              name="active"
              data-assignment-active
              checked={draft.active}
              onChange={(event) => write({ active: event.target.checked })}
            />
            <span>{t("assignment.active")}</span>
          </label>

          {state.status !== "idle" && state.status !== "ok" && (
            <p
              role="alert"
              className="rm-note rm-note-error"
              data-assignment-refused>
              {state.status === "duplicate"
                ? t("assignment.duplicate")
                : state.status === "invalid"
                  ? t("assignment.invalid")
                  : t("common.failed")}
            </p>
          )}

          <div className="rm-actions">
            <button
              type="submit"
              className="rm-btn rm-btn-primary"
              disabled={pending}
              data-assignment-save>
              {t("assignment.save")}
            </button>
            <button
              type="button"
              className="rm-btn rm-btn-ghost"
              onClick={onClose}>
              {t("period.cancel")}
            </button>
          </div>
        </form>
      )}
    </RoutineDrawer>
  );
}

export function RoutineAssignments(props: RoutineAssignmentsProps) {
  const t = useTranslations("routine");
  const [target, setTarget] = useState<AssignmentDraft | null>(null);

  return (
    <section className="ra-panel" data-assignments>
      <header className="ra-head">
        <span className="ra-head-icon" aria-hidden="true">
          <GraduationCap size={21} />
        </span>
        <div className="ra-head-text">
          <div className="ra-head-title">
            <h2>{t("assignment.title")}</h2>
            <span className="ra-count">
              {formatNumber(props.assignments.length, props.digits)}
            </span>
          </div>
          <p>{t("assignment.sub")}</p>
        </div>
        {props.canEdit && (
          <button
            type="button"
            className="rm-btn rm-btn-primary ra-add"
            data-assignment-add
            onClick={() => setTarget(emptyDraft(props.classId))}>
            <Plus size={17} aria-hidden="true" />
            {t("assignment.add")}
          </button>
        )}
      </header>

      {props.assignments.length === 0 ? (
        <div className="ra-empty" data-assignment-empty>
          <span className="ra-empty-icon" aria-hidden="true">
            <BookOpen size={26} />
          </span>
          <strong>{t("assignment.empty")}</strong>
          <p>{t("assignment.emptyHelp")}</p>
        </div>
      ) : (
        <div className="ra-table-wrap">
          <table className="ra-table">
            <thead>
              <tr>
                <th>{t("assignment.headTeacher")}</th>
                <th>{t("assignment.headSubject")}</th>
                <th>{t("assignment.headClass")}</th>
                <th>{t("assignment.headPeriods")}</th>
                <th>{t("assignment.headStatus")}</th>
                <th>{t("common.edit")}</th>
              </tr>
            </thead>
            <tbody>
              {props.assignments.map((assignment) => (
                <tr
                  key={assignment.id}
                  className={assignment.active ? "" : "ra-row-off"}
                  data-assignment-row={assignment.id}>
                  <td data-label={t("assignment.headTeacher")}>
                    <div className="ra-person">
                      <span className="ra-avatar" aria-hidden="true">
                        {initialOf(assignment.teacherName)}
                      </span>
                      <strong data-assignment-teacher-name>
                        {assignment.teacherName}
                      </strong>
                    </div>
                  </td>
                  <td data-label={t("assignment.headSubject")}>
                    <span className="ra-subject" data-assignment-subject>
                      {assignment.subjectBn}
                    </span>
                  </td>
                  <td data-label={t("assignment.headClass")}>
                    <span className="ra-class">{assignment.className}</span>
                  </td>
                  <td data-label={t("assignment.headPeriods")}>
                    <span className="ra-periods" data-assignment-count>
                      {t("assignment.perWeek", {
                        count: formatNumber(
                          assignment.periodsPerWeek,
                          props.digits,
                        ),
                      })}
                    </span>
                  </td>
                  <td data-label={t("assignment.headStatus")}>
                    <span
                      className={`ra-status ${assignment.active ? "ra-status-on" : "ra-status-off"}`}
                      data-assignment-active={assignment.active ? "yes" : "no"}>
                      {assignment.active
                        ? t("assignment.on")
                        : t("assignment.off")}
                    </span>
                  </td>
                  <td data-label={t("common.edit")}>
                    <div className="ra-actions">
                      {props.canEdit && (
                        <button
                          type="button"
                          className="rm-btn rm-btn-soft rm-btn-sm"
                          data-assignment-edit={assignment.id}
                          onClick={() => setTarget(draftOf(assignment))}>
                          <Pencil size={14} aria-hidden="true" />
                          {t("assignment.edit")}
                        </button>
                      )}
                      {/* The row's own controls raise their own toast: Archive for a staff session, Delete
                          for an administrator, and neither needs a second sentence from this table. */}
                      <RowControls
                        kind="teachingAssignment"
                        id={assignment.id}
                        name={`${assignment.teacherName} · ${assignment.subjectBn}`}
                        canDelete={props.canDelete}
                        canArchive
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div key={target ? target.id || "new" : "closed"}>
        <AssignmentDrawer
          target={target}
          onClose={() => setTarget(null)}
          props={props}
        />
      </div>
    </section>
  );
}
