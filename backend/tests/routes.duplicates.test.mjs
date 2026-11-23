import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/routes');
const src=readdirSync(dir).filter(f=>f.endsWith('.ts')).map(f=>readFileSync(path.join(dir,f),'utf8')).join('\n');
const routes=[...src.matchAll(/app\.(get|post|put|patch|delete)\(['"`]([^'"`]+)/g)].map(m=>m[1]+' '+m[2]);
test('aucune route HTTP dupliquée',()=>{const duplicates=routes.filter((r,i)=>routes.indexOf(r)!==i);assert.deepEqual([...new Set(duplicates)],[]);});

