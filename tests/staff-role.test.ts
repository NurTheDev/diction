/** Owner decision 2026-11-12: a real `staff` role that can archive/hide but never delete. */
import assert from 'node:assert/strict';
import {roles} from '../src/schemas/auth';
import {managedStaffRoles,createStaffSchema,updateStaffSchema} from '../src/schemas/admin-staff';
import {permitted} from '../src/components/admin/nav-items';

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
// The pre-existing restricted roles keep their narrow visibility.
assert.equal(permitted('blog','content_editor'),true);
assert.equal(permitted('students','content_editor'),false);
assert.equal(permitted('centerExams','exam_manager'),true);
assert.equal(permitted('blog','exam_manager'),false);
assert.equal(permitted('students','staff'),true,'staff see student lists to archive, never to delete');

console.log('Staff role: present in auth and managed roles, creatable, sees admin lists but not roles/audit/ai; restricted roles unchanged.');
