/** Quote all cells, including formula-like input, for Excel/LibreOffice exports. */
export function csvCell(value:string|number){let v=String(value);if(/^[\s\u0000-\u001f]*[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}
export function dueCsv(rows:{studentId:string;name:string;months:string;total:number}[]){return '\uFEFF'+[['Student ID','Student name','Overdue months (YYYY-MM: Taka)','Total overdue (Taka)'].map(csvCell).join(','),...rows.map(r=>[r.studentId,r.name,r.months,r.total].map(csvCell).join(','))].join('\r\n')+'\r\n'}
