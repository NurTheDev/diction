import { Pagination } from "@/components/admin/pagination";
import { Link } from "@/i18n/navigation";
import { formatDate, pageNumber } from "@/lib/admin/helpers";
import { feeStatus, money } from "@/lib/fees";
import { dhakaDay } from "@/lib/study-date";
import { Student } from "@/models/Academic";
import { FeeInvoice, FeePayment } from "@/models/Fees";
import { User } from "@/models/User";
import { idSchema } from "@/schemas/admin";
import { ArrowLeft, Info, ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { FeePaymentForm, FeeVoidForm } from "./fee-forms";

type FeeRole = "admin" | "student" | "parent";
const PAGE_SIZE = 20;
const badgeFor = (status: string) =>
  status === "paid" ? "enabled" : status === "voided" ? "disabled" : "pending";

export async function FeeDetail({
  role,
  userId,
  locale,
  id,
  requestedPage,
}: {
  role: FeeRole;
  userId: string;
  locale: string;
  id: string;
  requestedPage?: string;
}) {
  if (!idSchema.safeParse(id).success) notFound();
  const invoice = await FeeInvoice.findById(id).lean();
  if (!invoice) notFound();
  const profile = await Student.findOne({
    _id: invoice.student,
    ...(role === "student"
      ? { user: userId }
      : role === "parent"
        ? { parent: userId }
        : {}),
  })
    .select("user")
    .lean();
  if (!profile) notFound();
  const page = pageNumber(requestedPage);
  const [t, user, count, payments] = await Promise.all([
    getTranslations("fees"),
    User.findById(profile.user).select("name").lean(),
    FeePayment.countDocuments({ invoice: id }),
    FeePayment.find({ invoice: id })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
  ]);
  const path =
    role === "admin"
      ? "/admin/fees"
      : role === "parent"
        ? "/parent/fees"
        : "/dashboard/fees";
  const lang = locale === "bn" ? "bn" : "en";
  const status = feeStatus(invoice);
  const owed = invoice.voided ? 0 : invoice.amountMinor - invoice.paidMinor;
  return (
    <div className={role === "admin" ? "fee-page" : "fee-page plain wrap"}>
      <header className="fee-heading">
        <Link className="fee-back" href={path}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t("back")}
        </Link>
        <h1>{invoice.title[lang]}</h1>
        <p className="fee-subline">
          <span>{user?.name || "—"}</span>
          <span className={`admin-badge ${badgeFor(status)}`}>{t(status)}</span>
        </p>
      </header>

      <div className="fee-notice">
        <Info size={18} aria-hidden="true" />
        <span>{t("notice")}</span>
      </div>

      <section className="fee-panel">
        <div className="fee-panel-head">
          <h2>{t("summary")}</h2>
          {role === "admin" && !invoice.voided && invoice.paidMinor === 0 && (
            <FeeVoidForm id={id} kind="invoice" />
          )}
        </div>
        <div className="fee-panel-body">
          <div className="fee-stats">
            <div className="fee-stat" data-tone="blue">
              <span>{t("amount")}</span>
              <strong>{money(invoice.amountMinor, locale)}</strong>
            </div>
            <div className="fee-stat" data-tone="green">
              <span>{t("paid")}</span>
              <strong>{money(invoice.paidMinor, locale)}</strong>
            </div>
            <div
              className="fee-stat"
              data-tone={invoice.voided ? "grey" : owed > 0 ? "red" : "green"}>
              <span>{t("balance")}</span>
              <strong>{invoice.voided ? "—" : money(owed, locale)}</strong>
            </div>
            <div className="fee-stat" data-tone="grey">
              <span>{t("dueDate")}</span>
              <strong>{invoice.dueDate}</strong>
            </div>
          </div>
          {!invoice.voided && (
            <progress
              className="fee-progress"
              value={Math.min(invoice.paidMinor, invoice.amountMinor)}
              max={invoice.amountMinor || 1}
              aria-label={t("paid")}
            />
          )}
          {invoice.voided && role === "admin" && (
            <div className="fee-alert" role="status">
              <ShieldAlert size={18} aria-hidden="true" />
              <div>
                <strong>{t("reason")}</strong>
                <p>{invoice.voidReason}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {role === "admin" &&
        !invoice.voided &&
        invoice.paidMinor < invoice.amountMinor && (
          <section className="fee-panel">
            <div className="fee-panel-head">
              <h2>{t("recordTitle")}</h2>
            </div>
            <div className="fee-panel-body">
              <FeePaymentForm invoice={id} today={dhakaDay()} />
            </div>
          </section>
        )}

      <section className="fee-panel">
        <div className="fee-panel-head">
          <h2>{t("history")}</h2>
        </div>
        {payments.length ? (
          <div className="fee-table-wrap">
            <table className="fee-table">
              <thead>
                <tr>
                  <th>{t("paidDate")}</th>
                  <th className="fee-num">{t("amount")}</th>
                  <th>{t("method")}</th>
                  <th>{t("status")}</th>
                  {role === "admin" && (
                    <>
                      <th>{t("reference")}</th>
                      <th>{t("actions")}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={String(p._id)} data-voided={p.voided || undefined}>
                    <td data-label={t("paidDate")}>{p.paidDate}</td>
                    <td data-label={t("amount")} className="fee-num">
                      {money(p.amountMinor, locale)}
                    </td>
                    <td data-label={t("method")}>{t(p.method)}</td>
                    <td data-label={t("status")}>
                      <span
                        className={`admin-badge ${p.voided ? "disabled" : "enabled"}`}>
                        {t(p.voided ? "voided" : "recorded")}
                      </span>
                      {role === "admin" && p.voided && (
                        <div className="fee-void-note">
                          {t("reason")}: {p.voidReason} ·{" "}
                          {p.voidedAt ? formatDate(p.voidedAt, locale) : "—"}
                        </div>
                      )}
                    </td>
                    {role === "admin" && (
                      <>
                        <td data-label={t("reference")}>
                          {p.reference || "—"}
                        </td>
                        <td data-label={t("actions")}>
                          {!p.voided && !invoice.voided && (
                            <FeeVoidForm id={String(p._id)} kind="payment" />
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="fee-empty">{t("noPayments")}</p>
        )}
        <Pagination
          path={`${path}/${id}`}
          page={page}
          totalPages={Math.ceil(count / PAGE_SIZE)}
        />
      </section>
    </div>
  );
}
