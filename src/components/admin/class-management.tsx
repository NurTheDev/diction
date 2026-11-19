"use client";
import {
  assignClassBatchesAction,
  saveClassGroupAction,
  type ClassActionState,
} from "@/actions/class-admin";
import { Link } from "@/i18n/navigation";
import { formatNumber, type Digits } from "@/lib/admin/format";
import {
  feeStateOf,
  shiftWordsOf,
  type BatchOption,
  type ClassCardView,
} from "@/lib/classes/class-shared";
import {
  CalendarClock,
  CalendarDays,
  Clock,
  DoorOpen,
  GraduationCap,
  Layers,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  School,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { SubmitButton } from "./submit-button";
import { showRecycleToast } from "./toast-bus";

import "@/class-management.css";

const idle: ClassActionState = { status: "idle" };

/** The three shifts a class can run, in the order the day happens. */
const SHIFT_KEYS = ["morning", "day", "evening"] as const;

/** A teacher account the class may be given — an assignment is an authorization, so only live teachers
    are ever offered, and the id is what the form posts rather than the name it shows. */
export interface TeacherOption {
  id: string;
  name: string;
}

/** What the editor holds while it is open: one draft per field, so a refusal cannot empty it. */
export interface ClassDraft {
  id: string;
  revision: string;
  nameBn: string;
  nameEn: string;
  level: string;
  room: string;
  shifts: string[];
  fee: string;
  feeFree: boolean;
  feeWas: string;
  year: string;
  active: boolean;
  teachers: string[];
}

/** An empty class, as the editor opens with it on a create. */
export const newClassDraft = (year: number): ClassDraft => ({
  id: "",
  revision: "",
  nameBn: "",
  nameEn: "",
  level: "",
  room: "",
  shifts: [],
  fee: "",
  feeFree: false,
  feeWas: "",
  year: String(year),
  active: true,
  teachers: [],
});

/**
 * A class as the editor opens with it.
 *
 * F-16 · the fee arrives as two facts rather than one: the number in the box, and the tick that says a
 * zero is a class the centre runs for free rather than a class nobody has priced. `feeWas` is the fee the
 * form OPENED with, which is what lets the write tell "the operator emptied this box" from "this box was
 * never filled in" — the first clears a fee, the second leaves the stored one alone.
 */
const draftOf = (card: ClassCardView): ClassDraft => {
  const fee = feeStateOf(card.monthlyFee, card.feeFree);
  return {
    id: card.id,
    revision: card.revision,
    nameBn: card.nameBn,
    nameEn: card.nameEn,
    level: card.level,
    room: card.room,
    shifts: [...card.shifts],
    fee: fee.fee,
    feeFree: fee.free,
    feeWas: card.monthlyFee > 0 ? String(card.monthlyFee) : "",
    year: String(card.academicYear),
    active: card.active,
    teachers: [...card.teacherIds],
  };
};

/** A class as a list row hands it over — the same draft, from the fields the row was given. */
export const draftOfClass = (item: {
  id: string;
  revision: string;
  nameBn: string;
  nameEn: string;
  level?: string;
  room?: string;
  shifts?: string[];
  monthlyFee?: number;
  feeFree?: boolean;
  year: number;
  active: boolean;
  teachers?: string[];
}): ClassDraft => {
  const fee = feeStateOf(Number(item.monthlyFee) || 0, item.feeFree === true);
  return {
    id: item.id,
    revision: item.revision,
    nameBn: item.nameBn,
    nameEn: item.nameEn,
    level: String(item.level || ""),
    room: String(item.room || ""),
    shifts: [...(item.shifts || [])],
    fee: fee.fee,
    feeFree: fee.free,
    feeWas: Number(item.monthlyFee) > 0 ? String(Number(item.monthlyFee)) : "",
    year: String(item.year),
    active: item.active,
    teachers: [...(item.teachers || [])],
  };
};

export interface ClassManagementProps {
  cards: ClassCardView[];
  batchOptions: BatchOption[];
  /** F-04 · the teachers a class may be given, so the one editor writes the whole record here too. */
  teacherOptions: TeacherOption[];
  year: number;
  digits: Digits;
  canEdit: boolean;
}

/** The screen: a header with the one way in, then a card per class. */
export function ClassManagement({
  cards,
  batchOptions,
  teacherOptions,
  year,
  digits,
  canEdit,
}: ClassManagementProps) {
  const t = useTranslations("classAdmin");
  const [draft, setDraft] = useState<ClassDraft | null>(null);
  const isNew = (draft?.id || "") === "";

  /* Counted once per render of the options, not once per card per render. */
  const batchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const batch of batchOptions) {
      const key = String(batch.classId || "");
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [batchOptions]);

  return (
    <section className="cm-board" data-class-board>
      <header className="cm-head">
        <span className="cm-head-icon" aria-hidden="true">
          <School size={22} />
        </span>
        <div className="cm-head-text">
          <div className="cm-head-title">
            <h2>{t("section")}</h2>
            <span className="cm-count" data-class-count>
              {formatNumber(cards.length, digits)}
            </span>
          </div>
          <p className="cm-help" data-class-cards-help>
            {t("cardsHelp")}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="cm-btn cm-btn-primary cm-head-action"
            data-class-add
            onClick={() => setDraft(newClassDraft(year))}>
            <Plus size={17} aria-hidden="true" />
            {t("addClass")}
          </button>
        )}
      </header>

      {cards.length === 0 ? (
        <div className="cm-empty" data-class-empty>
          <span className="cm-empty-icon" aria-hidden="true">
            <School size={28} />
          </span>
          <p>{t("empty")}</p>
          <span>{t("emptyHelp")}</span>
        </div>
      ) : (
        <div className="cm-cards" data-class-cards>
          {cards.map((card) => (
            <ClassCard
              key={card.id}
              card={card}
              batchCount={batchCounts.get(card.id) || 0}
              digits={digits}
              canEdit={canEdit}
              onEdit={() => setDraft(draftOf(card))}
            />
          ))}
        </div>
      )}

      {/* One modal, keyed on the class it holds: opening another class starts from that class's own
          facts rather than from the last draft, and a write in flight is never aimed at the wrong id. */}
      <div key={draft ? `${draft.id || "new"}:${draft.revision}` : "closed"}>
        {draft && (
          <ClassModal
            draft={draft}
            isNew={isNew}
            year={year}
            digits={digits}
            teacherOptions={teacherOptions}
            batchOptions={batchOptions}
            onClose={() => setDraft(null)}
          />
        )}
      </div>
    </section>
  );
}

/** One class: its name, the four facts, and the three ways in. */
function ClassCard({
  card,
  batchCount,
  digits,
  canEdit,
  onEdit,
}: {
  card: ClassCardView;
  batchCount: number;
  digits: Digits;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations("classAdmin");
  /* A shift key is shown through the catalog; a word the owner typed themselves is shown as it stands,
     because it is theirs — see `shiftWordsOf`. */
  const words = shiftWordsOf(card);
  const room = card.room.trim();
  const level = card.level.trim();
  const feeState =
    card.monthlyFee > 0 ? "set" : card.feeFree ? "free" : "unset";

  return (
    <article
      className="cm-card"
      data-class-card={card.id}
      data-class-active={card.active ? "true" : "false"}>
      <header className="cm-card-head">
        <div className="cm-card-title">
          <h2 data-class-name>
            {card.name}
            {card.nameEn && card.nameEn !== card.nameBn ? (
              <small> ({card.nameEn})</small>
            ) : null}
          </h2>
          <span
            className={`cm-level${level ? "" : " cm-level-none"}`}
            data-class-level>
            {level ? level : t("levelNone")}
          </span>
        </div>
        <span
          className="cm-status"
          data-class-status={card.active ? "active" : "archived"}>
          {card.active ? t("statusActive") : t("statusArchived")}
        </span>
      </header>

      <div className="cm-stats">
        <div className="cm-stat cm-stat-students" data-class-students>
          <span className="cm-stat-icon" aria-hidden="true">
            <Users size={18} />
          </span>
          <span className="cm-stat-text">
            <b>{t("students")}:</b>
            <span>
              {t("studentsCount", {
                count: formatNumber(card.students, digits),
              })}
            </span>
          </span>
        </div>
        <div
          className={`cm-stat cm-stat-batches${card.batches > 0 ? "" : " cm-stat-empty"}`}
          data-class-batches>
          <span className="cm-stat-icon" aria-hidden="true">
            <Layers size={18} />
          </span>
          <span className="cm-stat-text">
            <b>{t("batches")}:</b>
            <span>
              {card.batches > 0
                ? t("batchesCount", {
                    count: formatNumber(card.batches, digits),
                  })
                : t("noBatches")}
            </span>
          </span>
        </div>
      </div>

      <ul className="cm-info">
        <li>
          <Clock size={16} aria-hidden="true" />
          <span data-class-shifts={words.length ? "yes" : "none"}>
            <b>{t("shifts")}:</b>{" "}
            {words.length ? (
              <span className="cm-chips">
                {words.map((word) => (
                  <span key={word} className="cm-chip" data-class-shift={word}>
                    {shiftWord(word, t)}
                  </span>
                ))}
              </span>
            ) : (
              <span className="cm-dim">{t("noShifts")}</span>
            )}
          </span>
        </li>
        <li>
          <DoorOpen size={16} aria-hidden="true" />
          <span data-class-room={room ? "yes" : "none"}>
            <b>{t("room")}:</b>{" "}
            {room ? room : <span className="cm-dim">{t("noRoom")}</span>}
          </span>
        </li>
        {/* F-16 · three facts, three sentences: a price, a class the centre runs for free, and a class
            nobody has priced yet. Two of them used to read as one. */}
        <li>
          <Wallet size={16} aria-hidden="true" />
          <span
            className={`cm-fee cm-fee-${feeState}`}
            data-class-fee={feeState}>
            {card.monthlyFee > 0
              ? t("feeWord", { amount: formatNumber(card.monthlyFee, digits) })
              : card.feeFree
                ? t("feeFreeWord")
                : t("feeNone")}
          </span>
        </li>
        <li>
          <GraduationCap size={16} aria-hidden="true" />
          <span
            className={card.teachers.length ? "" : "cm-dim"}
            data-class-teachers>
            {card.teachers.length
              ? card.teachers.join(" · ")
              : t("teacherNone")}
          </span>
        </li>
        <li>
          <CalendarDays size={16} aria-hidden="true" />
          <span data-class-year>
            {t("yearLabel")}: {formatNumber(card.academicYear, digits)}
          </span>
        </li>
      </ul>

      <div className="cm-card-actions">
        <div className="cm-links">
          <Link
            className="cm-btn cm-btn-ghost cm-btn-sm"
            data-class-students-link={card.id}
            href={`/admin/students/classes/${card.id}`}>
            <ListChecks size={15} aria-hidden="true" />
            {t("viewStudents")}
          </Link>
          <Link
            className="cm-btn cm-btn-ghost cm-btn-sm"
            data-class-routine-link={card.id}
            href={`/admin/routine/master?classId=${card.id}`}>
            <CalendarClock size={15} aria-hidden="true" />
            {t("viewRoutine")}
          </Link>
        </div>
        <div className="cm-manage">
          {canEdit && (
            <button
              type="button"
              className="cm-btn cm-btn-soft cm-btn-sm cm-manage-edit"
              data-class-edit={card.id}
              onClick={onEdit}>
              <Pencil size={15} aria-hidden="true" />
              {t("edit")}
            </button>
          )}
          <details className="cm-more" data-class-more={card.id}>
            <summary className="cm-btn cm-btn-ghost cm-btn-sm">
              <MoreHorizontal size={16} aria-hidden="true" />
              {t("more")}
            </summary>
            <div className="cm-more-body">
              <Link href={`/admin/students/classes/${card.id}`}>
                {t("viewHub")}
              </Link>
              <span className="cm-help">
                {batchCount
                  ? t("batchesCount", {
                      count: formatNumber(batchCount, digits),
                    })
                  : t("noBatches")}
              </span>
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

/** A shift key through the catalog; any other word as its owner wrote it. */
function shiftWord(word: string, t: (key: string) => string): string {
  const key = word.trim().toLowerCase();
  return key === "morning"
    ? t("shiftMorning")
    : key === "day"
      ? t("shiftDay")
      : key === "evening"
        ? t("shiftEvening")
        : word;
}

/** The refusal's own sentence, in the language being read — the toast says why, the form says where. */
function whyOf(state: ClassActionState, t: (key: string) => string): string {
  return state.status === "duplicate"
    ? t("duplicate")
    : state.status === "conflict"
      ? t("conflict")
      : state.status === "refused"
        ? String(state.message || t("saveFailed"))
        : state.status === "invalid"
          ? t("invalid")
          : t("saveFailed");
}

/**
 * S2 · F-04 — the one class editor: every field the record has, in one form.
 *
 * Both names, the level, the shifts it runs, the room, the month it costs and what a zero means, the
 * teachers who take it, and whether it is running at all. It is rendered in a dialog on the class board
 * and folded into a row on the class list, and both post to `saveClassGroupAction`, so a class is written
 * the same way whichever screen the operator is standing at — and no screen can save half of one.
 *
 * `variant` is the only difference between the two: a dialog has a close button and closes when its write
 * lands, a row has neither and stays open so the operator can read the answer where they wrote it. The
 * save is the form's first button in both, because a folded row is opened by a summary and the operator's
 * next click is the write.
 */
export function ClassEditorForm({
  draft,
  isNew,
  year,
  digits,
  teacherOptions,
  variant,
  onLanded,
  onClose,
}: {
  draft: ClassDraft;
  isNew: boolean;
  year: number;
  digits: Digits;
  teacherOptions: TeacherOption[];
  variant: "dialog" | "inline";
  onLanded?: () => void;
  onClose?: () => void;
}) {
  const t = useTranslations("classAdmin");
  const router = useRouter();
  const [value, setValue] = useState<ClassDraft>(draft);
  const write = (patch: Partial<ClassDraft>): void =>
    setValue((current) => ({ ...current, ...patch }));
  const levels = useMemo(() => {
    const raw = t.raw("levels");
    return Array.isArray(raw) ? raw.map((entry) => String(entry)) : [];
  }, [t]);
  /* Two editors can be open on one page — a board's sheet and a list's rows — so the level list they both
     offer is named for the class it belongs to rather than twice for the document. */
  const levelList = `class-levels-${draft.id || "new"}`;

  const why = (state: ClassActionState): string => whyOf(state, t);

  const run = useMemo(
    () =>
      async (
        previous: ClassActionState,
        form: FormData,
      ): Promise<ClassActionState> => {
        const next = await saveClassGroupAction(previous, form);
        /* Raised on the way back from the write rather than in an effect: the answer is the moment the
           operator is waiting for, and an effect can miss a state that unmounts the sheet. */
        showRecycleToast(
          next.status === "ok"
            ? {
                state: { status: "ok" },
                success: String(next.message || t("saved")),
                error: "",
              }
            : { state: { status: "error" }, success: "", error: why(next) },
        );
        return next;
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );
  const [state, action, pending] = useActionState(run, idle);

  /* A write that landed re-reads the class; a refusal leaves the editor open with the draft still in it,
     because that draft is what was wrong. A row stays open either way — it is part of a list the operator
     is reading — and a dialog closes only on the way back from a write that landed. */
  const revision = useRef(draft.revision);
  useEffect(() => {
    if (state.status !== "ok") return;
    router.refresh();
    onLanded?.();
  }, [state.status, router, onLanded]);
  /* The page hands back the class's new revision once the write has landed, and an editor still open
     adopts it: a second save from the same sheet is another write, not somebody else's. */
  useEffect(() => {
    if (revision.current === draft.revision) return;
    revision.current = draft.revision;
    if (state.status !== "ok") return;
    setValue((current) => ({ ...current, revision: draft.revision }));
  }, [draft.revision, state.status]);

  const toggleShift = (key: string): void =>
    write({
      shifts: value.shifts.includes(key)
        ? value.shifts.filter((entry) => entry !== key)
        : [...value.shifts, key],
    });
  const toggleTeacher = (id: string): void =>
    write({
      teachers: value.teachers.includes(id)
        ? value.teachers.filter((entry) => entry !== id)
        : [...value.teachers, id],
    });

  return (
    <form
      className={variant === "dialog" ? "cm-form" : "admin-edit"}
      action={action}
      onReset={(event) => event.preventDefault()}
      data-class-form={isNew ? "new" : draft.id}
      data-class-editor={variant}>
      <input type="hidden" name="id" value={value.id} />
      <input type="hidden" name="revision" value={value.revision} />
      {/* F-16 · the fee the form opened with: an emptied box clears a fee that was set, and a box that was
          never filled leaves the stored one alone. */}
      <input type="hidden" name="feeWas" value={value.feeWas} />

      <div className={variant === "dialog" ? "cm-grid" : "admin-edit-grid"}>
        <label className="cm-field">
          {t("nameLabel")}
          <input
            className="admin-input"
            name="nameBn"
            required
            maxLength={120}
            data-class-name-bn
            value={value.nameBn}
            onChange={(event) => write({ nameBn: event.target.value })}
          />
        </label>
        <label className="cm-field">
          {t("nameEnLabel")}
          <input
            className="admin-input"
            name="nameEn"
            maxLength={120}
            data-class-name-en
            value={value.nameEn}
            onChange={(event) => write({ nameEn: event.target.value })}
          />
        </label>
        <label className="cm-field">
          {t("levelLabel")}
          <input
            className="admin-input"
            name="level"
            maxLength={80}
            list={levelList}
            data-class-level
            value={value.level}
            onChange={(event) => write({ level: event.target.value })}
          />
          <datalist id={levelList}>
            {levels.map((level) => (
              <option key={level} value={level} />
            ))}
          </datalist>
          <small className="admin-help">{t("levelHelp")}</small>
        </label>
        <label className="cm-field">
          {t("roomLabel")}
          <input
            className="admin-input"
            name="room"
            maxLength={80}
            data-class-room
            placeholder="Room-1201"
            value={value.room}
            onChange={(event) => write({ room: event.target.value })}
          />
          <small className="admin-help">{t("roomHelp")}</small>
        </label>
        <label className="cm-field">
          {t("feeLabel")}
          <input
            className="admin-input"
            name="monthlyFee"
            inputMode="numeric"
            maxLength={9}
            data-class-fee
            placeholder={t("feePlaceholder")}
            disabled={value.feeFree}
            value={value.feeFree ? "" : value.fee}
            onChange={(event) => write({ fee: event.target.value })}
          />
          <small className="admin-help">{t("feeHelp")}</small>
        </label>
        {isNew && (
          <label className="cm-field">
            {t("yearLabel")}
            <input
              className="admin-input"
              name="academicYear"
              inputMode="numeric"
              required
              maxLength={4}
              data-class-year
              value={value.year}
              onChange={(event) => write({ year: event.target.value })}
            />
          </label>
        )}
        {/* The year is written once and never moved: a fee history is read against the year it was taken
            in, so the form posts the class's own year and offers no box to change it. */}
        {!isNew && (
          <input type="hidden" name="academicYear" value={value.year} />
        )}
      </div>

      <label className="admin-check cm-toggle">
        <input
          type="checkbox"
          name="feeFree"
          data-class-fee-free
          checked={value.feeFree}
          onChange={(event) => write({ feeFree: event.target.checked })}
        />{" "}
        {t("feeFreeCheck")}
        <small className="admin-help">
          {t("feeFreeHelp")} {t("feeClearHelp")}
        </small>
      </label>

      <fieldset className="admin-check-group cm-group" data-class-shift-boxes>
        <legend>{t("shiftsLabel")}</legend>
        <small className="admin-help">{t("shiftsHelp")}</small>
        {SHIFT_KEYS.map((key) => (
          <label className="admin-check cm-chip-check" key={key}>
            <input
              type="checkbox"
              name="shifts"
              value={key}
              data-class-shift-box={key}
              checked={value.shifts.includes(key)}
              onChange={() => toggleShift(key)}
            />
            {shiftWord(key, t)}
          </label>
        ))}
      </fieldset>

      {/* F-04 · the teachers travel with the class, so the marks grid a teacher may open is decided on the
          same form that names the class. Only live teacher accounts are offered: an assignment is an
          authorization, and a name that cannot sign in is not one anybody can hand a grid to. */}
      <fieldset
        className="admin-check-group cm-group"
        data-class-teachers={draft.id || "new"}>
        <legend>{t("teachers")}</legend>
        <small className="admin-help">{t("teachersHelp")}</small>
        {teacherOptions.length === 0 && (
          <p className="admin-help" data-class-teachers-empty>
            {t("teacherNone")}
          </p>
        )}
        {teacherOptions.map((option) => (
          <label
            className="admin-check cm-chip-check"
            key={option.id}
            data-teacher-option={option.id}>
            <input
              type="checkbox"
              name="teacherIds"
              value={option.id}
              data-teacher-check={option.id}
              checked={value.teachers.includes(option.id)}
              onChange={() => toggleTeacher(option.id)}
            />
            {option.name}
          </label>
        ))}
      </fieldset>

      {!isNew && (
        <label className="admin-check cm-toggle">
          <input
            type="checkbox"
            name="active"
            data-class-active-box
            checked={value.active}
            onChange={(event) => write({ active: event.target.checked })}
          />{" "}
          {t("activeCheck")}
        </label>
      )}
      {isNew && <input type="hidden" name="active" value="on" />}

      {/* F-05 · a class with children on it is not closed. The refusal is the action's own sentence, with
          the count in it and the way out beside it, and the editor stays open with the tick where the
          operator left it — a class that cannot be closed yet is a class they are still looking at. */}
      {state.status === "refused" && (
        <div
          className="admin-feedback error cm-note cm-note-error"
          role="alert"
          data-class-archive-refused
          data-class-archive-count={String(state.count ?? 0)}
          title={state.detail || ""}>
          <p>{state.message}</p>
          <p className="admin-help">{t("archiveRefusedHelp")}</p>
        </div>
      )}
      {state.status === "invalid" && (
        <p
          className="admin-feedback error cm-note cm-note-error"
          role="alert"
          data-class-invalid
          title={state.detail || ""}>
          {t("invalid")}
          {state.fields?.length ? ` — ${state.fields.join(", ")}` : ""}
        </p>
      )}
      {state.status === "duplicate" && (
        <p
          className="admin-feedback error cm-note cm-note-error"
          role="alert"
          data-class-duplicate>
          {t("duplicate")}
        </p>
      )}
      {state.status === "conflict" && (
        <p
          className="admin-feedback error cm-note cm-note-error"
          role="alert"
          data-class-conflict>
          {t("conflict")}
        </p>
      )}
      {state.status === "error" && (
        <p
          className="admin-feedback error cm-note cm-note-error"
          role="alert"
          data-class-error
          title={state.detail || ""}>
          {t("saveFailed")}
        </p>
      )}

      <div className="routine-form-actions cm-actions">
        <SubmitButton
          pending={pending}
          data-class-save
          busyLabel={t("saving")}
          label={t("save")}
        />
        {variant === "dialog" && onClose && (
          <button
            type="button"
            className="cm-btn cm-btn-ghost"
            data-class-cancel
            onClick={onClose}>
            {t("close")}
          </button>
        )}
        {isNew && variant === "dialog" && (
          <span className="cm-actions-help">{t("desc")}</span>
        )}
        {!isNew && variant === "dialog" && (
          <span className="cm-actions-help">
            {t("yearLabel")}: {formatNumber(Number(value.year) || year, digits)}
          </span>
        )}
      </div>

      {state.status !== "idle" && (
        <p
          className={`admin-feedback cm-note ${state.status === "ok" ? "cm-note-ok" : "cm-note-error"}`}
          role={state.status === "ok" ? "status" : "alert"}
          data-class-saved={state.status === "ok" ? "yes" : "no"}>
          {state.status === "ok"
            ? String(state.message || t("saved"))
            : why(state)}
        </p>
      )}
    </form>
  );
}

/** The add/edit sheet: the one editor, and — for a class that exists — the batches it runs. */
function ClassModal({
  draft,
  isNew,
  year,
  digits,
  teacherOptions,
  batchOptions,
  onClose,
}: {
  draft: ClassDraft;
  isNew: boolean;
  year: number;
  digits: Digits;
  teacherOptions: TeacherOption[];
  batchOptions: BatchOption[];
  onClose: () => void;
}) {
  const t = useTranslations("classAdmin");
  const dialog = useRef<HTMLDialogElement>(null);
  const why = (state: ClassActionState): string => whyOf(state, t);

  const batches = useMemo(
    () =>
      async (
        previous: ClassActionState,
        form: FormData,
      ): Promise<ClassActionState> => {
        const next = await assignClassBatchesAction(previous, form);
        showRecycleToast(
          next.status === "ok"
            ? {
                state: { status: "ok" },
                success: String(next.message || t("saved")),
                error: "",
              }
            : { state: { status: "error" }, success: "", error: why(next) },
        );
        return next;
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );
  const [batchState, batchAction, batchPending] = useActionState(batches, idle);
  /* The batch boxes are held here too, for the same reason: a refused write must not undo the ticks. */
  const [picked, setPicked] = useState<string[]>(() =>
    batchOptions
      .filter((batch) => batch.classId === draft.id)
      .map((batch) => batch.id),
  );

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (!node.open) node.showModal();
    /* No close() on cleanup: Strict Mode's mount→cleanup→mount would queue a `close` event that fires
       after the re-open and runs onClose, unmounting the modal at once. Unmounting removes it anyway. */
  }, []);

  return (
    <dialog
      ref={dialog}
      className="cm-modal"
      data-class-modal={isNew ? "new" : draft.id}
      aria-labelledby="class-modal-title"
      /* Esc closes a modal dialog natively; this keeps the board's state in step, so the next
         "add class" opens a fresh sheet instead of finding the old one closed. */
      onClose={onClose}
      onReset={(event) => event.preventDefault()}>
      <header className="cm-modal-head">
        <span className="cm-modal-icon" aria-hidden="true">
          {isNew ? <Plus size={20} /> : <Pencil size={19} />}
        </span>
        <h2 id="class-modal-title">{isNew ? t("newTitle") : t("editTitle")}</h2>
        <button
          type="button"
          className="cm-close"
          data-class-close
          onClick={onClose}
          aria-label={t("close")}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="cm-modal-scroll">
        <ClassEditorForm
          draft={draft}
          isNew={isNew}
          year={year}
          digits={digits}
          variant="dialog"
          teacherOptions={teacherOptions}
          onClose={onClose}
          onLanded={() => {
            if (dialog.current?.open) dialog.current.close();
            onClose();
          }}
        />

        {/* A class that exists can be given its batches. It is a second write on purpose: the batches are
            the batch screen's own records, and assigning them must not have to re-save the class. */}
        {!isNew && (
          <form
            className="cm-form cm-form-batches"
            action={batchAction}
            data-class-batch-form={draft.id}
            onReset={(event) => event.preventDefault()}>
            <input type="hidden" name="id" value={draft.id} />
            <fieldset className="admin-check-group cm-group">
              <legend>{t("batchesLabel")}</legend>
              <small className="admin-help" data-class-batch-help>
                {t("batchesHelp")}
              </small>
              {batchOptions.length === 0 && (
                <p className="admin-help" data-class-batch-none>
                  {t("noBatchOptions")}
                </p>
              )}
              {batchOptions.map((batch) => (
                <label className="admin-check cm-chip-check" key={batch.id}>
                  <input
                    type="checkbox"
                    name="batchIds"
                    value={batch.id}
                    data-class-batch-box={batch.id}
                    checked={picked.includes(batch.id)}
                    onChange={() =>
                      setPicked((current) =>
                        current.includes(batch.id)
                          ? current.filter((entry) => entry !== batch.id)
                          : [...current, batch.id],
                      )
                    }
                  />
                  {batch.name}
                  {batch.grade ? ` · ${batch.grade}` : ""}
                </label>
              ))}
            </fieldset>
            {batchState.status === "ok" && (
              <p
                className="admin-feedback ok cm-note cm-note-ok"
                role="status"
                data-class-batch-saved>
                {batchState.message || t("batchesSaved")}
              </p>
            )}
            {batchState.status !== "ok" && batchState.status !== "idle" && (
              <p
                className="admin-feedback error cm-note cm-note-error"
                role="alert"
                data-class-batch-error>
                {why(batchState)}
              </p>
            )}
            <div className="routine-form-actions cm-actions">
              <SubmitButton
                pending={batchPending}
                disabled={batchOptions.length === 0}
                data-class-batch-save
                busyLabel={t("saving")}
                label={t("saveBatches")}
              />
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
