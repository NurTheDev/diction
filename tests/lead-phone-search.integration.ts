// @ts-nocheck -- R3.7: searching the Visitors list by number, and where the number is allowed to travel.
/**
 * R3.7 · Staff can find a lead by a phone number — and the number never travels in a URL, a log or an
 * analytics event.
 *
 * The owner's requirement, in full: typed digits, partial numbers, Bangla digits, with or without the
 * leading zero. Every one of those is asserted against the database below, because "it should match" is
 * not a test.
 *
 * The privacy half is asserted too, and it is the half that is easy to get wrong silently:
 *
 *   • The search runs through `searchLeadsByPhone()`, reached from `src/actions/leads.ts` — a server
 *     action, i.e. a form submission. It is not a URL: `leadListQuery()` still refuses to build one and
 *     `listLeads()` still refuses to apply one, in ASCII digits, in Bangla digits and for a partial
 *     number, with the two thresholds tied to the same constant so they cannot drift apart.
 *   • Nothing the search prints, refuses, returns as an echo or audits contains the digits that were
 *     typed. Console output is captured for the whole block and read afterwards.
 *   • The audit row records that a search happened, with a MASK as its target. Looking a parent up by
 *     number is worth accounting for; the number is not the account.
 *   • There is no analytics in this repository at all, asserted by scanning `src/` for every tracking
 *     global this project has ever seen. If somebody adds one, this test fails and asks the question
 *     "can it see the leads search?" instead of letting it happen quietly.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {AdminAudit} from '../src/models/AdminAudit';
import {Lead} from '../src/models/Lead';
import {softDelete,restoreRecord} from '../src/lib/admin/recycle';
import {createQuickLead,listLeads,searchLeadsByPhone} from '../src/lib/leads/leads';
import {leadListQuery,leadPath,maskPhone} from '../src/lib/leads/vocab';
import {phoneSearchDigits,phoneSearchMask,PHONE_SEARCH_MIN_DIGITS} from '../src/lib/leads/lead-phone';

const RAHUL='01712817090';
const RAHUL_BN='০১৭১২৮১৭০৯০';
const TANVIR='01911223344';
const TWO_FIRST='01811000022';
const TWO_SECOND='01611333444';
const BINNED='01511777888';
const PREFIX_TRIPLE=['01711000101','01711000102','01711000103'];
const EVERY_NUMBER=[RAHUL,TANVIR,TWO_FIRST,TWO_SECOND,BINNED,...PREFIX_TRIPLE];

async function walk(dir){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=join(dir,entry.name);
    if(entry.isDirectory())out.push(...await walk(full));
    else if(/\.(ts|tsx|js|jsx)$/.test(entry.name))out.push(full);
  }
  return out;
}

async function run(){
  await preflight({mongo:true,test:'tests/lead-phone-search.integration.ts — needs a MongoDB (or TEST_MONGO_URI from npm run test-mode)'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}

  // Every character the search is asked to print, refuse or audit, captured so it can be read back.
  const spoken=[];
  const real={log:console.log,error:console.error,warn:console.warn,info:console.info};
  const capture=(...args)=>{spoken.push(args.map(value=>{try{return typeof value==='string'?value:JSON.stringify(value)}catch{return String(value)}}).join(' '))};

  try{
    const now=new Date();
    const actor=await User.create({name:'Front Desk',email:'front-desk@example.test',passwordHash:await bcrypt.hash('SearchOnly-2026!',12),role:'staff',active:true});
    const actorId=String(actor._id);

    // ---- 1. Fixtures, written the way a front desk actually writes them.
    const rahul=await createQuickLead({studentName:'রাহুল আহমেদ',school:'ধানমন্ডি উচ্চ বিদ্যালয়',phone:`বাবা ${RAHUL_BN}`},actorId,now);
    assert.equal(rahul.ok,true,'a number written in Bangla digits behind a label is a number');
    const tanvir=await createQuickLead({studentName:'তানভীর হাসান',phone:'+8801911223344'},actorId,now);
    assert.equal(tanvir.ok,true,'and so is one written with the country code');
    const dual=await createQuickLead({studentName:'দুই নাম্বারের লিড',phone:`${TWO_FIRST}, ${TWO_SECOND}`},actorId,now);
    assert.equal(dual.ok,true,'two numbers in one box are both kept');
    const silent=await createQuickLead({studentName:'নাম্বার ছাড়া লিড'},actorId,now);
    assert.equal(silent.ok,true,'a lead with no number is still a lead');
    const binned=await createQuickLead({studentName:'বিনে রাখা লিড',phone:BINNED},actorId,now);
    assert.equal(binned.ok,true);
    assert.equal((await softDelete('lead',binned.id,actorId,now)).status,'ok','one of them is then moved to the Recycle Bin');
    for(const number of PREFIX_TRIPLE)assert.equal((await createQuickLead({studentName:'একই প্রিফিক্স',phone:number},actorId,now)).ok,true);
    const stored=await Lead.findById(rahul.id).lean();
    assert.equal(stored.phones[0].normalized,RAHUL,'stored normalized…');
    assert.equal(stored.phones[0].original,`বাবা ${RAHUL_BN}`,'…with the spelling as written kept beside it');

    // ---- 2. Every way of typing the number finds the same lead.
    console.log=capture;console.error=capture;console.warn=capture;console.info=capture;
    const searches=[];
    const find=async(typed,expectedLeadId,why)=>{
      const result=await searchLeadsByPhone(typed,now,25,actorId);
      searches.push({typed,result});
      assert.equal(result.status,'found',`"${typed}" finds a lead: ${why}`);
      assert.ok(result.hits.some(hit=>hit.leadId===expectedLeadId),`"${typed}" finds the right one: ${why}`);
      return result;
    };
    await find(RAHUL,rahul.leadId,'typed digits, exactly as stored');
    await find(RAHUL.slice(1),rahul.leadId,'without the leading zero');
    await find(`0${RAHUL.slice(1)}`,rahul.leadId,'with the leading zero put back');
    await find(RAHUL_BN,rahul.leadId,'in Bangla digits');
    await find(`+88${RAHUL}`,rahul.leadId,'with +88 in front');
    await find(`88${RAHUL}`,rahul.leadId,'with 88 and no plus');
    await find(`0088${RAHUL}`,rahul.leadId,'with 0088, the way it is dialled from a landline');
    await find('017-128-17090',rahul.leadId,'with dashes');
    await find('017 128 17090',rahul.leadId,'with spaces');
    await find('(017) 12817090',rahul.leadId,'with brackets');
    await find(`৮৮ ${RAHUL_BN}`,rahul.leadId,'country code AND Bangla digits together');
    await find('7090',rahul.leadId,'the last four digits off a crumpled sheet');
    await find('1712817',rahul.leadId,'a partial number from the middle of the list');
    await find('01712',rahul.leadId,'the first five, with the zero');
    await find(TANVIR,tanvir.leadId,'a different lead by its own number');
    await find('0191',tanvir.leadId,'and by a four-digit fragment of it');
    await find(TWO_FIRST,dual.leadId,'a lead holding two numbers, by the first');
    await find(TWO_SECOND,dual.leadId,'and by the second');
    await find('1333444',dual.leadId,'and by a fragment of the second');
    await find(`${RAHUL_BN} বাবা`,rahul.leadId,'with the label still around it');

    // ---- 3. What is not found, and what is refused — two different answers.
    const nobody=await searchLeadsByPhone('01799999999',now,25,actorId);
    searches.push({typed:'01799999999',result:nobody});
    assert.equal(nobody.status,'empty','a number nobody holds is an empty result, not an error');
    assert.equal(nobody.hits.length,0);assert.equal(nobody.total,0);
    assert.ok(nobody.messageBn.length>3,'and it says so in words the operator can read');
    const gone=await searchLeadsByPhone(BINNED,now,25,actorId);
    searches.push({typed:BINNED,result:gone});
    assert.equal(gone.status,'empty','a binned lead is not resurrected by a number search');
    assert.equal((await restoreRecord('lead',binned.id,actorId)).status,'ok');
    const restored=await searchLeadsByPhone(BINNED,now,25,actorId);
    searches.push({typed:BINNED,result:restored});
    assert.equal(restored.status,'found','and is findable again the moment it is restored');
    const tooShort=await searchLeadsByPhone('12',now,25,actorId);
    searches.push({typed:'12',result:tooShort});
    assert.equal(tooShort.status,'refused','two digits is not a search');
    assert.equal(tooShort.code,'too_short');
    assert.ok(tooShort.messageBn.includes('২ অঙ্ক'),'the refusal counts the digits in Bangla…');
    assert.ok(!tooShort.messageBn.includes('12'),'…without quoting the digits that were typed');
    assert.equal(tooShort.hits.length,0,'and nothing is matched by accident while it refuses');
    const blank=await searchLeadsByPhone('   ',now,25,actorId);
    searches.push({typed:'   ',result:blank});
    assert.equal(blank.status,'refused');assert.equal(blank.code,'empty');
    assert.equal(phoneSearchDigits(`+88${RAHUL}`).hadCountryCode,true,'the reader knows it removed a country code');
    assert.equal(phoneSearchDigits(RAHUL.slice(1)).hadLeadingZero,false,'and that the zero was missing');
    assert.equal(phoneSearchMask('7090'),'****','a short fragment is masked to nothing: the last four ARE the number');
    assert.equal(phoneSearchMask(RAHUL),'01****90');

    // ---- 4. A limit is a limit, and the total still tells the truth.
    const limited=await searchLeadsByPhone('01711000',now,2,actorId);
    searches.push({typed:'01711000',result:limited});
    assert.equal(limited.hits.length,2,'two rows are returned…');
    assert.equal(limited.total,3,'…and the operator is told there are three, so a page is not mistaken for the answer');

    // ---- 5. The number never reaches a URL: the GET path stays closed while the POST path works.
    const asUrl=leadListQuery({locale:'bn',q:RAHUL});
    assert.equal(asUrl.refusedPhone,true,'the same digits are refused as a URL parameter');
    assert.equal(asUrl.href,'/bn/admin/leads','and the href carries nothing at all');
    assert.ok(!/\d{4,}/.test(asUrl.href),'no digit run of four or more survives in it');
    assert.equal(leadListQuery({q:RAHUL_BN}).refusedPhone,true,'Bangla digits too');
    assert.equal(leadListQuery({q:'7090'}).refusedPhone,true,'and a partial number, because the two thresholds are the same constant');
    assert.equal(PHONE_SEARCH_MIN_DIGITS,4,'the shortest search the posted path accepts…');
    assert.equal((await listLeads({q:RAHUL},now)).refusedPhone,true,'…is the shortest the GET path refuses');
    assert.equal((await listLeads({q:'7090'},now)).refusedPhone,true,'so no fragment can slip through the list instead');
    const byName=await listLeads({q:'রাহুল'},now);
    assert.equal(byName.refusedPhone,false,'a name is still a legitimate URL parameter');
    assert.ok(byName.rows.some(row=>row.leadId===rahul.leadId),'and still finds the lead');

    // ---- 6. What the result carries: numbers only where a dialler needs them, masks everywhere else.
    for(const {result} of searches){
      assert.ok(!JSON.stringify(result.masked).match(/01[3-9]\d{8}/),'the echo of a search is a mask, never a number');
      for(const hit of result.hits){
        assert.ok(!leadPath(hit.leadId).match(/01[3-9]\d{8}/),'the app route to a lead carries no number');
        for(const phone of hit.phones){
          assert.equal(phone.tel,`tel:+88${phone.normalized.slice(1)}`,'the only hrefs carrying a number are the two destinations the brief requires');
          assert.ok(phone.whatsapp.startsWith('https://wa.me/88'));
          assert.equal(phone.masked,maskPhone(phone.normalized),'and every row also carries its mask, for anywhere that must not show the number');
        }
      }
    }

    // ---- 7. What was said out loud while all of that ran.
    console.log=real.log;console.error=real.error;console.warn=real.warn;console.info=real.info;
    const said=spoken.join('\n');
    for(const number of EVERY_NUMBER){
      assert.ok(!said.includes(number),`nothing printed the number ${maskPhone(number)} while searching`);
      assert.ok(!said.includes(number.slice(1)),`nor without its leading zero (${maskPhone(number)})`);
    }
    assert.ok(!said.includes(RAHUL_BN),'and nothing printed it in Bangla digits either');
    const audits=await AdminAudit.find({action:'lead.phone-search'}).lean();
    assert.equal(audits.length,searches.filter(entry=>entry.result.status!=='refused').length,'every search that actually ran left one audit row — a refusal touched no data, so it is not logged');
    assert.ok(audits.every(row=>/^(\*\*\*\*|\d{2}\*\*\*\*\d{2})$/.test(row.target)),'each target is a mask');
    assert.ok(!audits.some(row=>/\d{4}/.test(row.target)),'not one digit run of four or more is in any of them');
    assert.ok((await AdminAudit.find({action:/^lead\./}).lean()).every(row=>!row.target.match(/01[3-9]\d{8}/)),'and no lead audit row anywhere holds a number');

    // ---- 8. Structural: the action is the only door, it exports only actions, and it logs no value.
    const actionSource=await readFile('src/actions/leads.ts','utf8');
    const exported=actionSource.split('\n').filter(line=>/^export /.test(line));
    assert.ok(exported.length>=1,'src/actions/leads.ts exports the search');
    assert.ok(exported.every(line=>/^export async function /.test(line)),'and exports ONLY async functions — one value export would corrupt every server action in the app');
    assert.ok(/requireArchiver\(\)/.test(actionSource),'it is guarded before it touches anything: Admin and Staff, Teachers excluded');
    const logged=actionSource.split('\n').filter(line=>/console\./.test(line));
    assert.ok(logged.length>=1,'a failure is logged');
    assert.ok(logged.every(line=>line.includes('{name:')&&!line.includes('error.message')&&!line.includes('String(error)')),'…by error NAME only, because a driver error can quote the value it choked on');
    assert.ok(!/href|Link|router\.push|searchParams/.test(actionSource),'and the action builds no href and reads no query parameter');

    // ---- 9. There is no analytics in this repository for a number to leak into.
    const patterns=[/gtag\s*\(/,/googletagmanager/,/google-analytics/,/dataLayer/,/fbq\s*\(/,/fbevents/,/plausible\.io/,/mixpanel/,/amplitude/,/posthog/,/segment\.io/,/analytics\.track\s*\(/,/clarity\.ms/,/hotjar/];
    const sources=await walk('src');
    const hits=[];
    for(const file of sources){
      const text=await readFile(file,'utf8');
      for(const pattern of patterns)if(pattern.test(text))hits.push(`${file}: ${pattern}`);
    }
    assert.deepEqual(hits,[],`no tracking global exists in src/ (${sources.length} files scanned), so there is no analytics event for a number to travel in — and if one is ever added, this test fails and asks whether it can see the leads search`);

    console.log(`Lead phone search: a number finds its lead typed exactly, without the leading zero, with +88 or 0088, in Bangla digits, with dashes, spaces or brackets, as a four-digit fragment and with a label still around it; a lead holding two numbers is found by either; a number nobody holds answers "empty" and a binned lead is not resurrected until it is restored; fewer than four digits is refused in Bangla that counts the digits without quoting them; a limit returns two rows and still reports three. The same digits are refused as a URL parameter — leadListQuery builds nothing and listLeads applies nothing — with both thresholds tied to one constant, so the number travels only as a form submission to a guarded server action. Console output captured across every search holds no fixture number in ASCII or Bangla; every audit target is a mask; the only hrefs carrying a number are tel: and wa.me; the action exports only async functions, logs an error name and never a value; and a scan of ${sources.length} files in src/ finds no analytics at all for a number to leak into.`);
  }finally{
    console.log=real.log;console.error=real.error;console.warn=real.warn;console.info=real.info;
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
