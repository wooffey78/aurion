import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const jsRoot=path.join(root,'assets','js');
const files=[];
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(/\.(?:js|mjs)$/.test(entry.name))files.push(full)}}
walk(jsRoot);
files.push(path.join(root,'sw.js'));
files.sort();

for(const file of files){
  try{execFileSync(process.execPath,['--check',file],{cwd:root,stdio:'pipe'})}
  catch(error){const out=Buffer.concat([error.stdout||Buffer.alloc(0),error.stderr||Buffer.alloc(0)]).toString();throw new Error('node --check a échoué pour '+path.relative(root,file)+'\n'+out)}
}

const moduleFiles=files.filter(file=>file.startsWith(jsRoot+path.sep));
for(const entry of moduleFiles){
  const context=vm.createContext({});
  const cache=new Map();
  const load=abs=>{
    if(cache.has(abs))return cache.get(abs);
    const source=readFileSync(abs,'utf8');
    const mod=new vm.SourceTextModule(source,{context,identifier:pathToFileURL(abs).href});
    cache.set(abs,mod);
    return mod;
  };
  try{
    const rootModule=load(entry);
    await rootModule.link(async(specifier,referencingModule)=>{
      if(!specifier.startsWith('.'))throw new Error('Import non relatif non autorisé dans assets/js: '+specifier);
      const from=referencingModule.identifier.startsWith('file:')?fileURLToPath(referencingModule.identifier):referencingModule.identifier;
      const target=path.resolve(path.dirname(from),specifier);
      if(!target.startsWith(jsRoot+path.sep)||!existsSync(target)||!path.extname(target))throw new Error('Import introuvable: '+path.relative(root,from)+' -> '+specifier);
      return load(target);
    });
  }catch(error){throw new Error('Résolution imports/exports échouée depuis '+path.relative(root,entry)+': '+error.message)}
}
console.log('Frontend check OK: '+files.length+' fichiers vérifiés par node --check; imports relatifs et exports vérifiés dans '+moduleFiles.length+' modules.');
