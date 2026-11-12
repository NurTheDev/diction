import assert from 'node:assert/strict';
import {courseSchema} from '../src/schemas/course';
const base={slug:'class-eight-math',grade:'8',subject:'math',titleBn:'অষ্টম শ্রেণির গণিত',titleEn:'Class eight mathematics',descriptionBn:'গণিত অনুশীলন',descriptionEn:'Mathematics practice',scheduleBn:'',scheduleEn:'',feeBn:'',feeEn:'',order:0,published:true};
assert.equal(courseSchema.safeParse(base).success,true);
assert.equal(courseSchema.safeParse({...base,grade:'13'}).success,false);
assert.equal(courseSchema.safeParse({...base,subject:'unknown'}).success,false);
assert.equal(courseSchema.safeParse({...base,scheduleBn:'সোমবার'}).success,false);
assert.equal(courseSchema.safeParse({...base,scheduleBn:'সোমবার',scheduleEn:'Monday'}).success,true);
console.log('Course validation tests passed.');
