import { Link } from "@/i18n/navigation";
import { practiceList } from "@/lib/content/practice-tests";
import { ArrowRight, BookOpenCheck, Info } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const pub = await getTranslations({
    locale,
    namespace: "publicPages.practice",
  });
  return { title: pub("title"), description: pub("tagline") };
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;
  const items = await practiceList();
  const pub = await getTranslations("publicPages.practice");
  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <h1>{pub("title")}</h1>
          <p>{pub("hero")}</p>
        </div>
      </section>
      <section className="content-section">
        <div className="wrap prl">
          <div className="prl-intro">
            <span className="prl-intro-ico" aria-hidden="true">
              <Info />
            </span>
            <p className="prl-intro-text">{pub("intro")}</p>
          </div>
          {items.length ? (
            <ul className="prl-grid">
              {items.map((i, idx) => {
                const href = `/practice-tests/${i.slug}`;
                const meta = [i.subject, i.grade].filter(Boolean) as string[];
                return (
                  <li key={i.slug} style={{ display: "contents" }}>
                    <article className="prl-card" data-tone={idx % 4}>
                      <span className="prl-tile" aria-hidden="true">
                        <BookOpenCheck />
                      </span>
                      <h2 className="prl-title">
                        <Link href={href}>{i.title}</Link>
                      </h2>
                      <p className="prl-chips">
                        {meta.map((m) => (
                          <span className="prl-chip" key={m}>
                            {m}
                          </span>
                        ))}
                      </p>
                      <div className="prl-foot">
                        <Link href={href} className="prl-cta">
                          {pub("start")}
                          <span className="prl-cta-arrow" aria-hidden="true">
                            <ArrowRight />
                          </span>
                        </Link>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="prl-empty">
              <span className="prl-empty-ico" aria-hidden="true">
                <BookOpenCheck />
              </span>
              <p>{pub("empty")}</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
