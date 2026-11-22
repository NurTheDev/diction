import { PublicSheetManager } from "@/components/admin/public-sheet-manager";
import { requireStaffPermissionPage } from "@/lib/admin/guard";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const user = await requireStaffPermissionPage("content");
  const canDelete = user.role === "admin" || user.role === "superadmin";
  return <PublicSheetManager canDelete={canDelete} canArchive={canDelete} />;
}
