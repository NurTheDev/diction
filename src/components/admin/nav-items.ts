import {LayoutDashboard,ClipboardList,CalendarCheck,CalendarClock,Contact,CalendarDays,Inbox,GraduationCap,FilePenLine,Images,ClipboardCheck,ListChecks,Settings,BookOpen,UsersRound,History,PanelsTopLeft,CalendarRange,FileText,Wallet,Bell,Bot,ShieldCheck,Award,Video,Newspaper,MessageSquare,FileUp,TrendingUp,FolderSearch,Scale,School,NotebookPen} from 'lucide-react';
/**
 * The menu, in the order the day happens.
 *
 * Five groups, and the order is the owner's decision (operations first): what a centre manager does
 * every day sits at the top and is open on arrival — take the money, call the visitors promised a call,
 * admit the ones who walked in — while the things done once a term, or once by whoever built the site,
 * sit below. The old menu led with "Today's work" and then put the cash desk under "Students and
 * accounts" beside the website's blog, so the two screens a front desk lives in were six items apart and
 * neither was first.
 *
 * Two rules this file does not break:
 *
 * · **Grouping is presentation, permission is not.** `permitted()` below is the whole of who may see
 *   what, and moving an item between groups must never change its answer — `tests/nav-groups.test.ts`
 *   holds the visible set of every role against a frozen table for exactly that reason.
 * · **Screens that belong together stay in one group.** A collapsed group hides its items from the
 *   sidebar's text, and the funnel report is proved to sit beside the visitor list it counts (R3.18), so
 *   Visitors, its follow-up queue, its import and its funnel are one group — the daily one.
 */
export const navGroups=[
 /* Money in, people called, people admitted: the day's own work, in that order. */
 {key:'daily',items:[['/admin','overview',LayoutDashboard],
  // The cash desk is the second door in the building: it is where a fee is taken, and it is used far
  // more often than anything below it. Only an administrator may open it (`permitted`).
  ['/admin/students/collect','centerDailyCash',Wallet],
  /* R3: the owner's visitor sheet. Follow-ups is the same list with the day filter already applied —
     one route, one row of code — and the funnel (R3 wave C) is the report the spec owes beside the list
     it counts, so all three sit together, one tap apart. */
  ['/admin/leads','leads',Contact],['/admin/leads?followUp=today','followUps',CalendarClock],
  ['/admin/leads/funnel','leadsFunnel',TrendingUp],['/admin/leads/import','importLeads',FileUp],
  ['/admin/admissions','admissions',ClipboardList],['/admin/bookings','bookings',CalendarCheck],
  /* R4: the teacher CV bank belongs with the visitor screens, because it is the same job — a list of
     people the centre has met, with a number to call and a note of what was said. It is the one item
     here that STAFF may not see (`permitted` below): a CV is a private record about a person who has
     not been hired, and hiring is the owner's decision, not the front desk's. */
  ['/admin/teacher-cvs','teacherCvs',FolderSearch]]},
 /* Who is enrolled, what they owe, and the timetable and exams they are enrolled into. */
 /* O1: a class is what the roll, the fees and the timetable all hang from, so the class and batch
    screen is the first door in this group rather than a row inside the student list. */
 {key:'students',items:[['/admin/classes','classes',School],['/admin/academics','academics',NotebookPen],
  ['/admin/students','centerStudents',UsersRound],['/admin/students/dues','centerDues',Wallet],
  ['/admin/students/fees-grid','centerSheetView',FileText],
  ['/admin/courses','courses',BookOpen],['/admin/batches','batches',CalendarRange],['/admin/slots','slots',CalendarDays],
  /* R9: the week the centre teaches and the day it actually runs. Both sit beside the batches and slots
     they are written for, and both in ONE group — a collapsed group must never hide half a timetable. */
  ['/admin/routine/master','routineMaster',CalendarClock],['/admin/routine/daily','routineDaily',ClipboardCheck],
  ['/admin/materials','materials',FileText],['/admin/faculty','faculty',GraduationCap],
  /* The exam screens fold into one `details` inside this group (the sidebar does that by item key), so
     they read as one subject rather than as four neighbours of the fee grid.
     O1: ONE door to exams and results, not two. The old "Results" item pointed at a screen of academic
     information whose numbers the exam hub already holds, and two doors to one grade is how a centre
     ends up with two answers — so it is gone from the menu, its address forwards to the hub
     (`/admin/exams`, `/admin/overview/results`), and the hub keeps the one name both languages already
     gave it — "exams and results" in both languages, one item, `centerExams`. */
  ['/admin/center-exams','centerExams',ClipboardCheck],
  /* R5: the grading scale sits beside the exams it grades, and is the owner's alone — an exam manager
     runs exams but does not decide what an A+ is worth centre-wide, and a teacher marks one class. */
  ['/admin/grading-scale','gradingScale',Scale],['/admin/model-tests','modelTests',ClipboardCheck],
  ['/admin/practice-tests','practice',ClipboardCheck]]},
 /* Everything the centre sends: to a phone, to the inbox, to the students' portal, to the public. */
 {key:'communication',items:[['/admin/sms','sms',MessageSquare],['/admin/messages','messages',Inbox],
  ['/admin/portal-notices','portalNotices',Bell],['/admin/content?kind=notice','notice',Newspaper]]},
 /* R6: the money questions the owner asks at month's end — what came in by day and by operator, what a
    month's cells add up to, whether the receipt book has a hole in it, what the year expected against
    what it got — with the fee structure and the staff accounts beside them. Staff sits at the cash desk,
    so staff may read all of it; a teacher may not, and slice 2's role tests are what keeps that true. */
 {key:'reports',items:[['/admin/reports','reportsHub',TrendingUp],['/admin/reports/daily','reportsDaily',Wallet],
  ['/admin/reports/monthly','reportsMonthly',CalendarRange],['/admin/reports/receipt-audit','reportsAudit',ClipboardCheck],
  ['/admin/reports/year','reportsYear',FileText],['/admin/fees','fees',Wallet],['/admin/accounts','accounts',UsersRound]]},
 /* The public site and the room itself: what a visitor to the website sees, who may do what here, and
    the doors that are opened once and then left alone. Last, because it is not the day's work. */
 {key:'settings',items:[['/admin/site-settings','siteSettings',Settings],['/admin/hero','hero',PanelsTopLeft],
  ['/admin/content?kind=blog','blog',FilePenLine],['/admin/content?kind=video','video',Video],
  ['/admin/content?kind=gallery','gallery',Images],['/admin/content?kind=other','otherContent',FileText],
  ['/admin/achievements','achievements',Award],['/admin/site-content','siteContent',ListChecks],
  ['/admin/public-sheets','sheets',FileText],['/admin/media','media',Images],
  ['/admin/intake-setup','intake',ShieldCheck],['/admin/ai','ai',Bot],['/admin/roles','roles',ShieldCheck],
  /* R6: the backup door sits beside the roles screen — both are the owner's alone (`permitted`). */
  ['/admin/backup','backup',FileUp],['/admin/recycle-bin','recycleBin',History],['/admin/audit','audit',History]]}
] as const;
/* Group 1 · Students: the centre's student screens are the administrator's and the owner's — the list,
   the cash desk, the fee grid and the dues list are each `requireAdmin`, and `backup-roles-browser` is
   what keeps "staff are refused the cash desk" true. So the nav must not offer them to a staff account:
   a door that closes on the person who taps it is worse than no door, and staff keep the money
   *reports* (R6) rather than the student records behind them. */
const CENTER_STUDENT_SCREENS=['centerStudents','centerDailyCash','centerSheetView','centerDues'];
/* O1: the class and batch screen writes what a roll, a fee and a timetable hang from, so it is gated
   exactly like the student screens it sits beside — a door that closes on the person who taps it is
   worse than no door, and `tests/nav-groups.test.ts` holds every role's set against this. */
const CLASS_SCREENS=['classes'];
export function permitted(key:string,role:string){if(CENTER_STUDENT_SCREENS.includes(key)||CLASS_SCREENS.includes(key))return role==='admin'||role==='superadmin';if(key==='teacherCvs')return role==='admin'||role==='superadmin';if(key==='gradingScale')return role==='admin'||role==='superadmin';if(role==='content_editor')return ['blog','sheets'].includes(key);if(role==='exam_manager')return ['centerExams','modelTests','practice'].includes(key);if(key==='roles'||key==='audit'||key==='ai'||key==='backup')return role==='superadmin';if(key==='sms')return role==='admin'||role==='superadmin';return role==='admin'||role==='superadmin'||role==='staff'}
