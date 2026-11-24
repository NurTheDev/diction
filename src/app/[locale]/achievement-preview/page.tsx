import { AchievementEditor } from "@/components/achievements/editor";
import { AdminShell } from "@/components/admin/shell";
import { clientMessages } from "@/i18n/client-namespaces";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
/** Isolated sample with no real student data, unavailable outside explicit local preview. */
export default async function AchievementPreview({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.PREVIEW_WITHOUT_SERVICES !== "1"
  )
    notFound();
  const { locale } = await params;
  return (
    <NextIntlClientProvider messages={clientMessages(await getMessages())}>
      <AdminShell name="Admin" locale={locale} preview>
        <AchievementEditor
          sample
          settings={{
            website: "",
            taglineBn: "পড়ালেখার প্রিয় প্রাঙ্গণ" /* i18n-scan-allow: the stored Bangla tagline — sample content in the design preview, data, not interface text */,
            logoUrl: "/brand/logo.png",
          }}
        />
      </AdminShell>
    </NextIntlClientProvider>
  );
}
