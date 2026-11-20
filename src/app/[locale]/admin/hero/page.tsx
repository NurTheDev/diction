import { HeroForm } from "@/components/admin/hero-form";
import { RowControls } from "@/components/admin/row-controls";
import { requireListAccessPage } from "@/lib/admin/guard";
import { HeroBanner } from "@/models/HeroBanner";
import { Image as ImageIcon, Info, LayoutTemplate } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function HeroAdmin() {
  const viewer = await requireListAccessPage("content"),
    canDelete = viewer.role === "admin" || viewer.role === "superadmin",
    canArchive = ["superadmin", "admin", "staff"].includes(viewer.role);
  const [t, bn, en, record] = await Promise.all([
    getTranslations("heroCms"),
    getTranslations({ locale: "bn", namespace: "hero" }),
    getTranslations({ locale: "en", namespace: "hero" }),
    HeroBanner.findOne({ key: "home" }).lean(),
  ]);

  return (
    <div className="hro">
      <header className="hro-head">
        <span className="hro-head-icon" aria-hidden="true">
          <LayoutTemplate size={26} />
        </span>
        <div>
          <span className="hro-tag">✦ {t("section")}</span>
          <h1>{t("title")}</h1>
          <p>{t("description")}</p>
        </div>
      </header>

      <div className="hro-note" role="note">
        <Info size={19} aria-hidden="true" />
        <span>{t("note")}</span>
      </div>

      <section className="hro-panel">
        <div className="hro-panel-head">
          <div className="hro-panel-title">
            <ImageIcon size={20} aria-hidden="true" />
            <h2>{t("title")}</h2>
          </div>
          {record && (
            <div className="hro-panel-tools">
              <RowControls
                kind="heroBanner"
                id={String(record._id)}
                name={record.key || "home"}
                canDelete={canDelete}
                canArchive={canArchive}
              />
            </div>
          )}
        </div>
        <div className="hro-body">
          <HeroForm
            values={{
              title1Bn: record?.title1?.bn || bn("title1"),
              title1En: record?.title1?.en || en("title1"),
              title2Bn: record?.title2?.bn || bn("title2"),
              title2En: record?.title2?.en || en("title2"),
              descriptionBn: record?.description?.bn || bn("description"),
              descriptionEn: record?.description?.en || en("description"),
              imageAltBn: record?.imageAlt?.bn || bn("imageLabel"),
              imageAltEn: record?.imageAlt?.en || en("imageLabel"),
              imageUrl: record?.imageUrl || "/brand/students-illustration.jpg",
              published: record?.published ?? false,
            }}
          />
        </div>
      </section>
    </div>
  );
}
