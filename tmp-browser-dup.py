import io
p='tests/lead-screens-browser.integration.ts'
s=io.open(p,encoding='utf-8').read()
def rep(old,new,n=1):
    global s
    assert s.count(old)==n,(old[:70],s.count(old))
    s=s.replace(old,new)

section = """
    // ---- 11. Duplicate phones (R3.10): the question, its three answers, and the drawer's mates.
    const DUP='ডুপ্লিকেট ভিজিটর',DUP2='দোকানদার ভিজিটর',M1='মার্জ প্রথম',M2='মার্জ দ্বিতীয়',T1='টাই প্রথম',T2='টাই দ্বিতীয়';
    const P6='01911223344',P7='01922334455';
    const typeAdd=async(name:string,phone:string)=>{
      const addPanel=panel(boss.page,t.addTitle);
      await addPanel.locator('input[name="studentName"]').waitFor({state:'visible',timeout:60000});
      await addPanel.locator('input[name="studentName"]').fill(name);
      await addPanel.locator('input[name="phone"]').fill(phone);
      await addPanel.locator('input[name="phone"]').press('Enter');
      return addPanel;
    };
    await boss.page.setViewportSize({width:360,height:900});
    await boss.page.goto(`${origin}${list}?new=1`,{waitUntil:'domcontentloaded',timeout:180000});
    // (a) A held number becomes a QUESTION: holders named and masked, and nothing written while it asks.
    let addPanel=await typeAdd(DUP,P1);
    const ask=addPanel.locator('[data-dup-ask]');
    await ask.waitFor({state:'visible',timeout:90000}).catch(async error=>{
      throw Error(`the duplicate question never appeared — ${error.message.split('\\n')[0]} · url=${boss.page.url()} · body=${JSON.stringify((await addPanel.innerText().catch(()=>'(none)')).replace(/\\s+/g,' ').slice(0,300))} · pageErrors=${JSON.stringify(boss.errors)}`);
    });
    const askText=(await ask.innerText()).replace(/\\s+/g,' ');
    assert.ok(askText.includes(RAHUL),`the question names who holds the number: ${askText.slice(0,200)}`);
    assert.ok(askText.includes(MASK_1),'the number is shown as its mask');
    assert.ok(!askText.includes(P1),'and never as digits');
    assert.equal(await Lead.countDocuments({studentName:DUP}),0,'nothing was written while the question stands');
    await noOverflow(boss.page,'the duplicate question at 360');
    await shot(boss.page,'b2-visitor-dup-360');
    // (b) The same question at desk width, then the sibling answer.
    await boss.page.setViewportSize({width:1440,height:900});
    await shot(boss.page,'b2-visitor-dup-1440');
    await ask.locator('button[name="dupChoice"][value="sibling"]').click();
    await until(async()=>(await Lead.countDocuments({studentName:DUP}))===1,'the sibling answer wrote exactly one lead',90000);
    const dupDoc=await Lead.findOne({studentName:DUP}).lean<{familyKey:string|null}>();
    const rahulDoc=await Lead.findOne({studentName:RAHUL}).lean<{familyKey:string|null}>();
    assert.equal(dupDoc!.familyKey,rahulDoc!.familyKey,'the sibling inherited the holder family key');
    // (c) "Keep as a separate lead": two strangers on one number, and NO family key on the new one.
    addPanel=await typeAdd(DUP2,P1);
    const ask2=addPanel.locator('[data-dup-ask]');
    await ask2.waitFor({state:'visible',timeout:90000});
    assert.ok(((await ask2.innerText()).replace(/\\s+/g,' ')).includes(DUP),'the question now lists the sibling too');
    await ask2.locator('button[name="dupChoice"][value="separate"]').click();
    await until(async()=>(await Lead.countDocuments({studentName:DUP2}))===1,'the separate answer wrote one lead',90000);
    const strangerDoc=await Lead.findOne({studentName:DUP2}).lean<{familyKey:string|null}>();
    assert.equal(strangerDoc!.familyKey,null,'a separate lead carries no family key at all');
    // (d) The drawer names the number-mates outside the family, masked, and merges one on purpose.
    await boss.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await rows(boss.page).filter({hasText:DUP2}).first().waitFor({timeout:90000});
    await rows(boss.page).filter({hasText:DUP2}).first().locator('button',{hasText:t.detail}).first().click();
    const dupDrawer=boss.page.locator('dialog.overview-drawer[open]');
    await dupDrawer.waitFor({state:'visible',timeout:60000});
    const mates=dupDrawer.locator('[data-dup-mates]');
    await mates.waitFor({state:'visible',timeout:90000});
    const matesText=(await mates.innerText()).replace(/\\s+/g,' ');
    assert.ok(matesText.includes(RAHUL)&&matesText.includes(SISTER),'the keyless stranger sees the whole holder family as mates');
    assert.ok(matesText.includes(MASK_1)&&!matesText.includes(P1),'masked here too');
    await shot(boss.page,'b2-visitor-dup-drawer-1440',false);
    // Merging bins the source behind the browser's own confirm, so the suite accepts that dialog on purpose.
    boss.page.once('dialog',dialog=>void dialog.accept());
    await mates.locator('li',{hasText:RAHUL}).locator('button',{hasText:t.dupMerge}).click();
    await until(async()=>{
      const gone=await Lead.findOne({studentName:RAHUL}).lean<{deletedAt:Date|null}>();
      return !!gone&&!!gone.deletedAt;
    },'the merged lead reached the bin',90000);
    await until(async()=>(await dupDrawer.locator('[data-dup-mates]').count())===0,'the drawer re-read itself and the block emptied',90000);
    assert.ok(((await dupDrawer.innerText()).replace(/\\s+/g,' ')).includes(SISTER),'and the merged family now lists the sibling');
    await dupDrawer.locator('button',{hasText:t.close}).first().click();
    await boss.page.locator('dialog.overview-drawer[open]').waitFor({state:'detached',timeout:60000}).catch(()=>{});
    // (e) Quick-add's own merge button: the entry folds into the named lead and writes no row.
    addPanel=await typeAdd(M1,P6);
    await addPanel.locator('p.admin-feedback').first().waitFor({state:'visible',timeout:90000});
    assert.equal(await addPanel.locator('[data-dup-ask]').count(),0,'a number nobody holds asks nothing');
    addPanel=await typeAdd(M2,P6);
    const ask3=addPanel.locator('[data-dup-ask]');
    await ask3.waitFor({state:'visible',timeout:90000});
    await ask3.locator('button[name="dupMerge"]').click();
    await until(async()=>(await Lead.countDocuments({studentName:M2}))===0,'the merge wrote no second row',90000);
    const m1=await Lead.findOne({studentName:M1}).lean<{notes:{text:string}[]}>();
    assert.ok((m1!.notes||[]).some(note=>note.text.includes('quick-add merge')),'and the target kept a record of it');
    // (f) Tying two leads that stay two: the mate block empties and the family list takes over.
    await typeAdd(T1,P7);
    await typeAdd(T2,P7);
    const ask4=panel(boss.page,t.addTitle).locator('[data-dup-ask]');
    await ask4.waitFor({state:'visible',timeout:90000});
    await ask4.locator('button[name="dupChoice"][value="separate"]').click();
    await until(async()=>(await Lead.countDocuments({studentName:T2}))===1,'the second stranger was written',90000);
    await boss.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await rows(boss.page).filter({hasText:T2}).first().waitFor({timeout:90000});
    await rows(boss.page).filter({hasText:T2}).first().locator('button',{hasText:t.detail}).first().click();
    const tieDrawer=boss.page.locator('dialog.overview-drawer[open]');
    await tieDrawer.waitFor({state:'visible',timeout:60000});
    await tieDrawer.locator('[data-dup-mates] li',{hasText:T1}).waitFor({state:'visible',timeout:90000});
    await tieDrawer.locator('[data-dup-mates] li',{hasText:T1}).locator('button',{hasText:t.dupTie}).click();
    await until(async()=>(await tieDrawer.locator('[data-dup-mates]').count())===0,'after the tie there are no mates outside the family',90000);
    assert.ok(((await tieDrawer.innerText()).replace(/\\s+/g,' ')).includes(T1),'the tied lead moved into the family list');
    await tieDrawer.locator('button',{hasText:t.close}).first().click();
    await boss.page.locator('dialog.overview-drawer[open]').waitFor({state:'detached',timeout:60000}).catch(()=>{});

"""

old="""    await boss.page.locator('dialog.overview-drawer[open]').waitFor({state:'detached',timeout:60000})
      .catch(()=>{/* the drawer closing is not what this section is about */});

    assert.deepEqual(boss.errors"""
assert s.count(old)==1
s=s.replace(old,"""    await boss.page.locator('dialog.overview-drawer[open]').waitFor({state:'detached',timeout:60000})
      .catch(()=>{/* the drawer closing is not what this section is about */});
"""+section+"""
    assert.deepEqual(boss.errors""")

oldclaim="every time it was submitted')+'.');"
assert s.count(oldclaim)==1
s=s.replace(oldclaim,"""every time it was submitted')+'. A number that is already on the list turns quick-add into a question instead of a second row: the holders are named and masked with no digits anywhere in the question, nothing is written while it stands, and its three answers are a sibling that inherits the holder family key, a merge that folds the entry into the named lead writing no row at all, and a separate lead that carries no key so two strangers on one number are not one family; the drawer lists the number-mates outside the family, merges one behind the browser own confirm into the bin with its notes and numbers, and ties two leads that stay two into one family — the question photographed at 360 px and 1440 px and the mates block at 1440 px.');""")
io.open(p,'w',encoding='utf-8').write(s)
print('browser suite ok')
