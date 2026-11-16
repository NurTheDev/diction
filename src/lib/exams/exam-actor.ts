/**
 * R5 · Exams — the live actor behind a scope.
 *
 * Split from `exam-scope` on purpose: that module is pure (a scope in, an answer out) so a suite can
 * build a teacher's scope and prove what it reaches without an auth stack in the process. This one reads
 * the session, re-checks the account against the database, and answers with the scope the request has.
 *
 * The rules it applies are written in `exam-scope`'s header; the two that matter at this boundary are
 * that a session alone is never trusted (the role is read live, so a demotion lands on the next request)
 * and that a role switched off in Role Management removes access even from a session that is still valid.
 */
import {getCurrentUser} from '../current-user';
import {CenterSettings} from '../../models/CenterRecords';
import {teacherClassGroups,type ExamScope} from './exam-scope';

const MANAGE_ROLES=['superadmin','admin','exam_manager'];
const PUBLISH_ROLES=['superadmin','admin','exam_manager'];
const ARCHIVE_ROLES=['superadmin','admin','staff'];

/** True when Role Management has switched this role off, which removes access even from a live session. */
async function roleDisabled(role:string):Promise<boolean>{
  try{
    const settings=await CenterSettings.findOne({}).select('disabledRoles').lean() as {disabledRoles?:string[]}|null;
    return !!settings&&(settings.disabledRoles||[]).includes(role);
  }catch{return false}
}

/**
 * The live actor's exam scope, or `null` when they have none.
 *
 * Reads the account fresh (the session alone is not trusted) and refuses a switched-off role, so an
 * operator who was demoted mid-day loses the exam grid on their next request.
 */
export async function getExamScope():Promise<ExamScope|null>{
  const user=await getCurrentUser();
  if(!user)return null;
  const role=String(user.role||'');
  if(await roleDisabled(role))return null;
  const base={userId:String(user.id||''),role,name:String(user.name||'')};
  if(!base.userId)return null;
  if(role==='teacher'){
    const groups=await teacherClassGroups(base.userId);
    return {...base,manage:false,publish:false,scale:false,archive:false,classGroups:groups,teacher:true};
  }
  if(!['superadmin','admin','exam_manager','staff'].includes(role))return null;
  const owner=role==='superadmin'||role==='admin';
  return {
    ...base,manage:MANAGE_ROLES.includes(role),publish:PUBLISH_ROLES.includes(role),
    scale:owner,archive:ARCHIVE_ROLES.includes(role),classGroups:null,teacher:false,
  };
}

export async function requireExamScope():Promise<ExamScope>{
  const scope=await getExamScope();
  if(!scope)throw new Error('UNAUTHORIZED');
  return scope;
}
