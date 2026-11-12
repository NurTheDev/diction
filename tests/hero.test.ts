import assert from 'node:assert/strict';
import {heroSchema} from '../src/schemas/hero';
const valid={title1Bn:'শিক্ষার আলো',title1En:'Learning starts',title2Bn:'সফলতার পথ',title2En:'Success follows',descriptionBn:'সযত্নে পড়াশোনা',descriptionEn:'Thoughtful learning',imageAltBn:'শিক্ষার্থীদের ছবি',imageAltEn:'Students learning',imageUrl:'/brand/students.png',published:true};
assert(heroSchema.safeParse(valid).success);assert(!heroSchema.safeParse({...valid,imageUrl:'javascript:alert(1)'}).success);assert(!heroSchema.safeParse({...valid,imageAltBn:''}).success);assert(!heroSchema.safeParse({...valid,title1En:'x'.repeat(121)}).success);
console.log('Homepage banner validation tests passed.');
