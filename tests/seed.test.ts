import assert from 'node:assert/strict';
import {teachers,facilities,faqs,siteSettings} from '../src/data/seed-content';
import {seedSchema,seedAdminSchema} from '../src/schemas/seed';
import {facultySchema} from '../src/schemas/faculty';
assert.equal(seedSchema.safeParse({teachers,facilities,faqs,siteSettings}).success,true);
assert.equal(new Set(teachers.map(x=>x.slug)).size,7);
assert.equal(teachers[0].name.en,'Sarek Chowdhury');
assert.equal(facilities.filter(f=>f.kind==='facility').length,5);
assert.equal(facilities.filter(f=>f.kind==='activity').length,8);
assert.equal(facilities.find(f=>f.key==='activity-5')?.title.bn,'একমাত্র আমাদের কোচিং এই MCQ ও MCQ শর্টকাটের জন্য আলাদা সাপ্তাহিক ক্লাস');
assert.equal(siteSettings.theme.primary,'#2E3192');
assert.equal(seedAdminSchema.safeParse({SEED_ADMIN_EMAIL:'bad',SEED_ADMIN_PASSWORD:'short'}).success,false);
assert.equal(facultySchema.safeParse({slug:'bad slug',nameBn:'নাম',nameEn:'Name',qualificationBn:'যোগ্যতা',qualificationEn:'Qualification',order:1,director:false,published:true}).success,false);
assert.equal(facultySchema.safeParse({slug:'valid-name',nameBn:'নাম',nameEn:'Name',qualificationBn:'যোগ্যতা',qualificationEn:'Qualification',order:1,director:false,published:true}).success,true);
console.log('Seed and faculty validation tests passed.');

assert.equal(seedAdminSchema.safeParse({SEED_ADMIN_EMAIL:'admin@example.test',SEED_ADMIN_PASSWORD:'আ'.repeat(30)}).success,false);

const faculty={slug:'profile',nameBn:'নাম',nameEn:'Name',qualificationBn:'যোগ্যতা',qualificationEn:'Qualification',order:1,director:false,published:true};
assert(facultySchema.safeParse({...faculty,bioBn:'শিক্ষক পরিচিতি',bioEn:'Teacher biography'}).success);
assert(!facultySchema.safeParse({...faculty,bioBn:'শুধু বাংলা',bioEn:''}).success);
assert(!facultySchema.safeParse({...faculty,bioBn:'x'.repeat(3001),bioEn:'Bio'}).success);
