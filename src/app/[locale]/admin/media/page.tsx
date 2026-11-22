import { MediaActions, MediaUpload } from "@/components/admin/media-controls";
import { Pagination } from "@/components/admin/pagination";
import { requireAdminPage } from "@/lib/admin/guard";
import { pageNumber } from "@/lib/admin/helpers";
import { safeImage } from "@/lib/safe-image";
import { MediaFile } from "@/models/MediaFile";
import { getTranslations } from "next-intl/server";
import Image from "next/image";

export default async function Media({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const query = await searchParams;
  const page = pageNumber(query.page);
  const t = await getTranslations("cms");
  const a = await getTranslations("admin");
  const [total, items] = await Promise.all([
    MediaFile.countDocuments(),
    MediaFile.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * 20)
      .limit(20)
      .lean(),
  ]);
  return (
    <div className="mdl">
      <header className="mdl-head">
        <span className="mdl-tag">{a("workspace")}</span>
        <h1>{t("mediaTitle")}</h1>
        <p>{t("mediaDesc")}</p>
      </header>

      <section className="mdl-panel">
        <div className="mdl-panel-head">
          <h2>{t("upload")}</h2>
        </div>
        <div className="mdl-panel-body">
          <MediaUpload />
        </div>
      </section>

      <section className="mdl-panel">
        <div className="mdl-panel-head">
          <h2>{t("mediaTitle")}</h2>
          <span className="mdl-count">{total}</span>
        </div>
        {items.length ? (
          <div className="mdl-grid">
            {items.map((item) => (
              <article className="mdl-card" key={String(item._id)}>
                <div className="mdl-img">
                  {safeImage(item.url) && (
                    <Image
                      src={item.url}
                      alt=""
                      fill
                      sizes="(max-width:700px) 50vw, 250px"
                    />
                  )}
                </div>
                <div className="mdl-body">
                  <div className="mdl-meta">
                    <span>
                      {item.width} × {item.height}
                    </span>
                    <span>{Math.round(item.bytes / 1024)} KB</span>
                  </div>
                  <input
                    className="mdl-url"
                    readOnly
                    value={item.url}
                    aria-label={t("imageUrl")}
                  />
                  <MediaActions id={String(item._id)} url={item.url} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mdl-empty">{t("mediaEmpty")}</div>
        )}
        <div className="mdl-foot">
          <Pagination
            path="/admin/media"
            page={page}
            totalPages={Math.ceil(total / 20)}
          />
        </div>
      </section>
    </div>
  );
}
