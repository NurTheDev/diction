import { Pagination } from "@/components/admin/pagination";
import { Link } from "@/i18n/navigation";
import { feeStatus, money } from "@/lib/fees";
import { Student } from "@/models/Academic";
import { FeeInvoice } from "@/models/Fees";
import { User } from "@/models/User";
import { ChevronRight, Info } from "lucide-react";
import type { Types } from "mongoose";
import { getTranslations } from "next-intl/server";
import { FeeInvoiceForm } from "./fee-forms";

type FeeRole = "admin" | "student" | "parent";

const PAGE_SIZE = 20;
const initial = (name: string) => Array.from(name.trim())[0] ?? "?";
const badgeFor = (status: string) =>
  status === "paid" ? "enabled" : status === "voided" ? "disabled" : "pending";

export async function FeeList({
  role,
  userId,
  locale,
  page,
}: {
  role: FeeRole;
  userId: string;
  locale: string;
  page: number;
}) {
  const [t, ids] = await Promise.all([
    getTranslations("fees"),
    role === "admin"
      ? Promise.resolve([] as Types.ObjectId[])
      : Student.find(role === "student" ? { user: userId } : { parent: userId })
          .select("_id")
          .limit(role === "student" ? 1 : 50)
          .lean()
          .then((rows) => rows.map((s) => s._id)),
  ]);
  const filter = role === "admin" ? {} : { student: { $in: ids } };
  const [total, invoices, studentOptions, totals] = await Promise.all([
    FeeInvoice.countDocuments(filter),
    FeeInvoice.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    role === "admin"
      ? Student.find()
          .sort({ createdAt: -1 })
          .select("user grade")
          .limit(1000)
          .lean()
      : Promise.resolve([]),
    /* Whole-filter totals (voided invoices excluded), not just this page: a page-sized sum would mislead. */
    FeeInvoice.aggregate<{ _id: null; billed: number; paid: number }>([
      { $match: { ...filter, voided: { $ne: true } } },
      {
        $group: {
          _id: null,
          billed: { $sum: "$amountMinor" },
          paid: { $sum: "$paidMinor" },
        },
      },
    ]),
  ]);
  const billed = totals[0]?.billed ?? 0,
    collected = totals[0]?.paid ?? 0,
    outstanding = Math.max(billed - collected, 0);

  const profileIds = [...new Set(invoices.map((i) => String(i.student)))];
  const invoiceProfiles = await Student.find({ _id: { $in: profileIds } })
    .select("user")
    .lean();
  const userIds = [
    ...invoiceProfiles.map((s) => s.user),
    ...studentOptions.map((s) => s.user),
  ];
  const users = await User.find({ _id: { $in: userIds } })
    .select("name email active role")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const profileMap = new Map(
    invoiceProfiles.map((p) => [
      String(p._id),
      userMap.get(String(p.user))?.name || "—",
    ]),
  );
  const students = studentOptions.flatMap((s) => {
    const u = userMap.get(String(s.user));
    return u?.role === "student" && u.active
      ? [
          {
            id: String(s._id),
            name: `${u.name} (${u.email || "—"}) · ${t("class")} ${s.grade}`,
          },
        ]
      : [];
  });
  const path =
    role === "admin"
      ? "/admin/fees"
      : role === "parent"
        ? "/parent/fees"
        : "/dashboard/fees";
  const lang = locale === "bn" ? "bn" : "en";
  return (
    <div className={role === "admin" ? "fee-page" : "fee-page plain wrap"}>
      <header className="fee-heading">
        <span className="fee-tag">✦ {t("section")}</span>
        <h1>{t("title")}</h1>
        <p>{t("description")}</p>
      </header>

      <div className="fee-notice">
        <Info size={18} aria-hidden="true" />
        <span>{t("notice")}</span>
      </div>

      <div className="fee-stats">
        <div className="fee-stat" data-tone="blue">
          <span>{t("amount")}</span>
          <strong>{money(billed, locale)}</strong>
        </div>
        <div className="fee-stat" data-tone="green">
          <span>{t("paid")}</span>
          <strong>{money(collected, locale)}</strong>
        </div>
        <div className="fee-stat" data-tone={outstanding > 0 ? "red" : "green"}>
          <span>{t("balance")}</span>
          <strong>{money(outstanding, locale)}</strong>
        </div>
      </div>

      {role === "admin" && (
        <section className="fee-panel">
          <div className="fee-panel-head">
            <h2>{t("createTitle")}</h2>
          </div>
          <div className="fee-panel-body">
            <FeeInvoiceForm students={students} />
          </div>
        </section>
      )}

      <section className="fee-panel">
        <div className="fee-panel-head">
          <h2>{t("invoices")}</h2>
        </div>
        {invoices.length ? (
          <div className="fee-table-wrap">
            <table className="fee-table">
              <thead>
                <tr>
                  <th>{t("invoice")}</th>
                  {role !== "student" && <th>{t("student")}</th>}
                  <th className="fee-num">{t("amount")}</th>
                  <th className="fee-num">{t("paid")}</th>
                  <th className="fee-num">{t("balance")}</th>
                  <th>{t("dueDate")}</th>
                  <th>{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => {
                  const status = feeStatus(i);
                  const owed = i.voided ? 0 : i.amountMinor - i.paidMinor;
                  const pct = i.amountMinor
                    ? Math.min(
                        100,
                        Math.round((i.paidMinor / i.amountMinor) * 100),
                      )
                    : 0;
                  const name = profileMap.get(String(i.student)) || "—";
                  return (
                    <tr key={String(i._id)}>
                      <td data-label={t("invoice")} className="fee-cell-main">
                        <Link
                          className="fee-invoice-link"
                          href={`${path}/${i._id}`}>
                          {i.title[lang]}
                          <ChevronRight size={16} aria-hidden="true" />
                        </Link>
                      </td>
                      {role !== "student" && (
                        <td data-label={t("student")}>
                          <span className="fee-student">
                            <span className="fee-avatar" aria-hidden="true">
                              {initial(name)}
                            </span>
                            {name}
                          </span>
                        </td>
                      )}
                      <td data-label={t("amount")} className="fee-num">
                        {money(i.amountMinor, locale)}
                      </td>
                      <td data-label={t("paid")} className="fee-num">
                        {money(i.paidMinor, locale)}
                        {!i.voided && (
                          <span className="fee-meter" aria-hidden="true">
                            <span style={{ width: `${pct}%` }} />
                          </span>
                        )}
                      </td>
                      <td
                        data-label={t("balance")}
                        className="fee-num"
                        data-owed={owed > 0 || undefined}>
                        {i.voided ? "—" : money(owed, locale)}
                      </td>
                      <td data-label={t("dueDate")}>{i.dueDate}</td>
                      <td data-label={t("status")}>
                        <span className={`admin-badge ${badgeFor(status)}`}>
                          {t(status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="fee-empty">{t("empty")}</p>
        )}
        <Pagination
          path={path}
          page={page}
          totalPages={Math.ceil(total / PAGE_SIZE)}
        />
      </section>
    </div>
  );
}
