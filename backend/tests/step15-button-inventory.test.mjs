import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function files(dir) {
  const out=[];
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory()) out.push(...files(p));
    else if(/\.(js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const jsFiles=files(path.join(root,'assets/js'));
const sources=jsFiles.map(f=>[f,fs.readFileSync(f,'utf8')]);
const all=sources.map(x=>x[1]).join('\n');

test('Step 15: all dashboard navigation buttons have delegated click contracts',()=>{
  assert.match(all,/navRoot\.onclick=.*button\[data-view\]/s);
  assert.match(all,/view\.querySelectorAll\('\[data-go\]'\)/);
});

test('Step 15: no catalog or SAV row button opens a modal/confirmation during bind',()=>{
  const suspects=[];
  for(const [file,src] of sources){
    const re=/(?:all|\$\$|querySelectorAll)\([^\n]{0,140}\)\.forEach\(b=>\{([\s\S]{0,1800}?)\n?\s*\}\)/g;
    let m;
    while((m=re.exec(src))){
      if((m[1].includes('modalForm(')||m[1].includes('confirmDelete(')) && !m[1].includes('b.onclick') && !m[1].includes('addEventListener')) suspects.push(`${file}:${m[0].slice(0,140)}`);
    }
  }
  assert.deepEqual(suspects,[]);
});

test('Step 15: static button ids either have a click contract or submit a form',()=>{
  const knownSubmit=new Set(['submit','send','go','vip-submit','mb-save']);
  const missing=[];
  for(const [file,src] of sources){
    for(const m of src.matchAll(/<button\b([^>]*)>/g)){
      const a=m[1], id=a.match(/id="([^"]+)"/i)?.[1];
      if(!id || id.includes('${')) continue;
      const windowSrc=src;
      const hasHandler = new RegExp(`(?:#${id.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}|\\b${id}\\b)[\\s\\S]{0,1200}(?:onclick|addEventListener\\(|onsubmit)`).test(windowSrc);
      const isSubmit = /type="submit"/i.test(a) || knownSubmit.has(id);
      if(!hasHandler && !isSubmit) missing.push(`${file}#${id}`);
    }
  }
  assert.deepEqual(missing,[]);
});
