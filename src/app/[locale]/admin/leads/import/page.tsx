import {requireArchiver} from '@/lib/admin/guard';
import {leadImportHistory} from '@/lib/leads/import-commit';
import {LeadImportWizard} from '@/components/admin/lead-import-wizard';

/**
 * R3 · The Visitor import wizard's own address, so the sweep and the sidebar reach it like any screen.
 * The page only guards and fetches the batch register; the wizard itself is the client component, and
 * every word it paints comes from the `leads` catalog in the language of the address.
 */
export default async function VisitorImportPage(){
  await requireArchiver();
  const history=await leadImportHistory(20);
  return <LeadImportWizard history={history}/>;
}
