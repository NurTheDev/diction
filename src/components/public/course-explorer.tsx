'use client';

import {useEffect,useState} from 'react';
import {useTranslations,useLocale} from 'next-intl';
import {Link} from '@/i18n/navigation';
import {ArrowRight,Atom,BookOpen,Calculator,CalendarDays,GraduationCap,Info,Languages,Layers,Shapes,Wallet} from 'lucide-react';
import {subjectValues} from '@/lib/subjects';
import type {PublicCourse} from '@/lib/content/course';

const subjectIcons=[BookOpen,Languages,Calculator,Atom,Shapes];

/** The bundled guide is only used when no database is configured; configured sites show published courses. */
export function CourseExplorer({status,courses,initialGrade='all',initialSubject='all'}:{status:'guide'|'ready'|'error';courses:PublicCourse[];initialGrade?:string;initialSubject?:string}){
  const t=useTranslations('pages'),cc=useTranslations('courseCms');
  const locale=useLocale();
  const [grade,setGrade]=useState(initialGrade);
  const [subject,setSubject]=useState(initialSubject);
  useEffect(()=>{setGrade(initialGrade);setSubject(initialSubject)},[initialGrade,initialSubject]);
  const names=t.raw('subjects') as string[];
  const descriptions=t.raw('subjectDetails') as string[];
  const number=(n:number)=>new Intl.NumberFormat(locale==='bn'?'bn-BD':'en').format(n);
  const filtered=courses.filter(c=>(grade==='all'||c.grade===grade)&&(subject==='all'||c.subject===subject));
  return <div className="course-explorer">
    <div className="filter-bar" role="group" aria-label={t('coursesTag')}>
      <div className="filter-field"><label htmlFor="grade"><GraduationCap size={17} aria-hidden="true"/>{t('filterClass')}</label><select id="grade" value={grade} onChange={e=>setGrade(e.target.value)}><option value="all">{t('all')}</option>{Array.from({length:9},(_,i)=>i+4).map(n=><option key={n} value={n}>{t('class')} {number(n)}</option>)}</select></div>
      <div className="filter-field"><label htmlFor="subject"><BookOpen size={17} aria-hidden="true"/>{t('filterSubject')}</label><select id="subject" value={subject} onChange={e=>setSubject(e.target.value)}><option value="all">{t('all')}</option>{names.map((n,i)=><option key={subjectValues[i]} value={subjectValues[i]}>{n}</option>)}</select></div>
    </div>
    {status==='guide'&&<div className="info-line course-guide-note"><Info size={18} aria-hidden="true"/><span>{t('courseGuideNote')}</span></div>}
    <h2 className="content-heading course-list-heading">{t('single')}</h2>
    {status==='guide'?<div className="public-card-grid course-grid">{names.map((name,i)=>{const Icon=subjectIcons[i]||BookOpen;return (subject==='all'||subject===subjectValues[i])&&<article className={`public-card course-card course-subject-${i}`} key={name}><div className="card-icon"><Icon size={24} aria-hidden="true"/></div><div className="card-kicker">{grade==='all'?`${t('class')} ${number(4)}–${number(12)}`:`${t('class')} ${number(Number(grade))}`}</div><h3>{name}</h3><p>{descriptions[i]}</p><Link href="/contact" className="text-link">{t('contactUs')} <ArrowRight size={16} aria-hidden="true"/></Link></article>})}</div>:status==='error'?<div className="empty-state course-empty" role="status"><p>{cc('error')}</p></div>:filtered.length?<div className="public-card-grid course-grid">{filtered.map(course=>{const index=subjectValues.indexOf(course.subject as typeof subjectValues[number]);const Icon=subjectIcons[index]||BookOpen;return <article className={`public-card course-card course-subject-${index}`} key={course.id}><div className="card-icon"><Icon size={24} aria-hidden="true"/></div><div className="card-kicker">{t('class')} {number(Number(course.grade))} · {names[index]}</div><h3>{course.title}</h3><p>{course.description}</p>{course.schedule&&<p className="course-meta"><CalendarDays size={16} aria-hidden="true"/><span><strong>{cc('schedule')}:</strong> {course.schedule}</span></p>}{course.fee&&<p className="course-meta"><Wallet size={16} aria-hidden="true"/><span><strong>{cc('fee')}:</strong> {course.fee}</span></p>}<Link href="/contact" className="text-link">{cc('contactForDetails')} <ArrowRight size={16} aria-hidden="true"/></Link></article>})}</div>:<div className="empty-state course-empty" role="status"><p>{cc('empty')}</p><Link href="/contact" className="text-link">{cc('contactForDetails')} <ArrowRight size={16} aria-hidden="true"/></Link></div>}
    <div className="package-card course-package"><div className="card-icon"><Layers size={23} aria-hidden="true"/></div><div><span className="card-kicker">{t('coursesTag')}</span><h3>{t('package')}</h3><p>{t('packageDesc')}</p></div><Link href="/admission" className="button button-navy">{t('enroll')} <ArrowRight size={16} aria-hidden="true"/></Link></div>
  </div>
}
