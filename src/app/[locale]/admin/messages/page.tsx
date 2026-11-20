import { DeleteRow } from "@/components/admin/delete-row";
import { requireArchiverPage } from "@/lib/admin/guard";
import { getTranslations } from "next-intl/server";

import { MessageToggle } from "@/components/admin/forms";
import { Pagination } from "@/components/admin/pagination";
import { formatDate, pageNumber, regexEscape } from "@/lib/admin/helpers";
import { ContactMessage } from "@/models/Intake";

export default async function Messages({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const viewer = await requireArchiverPage(),
    canDelete = viewer.role === "admin" || viewer.role === "superadmin";
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations("admin");
  const page = pageNumber(query.page);
  const q = (query.q || "").trim().slice(0, 80);
  const status = ["read", "unread"].includes(query.status || "")
    ? query.status
    : "";
  const filter: Record<string, unknown> = {};
  if (status) filter.read = status === "read";
  if (q) {
    const re = new RegExp(regexEscape(q), "i");
    filter.$or = [
      { name: re },
      { reference: re },
      { phone: re },
      { email: re },
    ];
  }
  const [total, messages] = await Promise.all([
    ContactMessage.countDocuments(filter),
    ContactMessage.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * 20)
      .limit(20)
      .lean(),
  ]);
  return (
    <div className="msg">
      <header className="msg-head">
        <span className="msg-eyebrow">{t("workspace")}</span>
        <h1>{t("messages")}</h1>
        <p>{t("messageDesc")}</p>
      </header>

      <form className="msg-filter">
        <input
          name="q"
          type="search"
          placeholder={t("searchPlaceholder")}
          defaultValue={q}
          aria-label={t("search")}
        />
        <select name="status" defaultValue={status} aria-label={t("filter")}>
          <option value="">{t("all")}</option>
          <option value="read">{t("read")}</option>
          <option value="unread">{t("unread")}</option>
        </select>
        <button type="submit" className="msg-btn">
          {t("apply")}
        </button>
      </form>

      <section className="msg-panel">
        {messages.length ? (
          messages.map((m) => (
            <article
              key={String(m._id)}
              className="msg-item"
              data-read={m.read ? "true" : "false"}>
              <span className="msg-avatar" aria-hidden="true">
                {String(m.name || "").trim().charAt(0).toUpperCase() || "?"}
              </span>

              <div className="msg-main">
                <div className="msg-top">
                  <strong className="msg-name">{m.name}</strong>
                  <span
                    className="msg-badge"
                    data-read={m.read ? "true" : "false"}>
                    {t(m.read ? "read" : "unread")}
                  </span>
                </div>
                <div className="msg-contact">
                  <span className="msg-ref">{m.reference}</span>
                  {m.phone ? (
                    <a href={`tel:${m.phone}`}>{m.phone}</a>
                  ) : (
                    <span>—</span>
                  )}
                  {m.email ? (
                    <a href={`mailto:${m.email}`}>{m.email}</a>
                  ) : (
                    <span>—</span>
                  )}
                </div>
                <p className="msg-body">{m.message}</p>
              </div>

              <time className="msg-time">
                {formatDate(m.createdAt, locale)}
              </time>

              <div className="msg-actions">
                <div className="msg-toggle">
                  <MessageToggle id={String(m._id)} read={m.read} />
                </div>
                {canDelete && (
                  <DeleteRow
                    kind="contactMessage"
                    id={String(m._id)}
                    name={m.name}
                    canArchive={false}
                  />
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="msg-empty">{t("emptyMessages")}</div>
        )}
        <div className="msg-pager">
          <Pagination
            path="/admin/messages"
            page={page}
            totalPages={Math.ceil(total / 20)}
            query={{ q, status: status || "" }}
          />
        </div>
      </section>
    </div>
  );
}
