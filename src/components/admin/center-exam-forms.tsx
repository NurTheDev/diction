"use client";
/**
 * R5 · Exams — the forms that shape an exam and publish it.
 *
 * One form body serves both create and edit, so an exam cannot be created with a field the edit form
 * does not have (the two drifting apart is how a centre ends up with exams it cannot correct). Three
 * details are load-bearing:
 *
 *   • **A request id makes the create replayable.** It is minted in the browser and posted with the
 *     shape; a double submit returns the same exam instead of a second one.
 *   • **The scale is a choice, not a textarea.** The owner picks a saved scale — the centre's one idea of
 *     what an A+ is worth — or types a one-off `min:label:point` list for this exam alone. The bands are
 *     snapshotted onto the exam either way, so a scale edited in December cannot rewrite a March result.
 *   • **Every word is a catalog key.** The type options used to be hardcoded English in a Bangla screen;
 *     they now come from `exams.typeLabels.*` like everything else on the page.
 */
import {
  createExamAction,
  publishExamAction,
  saveGradingScaleAction,
  unpublishExamAction,
  updateExamAction,
} from "@/actions/center-exams";
import { formatNumber, type Digits } from "@/lib/admin/format";
import type { ExamState } from "@/lib/exams/exam-state";
import {
  DEFAULT_GRADING_RANGES,
  EXAM_TYPES,
  MAX_EXAM_SUBJECTS,
  type GradeRange,
} from "@/lib/exams/vocab";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { BanglaDate } from "./bangla-date";
import { showRecycleToast } from "./recycle-toast-host";
import { SubmitButton } from "./submit-button";

const initial: ExamState = { status: "idle" };

/**
 * O1 · every write on the exam screens answers in the corner as well as in place.
 *
 * Each of these forms already paints its own sentence — "created", "saved", "published", and the reason
 * a write was refused — but a sentence under a button is easy to miss when the page has just re-read
 * itself, and a refusal that only re-renders a form leaves the operator guessing. So the same answer is
 * raised as the admin shell's own toast: success on the left of the screen's own vocabulary, failure in
 * red, both in the language being read.
 *
 * It is keyed on the state object rather than on the status string, because a second write answers `ok`
 * again and a string that does not change would never re-run anything: the toast from the first save
 * would be the last word the operator ever read.
 */
function useWriteToast(
  state: ExamState,
  ok: () => string,
  fail: () => string,
): void {
  useEffect(() => {
    if (state.status === "idle") return;
    showRecycleToast(
      state.status === "ok"
        ? { state: { status: "ok" }, success: ok(), error: "" }
        : { state: { status: "error" }, success: "", error: fail() },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

/** A refusal painted in the reader's language: the action sends a catalog key and its params. */
export function ExamError({ state }: { state: ExamState }) {
  const t = useTranslations("exams");
  if (state.status !== "error" || !state.messageKey) return null;
  return (
    <p role="alert" className="exf-msg exf-msg-err" data-exam-error>
      {t("form.notSavedPrefix")}{" "}
      {t(state.messageKey, state.messageParams || {})}
    </p>
  );
}

export interface ClassOption {
  id: string;
  name: string;
}
export interface ScaleOption {
  id: string;
  name: string;
  ranges: GradeRange[];
  active: boolean;
}
export interface ExamShapeValue {
  id?: string;
  name: string;
  type: string;
  date: string;
  scaleName: string;
  classIds: string[];
  subjects: {
    name: string;
    full: number;
    pass: number;
    parts?: { name: string; marks: number }[];
  }[];
  bands: { min: number; label: string; point: number }[];
}

/** The scale a saved exam used, as ranges the form can show; an exam with no scale name is the default. */
function rangesOf(
  bands: { min: number; label: string; point: number }[],
): GradeRange[] {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.map((band, index) => ({
    min: band.min,
    max: index === 0 ? 100 : sorted[index - 1].min - 1,
    grade: band.label,
    point: band.point,
  }));
}

const CUSTOM = "custom";

/** A component row's marks, in Latin digits whatever keyboard typed them, so the total can add up. */
function partSum(rows: { name: string; marks: string }[]): number {
  return rows.reduce((sum, row) => {
    const marks = Number(
      row.marks
        .replace(/[\u09e6-\u09ef]/g, (c) => String(c.charCodeAt(0) - 0x09e6))
        .trim(),
    );
    return sum + (Number.isFinite(marks) && marks >= 0 ? Math.round(marks) : 0);
  }, 0);
}

/**
 * The exam's shape: name, type, date, the classes it covers, its subjects and the scale it grades by.
 *
 * `mode` decides which action it posts to and which button it shows; everything else is the same form,
 * because the two must never disagree about what an exam is made of.
 */
export function ExamShapeForm({
  mode,
  groups,
  scales,
  value,
  digits,
}: {
  mode: "create" | "edit";
  groups: ClassOption[];
  scales: ScaleOption[];
  value: ExamShapeValue;
  digits: Digits;
}) {
  const t = useTranslations("exams");
  const action = mode === "create" ? createExamAction : updateExamAction;
  const [state, submit, pending] = useActionState(action, initial);
  const [requestId, setRequestId] = useState("");
  const [subjectCount, setSubjectCount] = useState(
    Math.max(1, value.subjects.length),
  );
  /* Group 3: a subject's components, as typed rows. They live in client state so the total can add
     itself up while the creator types, and they travel as positional form fields like the subjects. */
  const [parts, setParts] = useState<
    Record<number, { name: string; marks: string }[]>
  >(() =>
    Object.fromEntries(
      value.subjects.map((subject, index) => [
        index,
        (subject.parts || []).map((part) => ({
          name: part.name,
          marks: String(part.marks),
        })),
      ]),
    ),
  );
  const partRows = (index: number) => parts[index] || [];
  const setPart = (
    index: number,
    slot: number,
    next: { name?: string; marks?: string },
  ) =>
    setParts((old) => {
      const list = [...(old[index] || [])];
      list[slot] = { ...list[slot], ...next };
      return { ...old, [index]: list };
    });
  const addPart = (index: number) =>
    setParts((old) => ({
      ...old,
      [index]: [...(old[index] || []), { name: "", marks: "" }],
    }));
  const dropPart = (index: number, slot: number) =>
    setParts((old) => ({
      ...old,
      [index]: (old[index] || []).filter((_, i) => i !== slot),
    }));
  const savedScale = scales.find((scale) => scale.name === value.scaleName);
  const [scaleChoice, setScaleChoice] = useState(
    savedScale ? savedScale.id : value.bands.length ? CUSTOM : "",
  );
  const [classIds, setClassIds] = useState<string[]>(value.classIds);
  useEffect(() => {
    if (mode === "create") setRequestId(crypto.randomUUID());
  }, [mode]);
  const common = useTranslations("common");
  useWriteToast(
    state,
    () => (mode === "create" ? t("form.created") : t("form.saved")),
    () => common("saveFailed"),
  );
  const typed = scaleChoice === CUSTOM;
  const bandsText = typed
    ? (value.bands.length
        ? value.bands
        : DEFAULT_GRADING_RANGES.map((range) => ({
            min: range.min,
            label: range.grade,
            point: range.point,
          }))
      )
        .map((band) => `${band.min}:${band.label}:${band.point}`)
        .join("\n")
    : "";
  const preview =
    scales.find((scale) => scale.id === scaleChoice)?.ranges ||
    DEFAULT_GRADING_RANGES;
  const ready = (mode === "edit" || !!requestId) && classIds.length > 0;

  return (
    <form action={submit} className="exf" data-exam-form={mode}>
      {mode === "edit" && value.id && (
        <input type="hidden" name="exam" value={value.id} />
      )}
      {mode === "create" && (
        <input name="requestId" type="hidden" value={requestId} />
      )}

      {/* Basics */}
      <section className="exf-card">
        <div className="exf-grid">
          <label className="exf-field exf-span2">
            <span className="exf-label">{t("form.nameLabel")}</span>
            <input
              name="name"
              maxLength={120}
              required
              defaultValue={value.name}
            />
          </label>
          <label className="exf-field">
            <span className="exf-label">{t("form.dateLabel")}</span>
            <BanglaDate name="date" required defaultValue={value.date} />
          </label>
          <label className="exf-field">
            <span className="exf-label">{t("form.typeLabel")}</span>
            <select name="type" defaultValue={value.type || "monthly"}>
              {EXAM_TYPES.map((type) => (
                <option value={type} key={type}>
                  {t(`typeLabels.${type}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Classes */}
      <fieldset className="exf-card" data-exam-classes>
        <legend className="exf-legend">{t("form.classLabel")}</legend>
        <p className="exf-help">{t("form.classHelp")}</p>
        <div className="exf-chips">
          {groups.map((group) => (
            <label className="exf-chip" key={group.id}>
              <input
                type="checkbox"
                name="classId"
                value={group.id}
                checked={classIds.includes(group.id)}
                onChange={(event) =>
                  setClassIds((list) =>
                    event.target.checked
                      ? [...list, group.id]
                      : list.filter((id) => id !== group.id),
                  )
                }
              />
              <span>{group.name}</span>
            </label>
          ))}
        </div>
        {!groups.length && (
          <p className="exf-msg exf-msg-err">{t("form.noClasses")}</p>
        )}
      </fieldset>

      {/* Subjects */}
      <fieldset className="exf-card">
        <legend className="exf-legend">{t("form.subjectsLegend")}</legend>
        {Array.from({ length: subjectCount }, (_, index) => (
          <div className="exf-subject" key={index}>
            <div className="exf-grid3">
              <label className="exf-field">
                <span className="exf-label">
                  {t("form.subjectLabel")} {formatNumber(index + 1, digits)}
                </span>
                <input
                  name={`subject-${index}`}
                  required
                  maxLength={100}
                  defaultValue={value.subjects[index]?.name || ""}
                />
              </label>
              {partRows(index).length > 0 ? (
                /* With components, the total is their sum and says so: a read-only field that adds itself up
                   in front of the creator, rather than a second number they have to keep agreeing with. */
                <label className="exf-field">
                  <span className="exf-label">{t("form.fullLabel")}</span>
                  <input
                    name={`full-${index}`}
                    inputMode="numeric"
                    required
                    readOnly
                    value={formatNumber(partSum(partRows(index)), digits)}
                    data-part-total={index}
                  />
                </label>
              ) : (
                <label className="exf-field">
                  <span className="exf-label">{t("form.fullLabel")}</span>
                  <input
                    name={`full-${index}`}
                    inputMode="numeric"
                    required
                    defaultValue={value.subjects[index]?.full ?? ""}
                  />
                </label>
              )}
              <label className="exf-field">
                <span className="exf-label">{t("form.passLabel")}</span>
                <input
                  name={`pass-${index}`}
                  inputMode="numeric"
                  required
                  defaultValue={value.subjects[index]?.pass ?? ""}
                />
              </label>
            </div>

            <div className="exf-parts" data-exam-parts={index}>
              <p className="exf-help">{t("form.partsHelp")}</p>
              {partRows(index).map((part, slot) => (
                <div
                  className="exf-part"
                  key={slot}
                  data-part-row={`${index}-${slot}`}>
                  <label className="exf-field">
                    <span className="exf-label">{t("form.partName")}</span>
                    <input
                      name={`part-${index}-${slot}-name`}
                      maxLength={100}
                      value={part.name}
                      onChange={(event) =>
                        setPart(index, slot, { name: event.target.value })
                      }
                    />
                  </label>
                  <label className="exf-field">
                    <span className="exf-label">{t("form.partMarks")}</span>
                    <input
                      inputMode="numeric"
                      name={`part-${index}-${slot}-marks`}
                      value={part.marks}
                      onChange={(event) =>
                        setPart(index, slot, { marks: event.target.value })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="exf-mini exf-mini-danger"
                    onClick={() => dropPart(index, slot)}>
                    {t("form.partRemove")}
                  </button>
                </div>
              ))}
              <div className="exf-row">
                <button
                  type="button"
                  className="exf-mini exf-mini-add"
                  data-part-add={index}
                  disabled={partRows(index).length >= 8}
                  onClick={() => addPart(index)}>
                  {t("form.addPart")}
                </button>
              </div>
            </div>
          </div>
        ))}

        <div className="exf-row">
          <button
            type="button"
            className="exf-mini exf-mini-add"
            disabled={subjectCount >= MAX_EXAM_SUBJECTS}
            onClick={() => setSubjectCount((count) => count + 1)}>
            {t("form.addSubject")}
          </button>
          {subjectCount > 1 && (
            <button
              type="button"
              className="exf-mini exf-mini-danger"
              onClick={() => setSubjectCount((count) => count - 1)}>
              {t("form.removeLast")}
            </button>
          )}
        </div>
        {mode === "edit" && (
          <p className="exf-help">{t("form.subjectsLockedHelp")}</p>
        )}
      </fieldset>

      {/* Scale */}
      <section className="exf-card">
        <label className="exf-field">
          <span className="exf-label">{t("form.scaleLabel")}</span>
          <select
            name="scaleId"
            value={scaleChoice}
            onChange={(event) => setScaleChoice(event.target.value)}
            data-exam-scale>
            <option value="">{t("form.scaleDefault")}</option>
            {scales.map((scale) => (
              <option value={scale.id} key={scale.id}>
                {scale.name}
                {scale.active ? ` · ${t("form.scaleActive")}` : ""}
              </option>
            ))}
            <option value={CUSTOM}>{t("form.scaleCustom")}</option>
          </select>
        </label>

        {!typed && (
          <div className="exf-scroll">
            <table className="exf-table" data-scale-preview>
              <caption>{t("form.scalePreview")}</caption>
              <thead>
                <tr>
                  <th>{t("scale.col.grade")}</th>
                  <th>{t("scale.col.from")}</th>
                  <th>{t("scale.col.to")}</th>
                  <th>{t("scale.col.point")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((range) => (
                  <tr key={range.grade}>
                    <td>{range.grade}</td>
                    <td>{formatNumber(range.min, digits)}</td>
                    <td>{formatNumber(range.max, digits)}</td>
                    <td>{formatNumber(range.point, digits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {typed && (
          <>
            <label className="exf-field">
              <span className="exf-label">{t("form.bandsLabel")}</span>
              <textarea
                name="bands"
                rows={8}
                required
                defaultValue={bandsText}
              />
            </label>
            <p className="exf-help">{t("form.bandsHelp")}</p>
            <label className="exf-field">
              <span className="exf-label">{t("form.scaleNameLabel")}</span>
              <input
                name="scaleName"
                maxLength={80}
                defaultValue={
                  value.scaleName === "default" ? "" : value.scaleName
                }
              />
            </label>
          </>
        )}
      </section>

      <label className="exf-confirm">
        <input name="confirm" type="checkbox" value="YES" required />
        <span>{t("form.confirmReview")}</span>
      </label>

      <div className="exf-actions">
        <SubmitButton
          pending={pending || state.status === "ok"}
          disabled={!ready}
          data-exam-submit
          busyLabel={t("grid.saving")}
          label={
            mode === "create" ? t("form.createButton") : t("form.saveButton")
          }
        />
        {state.status === "ok" && (
          <p role="status" className="exf-msg exf-msg-ok" data-exam-saved>
            {mode === "create" ? t("form.created") : t("form.saved")}
          </p>
        )}
        <ExamError state={state} />
      </div>
    </form>
  );
}

/** What the publish prompt is allowed to know about the result SMS: a count and how the box starts. It is
    computed on the server by `src/lib/center/exam-result-audience.ts` and passed down as plain data, so
    this client component reads no ledger, no settings document and no provider. */
export interface PublishSmsPrompt {
  messages: number;
  students: number;
  classes: number;
  possible: boolean;
  reason: string | null;
  defaultOn: boolean;
}

/**
 * Publish, and the way back: unpublish.
 *
 * Publishing **asks first**. The spec's "Send result SMS now?" is a question with a moment to be asked in,
 * and that moment is the click: a modal carrying the review checkbox, the SMS checkbox and the number of
 * messages that would go out, counted the same way the send counts them. The setting is not the decision —
 * `autoResult` only says how the checkbox starts, so an unticked box publishes and sends nothing, and a
 * ticked one sends even when the setting is off, because the person holding the mouse just said so. The
 * count is part of the question for the same reason a price is: 212 messages and 4 messages are not the
 * same decision.
 *
 * Unpublishing asks nothing new and keeps the confirmation it has always had.
 */
export function PublishCenterExam({
  exam,
  published,
  sms,
  digits,
}: {
  exam: string;
  published: boolean;
  sms?: PublishSmsPrompt;
  digits: Digits;
}) {
  const t = useTranslations("exams");
  const [state, submit, pending] = useActionState(publishExamAction, initial);
  const [backState, backSubmit, backPending] = useActionState(
    unpublishExamAction,
    initial,
  );
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [send, setSend] = useState(!!sms?.defaultOn);
  /* The answer has to outlive the branch it was given in: a successful publish swaps this component into
     its unpublish form, and an operator who has just consented to a class's worth of messages is exactly
     the person who must still be told whether they went. It is cleared when they take the publish back. */
  const [note, setNote] = useState<"sent" | "skipped" | null>(null);
  /* Two effects, each keyed on its own action's state object rather than on its status string: a second
     publish answers 'ok' again, and a string that does not change would not re-run anything, so the note
     from the first publish would be the last word the operator ever read. */
  useEffect(() => {
    if (state.status === "ok") setNote(send ? "sent" : "skipped");
  }, [state, send]);
  useEffect(() => {
    if (backState.status === "ok") setNote(null);
  }, [backState]);
  const outcome = note ? (
    <p role="status" className="exf-msg exf-msg-ok" data-publish-status>
      {note === "sent" ? t("publish.smsSent") : t("publish.smsSkipped")}
    </p>
  ) : null;
  // The question closes when it has an answer, whichever way it went: an error has to be readable.
  useEffect(() => {
    if (state.status !== "idle" && dialog.current?.open) dialog.current.close();
  }, [state.status]);
  const common = useTranslations("common");
  useWriteToast(
    state,
    () => t("publish.published"),
    () => common("saveFailed"),
  );
  useWriteToast(
    backState,
    () => t("publish.unpublished"),
    () => common("saveFailed"),
  );
  const open = (): void => {
    dialog.current?.showModal();
  };

  if (published)
    return (
      <form
        action={backSubmit}
        className="exf exf-publish"
        data-exam-publish="unpublish">
        <input type="hidden" name="exam" value={exam} />
        <p className="exf-note">{t("publish.unpublishNote")}</p>
        <label className="exf-confirm">
          <input type="checkbox" name="confirm" value="YES" required />
          <span>{t("publish.unpublishConfirm")}</span>
        </label>
        <div className="exf-actions">
          <SubmitButton
            pending={backPending}
            busyLabel={t("grid.saving")}
            label={t("publish.unpublishButton")}
          />
        </div>
        {outcome}
        {backState.status === "ok" && (
          <p role="status" className="exf-msg exf-msg-ok">
            {t("publish.unpublished")}
          </p>
        )}
        <ExamError state={backState} />
      </form>
    );

  const count = sms?.messages ?? 0;
  return (
    <div className="exf exf-publish" data-exam-publish="publish">
      <p className="exf-note">{t("publish.note")}</p>
      <div className="exf-actions">
        <button
          type="button"
          className="exf-btn"
          data-publish-open
          onClick={open}
          disabled={pending}>
          {t("publish.openButton")}
        </button>
      </div>
      {outcome}
      <ExamError state={state} />
      <dialog ref={dialog} className="exf-dialog" data-publish-dialog>
        <form action={submit} className="exf-dialog-form" data-publish-form>
          <input type="hidden" name="exam" value={exam} />
          <h2>{t("publish.dialogTitle")}</h2>
          <label className="exf-confirm">
            <input
              type="checkbox"
              name="confirm"
              value="YES"
              required
              data-publish-confirm
            />
            <span>{t("publish.confirmReview")}</span>
          </label>
          <label className="exf-confirm">
            <input
              type="checkbox"
              name="sendResults"
              value="on"
              checked={send}
              data-publish-sms
              onChange={(event) => setSend(event.target.checked)}
            />
            <span>{t("publish.smsQuestion")}</span>
          </label>
          <p className="exf-help" data-publish-count>
            {count
              ? t("publish.smsCount", { count: formatNumber(count, digits) })
              : t("publish.smsCountNone")}
            {count > 0 && sms
              ? ` · ${t("publish.audienceNote", { count: formatNumber(count, digits), students: formatNumber(sms.students, digits), classes: formatNumber(sms.classes, digits) })}`
              : ""}
          </p>
          <p className="exf-help">{t("publish.smsHelp")}</p>
          {sms && !sms.possible && (
            <p className="exf-help" data-publish-blocked>
              {sms.reason === "NO_TEMPLATE"
                ? t("publish.smsCountNone")
                : t("errors.smsUnavailable")}
            </p>
          )}
          <p className="exf-help">{t("publish.smsDefault")}</p>
          <div className="exf-dialog-actions">
            <button
              type="button"
              className="exf-mini"
              data-publish-cancel
              onClick={() => dialog.current?.close()}>
              {t("publish.cancel")}
            </button>
            <SubmitButton
              pending={pending}
              data-publish-submit
              busyLabel={t("grid.saving")}
              label={t("publish.button")}
            />
          </div>
        </form>
      </dialog>
    </div>
  );
}

/**
 * The grading-scale editor: the ranges the centre grades by, with the GPA point each one carries.
 *
 * A scale is saved whole — ranges are posted as one JSON list — because a scale edited range by range is
 * a scale that is broken between the clicks, and an exam created in that moment would snapshot the
 * broken one.
 */
export function GradingScaleForm({
  scale,
  scales,
}: {
  scale: {
    id: string;
    name: string;
    ranges: GradeRange[];
    active: boolean;
  } | null;
  scales: ScaleOption[];
}) {
  const t = useTranslations("exams");
  const [state, submit, pending] = useActionState(
    saveGradingScaleAction,
    initial,
  );
  const [name, setName] = useState(scale?.name || "");
  const [ranges, setRanges] = useState<GradeRange[]>(
    scale?.ranges?.length ? scale.ranges : DEFAULT_GRADING_RANGES,
  );
  const [active, setActive] = useState(scale?.active ?? false);
  const common = useTranslations("common");
  useWriteToast(
    state,
    () => t("scale.saved"),
    () => common("saveFailed"),
  );
  const set = (index: number, patch: Partial<GradeRange>): void =>
    setRanges((list) =>
      list.map((range, at) => (at === index ? { ...range, ...patch } : range)),
    );

  return (
    <form action={submit} className="gsf" data-scale-form>
      {scale?.id && <input type="hidden" name="scale" value={scale.id} />}
      <input type="hidden" name="ranges" value={JSON.stringify(ranges)} />
      <input type="hidden" name="active" value={active ? "YES" : "NO"} />

      <label className="gsf-field">
        <span className="gsf-label">{t("scale.nameLabel")}</span>
        <input
          className="gsf-input"
          name="name"
          maxLength={100}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <div className="gsf-box">
        <table className="gsf-table">
          <caption>{t("scale.rangesHeading")}</caption>
          <thead>
            <tr>
              <th>{t("scale.col.grade")}</th>
              <th>{t("scale.col.point")}</th>
              <th>{t("scale.col.from")}</th>
              <th>{t("scale.col.to")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ranges.map((range, index) => (
              <tr key={`${range.grade}-${index}`}>
                <td>
                  <input
                    className="gsf-cell"
                    value={range.grade}
                    maxLength={30}
                    aria-label={t("scale.col.grade")}
                    onChange={(event) =>
                      set(index, { grade: event.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    className="gsf-cell"
                    inputMode="decimal"
                    value={range.point}
                    aria-label={t("scale.col.point")}
                    onChange={(event) =>
                      set(index, { point: Number(event.target.value) || 0 })
                    }
                  />
                </td>
                <td>
                  <input
                    className="gsf-cell"
                    inputMode="numeric"
                    value={range.min}
                    aria-label={t("scale.col.from")}
                    onChange={(event) =>
                      set(index, { min: Number(event.target.value) || 0 })
                    }
                  />
                </td>
                <td>
                  <input
                    className="gsf-cell"
                    inputMode="numeric"
                    value={range.max}
                    aria-label={t("scale.col.to")}
                    onChange={(event) =>
                      set(index, { max: Number(event.target.value) || 0 })
                    }
                  />
                </td>
                <td>
                  {ranges.length > 2 && (
                    <button
                      type="button"
                      className="gsf-remove"
                      data-scale-remove={index}
                      onClick={() =>
                        setRanges((list) =>
                          list.filter((_, at) => at !== index),
                        )
                      }>
                      {t("scale.remove")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="gsf-add"
        disabled={ranges.length >= 12}
        data-scale-add
        onClick={() =>
          setRanges((list) => [
            ...list,
            { min: 0, max: 0, grade: "", point: 0 },
          ])
        }>
        {t("scale.add")}
      </button>

      <label className="gsf-toggle">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        <span>{t("scale.activeLabel")}</span>
      </label>

      <p className="gsf-help">{t("scale.help")}</p>
      {scales.length > 1 && (
        <p className="gsf-help gsf-help-plain">{t("scale.others")}</p>
      )}

      <div className="gsf-actions">
        <SubmitButton
          pending={pending}
          disabled={!name}
          data-scale-save
          busyLabel={t("grid.saving")}
          label={t("scale.save")}
        />
        {state.status === "ok" && (
          <p role="status" className="exf-msg exf-msg-ok" data-scale-saved>
            {t("scale.saved")}
          </p>
        )}
        <ExamError state={state} />
      </div>
    </form>
  );
}
