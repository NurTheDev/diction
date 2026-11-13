/**
 * The data SendSmsDialog needs before it can open (R2).
 *
 * Loaded server-side so the browser never asks for the template catalog and so an inactive template
 * simply is not offered: the picker shows what may actually be sent. Bodies stay Bangla even on the
 * English UI — that is the spec's rule for message content.
 */
import 'server-only';
import {loadSmsSettings,loadSmsTemplates} from './sms-send';

export interface SmsDialogTemplate{key:string;name:string;body:string;active:boolean;edited:boolean}

export interface SmsDialogData{templates:SmsDialogTemplate[];institutePhone:string}

export async function smsDialogData():Promise<SmsDialogData>{
  const [rows,settings]=await Promise.all([loadSmsTemplates(),loadSmsSettings()]);
  return {
    templates:rows
      // `pending_reminder` is the spec's optional template (current-month PENDING, OFF by default).
      // It stays in the catalog and editable on the SMS page, but it is not offered in the picker:
      // the due list is DUE only, so nothing supplies the upcoming month's amount and due date yet.
      // Offering it is the switch the spec calls optional, and it is recorded as owed in
      // docs/R2-COVERAGE.md rather than shipped as a template that can only skip everybody.
      .filter(row=>(row.active||row.key==='custom')&&row.key!=='pending_reminder')
      .map(row=>({key:row.key,name:row.name,body:row.body,active:row.active,edited:row.edited})),
    institutePhone:settings.institutePhone,
  };
}
