/**
 * Minimal ZIP writer for `verify-output.zip`.
 *
 * Deliberately dependency-free and platform-free: the owner may run this on Windows, macOS or
 * Linux, and shelling out to `zip` / Compress-Archive is not portable. Pure functions only, so
 * tests/verify-report.test.ts round-trips the output through `yauzl` (a real unzip library).
 */
import {deflateRawSync} from 'node:zlib';

export type ZipEntry={name:string;data:Buffer;mtime?:Date};

const CRC_TABLE=(()=>{
  const table=new Int32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c}
  return table;
})();

export function crc32(data:Buffer):number{
  let c=0xffffffff;
  for(let i=0;i<data.length;i++)c=CRC_TABLE[(c^data[i])&0xff]^(c>>>8);
  return (c^0xffffffff)>>>0;
}

function dosTime(date:Date):{time:number;date:number}{
  const year=Math.max(1980,date.getFullYear());
  return {
    time:(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1),
    date:(((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate()),
  };
}

/** Builds a complete ZIP archive in memory. Names use forward slashes and UTF-8. */
export function createZip(entries:ZipEntry[]):Buffer{
  const locals:Buffer[]=[];
  const centrals:Buffer[]=[];
  let offset=0;
  for(const entry of entries){
    const name=Buffer.from(entry.name.replace(/\\/g,'/').replace(/^\/+/,''),'utf8');
    const crc=crc32(entry.data);
    const deflated=deflateRawSync(entry.data,{level:9});
    const useDeflate=deflated.length<entry.data.length;
    const payload=useDeflate?deflated:entry.data;
    const method=useDeflate?8:0;
    const {time,date}=dosTime(entry.mtime||new Date());

    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);            // version needed
    local.writeUInt16LE(0x0800,6);        // flags: UTF-8 names
    local.writeUInt16LE(method,8);
    local.writeUInt16LE(time,10);
    local.writeUInt16LE(date,12);
    local.writeUInt32LE(crc,14);
    local.writeUInt32LE(payload.length,18);
    local.writeUInt32LE(entry.data.length,22);
    local.writeUInt16LE(name.length,26);
    local.writeUInt16LE(0,28);
    locals.push(local,name,payload);

    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);
    central.writeUInt16LE(20,4);          // version made by
    central.writeUInt16LE(20,6);          // version needed
    central.writeUInt16LE(0x0800,8);
    central.writeUInt16LE(method,10);
    central.writeUInt16LE(time,12);
    central.writeUInt16LE(date,14);
    central.writeUInt32LE(crc,16);
    central.writeUInt32LE(payload.length,20);
    central.writeUInt32LE(entry.data.length,24);
    central.writeUInt16LE(name.length,28);
    central.writeUInt16LE(0,30);
    central.writeUInt16LE(0,32);
    central.writeUInt16LE(0,34);
    central.writeUInt16LE(0,36);
    central.writeUInt32LE(0,38);
    central.writeUInt32LE(offset,42);
    centrals.push(central,name);

    offset+=local.length+name.length+payload.length;
  }
  const centralDirectory=Buffer.concat(centrals);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(0,4);
  end.writeUInt16LE(0,6);
  end.writeUInt16LE(entries.length,8);
  end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(centralDirectory.length,12);
  end.writeUInt32LE(offset,16);
  end.writeUInt16LE(0,20);
  return Buffer.concat([...locals,centralDirectory,end]);
}
