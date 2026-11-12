import assert from 'node:assert/strict';
import {isPublicPdf,MAX_PUBLIC_SHEET_BYTES,publicSheetSchema} from '../src/schemas/public-sheet';
assert(isPublicPdf(Buffer.from('%PDF-1.4\ntest')));assert(!isPublicPdf(Buffer.from('not a pdf')));assert(!isPublicPdf(Buffer.from('%PDF')));assert.equal(MAX_PUBLIC_SHEET_BYTES,4194304);
const data={titleBn:'গণিত পাঠ',titleEn:'',descriptionBn:'',descriptionEn:'',className:'8',subject:'Math'};assert(publicSheetSchema.safeParse(data).success);assert(!publicSheetSchema.safeParse({...data,titleBn:''}).success);assert(!publicSheetSchema.safeParse({...data,titleBn:'x'.repeat(161)}).success);console.log('Public sheet input tests passed.');
