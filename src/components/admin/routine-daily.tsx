"use client";
/**
 * R9 · the daily working sheet: one date, pre-filled from the week, editable in every part.
 *
 * The sheet is the everyday paper a coaching centre actually runs on. It opens on Dhaka's today, it can
 * be walked to tomorrow or back to a date that has already passed, and it starts as a copy of the master
 * routine for that weekday — every period marked as the week's own, so the operator can see at a glance
 * which lines are the template and which are this date's.
 *
 * Three rules this component is built around:
 *
 *   • **The master routine is never touched here.** A substitute, a moved room, a changed time is written
 *     to the date alone. The sheet says so in its own help line, because the whole point of the two
 *     screens is that one is permanent and one is not.
 *   • **Nothing is blocked by time or by a dispatch.** A past date is fully editable and carries a small
 *     badge saying it has passed; a sheet that has already been sent is fully editable and carries a
 *     small badge saying it has changed since.
 *   • **A day that says nothing new costs nothing.** The engine stores a sheet only when it differs from
 *     the week, and the answer the operator gets says which happened — "saved" or "saved, and no copy was
 *     needed". That sentence is the storage rule made visible.
 *
 * The day is saved as ONE write, because a day is one decision: the status, the reason, the notes and
 * every period travel together, and the drawers below only edit the draft the form posts.
 */
import {
  resetDailySheetAction,
  saveDailySheetAction,
  type RoutineActionState,
} from "@/actions/routine";
import { formatDate, formatNumber, type Digits } from "@/lib/admin/format";
import type { RoutineClash } from "@/lib/routine/conflicts";
import type {
  DailyPeriodView,
  DailySheetView,
  RoutineTeacher,
} from "@/lib/routine/read";
import {
  DEFAULT_PERIOD_MINUTES,
  endAfter,
  nextPeriodSeed,
  rangeWord,
  type Language,
} from "@/lib/routine/time";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { showRecycleToast } from "./recycle-toast-host";
import {
  DurationChips,
  RoutineDrawer,
  TimeField,
  chainedEnd,
  durationOf,
} from "./routine-drawer";
import { RoutineHistory } from "./routine-history";
import { RowControls } from "./row-controls";
import { SubmitButton } from "./submit-button";

const idle: RoutineActionState = { status: "idle" };

/** One line of the draft: a period as the sheet holds it before it is posted. */
interface DraftPeriod {
  id: string;
  masterPeriod: string;
  start: string;
  end: string;
  subjectBn: string;
  subjectEn: string;
  teacher: string;
  room: string;
  jointWith: string;
  order: number;
  note: string;
  source: "master" | "own";
}

const draftOf = (period: DailyPeriodView): DraftPeriod => ({
  id: period.id,
  masterPeriod: period.masterPeriod,
  start: period.start,
  end: period.end,
  subjectBn: period.subjectBn,
  subjectEn: period.subjectEn,
  teacher: period.teacherId,
  room: period.room,
  jointWith: period.jointWith,
  order: period.order,
  note: period.note,
  source: period.source,
});

export interface RoutineDailyProps {
  sheet: DailySheetView;
  teachers: RoutineTeacher[];
  rooms: string[];
  joints: { id: string; label: string }[];
  /** The subjects a weekly exam can be about, for the exam subject picker. */
  examSubjects: { bn: string; en: string }[];
  weekdays: string[];
  digits: Digits;
  language: Language;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * The drawer that edits one period of this date — and only of this date.
 *
 * The length chips sit above the two clocks here exactly as they do in the week's own drawer, so a day
 * sheet that shortens a period to forty-five minutes says so with the same four buttons and the same
 * arithmetic — and the end follows the start unless the operator has pressed Custom.
 */
function DailyPeriodDrawer({
  target,
  onClose,
  onSave,
  onDuration,
  props,
}: {
  target: { index: number; period: DraftPeriod } | null;
  onClose: () => void;
  onSave: (period: DraftPeriod, index: number) => void;
  onDuration: (minutes: number | null) => void;
  props: RoutineDailyProps;
}) {
  const t = useTranslations("routine");
  const [draft, setDraft] = useState<DraftPeriod | null>(
    target?.period || null,
  );
  const write = (patch: Partial<DraftPeriod>): void =>
    setDraft((current) => (current ? { ...current, ...patch } : current));
  const isNew = (target?.index ?? -1) < 0;
  const [duration, setDuration] = useState<number | null>(() =>
    draft ? durationOf(draft.start, draft.end) : null,
  );
  const pick = (minutes: number | null): void => {
    setDuration(minutes);
    onDuration(minutes);
    if (minutes && draft) write({ end: endAfter(draft.start, minutes) });
  };
  const writeStart = (value: string): void =>
    write(
      draft
        ? { start: value, end: chainedEnd(value, draft.end, duration) }
        : { start: value },
    );

  return (
    <RoutineDrawer
      open={!!target}
      onClose={onClose}
      title={isNew ? t("period.newTitle") : t("period.editorTitle")}>
      {draft && (
        <form
          className="rds-dform"
          data-daily-period-form={isNew ? "new" : draft.id}
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.subjectBn.trim()) return;
            onSave(draft, target?.index ?? -1);
          }}>
          <p className="rds-note" data-daily-period-scope>
            {t("daily.dayOnly")}
          </p>
          <p className="rds-help" data-daily-period-shift>
            {t("period.shiftLine", {
              shift: props.sheet.shift || t("master.noShift"),
            })}
          </p>

          <DurationChips
            minutes={duration}
            digits={props.digits}
            onPick={pick}
          />

          <div className="rds-two">
            <label className="rds-field">
              {t("period.start")}
              <TimeField
                name="start"
                value={draft.start}
                digits={props.digits}
                onChange={writeStart}
              />
            </label>
            <label className="rds-field">
              {t("period.end")}
              <TimeField
                name="end"
                value={draft.end}
                digits={props.digits}
                onChange={(value) => write({ end: value })}
              />
            </label>
          </div>

          <label className="rds-field">
            {t("period.subjectBn")} *
            <input
              name="subjectBn"
              required
              maxLength={200}
              data-daily-subject-bn
              value={draft.subjectBn}
              onChange={(event) => write({ subjectBn: event.target.value })}
            />
          </label>
          <label className="rds-field">
            {t("period.subjectEn")}
            <input
              name="subjectEn"
              maxLength={200}
              value={draft.subjectEn}
              onChange={(event) => write({ subjectEn: event.target.value })}
            />
          </label>
          <label className="rds-field">
            {isNew ? t("period.teacher") : t("daily.substitute")}
            <select
              name="teacher"
              data-daily-teacher
              value={draft.teacher}
              onChange={(event) => write({ teacher: event.target.value })}>
              <option value="">{t("period.teacherNone")}</option>
              {props.teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
          </label>

          <div className="rds-two">
            <label className="rds-field">
              {t("period.room")}
              <input
                name="room"
                maxLength={80}
                list="routine-rooms-daily"
                data-daily-room
                value={draft.room}
                onChange={(event) => write({ room: event.target.value })}
              />
              <datalist id="routine-rooms-daily">
                {props.rooms.map((room) => (
                  <option key={room} value={room} />
                ))}
              </datalist>
            </label>
            <label className="rds-field">
              {t("period.order")}
              <input
                name="order"
                inputMode="numeric"
                maxLength={2}
                data-daily-order
                value={String(draft.order)}
                onChange={(event) =>
                  write({
                    order: Number(event.target.value.replace(/\D/g, "")) || 0,
                  })
                }
              />
            </label>
          </div>

          <label className="rds-field">
            {t("period.joint")}
            <select
              name="jointWith"
              data-daily-joint
              value={draft.jointWith}
              onChange={(event) => write({ jointWith: event.target.value })}>
              <option value="">{t("period.jointNone")}</option>
              {props.joints.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="rds-field">
            {t("period.note")}
            <textarea
              name="note"
              maxLength={300}
              data-daily-note
              value={draft.note}
              onChange={(event) => write({ note: event.target.value })}
            />
          </label>

          <div className="rds-actions rds-actions-drawer">
            <button
              type="submit"
              className="rds-btn rds-btn-primary"
              data-daily-period-save>
              {t("period.save")}
            </button>
            <button
              type="button"
              className="rds-btn rds-btn-ghost"
              onClick={onClose}>
              {t("period.cancel")}
            </button>
          </div>
        </form>
      )}
    </RoutineDrawer>
  );
}

export function RoutineDailySheet(props: RoutineDailyProps) {
  const { sheet, digits, language } = props;
  const t = useTranslations("routine");
  const router = useRouter();
  const [draft, setDraft] = useState<DraftPeriod[]>(() =>
    sheet.periods.map(draftOf),
  );
  const [status, setStatus] = useState<"normal" | "adjusted" | "holiday">(
    sheet.status,
  );
  const [holidayReason, setHolidayReason] = useState(sheet.holidayReason);
  const [notes, setNotes] = useState(sheet.notes);
  /* A weekly exam day's own two choices, written on this date rather than on the week. */
  const [examSubjectBn, setExamSubjectBn] = useState(sheet.examSubjectBn);
  const [examSubjectEn, setExamSubjectEn] = useState(sheet.examSubjectEn);
  const [examMode, setExamMode] = useState<"both" | "exam">(sheet.examMode);
  const [editor, setEditor] = useState<{
    index: number;
    period: DraftPeriod;
  } | null>(null);
  /* Slice 2: the sheet's own memory — the last twenty changes to this date, and the tap that puts one
     of them back. */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [state, action, pending] = useActionState(saveDailySheetAction, idle);
  const [resetState, resetAction] = useActionState(resetDailySheetAction, idle);

  /* A weekly exam day can run the exam beside its classes, or the exam alone. Exam-only posts an empty
     day, which is how every reader already understands "nothing runs here". */
  const examOnly =
    sheet.dayType === "exam" && status !== "holiday" && examMode === "exam";
  const offNoAdd = sheet.dayType === "off" && status !== "adjusted";
  const postedPeriods = examOnly ? [] : draft;
  /* Coming back from "exam only" brings the week's classes with it: the date stored no periods while it
     ran the exam alone, and "exam + classes" means the classes this weekday actually runs. */
  const pickExamMode = (mode: "both" | "exam"): void => {
    setExamMode(mode);
    if (mode === "both" && examOnly && draft.length === 0)
      setDraft(
        sheet.masterPeriods.map((period) => ({
          id: "",
          masterPeriod: period.id,
          start: period.start,
          end: period.end,
          subjectBn: period.subjectBn,
          subjectEn: period.subjectEn,
          teacher: period.teacherId,
          room: period.room,
          jointWith: period.jointWith,
          order: period.order,
          note: period.note,
          source: "master" as const,
        })),
      );
  };

  /* The sheet is one write, so the drawers edit a draft and the draft is what the form posts. */
  const starting = JSON.stringify({
    periods: sheet.periods.map(draftOf),
    status: sheet.status,
    holidayReason: sheet.holidayReason,
    notes: sheet.notes,
    examSubjectBn: sheet.examSubjectBn,
    examSubjectEn: sheet.examSubjectEn,
    examMode: sheet.examMode,
  });
  const now = JSON.stringify({
    periods: postedPeriods,
    status,
    holidayReason,
    notes,
    examSubjectBn,
    examSubjectEn,
    examMode,
  });
  const dirty = starting !== now;

  /* The day can change underneath this form: a version restored from its own memory, a reset, a write
     from another screen. The draft is the operator's, so it does not follow the day on its own — and a
     form still posting the version the operator just undid is a screen contradicting the day it shows.
     The newest entry in the day's memory is the marker that something was written; the draft is adopted
     only when it is still the version that was replaced, so nothing anybody is in the middle of typing
     is thrown away by a write of their own coming back. */
  const newestEntry = sheet.history[0]?.id || "";
  const [seen, setSeen] = useState({ entry: newestEntry, stored: starting });
  if (newestEntry !== seen.entry) {
    const stale = now === seen.stored;
    setSeen({ entry: newestEntry, stored: starting });
    if (stale) {
      setDraft(sheet.periods.map(draftOf));
      setStatus(sheet.status);
      setHolidayReason(sheet.holidayReason);
      setNotes(sheet.notes);
      setExamSubjectBn(sheet.examSubjectBn);
      setExamSubjectEn(sheet.examSubjectEn);
      setExamMode(sheet.examMode);
    }
  }

  useEffect(() => {
    if (state.status !== "ok") return;
    showRecycleToast({
      state: { status: "ok" },
      success: state.stored
        ? state.message || t("daily.saved")
        : state.message || t("daily.savedCopy"),
      error: "",
    });
    router.refresh();
  }, [state]);
  useEffect(() => {
    if (resetState.status !== "ok") return;
    showRecycleToast({
      state: { status: "ok" },
      success: resetState.message || t("daily.resetDone"),
      error: "",
    });
    router.refresh();
  }, [resetState]);

  const sentence = (clash: RoutineClash): string => {
    const params = {
      who: clash.who,
      otherClass: clash.otherClass,
      otherSubject: clash.otherSubject,
      time: rangeWord(clash.otherStart, clash.otherEnd, digits),
    };
    if (clash.kind === "teacher") return t("clashes.teacher", params);
    return t("clashes.room", params);
  };
  const savePeriod = (period: DraftPeriod, index: number): void => {
    setDraft((current) =>
      index < 0
        ? [...current, period]
        : current.map((entry, position) =>
            position === index ? period : entry,
          ),
    );
    setEditor(null);
  };
  const leaveOut = (index: number): void => {
    setDraft((current) => current.filter((_, position) => position !== index));
    showRecycleToast({
      state: { status: "ok" },
      success: t("period.leftOut"),
      error: "",
    });
  };
  const addPeriod = (): void =>
    setEditor({
      index: -1,
      period: {
        id: "",
        masterPeriod: "",
        start: "08:00",
        end: endAfter("08:00", DEFAULT_PERIOD_MINUTES),
        subjectBn: "",
        subjectEn: "",
        teacher: "",
        room: "",
        jointWith: "",
        order: draft.length,
        note: "",
        source: "own",
      },
    });
  /* The chain, on a day sheet: the next period starts when this sheet's last one ends — a period the
     sheet holds only as a draft counts, because a day being written is what the chain is for — and is
     numbered one past the highest number already on the sheet. */
  const [chainMinutes, setChainMinutes] = useState<number>(
    DEFAULT_PERIOD_MINUTES,
  );
  const addNextPeriod = (): void => {
    const seed = nextPeriodSeed(
      draft.map((period) => ({
        start: period.start,
        end: period.end,
        order: period.order,
      })),
      chainMinutes,
    );
    setEditor({
      index: -1,
      period: {
        id: "",
        masterPeriod: "",
        start: seed.start,
        end: seed.end,
        subjectBn: "",
        subjectEn: "",
        teacher: "",
        room: "",
        jointWith: "",
        order: seed.order,
        note: "",
        source: "own",
      },
    });
  };

  return (
    <>
      <div className="rds">
        <div className="rds-head" data-daily-badges>
          <h2 className="rds-day" data-daily-day>
            {props.weekdays[sheet.weekday]}
          </h2>
          <span className="rds-chip rds-chip-plain" data-daily-shift>
            {t("daily.shiftWord", {
              shift: sheet.shift || t("master.noShift"),
            })}
          </span>
          {sheet.passed && (
            <span className="rds-chip rds-chip-past" data-badge-passed>
              {t("daily.passed")}
            </span>
          )}
          {sheet.changedSinceSent && (
            <span className="rds-chip rds-chip-sent" data-badge-changed>
              {t("daily.changedSinceSent")}
            </span>
          )}
          {sheet.sent && sheet.sentAt && (
            <span className="rds-meta" data-daily-sent>
              {t("daily.sentAt", {
                when: formatDate(new Date(sheet.sentAt), digits, language),
              })}
            </span>
          )}
          {sheet.stored ? (
            <span className="rds-chip rds-chip-stored" data-daily-stored>
              {t("daily.stored")}
            </span>
          ) : (
            <span className="rds-chip rds-chip-plain" data-daily-not-stored>
              {t("daily.notStored")}
            </span>
          )}
          <button
            type="button"
            className="rds-btn rds-btn-ghost rds-btn-sm rds-head-end"
            data-daily-history
            onClick={() => setHistoryOpen(true)}>
            {t("history.open")}
          </button>
        </div>

        {sheet.passed && (
          <p className="rds-callout rds-callout-warn" data-passed-help>
            {t("daily.passedHelp")}
          </p>
        )}
        <p className="rds-callout" data-daily-scope>
          {t("daily.sheetHelp")}
        </p>

        {/* The reset React 19 runs once an action settles is declined, for the same reason as in the master
          drawers: an answer that keeps the sheet on screen must keep showing what was written. */}
        <form
          action={action}
          className="rds-form"
          data-daily-form
          onReset={(event) => event.preventDefault()}>
          <input type="hidden" name="classId" value={sheet.classId} />
          <input type="hidden" name="shift" value={sheet.shift} />
          <input type="hidden" name="date" value={sheet.date} />
          {/* The whole day travels as one value: the drawers above edit this draft, not the database. */}
          <input
            type="hidden"
            name="periods"
            data-daily-periods
            value={JSON.stringify(postedPeriods)}
          />

          <fieldset className="rds-status" data-daily-status>
            <legend>{t("daily.statusLabel")}</legend>
            <div className="rds-status-row">
              <label className="rds-radio">
                <input
                  type="radio"
                  name="status"
                  value="normal"
                  data-status-normal
                  checked={status === "normal"}
                  onChange={() => setStatus("normal")}
                />
                {t("daily.statusNormal")}
              </label>
              <label className="rds-radio">
                <input
                  type="radio"
                  name="status"
                  value="adjusted"
                  data-status-adjusted
                  checked={status === "adjusted"}
                  onChange={() => setStatus("adjusted")}
                />
                {t("daily.statusAdjusted")}
              </label>
              <label className="rds-radio">
                <input
                  type="radio"
                  name="status"
                  value="holiday"
                  data-status-holiday
                  checked={status === "holiday"}
                  onChange={() => setStatus("holiday")}
                />
                {t("daily.statusHoliday")}
              </label>
            </div>
          </fieldset>

          {status === "holiday" && (
            <p className="rds-banner rds-banner-holiday" data-holiday-banner>
              {t("daily.holidayBanner")}
            </p>
          )}
          {status === "adjusted" && (
            <p className="rds-banner rds-banner-adjusted" data-adjusted-banner>
              {t("daily.adjustedBanner")}
            </p>
          )}
          {sheet.dayType === "exam" && (
            <p className="rds-banner rds-banner-exam" data-exam-banner>
              {t("daily.examBanner")}
            </p>
          )}

          {/* The weekly exam's own two choices belong to the date, not the week: which subject is
              examined, and whether the day's classes run beside it. */}
          {sheet.dayType === "exam" && status !== "holiday" && (
            <fieldset className="rds-status" data-daily-exam>
              <legend>{t("daily.examLabel")}</legend>
              {/* A visible list first, because "which exam?" is answered by picking the subject the
                  class already runs — the two boxes below stay for a subject nobody has written yet. */}
              {props.examSubjects.length > 0 && (
                <label className="rds-field">
                  {t("daily.examSubjectPick")}
                  <select
                    className="admin-select"
                    data-exam-subject-pick
                    value=""
                    onChange={(event) => {
                      const picked = props.examSubjects.find(
                        (subject) => subject.bn === event.target.value,
                      );
                      if (!picked) return;
                      setExamSubjectBn(picked.bn);
                      setExamSubjectEn(picked.en);
                    }}>
                    <option value="">{t("daily.examSubjectChoose")}</option>
                    {props.examSubjects.map((subject) => (
                      <option key={`pick-${subject.bn}`} value={subject.bn}>
                        {subject.en ? `${subject.bn} · ${subject.en}` : subject.bn}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="rds-fields">
                <div className="rds-col">
                  <label className="rds-field">
                    {t("daily.examSubjectBn")}
                    <input
                      name="examSubjectBn"
                      maxLength={200}
                      list="routine-exam-subjects-bn"
                      data-exam-subject-bn
                      value={examSubjectBn}
                      onChange={(event) =>
                        setExamSubjectBn(event.target.value)
                      }
                    />
                    <datalist id="routine-exam-subjects-bn">
                      {props.examSubjects.map((subject) => (
                        <option key={`bn-${subject.bn}`} value={subject.bn} />
                      ))}
                    </datalist>
                  </label>
                </div>
                <div className="rds-col">
                  <label className="rds-field">
                    {t("daily.examSubjectEn")}
                    <input
                      name="examSubjectEn"
                      maxLength={200}
                      list="routine-exam-subjects-en"
                      data-exam-subject-en
                      value={examSubjectEn}
                      onChange={(event) =>
                        setExamSubjectEn(event.target.value)
                      }
                    />
                    <datalist id="routine-exam-subjects-en">
                      {props.examSubjects
                        .filter((subject) => subject.en)
                        .map((subject) => (
                          <option
                            key={`en-${subject.en}`}
                            value={subject.en}
                          />
                        ))}
                    </datalist>
                  </label>
                </div>
              </div>
              <small className="rds-hint">{t("daily.examSubjectHelp")}</small>
              <div
                className="rds-status-row"
                role="radiogroup"
                aria-label={t("daily.examModeLabel")}>
                <label className="rds-radio">
                  <input
                    type="radio"
                    name="examMode"
                    value="both"
                    data-exam-mode-both
                    checked={examMode === "both"}
                    onChange={() => pickExamMode("both")}
                  />
                  {t("daily.examModeBoth")}
                </label>
                <label className="rds-radio">
                  <input
                    type="radio"
                    name="examMode"
                    value="exam"
                    data-exam-mode-exam
                    checked={examMode === "exam"}
                    onChange={() => setExamMode("exam")}
                  />
                  {t("daily.examModeExam")}
                </label>
              </div>
              <small className="rds-hint">{t("daily.examModeHelp")}</small>
            </fieldset>
          )}

          {examOnly && (
            <p className="rds-banner rds-banner-exam" data-exam-only-banner>
              {t("daily.examOnlyBanner")}
            </p>
          )}
          {offNoAdd && props.canEdit && (
            <p className="rds-hint" data-weekoff-no-add>
              {t("daily.weekOffNoAdd")}
            </p>
          )}

          <div className="rds-fields">
            <div className="rds-col">
              <label className="rds-field">
                {t("daily.holidayReason")}
                <input
                  name="holidayReason"
                  maxLength={300}
                  data-holiday-reason
                  value={holidayReason}
                  onChange={(event) => setHolidayReason(event.target.value)}
                />
              </label>
              <small className="rds-hint">{t("daily.holidayReasonHelp")}</small>
            </div>
            <div className="rds-col">
              <label className="rds-field">
                {t("daily.notes")}
                <textarea
                  name="notes"
                  maxLength={1000}
                  data-daily-notes
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            </div>
          </div>

          {!examOnly && (
            <div className="rds-sheet">
              {draft.length === 0 ? (
              <p className="rds-empty" data-daily-empty>
                {t("daily.noSheet")}
              </p>
            ) : (
              <ul className="rds-periods">
                {draft.map((period, index) => {
                  const key = period.id || `new-${index}`;
                  const teacherName = props.teachers.find(
                    (teacher) => teacher.id === period.teacher,
                  )?.name;
                  const fromMaster = !!period.masterPeriod;
                  return (
                    <li
                      key={key}
                      data-daily-period={key}
                      className={`rds-period ${fromMaster ? "rds-period-master" : "rds-period-own"}`}>
                      <span className="rds-when" data-daily-period-time>
                        {rangeWord(period.start, period.end, digits)}
                      </span>
                      <span className="rds-what">
                        <strong
                          className="rds-subject"
                          data-daily-period-subject>
                          {period.subjectBn}
                        </strong>
                        <span className="rds-line">
                          <span
                            className={
                              teacherName
                                ? "rds-teacher"
                                : "rds-teacher rds-none"
                            }
                            data-daily-period-teacher>
                            {teacherName || t("master.noTeacher")}
                          </span>
                          {period.room ? (
                            <span className="rds-room" data-daily-period-room>
                              {t("master.roomWord", { room: period.room })}
                            </span>
                          ) : (
                            <span
                              className="rds-none"
                              data-daily-period-room-none>
                              {t("daily.noRoom")}
                            </span>
                          )}
                          <span
                            className={`rds-chip rds-chip-sm ${fromMaster ? "rds-chip-master" : "rds-chip-own"}`}
                            data-daily-period-source={period.source}>
                            {fromMaster
                              ? t("daily.fromMaster")
                              : t("daily.ownPeriod")}
                          </span>
                        </span>
                      </span>
                      <span className="rds-p-actions">
                        {props.canEdit && (
                          <button
                            type="button"
                            className="rds-btn rds-btn-ghost rds-btn-sm"
                            data-daily-period-edit={key}
                            onClick={() => setEditor({ index, period })}>
                            {t("common.edit")}
                          </button>
                        )}
                        <details
                          className="rds-more"
                          data-daily-period-more={key}>
                          <summary
                            className="rds-btn rds-btn-ghost rds-btn-sm"
                            aria-label={t("common.more")}>
                            {t("common.more")}
                          </summary>
                          <div className="rds-more-body">
                            {props.canEdit && (
                              <button
                                type="button"
                                className="rds-btn rds-btn-ghost rds-btn-sm rds-btn-danger"
                                data-daily-period-leave={key}
                                onClick={() => leaveOut(index)}>
                                {t("daily.leaveOut")}
                              </button>
                            )}
                            <small className="rds-hint">
                              {t("daily.leaveOutHelp")}
                            </small>
                          </div>
                        </details>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* The chain is offered whether or not the date has anything on it yet: the next period of an
              empty sheet is its first one, and an operator building a day from nothing should not have to
              find a different button for the first period than for the second. */}
            {props.canEdit && !offNoAdd && (
              <div className="rds-add">
                <button
                  type="button"
                  className="rds-btn rds-btn-primary"
                  data-daily-add-next
                  title={t("daily.addNext")}
                  onClick={addNextPeriod}>
                  + {t("daily.addNext")}
                </button>
                <small className="rds-hint" data-daily-next-help>
                  {t("daily.nextHelp")}
                </small>
              </div>
            )}
            </div>
          )}

          {state.status === "clash" && (
            <div className="rds-warn" role="alert" data-clash-warning>
              <strong>{t("clashes.banner")}</strong>
              <p className="rds-help">{t("clashes.bannerHelp")}</p>
              <ul>
                {(state.clashes || []).map((clash, index) => (
                  <li
                    key={`${clash.kind}${clash.otherStart}${index}`}
                    data-clash-line={clash.kind}>
                    {sentence(clash)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(state.status === "invalid" ||
            state.status === "error" ||
            state.status === "missing") && (
            <p role="alert" className="rds-error" data-daily-refused>
              {state.status === "invalid"
                ? t("period.invalid")
                : state.status === "missing"
                  ? t("common.missing")
                  : t("common.failed")}
            </p>
          )}
          {dirty && (
            <p className="rds-dirty" role="status" data-daily-dirty>
              {t("daily.unsaved")}
            </p>
          )}

          <div className="rds-actions">
            {props.canEdit && (
              <SubmitButton
                pending={pending}
                data-daily-save
                busyLabel={t("period.saving")}
                label={t("daily.save")}
              />
            )}
            {props.canEdit && state.status === "clash" && (
              <SubmitButton
                pending={pending}
                name="force"
                value="on"
                className="rds-save-anyway"
                data-save-anyway
                busyLabel={t("period.saving")}
                label={t("daily.saveAnyway")}
              />
            )}
            {props.canEdit && !offNoAdd && !examOnly && (
              <button
                type="button"
                className="rds-btn rds-btn-ghost"
                data-daily-add-period
                onClick={addPeriod}>
                + {t("daily.addPeriod")}
              </button>
            )}
          </div>
        </form>

        <div className="rds-foot">
          {props.canEdit && (
            <form
              action={resetAction}
              className="rds-reset"
              data-daily-reset-form
              onReset={(event) => event.preventDefault()}>
              <input type="hidden" name="classId" value={sheet.classId} />
              <input type="hidden" name="shift" value={sheet.shift} />
              <input type="hidden" name="date" value={sheet.date} />
              <button
                type="submit"
                className="rds-btn rds-btn-ghost rds-btn-sm"
                disabled={sheet.stored === false}
                data-daily-reset>
                {t("daily.reset")}
              </button>
              <small className="rds-hint">{t("daily.resetHelp")}</small>
            </form>
          )}
          {sheet.stored && sheet.docId && (
            <RowControls
              kind="dailyRoutine"
              id={sheet.docId}
              name={`${sheet.className} · ${sheet.date}`}
              canDelete={props.canDelete}
              canArchive={false}
              onDone={() => router.refresh()}
            />
          )}
          <p className="rds-signature" data-daily-signature>
            {t("daily.periodCount", {
              count: formatNumber(sheet.periods.length, digits),
            })}
          </p>
        </div>
      </div>

      <div
        key={
          editor
            ? `${editor.index}:${editor.period.id || `new:${editor.period.start}`}`
            : "closed"
        }>
        <DailyPeriodDrawer
          target={editor}
          onClose={() => setEditor(null)}
          onSave={savePeriod}
          props={props}
          onDuration={(minutes) => {
            if (minutes) setChainMinutes(minutes);
          }}
        />
      </div>
      {/* Keyed on open and shut only. A restore answers, Next re-reads the page, the day's memory is one
        entry longer — and a key that counted those entries threw the drawer away at that exact moment,
        taking the "restored" the operator had just earned with it and never calling the callback that
        puts the day back on the form. The list is a prop; it does not need a new component to change. */}
      <div key={historyOpen ? "history:open" : "history:closed"}>
        <RoutineHistory
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          kind="daily"
          docId={sheet.docId || ""}
          entries={sheet.history}
          weekdays={props.weekdays}
          digits={digits}
          canEdit={props.canEdit}
          onDone={() => router.refresh()}
        />
      </div>
    </>
  );
}
