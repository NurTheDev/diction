'use client';
import {useTranslations} from 'next-intl';
import {useActionState} from 'react';import {updateCenterClass,type CenterActionState} from '@/actions/center-students';
const initial:CenterActionState={status:'idle'};
/** A class group's labels, shift, archive switch and — R5 — the teachers who take it. The teacher list is
    what decides which marks grid a teacher may open, and this is the only place it is written, so the
    owner sees who takes a class without opening anything: the summary names them. */
export function CenterClassEdit({item,teacherOptions}:{item:{id:string;revision:string;nameBn:string;nameEn:string;shift:string;active:boolean;year:number;teachers:string[];monthlyFee?:number};teacherOptions:{id:string;name:string}[]}){const t=useTranslations('exams'),[state,action,pending]=useActionState(updateCenterClass,initial);const assigned=teacherOptions.filter(option=>item.teachers.includes(option.id)).map(option=>option.name);return <details className="center-preview-row"><summary data-class-summary={item.id}>{item.nameBn} · {item.year} {item.shift} · {item.active?t('classEdit.active'):t('classEdit.archived')} · {assigned.length?assigned.join(', '):t('classEdit.teacherNone')}</summary><form action={action} className="admin-edit" data-class-edit={item.id}><input type="hidden" name="id" value={item.id}/><input type="hidden" name="revision" value={item.revision}/><label>{t('classEdit.nameLabel')}<input className="admin-input" name="nameBn" defaultValue={item.nameBn} required maxLength={120}/></label><label>{t('classEdit.nameEnLabel')}<input className="admin-input" name="nameEn" defaultValue={item.nameEn} maxLength={120}/></label><label>{t('classEdit.shiftLabel')}<input className="admin-input" name="shift" defaultValue={item.shift} maxLength={100}/></label>
    {/* What a month of this class costs. It is the class's own fact, kept beside its name and shift. */}
    <label>{t('classEdit.feeLabel')}<input className="admin-input" name="monthlyFee" inputMode="numeric" data-class-fee={item.id}
      defaultValue={item.monthlyFee?String(item.monthlyFee):''} maxLength={9}/><small>{t('classEdit.feeHelp')}</small></label><label className="admin-check"><input type="checkbox" name="active" defaultChecked={item.active}/>{t('classEdit.activeCheck')}</label>
    {/* One tick per teacher account. A class nobody is assigned to is nobody's to mark, which is why the
        empty case says where a teacher account is made rather than showing a blank box. */}
    <fieldset className="admin-fieldset" data-class-teachers={item.id}><legend>{t('classEdit.teachers')}</legend>
      {teacherOptions.length===0&&<small data-class-teachers-empty>{t('classEdit.noTeachers')}</small>}
      {teacherOptions.map(option=><label key={option.id} className="admin-check" data-teacher-option={option.id}><input type="checkbox" name="teacherIds" value={option.id} defaultChecked={item.teachers.includes(option.id)} data-teacher-check={option.id}/>{option.name}</label>)}
    </fieldset>
    <p>{t('classEdit.help')} {t('classEdit.teachersHelp')}</p><button className="admin-mini-button" disabled={pending}>{t('classEdit.save')}</button>{state.status!=='idle'&&<p role={state.status==='ok'?'status':'alert'} data-class-saved={state.status==='ok'?'yes':'no'}>{state.status==='ok'?t('classEdit.saved'):t('classEdit.saveFailed')}</p>}</form></details>}
