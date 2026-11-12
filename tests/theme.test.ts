import assert from 'node:assert/strict';
import {contrastOnWhite,safeThemeColor,themeSchema,DEFAULT_THEME} from '../src/schemas/theme';
assert(safeThemeColor(DEFAULT_THEME.primary));assert(safeThemeColor(DEFAULT_THEME.action));assert(!safeThemeColor('#FFFFFF'));assert(!safeThemeColor('#ED1C24'));assert(!safeThemeColor('red'));assert(!safeThemeColor('#123'));assert(contrastOnWhite('#000000')===21);assert.equal(contrastOnWhite('bad'),0);assert(themeSchema.safeParse({primary:'#112233',action:'#880000'}).success);assert(!themeSchema.safeParse({primary:'#ffffff',action:'#000000'}).success);
console.log('Theme validation and contrast tests passed.');
