/**
 * The data SendSmsDialog needs before it can open (R2).
 *
 * Loaded server-side so the browser never asks for the template catalog and so an inactive template
 * simply is not offered: the picker shows what may actually be sent. Bodies stay Bangla even on the
 * English UI — that is the spec's rule for message content.
 */
import 'server-only';
import {loadSmsSettings,loadSmsTemplates} from './sms-send';
import {visitorTemplateFits} from '@/lib/leads/lead-sms';

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

/**
 * The same catalog, narrowed for a VISITOR send (R3.9).
 *
 * A lead has no fee, no month, no amount and no enrolled-class name, so a template asking for any of those
 * can only end in the dialog's own "a value did not render" refusal — a dead end reached after the operator
 * picked people, read a preview and pressed send. Not offering it is the rule this file already applies to
 * `pending_reminder`, applied for a different reason: there, nothing supplies the chip yet; here, nothing
 * ever will. `visitor_thanks` needs only {institute_phone}, which is the center's own number, so it is
 * always in this list and is the default at every lead entry point.
 */
export async function visitorSmsDialogData():Promise<SmsDialogData>{
  const [rows,settings]=await Promise.all([loadSmsTemplates(),loadSmsSettings()]);
  return {
    templates:rows
      .filter(row=>(row.active||row.key==='custom')&&visitorTemplateFits(row.variables))
      .map(row=>({key:row.key,name:row.name,body:row.body,active:row.active,edited:row.edited})),
    institutePhone:settings.institutePhone,
  };
}
