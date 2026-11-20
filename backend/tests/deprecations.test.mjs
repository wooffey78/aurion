import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const dir=path.resolve(fileURLToPath(new URL('../src/routes', import.meta.url)));
const src=readdirSync(dir).filter(f=>f.endsWith('.ts')).map(f=>readFileSync(path.join(dir,f),'utf8')).join('\n');
test('/regulatory reste explicitement supprimée après migration 013',()=>assert.equal([...src.matchAll(/app\.(get|post|put|patch|delete)\(['"`]([^'"`]+)/g)].some(m=>m[2]==='/regulatory'),false));
