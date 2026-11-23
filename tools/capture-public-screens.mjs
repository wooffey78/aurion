// Bloc 15 — capture visuelle des écrans publics modifiés (landing sans image, titre réduit,
// connexion) à 1280×720 : vérification qu'aucun défilement vertical excessif n'apparaît.
// Le serveur est démarré ici sur une base déjà migrée ; aucune donnée réelle.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');
const listen = (server, port = 0, host = '127.0.0.1') => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.removeListener('error', reject); resolve(server.address().port); }); });
const freePort = async () => { const s = net.createServer(); const p = await listen(s); await new Promise(r => s.close(r)); return p; };
const port = await freePort(), baseUrl = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: 'test', AURION_LOCAL_EVALUATION_MODE: 'true', HOST: '127.0.0.1', PORT: String(port), APP_BASE_URL: baseUrl, CORS_ORIGIN: baseUrl, COOKIE_SECURE: 'false' };
const app = spawn(process.execPath, ['backend/dist/server.js'], { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe'] });
let log = '';
app.stderr.on('data', c => { log += c.toString(); });
const end = Date.now() + 45000;
let ready = false; while (Date.now() < end) { try { const r = await fetch(baseUrl + '/health/db'); if (r.ok) { ready = true; break; } } catch {} if (app.exitCode !== null) break; await delay(300); } if (!ready) throw new Error('Serveur de capture indisponible : ' + log.slice(-1200));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/landing-720.png', fullPage: false });
const landingScroll = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
await page.goto(baseUrl + '/?auth=login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/login-720.png', fullPage: false });
const loginScroll = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
// Mode connexion (onglet) : le formulaire est plus court — il doit tenir à 720 px.
await page.goto(baseUrl + '/?auth=login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);
await page.click('#login').catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/login-tab-720.png', fullPage: false });
const loginTabScroll = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
console.log(`landing scrollVertical=${landingScroll}px  login(scroll initial)=${loginScroll}px  loginTab=${loginTabScroll}px`);
await browser.close();
app.kill();
process.exit(0);
