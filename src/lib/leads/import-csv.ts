/**
 * R3 · Visitor import — reading a comma-separated sheet.
 *
 * A visitor list arrives as `.xlsx` or as `.csv` exported from the owner's spreadsheet, and the CSV
 * half has to survive what such an export contains: quoted cells, doubled quotes inside them, commas
 * and newlines inside quotes, a CRLF line ending, a byte-order mark, and Bangla text in UTF-8. There
 * is no CSV dependency in this project, and the whole rule fits in one pass over the characters, so
 * it lives here instead of in a package: a cell ends at a comma outside quotes, a row ends at a
 * newline outside quotes, and a quote inside a quoted cell is written twice.
 *
 * Nothing is trimmed and nothing is typed: the grid comes back exactly as written, because the
 * readers in `lead-date`, `lead-phone` and `lead-class` are the ones allowed to decide what a cell
 * means, and they need the cell as the sheet held it.
 */

/** One sheet's worth of cells, row-major, exactly as written. A trailing empty row is dropped. */
export function parseCsvGrid(text:string):string[][]{
  const source=text.charCodeAt(0)===0xfeff?text.slice(1):text;
  const rows:string[][]=[];
  let row:string[]=[],cell='',quoted=false;
  const pushCell=()=>{row.push(cell);cell=''};
  const pushRow=()=>{pushCell();if(row.some(value=>value.trim()!==''))rows.push(row);row=[]};
  for(let i=0;i<source.length;i++){
    const ch=source[i];
    if(quoted){
      if(ch==='"'){
        if(source[i+1]==='"'){cell+='"';i++}
        else quoted=false;
      }else cell+=ch;
      continue;
    }
    if(ch==='"'){quoted=true;continue}
    if(ch===','){pushCell();continue}
    if(ch==='\n'){pushRow();continue}
    if(ch==='\r'){if(source[i+1]==='\n')i++;pushRow();continue}
    cell+=ch;
  }
  if(cell!==''||row.length)pushRow();
  return rows;
}
