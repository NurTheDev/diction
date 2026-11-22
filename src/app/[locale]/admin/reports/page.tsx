import { Link } from "@/i18n/navigation";
import { requireArchiverPage } from "@/lib/admin/guard";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

type ReportCard = {
  key: string;
  href: string;
  title: string;
  desc: string;
  Icon: LucideIcon;
};

export default async function ReportsHub() {
  await requireArchiverPage();
  const t = await getTranslations("reports");

  const cards: ReportCard[] = [
    {
      key: "daily",
      href: "/admin/reports/daily",
      title: t("hub.daily"),
      desc: t("daily.desc"),
      Icon: CalendarDays,
    },
    {
      key: "monthly",
      href: "/admin/reports/monthly",
      title: t("hub.monthly"),
      desc: t("monthly.desc"),
      Icon: CalendarRange,
    },
    {
      key: "audit",
      href: "/admin/reports/receipt-audit",
      title: t("hub.audit"),
      desc: t("audit.desc"),
      Icon: ShieldCheck,
    },
    {
      key: "year",
      href: "/admin/reports/year",
      title: t("hub.year"),
      desc: t("year.desc"),
      Icon: BarChart3,
    },
  ];

  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="section-tag">✦ {t("hub.title")}</span>
          <h1>{t("hub.title")}</h1>
          <p>{t("hub.desc")}</p>
        </div>
      </div>

      <div className="reports-hub" data-reports-hub>
        {cards.map(({ key, href, title, desc, Icon }) => (
          <section
            className="admin-panel reports-card"
            data-accent={key}
            key={href}>
            <div className="admin-panel-body reports-card-body">
              <span className="reports-card-icon" aria-hidden="true">
                <Icon size={24} />
              </span>
              <strong className="reports-card-title">
                <Link className="text-link reports-card-link" href={href}>
                  {title}
                </Link>
              </strong>
              <p className="reports-card-desc">{desc}</p>
              <Link className="admin-mini-button reports-card-open" href={href}>
                {t("hub.open")}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
