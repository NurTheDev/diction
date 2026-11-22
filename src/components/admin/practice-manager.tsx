"use client";

import { parsePracticeCsv } from "@/lib/practice-csv";
import {
  practiceTestSchema,
  type PracticeQuestion,
} from "@/schemas/practice-test";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { DeleteRow } from "./delete-row";

type Item = {
  id: string;
  slug: string;
  title: string;
  subject: string;
  grade: string;
  published: boolean;
};

const empty = (): PracticeQuestion => ({
  prompt: "",
  options: ["", "", "", ""],
  correct: 0,
  explanation: "",
});

export function PracticeManager({ canDelete = true }: { canDelete?: boolean }) {
  const locale = useLocale(),
    t = useTranslations("practice");
  const [questions, setQuestions] = useState<PracticeQuestion[]>([empty()]),
    [items, setItems] = useState<Item[]>([]),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/practice-tests", { cache: "no-store" });
      if (!r.ok) throw Error();
      setItems((await r.json()).items);
    } catch {
      setMsg(t("loadError"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update(i: number, patch: Partial<PracticeQuestion>) {
    setQuestions((q) => q.map((x, j) => (i === j ? { ...x, ...patch } : x)));
  }

  async function importCsv(file?: File) {
    if (!file) return;
    if (file.size > 256000) {
      setMsg(t("msg.csvTooLarge"));
      return;
    }
    try {
      const q = parsePracticeCsv(await file.text());
      setQuestions(q);
      setMsg(t("msg.csvLoaded"));
    } catch {
      setMsg(t("msg.csvFailed"));
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form),
      v = practiceTestSchema.safeParse({
        title: d.get("title"),
        subject: d.get("subject"),
        grade: d.get("grade"),
        questions,
      });
    if (!v.success) {
      setMsg(t("msg.incomplete"));
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/practice-tests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(v.data),
      });
      if (!r.ok) throw Error();
      form.reset();
      setQuestions([empty()]);
      await load();
      setMsg(t("msg.draftSaved"));
    } catch {
      setMsg(t("msg.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function change(i: Item) {
    if (!confirm(i.published ? t("confirm.withdraw") : t("confirm.publish")))
      return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/practice-tests/${i.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ published: !i.published }),
      });
      if (!r.ok) throw Error();
      await load();
      setMsg(t("msg.changeSaved"));
    } catch {
      setMsg(t("msg.changeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pm">
      <header className="pm-head">
        <h1 className="pm-title">{t("practice.title")}</h1>
        <p className="pm-lead">{t("practice.notice")}</p>
      </header>

      <details className="pm-csv">
        <summary>{t("practice.csvFormat")}</summary>
        <div className="pm-csv-body">
          <p>{t("practice.csvRules")}</p>
          <code>
            question,option1,option2,option3,option4,correct,explanation
          </code>
          <p>
            <a href="/templates/practice-questions.csv" download>
              {t("practice.csvTemplate")}
            </a>
          </p>
          <p>{t("practice.csvQuote")}</p>
        </div>
      </details>

      <form className="pm-form" data-busy={busy} onSubmit={save}>
        <div className="pm-card pm-basics">
          <label className="pm-field pm-field-wide">
            <span>{t("form.title")}</span>
            <input name="title" maxLength={160} required />
          </label>
          <label className="pm-field">
            <span>{t("form.subject")}</span>
            <input name="subject" maxLength={80} required />
          </label>
          <label className="pm-field">
            <span>{t("form.grade")}</span>
            <input name="grade" maxLength={80} />
          </label>
          <label className="pm-field pm-field-wide">
            <span>{t("form.importCsv")}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                void importCsv(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        {questions.map((q, i) => (
          <fieldset className="pm-question" key={i}>
            <legend>
              <span className="pm-qnum">
                <b>{i + 1}</b>
                {t("form.question")} {i + 1}
              </span>
            </legend>

            <label className="pm-field">
              <span>{t("form.question")}</span>
              <textarea
                required
                maxLength={1000}
                value={q.prompt}
                onChange={(e) => update(i, { prompt: e.target.value })}
              />
            </label>

            <div className="pm-opts">
              {q.options.map((o, j) => (
                <label
                  className="pm-field pm-opt"
                  data-correct={q.correct === j}
                  key={j}>
                  <span>
                    {t("form.option")} {j + 1}
                  </span>
                  <input
                    required
                    maxLength={250}
                    value={o}
                    onChange={(e) =>
                      update(i, {
                        options: q.options.map((x, k) =>
                          k === j ? e.target.value : x,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>

            <div className="pm-qtail">
              <label className="pm-field">
                <span>{t("form.correct")}</span>
                <select
                  value={q.correct}
                  onChange={(e) =>
                    update(i, { correct: Number(e.target.value) })
                  }>
                  {q.options.map((_, j) => (
                    <option key={j} value={j}>
                      {j + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pm-field">
                <span>{t("form.explanation")}</span>
                <textarea
                  maxLength={2000}
                  value={q.explanation}
                  onChange={(e) => update(i, { explanation: e.target.value })}
                />
              </label>
            </div>

            {questions.length > 1 && (
              <button
                type="button"
                className="pm-btn pm-btn-danger pm-remove"
                onClick={() =>
                  setQuestions((q) => q.filter((_, j) => j !== i))
                }>
                {t("form.removeQuestion")}
              </button>
            )}
          </fieldset>
        ))}

        <div className="pm-actions">
          <span className="pm-qcount">{questions.length}/30</span>
          <button
            type="button"
            className="pm-btn pm-btn-ghost"
            disabled={questions.length >= 30}
            onClick={() => setQuestions((q) => [...q, empty()])}>
            {t("form.addQuestion")}
          </button>
          <button
            type="submit"
            className="pm-btn pm-btn-primary"
            disabled={busy}>
            {t("form.saveDraft")}
          </button>
        </div>
      </form>

      <p className="pm-msg" role="status">
        {msg}
      </p>

      <h2 className="pm-listhead">
        {t("practice.savedHeading")}
        <span className="pm-count">{items.length}</span>
      </h2>

      <div className="pm-list">
        {items.map((i) => (
          <article className="pm-item" data-published={i.published} key={i.id}>
            <div className="pm-item-main">
              <strong className="pm-item-title">{i.title}</strong>
              <div className="pm-meta">
                {i.subject && <span className="pm-tag">{i.subject}</span>}
                {i.grade && <span className="pm-tag">{i.grade}</span>}
                <span
                  className={`pm-tag ${i.published ? "pm-tag-on" : "pm-tag-off"}`}>
                  {i.published ? t("state.published") : t("state.draft")}
                </span>
              </div>
              {i.published && (
                <a
                  className="pm-view"
                  href={`/${locale}/practice-tests/${i.slug}`}
                  target="_blank"
                  rel="noopener noreferrer">
                  {t("practice.viewTest")}
                </a>
              )}
            </div>
            <div className="pm-item-actions">
              <button
                type="button"
                className="pm-btn pm-btn-ghost pm-btn-sm"
                disabled={busy}
                onClick={() => void change(i)}>
                {i.published ? t("practice.withdraw") : t("practice.publish")}
              </button>
              {canDelete && (
                <DeleteRow
                  kind="practiceTest"
                  id={i.id}
                  name={i.title}
                  canArchive={canDelete}
                  onDone={load}
                />
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
