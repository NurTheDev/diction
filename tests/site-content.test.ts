import assert from 'node:assert/strict';
import {siteContentSchema} from '../src/schemas/site-content';
const base={kind:'faq',key:'admission-question',titleBn:'কীভাবে ভর্তি হব?',titleEn:'How do I apply?',descriptionBn:'অনলাইনে আবেদন করুন।',descriptionEn:'Apply online.',order:0,published:true};
assert.equal(siteContentSchema.safeParse(base).success,true);
assert.equal(siteContentSchema.safeParse({...base,key:'bad key'}).success,false);
assert.equal(siteContentSchema.safeParse({...base,descriptionBn:''}).success,false);
assert.equal(siteContentSchema.safeParse({...base,kind:'activity',descriptionBn:'',descriptionEn:''}).success,true);
assert.equal(siteContentSchema.safeParse({...base,kind:'facility',descriptionEn:''}).success,false);
console.log('Site-content validation tests passed.');
