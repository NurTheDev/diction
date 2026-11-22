import { StaffRoles } from "@/components/admin/staff-roles";
import { getAdmin } from "@/lib/admin/guard";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params,
    admin = await getAdmin();
  if (admin?.role !== "superadmin") redirect(`/${locale}/admin`);
  return <StaffRoles />;
}
