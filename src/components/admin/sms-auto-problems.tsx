import { SmsProblemRetry } from "@/components/admin/sms-panel";
import { formatNumber, formatTime, type Digits } from "@/lib/admin/format";
import {
  autoSmsProblems,
  autoSmsTriggerLabelKey,
} from "@/lib/center/sms-auto-problems";
import { getLocale, getTranslations } from "next-intl/server";

/**
 * "Automatic SMS problems" (R2 follow-up). The three automatic sends are best-effort on purpose — a
 * message that cannot go out must never turn a saved payment or a published result into an error — so
 * without this card a failure would be a console line nobody reads: the toggle looks on and nothing
 * is ever sent.
 *
 * It renders NOTHING when there is nothing wrong, so a healthy centre never sees it, and it says in
 * so many words that the money and the receipt are safe — that is the operator's first question. The
 * retry itself is `SmsProblemRetry`, a client component, because a paid action needs a pending state.
 */
export async function SmsAutoProblems({ digits = "bn" }: { digits?: Digits }) {
  const { count, items } = await autoSmsProblems();
  if (!count || !items.length) return null;
  const en = (await getLocale().catch(() => "bn")) === "en";
  const ts = await getTranslations("sms");
  const last = items[0];
  const language = en ? "en" : "bn";
  return (
    <section className="smx-sec smx-problems" data-sms-problems="">
      <div className="smx-sec-head">
        <h2>{ts("problemsPanel.title")}</h2>
        <span className="smx-badge smx-badge-bad" data-sms-problem-count="">
          {formatNumber(count, digits)}
        </span>
      </div>
      <div className="smx-sec-body">
        <p className="smx-alert" role="status" data-sms-problem-last="">
          {en ? last.messageEn : last.messageBn}
          {last.who ? ` — ${last.who}` : ""}
        </p>
        <p className="smx-help">{ts("problemsPanel.help")}</p>
        <ul className="smx-problem-list">
          {items.map((item) => {
            const label = autoSmsTriggerLabelKey(item.trigger);
            return (
              <li key={item.id} data-sms-problem="">
                <strong>{ts(label)}</strong>
                {item.who ? <span className="smx-who">{item.who}</span> : null}
                <span className="smx-help">
                  {en ? item.messageEn : item.messageBn}
                </span>
                {item.attempts > 1 ? (
                  <span className="smx-help">
                    {ts("problemsPanel.attempts", {
                      count: formatNumber(item.attempts, digits),
                    })}
                    {" · "}
                    {formatTime(item.lastAttemptAt, digits, language)}
                  </span>
                ) : (
                  <span className="smx-help">
                    {formatTime(item.lastAttemptAt, digits, language)}
                  </span>
                )}
                <SmsProblemRetry
                  locale={language}
                  problemId={item.id}
                  attempts={item.attempts}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
