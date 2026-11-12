import assert from 'node:assert/strict';
import {createPortalNoticeSchema,editPortalNoticeSchema} from '../src/schemas/portal-notices';
const valid={batch:'507f1f77bcf86cd799439011',titleBn:'সাপ্তাহিক ক্লাস',titleEn:'Weekly class',bodyBn:'সময় পরিবর্তন হয়েছে।',bodyEn:'The time has changed.',idempotencyKey:'bfbf0b28-04cd-4073-9ac1-40a815b3d33c'};
assert(createPortalNoticeSchema.safeParse(valid).success);assert(!createPortalNoticeSchema.safeParse({...valid,batch:'fake'}).success);assert(!createPortalNoticeSchema.safeParse({...valid,bodyBn:' '}).success);assert(!createPortalNoticeSchema.safeParse({...valid,bodyEn:'x'.repeat(3001)}).success);assert(!createPortalNoticeSchema.safeParse({...valid,idempotencyKey:'wrong'}).success);assert(editPortalNoticeSchema.safeParse({...valid,id:valid.batch}).success);assert(!editPortalNoticeSchema.safeParse({...valid,id:'bad'}).success);
console.log('Private portal notice validation tests passed.');
