import {LayoutDashboard,ClipboardList,CalendarCheck,CalendarClock,Contact,CalendarDays,Inbox,BookOpenCheck,GraduationCap,FilePenLine,Images,ClipboardCheck,ListChecks,Settings,BookOpen,UsersRound,History,PanelsTopLeft,CalendarRange,FileText,Wallet,Bell,Bot,ShieldCheck,Award,Video,Newspaper,MessageSquare,FileUp,TrendingUp,FolderSearch} from 'lucide-react';
export const navGroups=[
 {key:'today',items:[['/admin','overview',LayoutDashboard],['/admin/admissions','admissions',ClipboardList],['/admin/bookings','bookings',CalendarCheck],['/admin/messages','messages',Inbox]]},
 // R3: the owner's visitor sheet, as its own group so the two screens that replace it sit together.
 // Follow-ups is the same list with the day filter already applied — one route, one row of code.
 {key:'visitors',items:[['/admin/leads','leads',Contact],['/admin/leads?followUp=today','followUps',CalendarClock],['/admin/leads/import','importLeads',FileUp],
  // R3 wave C: the funnel report the spec owes beside the list it counts — same group, one tap away.
  ['/admin/leads/funnel','leadsFunnel',TrendingUp],
  /* R4: the teacher CV bank sits in the same group as the visitor screens, because it is the same job —
     a list of people the centre has met, with a number to call and a note of what was said. It is the
     one item here that STAFF may not see (`permitted` below): a CV is a private record about a person
     who has not been hired, and hiring is the owner's decision, not the front desk's. */
  ['/admin/teacher-cvs','teacherCvs',FolderSearch]]},
 {key:'content',items:[['/admin/content?kind=blog','blog',FilePenLine],['/admin/content?kind=notice','notice',Newspaper],['/admin/content?kind=video','video',Video],['/admin/content?kind=gallery','gallery',Images],['/admin/content?kind=other','otherContent',FileText],['/admin/achievements','achievements',Award],['/admin/faculty','faculty',GraduationCap],['/admin/site-content','siteContent',ListChecks],['/admin/media','media',Images]]},
 {key:'academic',items:[['/admin/courses','courses',BookOpen],['/admin/batches','batches',CalendarRange],['/admin/slots','slots',CalendarDays],['/admin/portal-notices','portalNotices',Bell],['/admin/materials','materials',FileText],['/admin/public-sheets','sheets',FileText],['/admin/academics','academics',BookOpenCheck],['/admin/center-exams','centerExams',ClipboardCheck],['/admin/model-tests','modelTests',ClipboardCheck],['/admin/practice-tests','practice',ClipboardCheck]]},
 {key:'people',items:[['/admin/students','centerStudents',UsersRound],['/admin/students/collect','centerDailyCash',Wallet],['/admin/students/fees-grid','centerSheetView',FileText],['/admin/accounts','accounts',UsersRound],['/admin/fees','fees',Wallet],['/admin/sms','sms',MessageSquare]]},
 {key:'settings',items:[['/admin/site-settings','siteSettings',Settings],['/admin/hero','hero',PanelsTopLeft],['/admin/intake-setup','intake',ShieldCheck],['/admin/ai','ai',Bot],['/admin/roles','roles',ShieldCheck],['/admin/recycle-bin','recycleBin',History],['/admin/audit','audit',History]]}
] as const;
export function permitted(key:string,role:string){if(key==='teacherCvs')return role==='admin'||role==='superadmin';if(role==='content_editor')return ['blog','sheets'].includes(key);if(role==='exam_manager')return ['centerExams','modelTests','practice'].includes(key);if(key==='roles'||key==='audit'||key==='ai')return role==='superadmin';if(key==='sms')return role==='admin'||role==='superadmin';return role==='admin'||role==='superadmin'||role==='staff'}
