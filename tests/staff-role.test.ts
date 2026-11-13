/** Owner decision 2026-11-12: a real `staff` role that can archive/hide but never delete. */
import assert from 'node:assert/strict';
import {roles} from '../src/schemas/auth';
import {managedStaffRoles,createStaffSchema,updateStaffSchema} from '../src/schemas/admin-staff';
import {permitted} from '../src/components/admin/nav-items';
import {overviewScope} from '../src/lib/admin/overview-access';

assert.ok(roles.includes('staff'),'the staff role exists in the auth role list');
assert.ok(managedStaffRoles.includes('staff'),'super admins can create and change staff accounts');

// A staff account is creatable and updatable through the managed-staff schemas.
assert.equal(createStaffSchema.safeParse({name:'Front desk',email:'desk@example.test',password:'Long-enough-pass-1',role:'staff'}).success,true);
assert.equal(updateStaffSchema.safeParse({role:'staff',active:true}).success,true);

// Visibility: staff reach every admin list an admin reaches, except the super-admin-only screens.
for(const key of ['overview','blog','courses','students','fees','media','slots','admissions']){
  assert.equal(permitted(key,'staff'),true,`staff can open ${key}`);
  assert.equal(permitted(key,'admin'),true);
}
for(const key of ['roles','audit','ai']){
  assert.equal(permitted(key,'staff'),false,`staff cannot open ${key}`);
  assert.equal(permitted(key,'admin'),false);
  assert.equal(permitted(key,'superadmin'),true);
}
// R3 wave B: the Visitors screens are front-desk work, so staff reach them — and the two restricted
// roles, which are scoped to content and exams, never see a parent's number.
for(const key of ['leads','followUps']){
  for(const role of ['staff','admin','superadmin'])assert.equal(permitted(key,role),true,`${role} can open ${key}`);
  for(const role of ['content_editor','exam_manager'])assert.equal(permitted(key,role),false,`${role} cannot open ${key}`);
}

// The pre-existing restricted roles keep their narrow visibility.
assert.equal(permitted('blog','content_editor'),true);
assert.equal(permitted('students','content_editor'),false);
assert.equal(permitted('centerExams','exam_manager'),true);
assert.equal(permitted('blog','exam_manager'),false);
assert.equal(permitted('students','staff'),true,'staff see student lists to archive, never to delete');

// R3.11 (owner decision 2): a staff Overview is the visitor queue — today's follow-ups and the count of
// promises whose day has passed — and nothing the owner reads in the morning. One function answers it, so
// the page cannot drift into showing a staff account somebody else's numbers.
for(const role of ['staff','admin','superadmin']){
  assert.equal(overviewScope(role).followUps,true,`${role} sees the follow-up panel with today's count and the overdue count`);
}
assert.deepEqual(overviewScope('staff'),{followUps:true,intake:false,smsProblems:false,database:false},
  'a staff Overview is the queue and nothing else: no intake counters, no auto-SMS problems, no database usage');
assert.equal(overviewScope('admin').intake,true,'the intake counters stay the admin’s morning read');
assert.equal(overviewScope('admin').smsProblems,true);
assert.equal(overviewScope('admin').database,false,'database usage is a super admin’s');
assert.equal(overviewScope('superadmin').database,true);
for(const role of ['content_editor','exam_manager','','student','nobody']){
  assert.deepEqual(overviewScope(role),{followUps:false,intake:false,smsProblems:false,database:false},
    `a role this function does not know gets no panel at all (${role||'empty'})`);
}

console.log('Staff role: present in auth and managed roles, creatable, sees admin lists but not roles/audit/ai, sees the Visitors list and its follow-up queue; its Overview is that queue and nothing else — today’s follow-ups and the overdue count, with the intake counters, the auto-SMS problems and the database usage left to admin and super admin — and a role the scope function does not know gets no panel at all.');
