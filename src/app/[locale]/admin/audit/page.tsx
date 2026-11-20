import { Pagination } from "@/components/admin/pagination";
import { getAdmin } from "@/lib/admin/guard";
import { formatDate, pageNumber } from "@/lib/admin/helpers";
import { AdminAudit } from "@/models/AdminAudit";
import { User } from "@/models/User";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function verbTone(code: string) {
  const verb = code.split(".").pop() ?? "";
  if (/delete|remove|purge|archive|withdraw|reject|cancel/i.test(verb))
    return "danger";
  if (/create|add|new|enrol|admit|publish|filled|send|sent/i.test(verb))
    return "success";
  if (/update|save|edit|change|follow|resend|mark|read/i.test(verb))
    return "info";
  return "neutral";
}

export default async function Audit({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const admin = await getAdmin();
  if (admin?.role !== "superadmin") redirect(`/${locale}/admin`);
  const t = await getTranslations("audit");
  const page = pageNumber((await searchParams).page);
  const [count, entries] = await Promise.all([
    AdminAudit.countDocuments(),
    AdminAudit.find()
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * 30)
      .limit(30)
      .lean(),
  ]);
  const actors = await User.find({ _id: { $in: entries.map((e) => e.actor) } })
    .select("name")
    .lean();
  const names = new Map(actors.map((a) => [String(a._id), a.name]));
  const subjects = t.raw("subjects") as Record<string, string>,
    verbs = t.raw("verbs") as Record<string, string>;

  const actionParts = (code: string) => {
    const parts = code.split("."),
      subject = subjects[parts[0]],
      verb = verbs[parts[parts.length - 1]];
    return subject && verb && parts.length > 1 ? { subject, verb } : null;
  };

  return (
    <div className="aud">
      <header className="aud-head">
        <span className="aud-tag">{t("section")}</span>
        <h1>{t("title")}</h1>
        <p>{t("description")}</p>
      </header>

      <div className="aud-notice" role="note">
        {t("warning")}
      </div>

      <section className="aud-panel">
        <div className="aud-panel-head">
          <h2>{t("title")}</h2>
          <span className="aud-count">{count}</span>
        </div>

        {entries.length ? (
          <div className="aud-table-wrap">
            <table className="aud-table">
              <thead>
                <tr>
                  <th>{t("time")}</th>
                  <th>{t("actor")}</th>
                  <th>{t("action")}</th>
                  <th>{t("target")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const name = names.get(String(e.actor));
                  const parts = actionParts(e.action);
                  return (
                    <tr key={String(e._id)}>
                      <td className="aud-time" data-label={t("time")}>
                        {formatDate(e.createdAt, locale)}
                      </td>
                      <td data-label={t("actor")}>
                        {name ? (
                          <span className="aud-actor">
                            <span className="aud-avatar" aria-hidden="true">
                              {Array.from(String(name))[0]}
                            </span>
                            {name}
                          </span>
                        ) : (
                          <span className="aud-actor-none">—</span>
                        )}
                      </td>
                      <td title={e.action} data-label={t("action")}>
                        {parts ? (
                          <span className="aud-action">
                            <span className="aud-subject">{parts.subject}</span>
                            <span
                              className="aud-verb"
                              data-tone={verbTone(e.action)}>
                              {parts.verb}
                            </span>
                          </span>
                        ) : (
                          <span className="aud-code">{e.action}</span>
                        )}
                      </td>
                      <td data-label={t("target")}>
                        {e.target ? (
                          <span className="aud-target">{e.target}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="aud-empty">{t("empty")}</div>
        )}

        <div className="aud-foot">
          <Pagination
            path="/admin/audit"
            page={page}
            totalPages={Math.ceil(count / 30)}
          />
        </div>
      </section>
    </div>
  );
}
