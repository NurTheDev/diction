/**
 * Unit test for the `npm run verify` harness itself (report, zip, plan).
 * Needs no database and no browser, so it runs on any machine — including one where the
 * app-level verification is blocked. It proves: a requirement can never be reported PASS without a
 * recorded result, the report has exactly one line per requirement, the ZIP the owner sends back is
 * a valid archive with intact contents, and every registered requirement points at a real proof.
 */
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createZip,crc32} from '../scripts/verify-zip';
import {exitCodeFor,overallStatus,renderReport,requirementRows,summarize,type ItemResult} from '../scripts/verify-report';
import {latestMilestone,milestones,requirements,select,STEP_REFS} from '../scripts/verify-plan';

function demoInput(results:Record<string,ItemResult>){
  const list=select('R0');
  return {
    milestone:'R0',requirements:list,results,
    steps:[{ref:'install',label:'Dependencies and Node version',status:'PASS' as const,evidence:'Node 22.22.3'}],
    env:{node:'22.22.3',npm:'10.9.8',platform:'Linux 6.1 x64'},
    startedAt:'2026-11-12T10:00:00.000Z',finishedAt:'2026-11-12T10:04:00.000Z',durationMs:240_000,
    screenshots:{dir:'screenshots/r0',files:['screenshots/r0/admin-overview-360.png','screenshots/r0/admin-overview-1440.png']},
    notes:['example note'],
  };
}

async function readZip(buffer:Buffer):Promise<{names:string[];contents:Record<string,Buffer>}>{
  const yauzl=(await import('yauzl')).default;
  return new Promise((resolve,reject)=>{
    yauzl.fromBuffer(buffer,{lazyEntries:true},(error,zipfile)=>{
      if(error||!zipfile)return reject(error||Error('no zipfile'));
      const names:string[]=[],contents:Record<string,Buffer>={};
      zipfile.on('error',reject);
      zipfile.on('entry',entry=>{
        names.push(entry.fileName);
        if(/\/$/.test(entry.fileName)){zipfile.readEntry();return}
        zipfile.openReadStream(entry,(streamError,stream)=>{
          if(streamError||!stream)return reject(streamError||Error('no stream'));
          const chunks:Buffer[]=[];
          stream.on('data',c=>chunks.push(c as Buffer));
          stream.on('end',()=>{contents[entry.fileName]=Buffer.concat(chunks);zipfile.readEntry()});
          stream.on('error',reject);
        });
      });
      zipfile.on('end',()=>resolve({names,contents}));
      zipfile.readEntry();
    });
  });
}

async function run(){
  // ── summarising: nothing is PASS unless a result was recorded ────────────────
  const list=select('R0');
  assert.ok(list.length>=10,'R0 registry should hold every R0 requirement');
  const empty=summarize(list,{});
  assert.equal(empty.pass,0,'no requirement may be PASS without evidence');
  assert.equal(empty.notTested,list.length,'unproven requirements are NOT TESTED, never PASS');
  assert.equal(overallStatus(empty),'INCOMPLETE');
  assert.equal(exitCodeFor(empty),0,'NOT TESTED alone must not look like a crash');

  const allPass=Object.fromEntries(list.map(r=>[r.id,{status:'PASS' as const,evidence:'ran here'}]));
  assert.equal(overallStatus(summarize(list,allPass)),'PASS');
  const oneFail={...allPass,[list[0].id]:{status:'FAIL' as const,evidence:'exit 1'}};
  assert.equal(overallStatus(summarize(list,oneFail)),'FAIL');
  assert.equal(exitCodeFor(summarize(list,oneFail)),1);
  const mixed={...allPass,[list[1].id]:{status:'NOT TESTED' as const,evidence:'no database'}};
  assert.equal(overallStatus(summarize(list,mixed)),'INCOMPLETE');
  assert.equal(exitCodeFor(summarize(list,mixed)),0);

  // ── report content ───────────────────────────────────────────────────────────
  const report=renderReport(demoInput(mixed));
  assert.match(report,/# Verification report — milestone R0/);
  assert.match(report,/## Result: \*\*INCOMPLETE\*\*/);
  for(const r of list)assert.ok(report.includes(`| ${r.id} |`),`report must contain a line for ${r.id}`);
  assert.equal((report.match(/\n\| R0\.\d+ \|/g)||[]).length,list.length,'exactly one table line per requirement');
  assert.match(report,/⚠️ NOT TESTED/);
  assert.match(report,/no database/,'the reason must be printed');
  assert.match(report,/screenshots\/r0\/admin-overview-360\.png/);
  assert.match(report,/verify-output\.zip/);
  assert.match(report,/awaiting owner verification/,'the status vocabulary must be stated');
  assert.doesNotMatch(report,/undefined|NaN/);

  // a FAIL line keeps its evidence readable even with pipes and newlines
  const rows=requirementRows(list,{[list[0].id]:{status:'FAIL',evidence:'first | second\nthird line'}});
  assert.ok(rows.some(r=>r.includes('first \\| second')&&r.includes('<br>third line')),'pipes and newlines are escaped');

  // ── zip the owner sends back ─────────────────────────────────────────────────
  const pngLike=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47]),Buffer.alloc(2048,7)]);
  const zip=createZip([
    {name:'verify-report.md',data:Buffer.from(report,'utf8')},
    {name:'logs/unit-test-center.txt',data:Buffer.from('9 suites passed\n','utf8')},
    {name:'screenshots/r0/admin-overview-360.png',data:pngLike},
    {name:'/leading-slash.txt',data:Buffer.from('normalised','utf8')},
  ]);
  assert.ok(zip.subarray(0,4).equals(Buffer.from('PK\x03\x04')),'starts with a local file header');
  const read=await readZip(zip);
  assert.deepEqual(read.names.slice().sort(),['leading-slash.txt','logs/unit-test-center.txt','screenshots/r0/admin-overview-360.png','verify-report.md']);
  assert.equal(read.contents['verify-report.md'].toString('utf8'),report,'report survives the round trip byte for byte');
  assert.ok(read.contents['screenshots/r0/admin-overview-360.png'].equals(pngLike),'binary screenshot is intact');
  assert.equal(read.contents['leading-slash.txt'].toString(),'normalised');
  assert.equal(crc32(Buffer.from('123456789')),0xcbf43926,'CRC-32 matches the reference value');
  assert.ok(createZip([]).length===22,'an empty archive is still a valid zip');

  // ── plan integrity ───────────────────────────────────────────────────────────
  const ids=requirements.map(r=>r.id);
  assert.equal(new Set(ids).size,ids.length,'requirement ids are unique');
  for(const r of requirements){
    assert.ok(r.text.trim().length>10,`${r.id} needs a plain requirement`);
    assert.ok(r.bn.trim().length>3,`${r.id} needs a Bangla line`);
    assert.ok(['step','unit','browser','screens'].includes(r.proof.kind),`${r.id} has an unknown proof kind`);
    if(r.proof.kind==='step')assert.ok((STEP_REFS as readonly string[]).includes(r.proof.ref),`${r.id} proves an unknown step "${r.proof.ref}"`);
    if(r.proof.kind==='browser')assert.ok(existsSync(r.proof.ref),`${r.id} points at a missing test file ${r.proof.ref}`);
    if(r.proof.kind==='unit'){
      const pkg=JSON.parse(await readFile('package.json','utf8')) as {scripts:Record<string,string>};
      assert.ok(pkg.scripts[r.proof.ref],`${r.id} points at a missing npm script ${r.proof.ref}`);
    }
  }
  assert.ok(milestones().includes('R0'));
  assert.equal(latestMilestone(),milestones()[milestones().length-1]);
  assert.equal(select('r0').length,select('R0').length,'milestone filter is case insensitive');
  assert.ok(select('all').length>=select('R0').length);
  assert.deepEqual(select('R9'),[],'an unknown milestone reports nothing rather than everything');

  console.log('Verify harness: report never claims PASS without evidence, one line per requirement, reasons escaped, ZIP round-trips through yauzl with intact binary content, and every registered requirement points at a real proof.');
}

run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
