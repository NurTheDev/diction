'use client';
/**
 * S2 · F-04 — the class list's own editor, which is now the ONE class editor folded into a row.
 *
 * This file used to hold a second, smaller class form: a name in both languages, a free-typed shift word,
 * a fee, an archive tick and the teachers. The class board held the other half — the level, the room, the
 * shift boxes. Two forms wrote one record, so which fields a class had depended on which screen the owner
 * last used, and a save here quietly kept whatever the board had written for the fields it did not show.
 *
 * What is left here is the row's own shell: the summary that names the class, its year, its shift and the
 * teachers who take it — the owner reads the assignment without opening anything — and inside it the same
 * `ClassEditorForm` the board's sheet renders, posting to the same action. The shift is no longer a word
 * anybody types: it is the three boxes, and the word the routine reads is derived from them (F-08).
 */
import {useTranslations} from 'next-intl';
import {ClassEditorForm,draftOfClass,type TeacherOption} from './class-management';
import {formatNumber,type Digits} from '@/lib/admin/format';

/** One class as the list row hands it to the editor. */
export interface CenterClassItem{
  id:string;revision:string;nameBn:string;nameEn:string;level:string;room:string;shifts:string[];
  shift:string;active:boolean;year:number;teachers:string[];monthlyFee:number;feeFree:boolean;
}

/** A class group's labels, shifts, room, fee, archive switch and — R5 — the teachers who take it. The
    teacher list is what decides which marks grid a teacher may open, and the row names them so the owner
    sees who takes a class without opening anything. */
export function CenterClassEdit({item,teacherOptions,digits}:{
  item:CenterClassItem;teacherOptions:TeacherOption[];digits:Digits;
}){
  const t=useTranslations('exams');
  const assigned=teacherOptions.filter(option=>item.teachers.includes(option.id)).map(option=>option.name);
  /* `data-class-edit` is the marker this fold has always been driven by — the exam suite opens the row,
     ticks a teacher inside it and clicks its first button, which is the save. It sits on the fold rather
     than on the form so that it names the whole thing the operator opened, whichever form is inside. */
  return <details className="center-preview-row" data-class-edit={item.id}>
    <summary data-class-summary={item.id}>{item.nameBn} · {formatNumber(item.year,digits)} {item.shift} ·{' '}
      {item.active?t('classEdit.active'):t('classEdit.archived')} ·{' '}
      {assigned.length?assigned.join(', '):t('classEdit.teacherNone')}</summary>
    <ClassEditorForm draft={draftOfClass({
      id:item.id,revision:item.revision,nameBn:item.nameBn,nameEn:item.nameEn,level:item.level,
      room:item.room,shifts:item.shifts,monthlyFee:item.monthlyFee,feeFree:item.feeFree,year:item.year,
      active:item.active,teachers:item.teachers,
    })} isNew={false} year={item.year} digits={digits} teacherOptions={teacherOptions} variant="inline"/>
  </details>;
}
