import assert from 'node:assert/strict';
import {youtubeId} from '../src/lib/video';
import {safeImage} from '../src/lib/safe-image';
import {cleanHtml} from '../src/lib/sanitize';
import {editorialSchema} from '../src/schemas/editorial';
assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),'dQw4w9WgXcQ');
assert.equal(youtubeId('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'),null);
assert.equal(youtubeId('javascript:alert(1)'),null);
assert.equal(safeImage('/brand/logo.png'),'/brand/logo.png');
assert.equal(safeImage('/brand/../api/private'),'');
assert.equal(safeImage('https://evil.example/photo.png'),'');
assert.equal(safeImage('https://user:pass@res.cloudinary.com/demo/a.png'),'');
const html=cleanHtml('<p>Hello <strong>world</strong></p><script>alert(1)</script><a href="javascript:alert(2)" onclick="alert(3)">link</a><img src=x onerror=alert(1)>');
assert(!html.includes('<script'));assert(!html.includes('javascript:'));assert(!html.includes('onclick'));assert(!html.includes('<img'));assert(html.includes('<strong>world</strong>'));
const base={kind:'blog',slug:'hello',titleBn:'শিরোনাম',titleEn:'Title',summaryBn:'',summaryEn:'',bodyBn:'<p>একটি লেখা</p>',bodyEn:'<p>Some text</p>',categoryBn:'',categoryEn:'',tags:'',imageUrl:'',videoUrl:'',order:0,published:true};
assert.equal(editorialSchema.safeParse(base).success,true);
assert.equal(editorialSchema.safeParse({...base,bodyBn:''}).success,false);
assert.equal(editorialSchema.safeParse({...base,kind:'video',videoUrl:'https://evil.example'}).success,false);
assert.equal(editorialSchema.safeParse({...base,kind:'gallery',imageUrl:''}).success,false);
console.log('Editorial validation and sanitization tests passed.');
assert.equal(editorialSchema.safeParse({...base,titleEn:'',bodyEn:''}).success,true);
assert.equal(editorialSchema.safeParse({...base,titleBn:''}).success,false);

assert.equal(editorialSchema.safeParse({...base,extraImage1:'javascript:alert(1)'}).success,false);
assert.equal(editorialSchema.safeParse({...base,sheetSlug:'../private'}).success,false);
assert.equal(editorialSchema.safeParse({...base,videoUrl:'https://attacker.test/video'}).success,false);

assert.equal(editorialSchema.safeParse({...base,bodyBn:'',videoUrl:'https://www.youtube.com/watch?v=abcDEF12345'}).success,true);
assert.equal(editorialSchema.safeParse({...base,bodyBn:'',sheetSlug:'sheet-123'}).success,true);
