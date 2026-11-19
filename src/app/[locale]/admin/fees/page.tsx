import { FeeList } from "@/components/fees/fee-list";
import { requireAdminPage } from "@/lib/admin/guard";
import { pageNumber } from "@/lib/admin/helpers";
export const dynamic = "force-dynamic";
export default async function Fees({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireAdminPage();
  return (
    <FeeList
      role="admin"
      userId={user.id}
      locale={(await params).locale}
      page={pageNumber((await searchParams).page)}
    />
  );
}
