import {getLocale} from 'next-intl/server';
import {smsDialogData} from '@/lib/center/sms-dialog-data';
import SmsDialogTrigger from './sms-dialog-trigger';
import type {SmsSendRequest} from './send-sms-dialog';

/**
 * Server-side half of the SMS entry point (R2).
 *
 * A page drops this in with the request that describes its recipients and gets a working "Send
 * reminder" / "Send SMS" button: the template catalog and the institute phone are loaded here, once,
 * on the server, so no screen has to know anything about SMS to offer it. This is what makes the
 * dialog reusable — the four screens wired in R2 differ only in `request`.
 *
 * The spec also lists Visitors and Teacher CVs as entry points. Those screens and their models
 * (`Lead`, `TeacherCandidate`) are R3/R4 deliverables, so they are not wired here yet; when they land
 * they add a source kind to src/lib/center/sms-source.ts and render this same component.
 */
export default async function SmsDialogHost(props:{
  request:SmsSendRequest;
  titleBn:string;
  titleEn:string;
  labelBn:string;
  labelEn:string;
  defaultTemplateKey?:string;
  variant?:'mini'|'navy';
  disabled?:boolean;
  icon?:boolean;
}){
  const {request,titleBn,titleEn,labelBn,labelEn,defaultTemplateKey,variant,disabled,icon}=props;
  const [data,locale]=await Promise.all([smsDialogData(),getLocale().catch(()=>'bn')]);
  return (
    <SmsDialogTrigger request={request} templates={data.templates} institutePhone={data.institutePhone}
      titleBn={titleBn} titleEn={titleEn} labelBn={labelBn} labelEn={labelEn}
      defaultTemplateKey={defaultTemplateKey} en={locale==='en'} variant={variant} disabled={disabled} icon={icon} />
  );
}
