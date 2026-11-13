/**
 * R3.11 (owner decision 2) · What each role's Overview shows.
 *
 * The front desk asked for one thing in the morning: who did we promise to call today, and how many
 * promises are already late. That is the visitor queue, and it is the whole of a staff Overview — the
 * intake counters, the automatic-SMS problems and the database usage are the owner's business and stay
 * behind `requireAdmin()`. The decision lives here rather than in an `if` on the page so that a role can
 * be answered about in one line, in a test, without rendering anything: a screen that shows a staff
 * account somebody else's numbers is a leak, and a leak that only a page render can prove is a leak
 * nobody proves.
 *
 * Fail-closed: a role this function does not know gets nothing at all.
 */
export interface OverviewScope{
  /** The visitor follow-up panel: today's count, the overdue count and the next few names. */
  followUps:boolean;
  /** The intake counters, today's new admissions and the checklist — the owner's morning read. */
  intake:boolean;
  /** The automatic-SMS problems panel. */
  smsProblems:boolean;
  /** Database usage, which only a super admin may see. */
  database:boolean;
}

const NOTHING:OverviewScope={followUps:false,intake:false,smsProblems:false,database:false};

export function overviewScope(role:string):OverviewScope{
  if(role==='superadmin')return {followUps:true,intake:true,smsProblems:true,database:true};
  if(role==='admin')return {followUps:true,intake:true,smsProblems:true,database:false};
  if(role==='staff')return {followUps:true,intake:false,smsProblems:false,database:false};
  // content editors and exam managers are redirected to their own pages before this is ever asked;
  // anything else — a disabled role, a student, an empty string — gets no panel at all.
  return NOTHING;
}
