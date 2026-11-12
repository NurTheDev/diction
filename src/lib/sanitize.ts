import sanitizeHtml from 'sanitize-html';
/** Narrow HTML subset; apply again on reads in case legacy records bypassed validation. */
export function cleanHtml(input:string){return sanitizeHtml(input,{allowedTags:['p','br','strong','em','s','h2','h3','ul','ol','li','blockquote','a'],allowedAttributes:{a:['href']},allowedSchemes:['http','https','mailto'],allowProtocolRelative:false,transformTags:{a:(_tag,attrs)=>({tagName:'a',attribs:{href:attrs.href||'',rel:'noopener noreferrer'}})}});}
