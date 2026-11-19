const { chromium } = require(process.env.CAREKOSH_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs');
const path = require('path');
const {pathToFileURL} = require('url');
const root=path.resolve(__dirname,'..');
const evidence=fs.mkdtempSync(path.join(require('os').tmpdir(),'carekosh-browser-review-'));
console.log('Screenshots and browser results: '+evidence);
(async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1100,height:1000}});
  const page=await context.newPage();
  const consoleErrors=[];
  page.on('pageerror',e=>consoleErrors.push(String(e)));
  const diagrams=[];
  for(const name of fs.readdirSync(path.join(root,'diagrams')).filter(x=>x.endsWith('.svg')).sort()){
    await page.goto(pathToFileURL(path.join(root,'diagrams',name)).href);
    await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,8000))]));
    const data=await page.evaluate(()=>{
      const svg=document.querySelector('svg'),vb=svg.viewBox.baseVal;
      const texts=[...svg.querySelectorAll('text')].map(el=>{const b=el.getBBox();return {text:el.textContent.trim(),x:b.x,y:b.y,w:b.width,h:b.height}});
      const overflow=texts.filter(b=>b.x<-.5||b.y<-.5||b.x+b.w>vb.width+.5||b.y+b.h>vb.height+.5);
      const collisions=[];
      for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){
        const a=texts[i],b=texts[j];
        if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>2 && Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>2)
          collisions.push([a.text,b.text]);
      }
      return {texts:texts.length,overflow,collisions,fonts:document.fonts.check('18px Newsreader')};
    });
    await page.locator('svg').screenshot({path:path.join(evidence,name.replace('.svg','.png'))});
    diagrams.push({name,...data});
  }
  const pages=[];
  for(const name of fs.readdirSync(root).filter(x=>/^0[1-4]_.*\.html$/.test(x)).sort()){
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(pathToFileURL(path.join(root,name)).href);
    await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,8000))]));
    const structure=await page.evaluate(()=>{
      const ids=[...document.querySelectorAll('[id]')].map(x=>x.id);
      const badReferences=[...document.querySelectorAll('a[href^="#"]')].map(x=>x.getAttribute('href').slice(1)).filter(id=>id&&!document.getElementById(decodeURIComponent(id)));
      return {figures:document.querySelectorAll('figure.diagram').length,enlargeButtons:document.querySelectorAll('.fig-tools button').length,
        duplicateIds:ids.filter((x,i)=>ids.indexOf(x)!==i),badReferences,desktopOverflow:document.documentElement.scrollWidth>innerWidth+2};
    });
    const buttons=page.locator('.fig-tools button');
    for(let i=0;i<await buttons.count();i++){
      await buttons.nth(i).click();
      if(!await page.locator('dialog[open] svg').count())throw Error(`Enlarge failed: ${name}, figure ${i}`);
      await page.locator('[data-z="close"]').click();
    }
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(evidence,name.replace('.html','-desktop.png'))});
    await page.setViewportSize({width:390,height:844});
    const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
    await page.screenshot({path:path.join(evidence,name.replace('.html','-mobile.png'))});
    pages.push({name,...structure,mobileOverflow});
  }
  fs.writeFileSync(path.join(evidence,'browser-qa.json'),JSON.stringify({diagrams,pages,consoleErrors},null,2));
  console.log(JSON.stringify({diagramCount:diagrams.length,textCount:diagrams.reduce((a,b)=>a+b.texts,0),
    diagramIssues:diagrams.filter(x=>x.overflow.length||x.collisions.length),pages,consoleErrors},null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
