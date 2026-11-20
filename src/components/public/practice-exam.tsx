"use client";
import {
  BookOpenCheck,
  Check,
  CircleHelp,
  History,
  Info,
  Loader2,
  Minus,
  RotateCcw,
  Save,
  Send,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type Question = { prompt: string; options: string[] };
type Feedback = Question & {
  correct: number;
  selected: number;
  explanation: string;
};
type Result = {
  score: number;
  total: number;
  feedback: Feedback[];
  saved: boolean;
};

const lettersBn = ["ক", "খ", "গ", "ঘ", "ঙ", "চ", "ছ", "জ"];
const lettersEn = ["A", "B", "C", "D", "E", "F", "G", "H"];

export function PracticeExam({
  slug,
  title,
  subject,
  grade,
  questions,
}: {
  slug: string;
  title: string;
  subject: string;
  grade: string;
  questions: Question[];
}) {
  const locale = useLocale(),
    t = useTranslations("practicePublic");
  const [answers, setAnswers] = useState(questions.map(() => -1)),
    [save, setSave] = useState(false),
    [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  const letters = locale === "bn" ? lettersBn : lettersEn;
  const nf = new Intl.NumberFormat(locale);
  const answered = answers.filter((v) => v >= 0).length;
  const progress = questions.length
    ? Math.round((answered / questions.length) * 100)
    : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/practice-tests/${slug}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers, save }),
      });
      if (!r.ok) throw Error();
      setResult(await r.json());
    } catch {
      setError(t("exam.resultError"));
    } finally {
      setBusy(false);
    }
  }

  const pct = result
    ? result.total
      ? Math.round((result.score / result.total) * 100)
      : 0
    : 0;
  const tone = pct >= 80 ? "high" : pct >= 50 ? "mid" : "low";

  return (
    <div className="pex">
      <header className="pex-head">
        <div className="pex-head-top">
          <span className="pex-head-icon" aria-hidden="true">
            <BookOpenCheck size={26} />
          </span>
          <h1>{title}</h1>
        </div>
        {(subject || grade) && (
          <div className="pex-chips">
            {subject && <span className="pex-chip">{subject}</span>}
            {grade && (
              <span className="pex-chip" data-kind="grade">
                {grade}
              </span>
            )}
          </div>
        )}
        <p className="pex-notice">
          <Info size={18} aria-hidden="true" />
          <span>{t("exam.notice")}</span>
        </p>
      </header>

      {!result ? (
        <form className="pex-form" onSubmit={submit}>
          <div className="pex-progress" aria-hidden="true">
            <span className="pex-progress-bar">
              <span
                className="pex-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </span>
            <span className="pex-progress-count">
              {nf.format(answered)} / {nf.format(questions.length)}
            </span>
          </div>

          {questions.map((q, i) => (
            <fieldset
              className="pex-q practice-exam-question"
              data-answered={answers[i] >= 0}
              key={i}>
              <legend className="pex-q-legend">
                <span className="pex-q-title">
                  <span className="pex-q-num">{nf.format(i + 1)}</span>
                  <span className="pex-q-text">{q.prompt}</span>
                </span>
              </legend>
              <div className="pex-options">
                {q.options.map((o, j) => (
                  <label className="pex-option" key={j}>
                    <input
                      type="radio"
                      name={`q-${i}`}
                      checked={answers[i] === j}
                      onChange={() =>
                        setAnswers((a) => a.map((v, k) => (k === i ? j : v)))
                      }
                    />
                    <span className="pex-letter" aria-hidden="true">
                      {letters[j] ?? j + 1}
                    </span>
                    <span className="pex-option-text">{o}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div className="pex-submit">
            <label className="pex-consent consent-check">
              <input
                type="checkbox"
                checked={save}
                onChange={(e) => setSave(e.target.checked)}
              />
              <span>{t("exam.saveConsent")}</span>
            </label>
            <p className="pex-hint">{t("exam.saveConsentNote")}</p>
            <button className="pex-btn pex-btn-primary" disabled={busy}>
              {busy ? (
                <Loader2 size={18} className="pex-spin" aria-hidden="true" />
              ) : (
                <Send size={18} aria-hidden="true" />
              )}
              {busy ? t("exam.pleaseWait") : t("exam.submit")}
            </button>
            {error && (
              <p className="pex-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </form>
      ) : (
        <section className="pex-result" aria-live="polite">
          <div
            className="pex-score"
            data-tone={tone}
            style={{ "--pct": pct } as React.CSSProperties}>
            <div className="pex-ring" aria-hidden="true">
              <span className="pex-ring-inner">{nf.format(pct)}%</span>
            </div>
            <div className="pex-score-text">
              <h2>
                {t("exam.resultHeading")}: {result.score} / {result.total}
              </h2>
              <p
                className="pex-saved"
                data-state={result.saved ? "saved" : save ? "failed" : "none"}>
                {result.saved ? (
                  <Save size={16} aria-hidden="true" />
                ) : (
                  <Info size={16} aria-hidden="true" />
                )}
                <span>
                  {result.saved
                    ? t("exam.savedToProfile")
                    : save
                      ? t("exam.saveFailedRequirements")
                      : t("exam.notSaved")}
                </span>
              </p>
            </div>
          </div>

          {result.feedback.map((q, i) => {
            const state =
              q.selected < 0
                ? "skipped"
                : q.selected === q.correct
                  ? "correct"
                  : "wrong";
            return (
              <article
                className="pex-review practice-exam-question"
                data-state={state}
                key={i}>
                <div className="pex-review-head">
                  <span className="pex-review-mark" aria-hidden="true">
                    {state === "correct" ? (
                      <Check size={19} strokeWidth={3} />
                    ) : state === "wrong" ? (
                      <X size={19} strokeWidth={3} />
                    ) : (
                      <Minus size={19} strokeWidth={3} />
                    )}
                  </span>
                  <h3>
                    {i + 1}. {q.prompt}
                  </h3>
                </div>
                <p className="pex-answer" data-kind="yours">
                  <span className="pex-answer-label">
                    {t("exam.yourAnswer")}:
                  </span>
                  <span className="pex-answer-value">
                    {q.selected < 0
                      ? t("exam.notAnswered")
                      : q.options[q.selected]}
                  </span>
                </p>
                <p className="pex-answer" data-kind="correct">
                  <strong>
                    {t("exam.correctAnswer")}: {q.options[q.correct]}
                  </strong>
                </p>
                {q.explanation && (
                  <p className="pex-explain">
                    <span className="pex-explain-label">
                      {t("exam.explanation")}:
                    </span>
                    {q.explanation}
                  </p>
                )}
              </article>
            );
          })}

          <div className="pex-after">
            <p className="pex-hint">
              <CircleHelp size={17} aria-hidden="true" />
              <span>{t("exam.snapshotNote")}</span>
            </p>
            <div className="pex-after-actions">
              <a
                className="pex-btn pex-btn-primary pex-link"
                href={`/${locale}/dashboard/practice-history`}>
                <History size={18} aria-hidden="true" />
                {t("exam.viewSaved")}
              </a>
              <button
                className="pex-btn pex-btn-ghost"
                type="button"
                onClick={() => {
                  setResult(null);
                  setAnswers(questions.map(() => -1));
                }}>
                <RotateCcw size={17} aria-hidden="true" />
                {t("exam.tryAgain")}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
