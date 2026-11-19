import { Link } from "@/i18n/navigation";
import {
  formatClass,
  formatDate,
  formatNumber,
  type Digits,
} from "@/lib/admin/format";
import {
  followUpBadge,
  rowView,
  statusBadge,
  statusLabel,
} from "@/lib/leads/lead-ui";
import { followUpBoard } from "@/lib/leads/leads";
import { ArrowRight, CheckCircle2, MessageCircle, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LeadDetailDrawer, LeadRowControls } from "./leads-ui";
/** First letter of the name for the avatar; Array.from keeps Bangla characters whole. */
const initial = (name: string) => Array.from((name || "").trim())[0] ?? "?";

/**
 * "Today's follow-ups" on the Overview (R3 wave B).
 *
 * The overdue count is its own number and never folded into today's: a parent nobody called three days
 * ago is a different problem from one due now, and hiding it inside a total is how a promise gets broken
 * twice. The board comes from `followUpBoard()` in the rule layer — one range query over an ISO day in
 * Asia/Dhaka, oldest promise first — so this widget, the Visitors list and the daily cron job cannot
 * disagree about what "today" means.
 *
 * Rows carry the same controls as the list (dial, WhatsApp, status, the five follow-up buttons, the
 * drawer), because the point of the widget is to work the queue from here, not to be a summary of it.
 */
export async function LeadFollowUps({
  digits = "bn",
  language = "bn",
  limit = 6,
}: {
  digits?: Digits;
  language?: "bn" | "en";
  limit?: number;
}) {
  const [t, board] = await Promise.all([
    getTranslations("leads"),
    followUpBoard(new Date(), limit),
  ]);
  return (
    <section className="lf" aria-labelledby="lf-title">
      <div className="lf-head">
        <div className="lf-head-text">
          <h2 id="lf-title">{t("followUpsTitle")}</h2>
          <p>{t("followUpsDesc")}</p>
        </div>
        <Link className="lf-link" href="/admin/leads?followUp=today">
          {t("viewAll")}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className="lf-summary">
        <span className="admin-badge pending">
          {t("todayBadge", { n: formatNumber(board.today, digits) })}
        </span>
        <span className={`admin-badge ${board.overdue ? "rejected" : ""}`}>
          {t("overdueBadge", { n: formatNumber(board.overdue, digits) })}
        </span>
      </div>
      {board.rows.length ? (
        <ul className="lf-list">
          {board.rows.map((row) => {
            const view = rowView(row);
            const classText = row.classGroup
              ? formatClass(row.classGroup, digits, language, t("colClass"))
              : row.classLabel || "";
            const meta = [row.leadId, classText].filter(Boolean).join(" · ");
            return (
              <li
                key={row.id}
                className="lf-row"
                data-followup={followUpBadge(row.followUp)}>
                <div className="lf-who">
                  <span className="lf-avatar" aria-hidden="true">
                    {initial(row.studentName)}
                  </span>
                  <div className="lf-who-text">
                    <strong>{row.studentName}</strong>
                    <span>{meta}</span>
                  </div>
                </div>
                <div className="lf-contact">
                  {view.phones.length ? (
                    view.phones.map((phone, index) => (
                      <span key={index} className="list-row-actions lf-phone">
                        <span className="admin-badge">{phone.masked}</span>
                        <a className="admin-mini-button" href={phone.tel}>
                          <Phone size={15} aria-hidden="true" />
                          {t("call")}
                        </a>
                        <a
                          className="admin-mini-button"
                          href={phone.whatsapp}
                          target="_blank"
                          rel="noreferrer">
                          <MessageCircle size={15} aria-hidden="true" />
                          {t("whatsapp")}
                        </a>
                      </span>
                    ))
                  ) : (
                    <span className="lf-muted">{t("noPhone")}</span>
                  )}
                </div>
                <div className="lf-when list-row-actions">
                  {row.nextFollowUp && (
                    <span
                      className={`admin-badge ${followUpBadge(row.followUp)}`}>
                      {formatDate(row.nextFollowUp, digits, language)}
                    </span>
                  )}
                  <span className={`admin-badge ${statusBadge(row.status)}`}>
                    {statusLabel(t, row.status)}
                  </span>
                </div>
                <div className="lf-controls lead-row">
                  <div className="list-row-actions">
                    <LeadDetailDrawer
                      seed={view}
                      language={language}
                      digits={digits}
                    />
                  </div>
                  <LeadRowControls row={view} language={language} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="lf-empty">
          <CheckCircle2 size={30} aria-hidden="true" />
          <p>{t("noneDue")}</p>
        </div>
      )}
    </section>
  );
}
