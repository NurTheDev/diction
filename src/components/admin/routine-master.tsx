"use client";
/**
 * R9 · the master routine builder: the week, and the two drawers that write it.
 *
 * What the brief asked for, and where it lives:
 *
 *   • **A visible "+ Add Period" on every day and a visible Edit on every period.** Not in a menu, not
 *     behind a row tap: the button is on the card. The ⋯ menu beside it holds the things done rarely —
 *     delete, restore from the day's bin, the day's own shift — and the menu is an addition to the
 *     visible button, never a replacement for it.
 *   • **A clash warns and never blocks.** A teacher written into two rooms at the same minute, or a room
 *     written into two classes, comes back as `clash`: the drawer stays open with a banner naming the
 *     person, the class and the time, and a prominent "Save anyway" beside the ordinary Save. Pressing
 *     it re-posts the same form with `force` and the period is written. The week that already clashes
 *     says so at the top of the page before anybody opens an editor.
 *   • **Nothing is locked.** Any field of any period can be changed, including which day it belongs to —
 *     moving a period is the day picker in its own editor.
 *
 * Styling lives in `globals.css` under "Merged from src/routine-board.css"
 * (everything is `rm-*`).
 */
import {
  deleteMasterPeriodAction,
  restoreMasterPeriodAction,
  saveMasterDayAction,
  saveMasterPeriodAction,
  setMasterDayTypeAction,
  type RoutineActionState,
} from "@/actions/routine";
import { formatNumber, type Digits } from "@/lib/admin/format";
import { dayTotals, type RoutineClash } from "@/lib/routine/conflicts";
import type {
  MasterDayView,
  PeriodView,
  RoutineTeacher,
} from "@/lib/routine/read";
import {
  DEFAULT_PERIOD_MINUTES,
  endAfter,
  nextPeriodSeed,
  rangeWord,
  type ChainSeed,
} from "@/lib/routine/time";
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  DoorOpen,
  History as HistoryIcon,
  Layers,
  Link2,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { showRecycleToast } from "./recycle-toast-host";
import {
  DurationChips,
  RoutineDrawer,
  TimeField,
  chainedEnd,
  durationOf,
  useClashSentence,
} from "./routine-drawer";
import { RoutineHistory } from "./routine-history";
import { RoutineDayOps, RoutineTools, type BulkPicked } from "./routine-tools";
import { RowControls } from "./row-controls";
import { SubmitButton } from "./submit-button";

const idle: RoutineActionState = { status: "idle" };

export interface JointOptions {
  weekday: number;
  options: { id: string; label: string }[];
}

export interface RoutineMasterProps {
  classId: string;
  className: string;
  shift: string;
  /** Every class and every shift, so the replacement tool can be centre-wide rather than only this one. */
  classes: { id: string; name: string }[];
  shifts: string[];
  /** Dhaka's today and the last date the replacement range offers — decided on the server, not here. */
  today: string;
  until: string;
  days: MasterDayView[];
  /** The seven weekday names, in the screen's own language, starting on Sunday. */
  weekdays: string[];
  teachers: RoutineTeacher[];
  rooms: string[];
  joints: JointOptions[];
  clashes: RoutineClash[];
  digits: Digits;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * What a weekday is for this class and shift: a teaching day, its weekly day off, or its weekly exam day.
 *
 * One tap writes it — there is no save step — and a tap on another option changes it again, so the
 * choice is never locked in. It works on an empty weekday too (the day is created as a label), and the
 * periods already on the day are kept whatever it is set to.
 */
function DayTypeControl(props: {
  classId: string;
  shift: string;
  day: MasterDayView;
  onDone: () => void;
}) {
  const { classId, shift, day, onDone } = props;
  const t = useTranslations("routine");
  const [state, action, pending] = useActionState(setMasterDayTypeAction, idle);
  useEffect(() => {
    if (state.status === "ok") onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form
      action={action}
      className="rm-daytype"
      data-day-type-form={day.weekday}>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="shift" value={day.shift || shift} />
      <input type="hidden" name="weekday" value={day.weekday} />
      <span className="rm-daytype-label">{t("day.type.label")}</span>
      <div
        className="rm-daytype-group"
        role="group"
        aria-label={t("day.type.label")}>
        {(["class", "off", "exam"] as const).map((type) => (
          <button
            key={type}
            type="submit"
            name="dayType"
            value={type}
            className={`rm-daytype-opt${day.dayType === type ? " rm-daytype-on" : ""}`}
            data-day-type={type}
            aria-pressed={day.dayType === type}
            disabled={pending}>
            {t(`day.type.${type}`)}
          </button>
        ))}
      </div>
      {(state.status === "error" || state.status === "invalid") && (
        <small className="rm-daytype-error" role="alert">
          {t("common.failed")}
        </small>
      )}
    </form>
  );
}

/** Deleting one period: into that day's own bin for thirty days, with Undo in the toast. */
function PeriodDeleteControl({
  classId,
  shift,
  periodId,
  name,
  onDone,
}: {
  classId: string;
  shift: string;
  periodId: string;
  name: string;
  onDone?: () => void;
}) {
  const t = useTranslations("routine");
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);

  const payload = (): FormData => {
    const data = new FormData();
    data.set("classId", classId);
    data.set("shift", shift);
    data.set("periodId", periodId);
    return data;
  };

  const restore = async (): Promise<void> => {
    const result = await restoreMasterPeriodAction(idle, payload());
    showRecycleToast({
      state: { status: result.status === "ok" ? "ok" : "error" },
      success: t("period.restored"),
      error: t("common.failed"),
    });
    router.refresh();
  };

  const remove = async (): Promise<void> => {
    setPending(true);
    try {
      const result = await deleteMasterPeriodAction(idle, payload());
      showRecycleToast({
        state: { status: result.status === "ok" ? "ok" : "error" },
        success: t("period.deleted"),
        error:
          result.status === "missing"
            ? t("common.missing")
            : t("common.failed"),
        /* The same ten-second Undo window every other delete in this app has. */
        actions:
          result.status === "ok"
            ? [{ label: t("common.undo"), run: () => void restore() }]
            : [],
      });
      if (result.status === "ok") {
        dialog.current?.close();
        onDone?.();
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="rm-btn rm-btn-danger-ghost rm-btn-sm"
        disabled={pending}
        data-period-delete={periodId}
        onClick={() => dialog.current?.showModal()}>
        <Trash2 size={15} aria-hidden="true" />
        {t("period.delete")}
      </button>
      <dialog
        ref={dialog}
        className="rm-confirm"
        onClose={() => trigger.current?.focus()}>
        <span className="rm-confirm-icon" aria-hidden="true">
          <Trash2 size={22} />
        </span>
        <h2>{t("period.deleteNamed", { name })}</h2>
        <p>{t("period.deleteBody")}</p>
        <div className="rm-confirm-actions">
          <button
            type="button"
            className="rm-btn rm-btn-ghost"
            onClick={() => dialog.current?.close()}>
            {t("period.cancel")}
          </button>
          <button
            type="button"
            className="rm-btn rm-btn-danger"
            disabled={pending}
            data-period-delete-yes={periodId}
            onClick={() => void remove()}>
            {t("period.delete")}
          </button>
        </div>
      </dialog>
    </>
  );
}

/**
 * One period's editor.
 *
 * `target.seed` is what "+ the next period" hands it: the times and the sequence a day's own last
 * period implies, worked out by `nextPeriodSeed` rather than by this drawer. `onDuration` reports the
 * chip the operator pressed back to the board, so the next period the board offers is chained to the
 * length the centre is actually running today and not to a default nobody chose.
 */
function MasterPeriodDrawer({
  target,
  onClose,
  onDuration,
  props,
}: {
  target: {
    weekday: number;
    period: PeriodView | null;
    seed?: ChainSeed;
  } | null;
  onClose: () => void;
  onDuration: (minutes: number | null) => void;
  props: RoutineMasterProps;
}) {
  const t = useTranslations("routine");
  const router = useRouter();
  const sentence = useClashSentence();
  const [state, action, pending] = useActionState(saveMasterPeriodAction, idle);
  const period = target?.period || null;
  const weekday = target?.weekday ?? 0;

  useEffect(() => {
    if (state.status !== "ok") return;
    onClose();
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const joints =
    props.joints.find((entry) => entry.weekday === weekday)?.options || [];
  const seed = target?.seed || null;
  /* A new period starts on the chip the centre runs: fifty minutes from eight, or from wherever the
     day's own last period ended when the chain button opened this drawer. */
  const start = period?.start || seed?.start || "08:00";
  const end =
    period?.end || seed?.end || endAfter(start, DEFAULT_PERIOD_MINUTES);

  /* Every field lives in state: React 19 hands a finished form action back to the form's defaults, and a
     save that answers as a warning must hand the operator the period they typed rather than an empty
     form, or the "Save anyway" standing beside the warning would post the emptiness. The board re-keys
     this drawer per target, so the state starts as the period being edited and then holds what is typed. */
  const [draft, setDraft] = useState({
    weekday: String(weekday),
    start,
    end,
    subjectBn: period?.subjectBn || "",
    subjectEn: period?.subjectEn || "",
    teacher: period?.teacherId || "",
    room: period?.room || "",
    jointWith: period?.jointWith || "",
    order: String(period?.order ?? seed?.order ?? 0),
    note: period?.note || "",
  });
  const write = (patch: Partial<typeof draft>): void =>
    setDraft((current) => ({ ...current, ...patch }));

  /* The length this drawer is on: the one the period's own two times press, fifty minutes for a period
     with no times yet, and Custom for a length no chip names — so opening a drawer on a period that
     runs fifty-five minutes never quietly moves its end. */
  const [duration, setDuration] = useState<number | null>(() =>
    period ? durationOf(period.start, period.end) : durationOf(start, end),
  );
  const pick = (minutes: number | null): void => {
    setDuration(minutes);
    onDuration(minutes);
    if (minutes) write({ end: endAfter(draft.start, minutes) });
  };
  /* A start written while a chip is on drags its end along; a start written on Custom moves alone. */
  const writeStart = (value: string): void =>
    write({ start: value, end: chainedEnd(value, draft.end, duration) });

  const name = period
    ? t("period.summary", {
        time: rangeWord(period.start, period.end, props.digits),
        subject: period.subjectBn,
      })
    : t("period.newTitle");

  return (
    <RoutineDrawer
      open={!!target}
      onClose={onClose}
      title={period ? t("period.editorTitle") : t("period.newTitle")}>
      {/* Declining React 19's form reset keeps every control showing exactly what the operator wrote. */}
      <form
        action={action}
        className="rm-form"
        data-period-form={period?.id || "new"}
        onReset={(event) => event.preventDefault()}>
        <input type="hidden" name="classId" value={props.classId} />
        <input type="hidden" name="shift" value={props.shift} />
        <input type="hidden" name="periodId" value={period?.id || ""} />
        <input type="hidden" name="masterPeriod" value="" />

        <label className="rm-field">
          {t("period.day")}
          <select
            className="admin-select"
            name="weekday"
            data-period-weekday
            value={draft.weekday}
            onChange={(event) => write({ weekday: event.target.value })}>
            {props.weekdays.map((word, index) => (
              <option key={word + index} value={index}>
                {word}
              </option>
            ))}
          </select>
          <small className="rm-help">{t("period.moveHelp")}</small>
        </label>

        <p className="rm-shiftline" data-period-shift>
          <Clock size={15} aria-hidden="true" />
          {t("period.shiftLine", { shift: props.shift || t("master.noShift") })}
        </p>

        <DurationChips minutes={duration} digits={props.digits} onPick={pick} />

        <div className="rm-two">
          <label className="rm-field">
            {t("period.start")}
            <TimeField
              name="start"
              value={draft.start}
              digits={props.digits}
              onChange={writeStart}
            />
          </label>
          <label className="rm-field">
            {t("period.end")}
            <TimeField
              name="end"
              value={draft.end}
              digits={props.digits}
              onChange={(value) => write({ end: value })}
            />
          </label>
        </div>
        <small className="rm-help">{t("period.timeHelp")}</small>

        <div className="rm-two">
          <label className="rm-field">
            {t("period.subjectBn")} *
            <input
              className="admin-input"
              name="subjectBn"
              required
              maxLength={200}
              data-period-subject-bn
              value={draft.subjectBn}
              onChange={(event) => write({ subjectBn: event.target.value })}
            />
          </label>
          <label className="rm-field">
            {t("period.subjectEn")}
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
            {t("period.teacher")}
            <select
              className="admin-select"
              name="teacher"
              data-period-teacher
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
          <label className="rm-field">
            {t("period.room")}
            <input
              className="admin-input"
              name="room"
              maxLength={80}
              list="routine-rooms"
              data-period-room
              value={draft.room}
              onChange={(event) => write({ room: event.target.value })}
            />
            <datalist id="routine-rooms">
              {props.rooms.map((room) => (
                <option key={room} value={room} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="rm-two">
          <label className="rm-field">
            {t("period.joint")}
            <select
              className="admin-select"
              name="jointWith"
              data-period-joint
              value={draft.jointWith}
              onChange={(event) => write({ jointWith: event.target.value })}>
              <option value="">{t("period.jointNone")}</option>
              {joints.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <small className="rm-help">{t("period.jointHelp")}</small>
          </label>
          <label className="rm-field">
            {t("period.order")}
            <input
              className="admin-input"
              name="order"
              inputMode="numeric"
              maxLength={2}
              data-period-order
              value={draft.order}
              onChange={(event) => write({ order: event.target.value })}
            />
            <small className="rm-help">{t("period.orderHelp")}</small>
          </label>
        </div>

        <label className="rm-field">
          {t("period.note")}
          <textarea
            className="admin-textarea"
            name="note"
            maxLength={300}
            value={draft.note}
            onChange={(event) => write({ note: event.target.value })}
          />
        </label>

        {/* The clash is an answer, not a refusal: the banner names what landed where, and the button
            beside the ordinary Save writes it anyway. */}
        {state.status === "clash" && (
          <div className="rm-warn" role="alert" data-clash-warning>
            <div className="rm-warn-head">
              <AlertTriangle size={18} aria-hidden="true" />
              <strong>{t("clashes.banner")}</strong>
            </div>
            <p className="rm-help">{t("clashes.bannerHelp")}</p>
            <ul>
              {(state.clashes || []).map((clash, index) => (
                <li
                  key={`${clash.kind}${clash.otherStart}${index}`}
                  data-clash-line={clash.kind}>
                  {sentence(clash, props.digits)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(state.status === "invalid" ||
          state.status === "missing" ||
          state.status === "error" ||
          state.status === "duplicate") && (
          <p role="alert" className="rm-note rm-note-error" data-period-refused>
            {state.status === "invalid"
              ? t("period.invalid")
              : state.status === "missing"
                ? t("common.missing")
                : state.status === "duplicate"
                  ? t("common.duplicate")
                  : t("common.failed")}
          </p>
        )}

        <div className="rm-actions">
          <SubmitButton
            pending={pending}
            data-period-save
            busyLabel={t("period.saving")}
            label={t("period.save")}
          />
          {state.status === "clash" && (
            <SubmitButton
              pending={pending}
              name="force"
              value="on"
              className="rm-save-anyway"
              data-save-anyway
              busyLabel={t("period.saving")}
              label={t("period.saveAnyway")}
            />
          )}
          <button
            type="button"
            className="rm-btn rm-btn-ghost"
            onClick={onClose}
            data-period-cancel>
            {t("period.cancel")}
          </button>
        </div>
      </form>

      {/* The danger zone: soft delete, thirty days, Undo — the same policy every other record follows. */}
      {period && (
        <div className="rm-danger" data-period-danger>
          <h3>{t("period.dangerZone")}</h3>
          <PeriodDeleteControl
            classId={props.classId}
            shift={props.shift}
            periodId={period.id}
            name={name}
            onDone={onClose}
          />
        </div>
      )}
    </RoutineDrawer>
  );
}

/** A day of the week itself: which shift it belongs to, and whether it is switched off. */
function MasterDayDrawer({
  day,
  onClose,
  props,
}: {
  day: MasterDayView | null;
  onClose: () => void;
  props: RoutineMasterProps;
}) {
  const t = useTranslations("routine");
  const router = useRouter();
  const [state, action, pending] = useActionState(saveMasterDayAction, idle);
  /* Held in state for the same reason as the period drawer above: an answer that keeps the drawer open
     must not blank the shift the operator typed into it. */
  const [shiftValue, setShiftValue] = useState(day?.shift || props.shift);
  const [active, setActive] = useState(day?.active !== false);

  useEffect(() => {
    if (state.status !== "ok") return;
    onClose();
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <RoutineDrawer open={!!day} onClose={onClose} title={t("day.editorTitle")}>
      <form
        action={action}
        className="rm-form"
        data-day-form={day?.weekday ?? ""}
        onReset={(event) => event.preventDefault()}>
        <input type="hidden" name="dayId" value={day?.id || ""} />
        <label className="rm-field">
          {t("day.shift")}
          <input
            className="admin-input"
            name="shift"
            data-day-shift
            value={shiftValue}
            onChange={(event) => setShiftValue(event.target.value)}
            maxLength={100}
            list="routine-shifts"
            required
          />
          <datalist id="routine-shifts">
            {[
              ...new Set(
                [...props.days.map((entry) => entry.shift), props.shift].filter(
                  Boolean,
                ),
              ),
            ].map((shift) => (
              <option key={shift} value={shift} />
            ))}
          </datalist>
          <small className="rm-help">{t("day.shiftHelp")}</small>
        </label>

        <label className="rm-toggle">
          <input
            type="checkbox"
            name="active"
            data-day-active
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          <span>{t("day.active")}</span>
          <small className="rm-help">{t("day.activeHelp")}</small>
        </label>

        {state.status !== "ok" && state.status !== "idle" && (
          <p role="alert" className="rm-note rm-note-error" data-day-refused>
            {t("common.failed")}
          </p>
        )}
        <div className="rm-actions">
          <SubmitButton
            pending={pending}
            data-day-save
            busyLabel={t("period.saving")}
            label={t("day.save")}
          />
          <button
            type="button"
            className="rm-btn rm-btn-ghost"
            onClick={onClose}>
            {t("period.cancel")}
          </button>
        </div>
      </form>
      {/* A whole day, moved to another weekday or duplicated onto one. Both are day questions, so both
          live in the day's own editor rather than in a menu on the card. */}
      {day?.id && props.canEdit && (
        <RoutineDayOps
          classId={props.classId}
          shift={day.shift || props.shift}
          from={day.weekday}
          weekdays={props.weekdays}
          offDays={props.days
            .filter((entry) => entry.dayType === "off")
            .map((entry) => entry.weekday)}
          digits={props.digits}
          onDone={onClose}
        />
      )}
    </RoutineDrawer>
  );
}

export function RoutineMasterBoard(props: RoutineMasterProps) {
  const t = useTranslations("routine");
  const router = useRouter();
  const sentence = useClashSentence();
  const [periodTarget, setPeriodTarget] = useState<{
    weekday: number;
    period: PeriodView | null;
    seed?: ChainSeed;
  } | null>(null);
  /* The length the chain is offering, which is the last chip an operator pressed in a drawer — fifty
     minutes until somebody says otherwise, because that is what the centre's schedule is built from. */
  const [chainMinutes, setChainMinutes] = useState<number>(
    DEFAULT_PERIOD_MINUTES,
  );
  const [dayTarget, setDayTarget] = useState<MasterDayView | null>(null);
  /* The ticks live here, beside the cards they are on, and the tools read them from here. One day at a
     time, because a bulk edit is one write to one document — ticking a period of another day starts a
     new pick rather than quietly spanning two. */
  const [picked, setPicked] = useState<BulkPicked>({ weekday: -1, ids: [] });
  /* Held as a weekday, not as the day object: a restore refreshes the page, and the drawer must then show
     the day's new memory rather than the copy it was opened with. */
  const [historyWeekday, setHistoryWeekday] = useState<number | null>(null);
  const historyDay =
    historyWeekday === null
      ? null
      : props.days.find((day) => day.weekday === historyWeekday) || null;

  const toggle = (weekday: number, id: string, on: boolean): void =>
    setPicked((current) => {
      if (current.weekday !== weekday)
        return on ? { weekday, ids: [id] } : { weekday: -1, ids: [] };
      const ids = on
        ? [...new Set([...current.ids, id])]
        : current.ids.filter((value) => value !== id);
      return ids.length ? { weekday, ids } : { weekday: -1, ids: [] };
    });
  const pickAll = (day: MasterDayView): void =>
    setPicked({
      weekday: day.weekday,
      ids: day.periods.map((period) => period.id),
    });
  const clearPicks = (): void => setPicked({ weekday: -1, ids: [] });
  const subjectOf = (period: PeriodView): string => period.subjectBn;
  const nameOf = (period: PeriodView): string =>
    t("period.summary", {
      time: rangeWord(period.start, period.end, props.digits),
      subject: subjectOf(period),
    });

  return (
    <>
      <div className="rm-board">
        {props.clashes.length > 0 && (
          <div className="rm-warn rm-warn-week" role="status" data-clash-banner>
            <div className="rm-warn-head">
              <AlertTriangle size={18} aria-hidden="true" />
              <strong>
                {t("clashes.weekBanner", {
                  count: formatNumber(props.clashes.length, props.digits),
                })}
              </strong>
            </div>
            <p className="rm-help">{t("clashes.bannerHelp")}</p>
            <ul>
              {props.clashes.map((clash, index) => (
                <li
                  key={`${clash.kind}${clash.weekday}${clash.start}${index}`}
                  data-clash-line={clash.kind}>
                  <b>{props.weekdays[clash.weekday]}</b> ·{" "}
                  {sentence(clash, props.digits)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {props.canEdit && (
          <RoutineTools
            classId={props.classId}
            shift={props.shift}
            classes={props.classes}
            shifts={props.shifts}
            weekdays={props.weekdays}
            teachers={props.teachers}
            rooms={props.rooms}
            digits={props.digits}
            today={props.today}
            until={props.until}
            picked={picked}
            onClear={clearPicks}
          />
        )}

        <div className="rm-week" data-routine-week>
          {props.days.map((day) => {
            const totals = dayTotals(
              day.periods.map((period) => ({
                weekday: day.weekday,
                start: period.start,
                end: period.end,
                teacher: period.teacherId,
                room: period.room,
              })),
            );
            return (
              <section
                className={`rm-day${day.active ? "" : " rm-day-inactive"}${day.dayType === "off" ? " rm-day-weekoff" : ""}`}
                data-day-type-now={day.dayType}
                key={day.weekday}
                data-routine-day={day.weekday}>
                <header className="rm-day-head">
                  <div className="rm-day-title">
                    <h2 data-routine-weekday={day.weekday}>
                      {props.weekdays[day.weekday]}
                    </h2>
                    {!day.active && (
                      <span className="rm-badge rm-badge-off" data-day-off>
                        {t("master.dayOff")}
                      </span>
                    )}
                    {day.dayType !== "class" && (
                      <span
                        className={`rm-badge rm-badge-${day.dayType === "off" ? "weekoff" : "exam"}`}
                        data-day-type-badge={day.dayType}>
                        {t(`day.type.${day.dayType}`)}
                      </span>
                    )}
                  </div>

                  <div className="rm-day-meta">
                    <span className="rm-meta" data-routine-day-count>
                      <Layers size={14} aria-hidden="true" />
                      {t("master.periodCount", {
                        count: formatNumber(day.periods.length, props.digits),
                      })}
                      {totals.minutes > 0
                        ? ` · ${t("master.minutes", { minutes: formatNumber(totals.minutes, props.digits) })}`
                        : ""}
                    </span>
                    {/* Which shift this day belongs to: the board is one class in one shift, and a card
                        that does not say so leaves an operator guessing whether they are looking at the
                        morning or the evening half of a class. */}
                    <span className="rm-meta" data-day-shift={day.weekday}>
                      <Clock size={14} aria-hidden="true" />
                      {t("master.shiftWord", {
                        shift: day.shift || props.shift || t("master.noShift"),
                      })}
                    </span>
                  </div>

                  <div className="rm-day-actions">
                    {props.canEdit && day.periods.length > 0 && (
                      <button
                        type="button"
                        className="rm-btn rm-btn-ghost rm-btn-sm"
                        data-bulk-all={day.weekday}
                        onClick={() => pickAll(day)}>
                        <ListChecks size={15} aria-hidden="true" />
                        {t("bulk.pickAll")}
                      </button>
                    )}
                    {props.canEdit && day.id && (
                      <button
                        type="button"
                        className="rm-btn rm-btn-ghost rm-btn-sm"
                        data-day-edit={day.weekday}
                        onClick={() => setDayTarget(day)}>
                        <Pencil size={15} aria-hidden="true" />
                        {t("common.edit")}
                      </button>
                    )}
                    {day.id && (
                      <button
                        type="button"
                        className="rm-btn rm-btn-ghost rm-btn-sm"
                        data-history-open={day.weekday}
                        onClick={() => setHistoryWeekday(day.weekday)}>
                        <HistoryIcon size={15} aria-hidden="true" />
                        {t("history.open")}
                      </button>
                    )}
                    {day.id && (
                      <div className="rm-day-controls">
                        <RowControls
                          kind="masterRoutine"
                          id={day.id}
                          name={`${props.className} · ${props.weekdays[day.weekday]}`}
                          canDelete={props.canDelete}
                          canArchive
                          onDone={() => router.refresh()}
                        />
                      </div>
                    )}
                  </div>
                  {props.canEdit && (
                    <DayTypeControl
                      classId={props.classId}
                      shift={props.shift}
                      day={day}
                      onDone={() => router.refresh()}
                    />
                  )}
                  {day.dayType !== "class" && (
                    <p className="rm-daytype-help" data-day-type-help>
                      {t(`day.type.${day.dayType}Help`)}
                    </p>
                  )}
                </header>

                {day.periods.length === 0 ? (
                  <div className="rm-day-empty" data-routine-empty-day>
                    <CalendarClock size={22} aria-hidden="true" />
                    <p>{t("master.noPeriods")}</p>
                  </div>
                ) : (
                  <ul className="rm-periods">
                    {day.periods.map((period) => (
                      <li
                        className="rm-period"
                        key={period.id}
                        data-period-card={period.id}>
                        {props.canEdit && (
                          <label className="rm-pick">
                            <input
                              type="checkbox"
                              data-bulk-select={period.id}
                              checked={
                                picked.weekday === day.weekday &&
                                picked.ids.includes(period.id)
                              }
                              onChange={(event) =>
                                toggle(
                                  day.weekday,
                                  period.id,
                                  event.target.checked,
                                )
                              }
                            />
                            <span className="rm-pick-word">
                              {t("bulk.pick")}
                            </span>
                          </label>
                        )}

                        <span className="rm-time" data-period-time>
                          {rangeWord(period.start, period.end, props.digits)}
                        </span>

                        <div className="rm-what">
                          <strong data-period-subject>
                            {subjectOf(period)}
                          </strong>
                          <span
                            className={`rm-line${period.teacherName ? "" : " rm-dim"}`}>
                            <User size={14} aria-hidden="true" />
                            <span data-period-teacher>
                              {period.teacherName || t("master.noTeacher")}
                            </span>
                          </span>
                          {period.room ? (
                            <span className="rm-line">
                              <DoorOpen size={14} aria-hidden="true" />
                              <span data-period-room>
                                {t("master.roomWord", { room: period.room })}
                              </span>
                            </span>
                          ) : (
                            /* A room nobody wrote is said out loud rather than left blank: a period with
                               no room is a question the owner has to answer before the day runs.
                               `[data-period-room]` stays the room that was written, so a count of rooms is
                               still a count of rooms. */
                            <span className="rm-line rm-dim">
                              <DoorOpen size={14} aria-hidden="true" />
                              <span data-period-room-none>
                                {t("master.noRoom")}
                              </span>
                            </span>
                          )}
                          {(period.jointWith || period.note) && (
                            <span className="rm-tags">
                              {period.jointWith && (
                                <span
                                  className="rm-badge rm-badge-joint"
                                  data-period-joint>
                                  <Link2 size={12} aria-hidden="true" />
                                  {t("master.joint")}
                                </span>
                              )}
                              {period.note && (
                                <span
                                  className="rm-note-inline"
                                  data-period-note>
                                  {period.note}
                                </span>
                              )}
                            </span>
                          )}
                        </div>

                        <div className="rm-period-actions">
                          {props.canEdit && (
                            <button
                              type="button"
                              className="rm-btn rm-btn-soft rm-btn-sm"
                              data-period-edit={period.id}
                              onClick={() =>
                                setPeriodTarget({
                                  weekday: day.weekday,
                                  period,
                                })
                              }>
                              <Pencil size={14} aria-hidden="true" />
                              {t("common.edit")}
                            </button>
                          )}
                          <details
                            className="rm-more"
                            data-period-more={period.id}>
                            <summary
                              className="rm-btn rm-btn-ghost rm-btn-sm rm-btn-icon"
                              aria-label={t("common.more")}>
                              <MoreHorizontal size={16} aria-hidden="true" />
                              <span className="rm-sr">{t("common.more")}</span>
                            </summary>
                            <div className="rm-more-body">
                              {props.canEdit && (
                                <PeriodDeleteControl
                                  classId={props.classId}
                                  shift={props.shift}
                                  periodId={period.id}
                                  name={nameOf(period)}
                                />
                              )}
                              {period.jointWith && (
                                <span className="rm-help">
                                  {t("master.joint")}
                                </span>
                              )}
                            </div>
                          </details>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {day.binned > 0 && (
                  <p className="rm-binned" data-binned-count>
                    <Trash2 size={13} aria-hidden="true" />
                    {t("master.binned", {
                      count: formatNumber(day.binned, props.digits),
                    })}
                  </p>
                )}

                {/* A weekly day off takes no new class: the add buttons are not offered, and the engine
                    refuses the same write if a form posts past the screen. Existing periods stay on the
                    card and stay editable — marking a day off keeps what was written on it. */}
                {props.canEdit && day.dayType !== "off" && (
                  <div className="rm-day-add">
                    {/* The primary way in is the chain, on every day of the week — a day with nothing on
                        it included, because "the next period" of an empty day is its first one. It starts
                        when this day's last period ends, runs the length the chips are on, and is
                        numbered one past the day's highest. */}
                    <button
                      type="button"
                      className="rm-btn rm-btn-primary"
                      data-add-next={day.weekday}
                      title={t("master.nextHelp")}
                      onClick={() =>
                        setPeriodTarget({
                          weekday: day.weekday,
                          period: null,
                          seed: nextPeriodSeed(
                            day.periods.map((period) => ({
                              start: period.start,
                              end: period.end,
                              order: period.order,
                            })),
                            chainMinutes,
                          ),
                        })
                      }>
                      <Plus size={16} aria-hidden="true" />
                      {t("master.addNext")}
                    </button>
                    {/* The plain button stays on every day — it is the one a suite counts, and the way in
                        for an operator who wants to choose the time rather than be given it. */}
                    <button
                      type="button"
                      className="rm-btn rm-btn-ghost"
                      data-add-period={day.weekday}
                      onClick={() =>
                        setPeriodTarget({ weekday: day.weekday, period: null })
                      }>
                      <Plus size={16} aria-hidden="true" />
                      {t("master.addPeriod")}
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {/* The drawers live outside every card: a `<dialog>` inside a `<details>` in a scrolling column is a
          dialog that opens clipped, and a nested form is a form that does not submit. They sit outside
          `.rm-board` too, so their wrappers never add a gap to the page's grid. */}
      {/* The drawer is re-keyed on the seed as well, because "+ the next period" on a day whose drawer was
          already open this session has to arrive as a fresh draft and not as the one last typed. */}
      <div
        key={
          periodTarget
            ? `${periodTarget.weekday}:${
                periodTarget.period?.id ||
                `new:${periodTarget.seed ? `${periodTarget.seed.start}-${periodTarget.seed.order}` : "plain"}`
              }`
            : "closed"
        }>
        <MasterPeriodDrawer
          target={periodTarget}
          onClose={() => setPeriodTarget(null)}
          props={props}
          onDuration={(minutes) => {
            if (minutes) setChainMinutes(minutes);
          }}
        />
      </div>
      <div key={dayTarget ? `day:${dayTarget.weekday}` : "day:closed"}>
        <MasterDayDrawer
          day={dayTarget}
          onClose={() => setDayTarget(null)}
          props={props}
        />
      </div>
      <div
        key={
          historyWeekday === null
            ? "history:closed"
            : `history:${historyWeekday}`
        }>
        <RoutineHistory
          open={!!historyDay}
          onClose={() => setHistoryWeekday(null)}
          kind="master"
          docId={historyDay?.id || ""}
          entries={historyDay?.history || []}
          weekdays={props.weekdays}
          digits={props.digits}
          canEdit={props.canEdit}
          onDone={() => router.refresh()}
        />
      </div>
    </>
  );
}
