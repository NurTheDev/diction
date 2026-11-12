import assert from 'node:assert/strict';
import {materialMetadataSchema,MAX_MATERIAL_BYTES,isPdf} from '../src/schemas/materials';
const valid={batch:'507f1f77bcf86cd799439011',titleBn:'পাঠ্য উপকরণ',titleEn:'Learning material',descriptionBn:'',descriptionEn:''};
assert(materialMetadataSchema.safeParse(valid).success);assert(!materialMetadataSchema.safeParse({...valid,batch:'bad'}).success);assert(!materialMetadataSchema.safeParse({...valid,descriptionBn:'বিবরণ'}).success);assert(isPdf(Buffer.from('%PDF-1.7\n')));assert(!isPdf(Buffer.from('<script>')));assert.equal(MAX_MATERIAL_BYTES,2097152);console.log('Learning material validation tests passed.');
