/** Escape the whole input so searches cannot inject expensive regular expressions. */
export function literalSearch(text:string){const slash=String.fromCharCode(92);const specials='.*+?^${}()|[]'+slash;return new RegExp(Array.from(text,c=>specials.includes(c)?slash+c:c).join(''),'i')}
