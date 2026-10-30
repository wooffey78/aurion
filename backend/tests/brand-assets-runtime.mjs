import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import AdmZip from 'adm-zip';
import { addBrandGuideFiles, addBrandGuidePdf, addBrandLogoAssets, brandBundleReadme, pngHasTransparentPixels } from '../src/services/brand-assets.ts';

class MemoryZip {
  files = new Map();
  addFile(name, contents) { this.files.set(name, Buffer.from(contents)); }
  getEntries() { return [...this.files.keys()].map(entryName => ({ entryName })); }
}

function tinyPng(alpha, width = 1, height = 1) {
  const crc32 = data => {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const kind = Buffer.from(type, 'ascii'), length = Buffer.alloc(4), crc = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(Buffer.concat([kind, data])));
    return Buffer.concat([length, kind, data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    for (let x = 0; x < width; x++) rows.set([20, 40, 60, alpha], row + 1 + x * 4);
  }
  const pixels = deflateSync(rows);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('détecte la transparence réelle des pixels PNG et échoue prudemment sur les autres formats', () => {
  assert.equal(pngHasTransparentPixels(tinyPng(0)), true);
  assert.equal(pngHasTransparentPixels(tinyPng(255)), false);
  assert.equal(pngHasTransparentPixels(Buffer.from('not a png')), false);
  const invalidChecksum = tinyPng(0);
  invalidChecksum[invalidChecksum.length - 1] ^= 1;
  assert.equal(pngHasTransparentPixels(invalidChecksum), false);
});

test('ne génère les variantes monochromes que lorsque des pixels transparents sont vérifiés', () => {
  const opaqueZip = new MemoryZip();
  const opaque = tinyPng(255);
  assert.equal(addBrandLogoAssets(opaqueZip, opaque, '.png', '#2563eb', '#111827').monochromeAdded, false);
  assert.equal(opaqueZip.files.has('logo/variantes/logo-monochrome-noir.svg'), false);

  const transparentZip = new MemoryZip();
  const transparent = tinyPng(0);
  assert.equal(addBrandLogoAssets(transparentZip, transparent, '.png', '#2563eb', '#111827').monochromeAdded, true);
  assert.deepEqual(transparentZip.files.get('logo/logo-principal.png'), transparent);
  assert.match(transparentZip.files.get('logo/variantes/logo-monochrome-noir.svg').toString(), /feColorMatrix/);
});

test('le guide et les tokens exportent le thème sans interpréter le nom de l’entreprise comme du HTML', () => {
  const zip = new MemoryZip();
  const logo = tinyPng(0);
  addBrandLogoAssets(zip, logo, '.png', '#2563eb', '#111827');
  const added = addBrandGuideFiles(zip, {
    companyName: '<script>alert(1)</script>', activity: 'Électricité', accent: 'red', dark: '#112233', font: 'serif', radius: 'square',
  });

  assert.deepEqual(added, ['brand/tokens.css', 'brand/guide-identite.html']);
  const guide = zip.files.get('brand/guide-identite.html').toString();
  const tokens = zip.files.get('brand/tokens.css').toString();
  assert.doesNotMatch(guide, /<script>/i);
  assert.match(guide, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(guide, /logo\/variantes\/logo-fond-clair\.svg/);
  assert.match(guide, /ne constituent pas une vectorisation/);
  assert.match(guide, /Contraste avec blanc : 5\.[0-9]+:1/);
  assert.match(guide, /Georgia, &quot;Times New Roman&quot;, serif/);
  assert.match(tokens, /--aurion-brand-accent: #0B63CE/);
  assert.match(tokens, /--aurion-brand-dark-text: #FFFFFF/);
  assert.match(tokens, /--aurion-brand-radius: 0px/);
  assert.equal(zip.files.has('brand/palette.json'), false);

  const lightBackgroundZip = new MemoryZip();
  addBrandGuideFiles(lightBackgroundZip, { dark: '#F5F5F5' });
  const lightGuide = lightBackgroundZip.files.get('brand/guide-identite.html').toString();
  assert.match(lightGuide, /\.swatch-color\.dark\{background:#F5F5F5;color:#111827\}/);
  assert.match(lightGuide, /Contraste avec blanc : 1\.[0-9]+:1/);
});

test('le README décrit seulement les actifs réellement présents', () => {
  const noLogo = brandBundleReadme('Entreprise exemple', ['palette.json', 'brand/guide-identite.html']);
  assert.match(noLogo, /Aucun logo principal n’est enregistré/);
  assert.doesNotMatch(noLogo, /logo\/variantes\/logo-fond-clair\.svg/);
  assert.match(noLogo, /brand\/guide-identite\.html/);

  const withLogo = brandBundleReadme('Entreprise exemple', ['logo/logo-principal.png', 'logo/variantes/logo-fond-clair.svg']);
  assert.match(withLogo, /Le logo principal ci-dessous est le fichier enregistré/);
  assert.match(withLogo, /logo\/variantes\/logo-fond-clair\.svg/);
});

test('le kit de marque produit un ZIP lisible avec les fichiers annoncés et le logo original intact', () => {
  const source = tinyPng(0);
  const zip = new AdmZip();
  const logo = addBrandLogoAssets(zip, source, '.png', '#2563eb', '#111827');
  const guideFiles = addBrandGuideFiles(zip, { companyName: 'Atelier Exemple', activity: 'Réparation', accent: '#2563eb', dark: '#111827' });
  const assetPaths = zip.getEntries().map(entry => entry.entryName);
  zip.addFile('palette.json', Buffer.from(JSON.stringify({ accent: '#2563EB', dark: '#111827' }), 'utf8'));
  zip.addFile('README.md', Buffer.from(brandBundleReadme('Atelier Exemple', [...assetPaths, 'palette.json']), 'utf8'));

  const reopened = new AdmZip(zip.toBuffer());
  const files = new Map(reopened.getEntries().map(entry => [entry.entryName, entry.getData()]));
  assert.equal(logo.originalAdded, true);
  assert.equal(logo.monochromeAdded, true);
  assert.deepEqual(guideFiles, ['brand/tokens.css', 'brand/guide-identite.html']);
  assert.deepEqual(files.get('logo/logo-principal.png'), source);
  const presentationSvg = files.get('logo/variantes/logo-fond-clair.svg').toString();
  const embeddedPng = presentationSvg.match(/href="data:image\/png;base64,([^"]+)"/);
  assert.ok(embeddedPng, 'le SVG doit embarquer le logo PNG source');
  assert.deepEqual(Buffer.from(embeddedPng[1], 'base64'), source);
  assert.match(files.get('brand/guide-identite.html').toString(), /Atelier Exemple/);
  assert.match(files.get('README.md').toString(), /logo\/variantes\/logo-monochrome-noir\.svg/);
  assert.ok(files.has('favicon.svg'));
  assert.ok(files.has('palette.json'));
});

test('un PNG carré génère des tailles raster courantes et un favicon ICO compatible', () => {
  const zip = new MemoryZip(), source = tinyPng(255, 64, 64);
  const result = addBrandLogoAssets(zip, source, '.png', '#2563eb', '#111827');
  assert.deepEqual(result.rasterVariantsAdded.sort(), ['logo/favicon.ico', 'logo/formats/logo-32.png', 'logo/formats/logo-64.png'].sort());
  const icon = zip.files.get('logo/formats/logo-32.png');
  assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(icon.readUInt32BE(16), 32);
  assert.equal(icon.readUInt32BE(20), 32);
  const ico = zip.files.get('logo/favicon.ico');
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt32LE(14), ico.length - 22);
  assert.equal(ico.subarray(22, 30).toString('hex'), '89504e470d0a1a0a');
});

test('le guide PDF imprimable reprend le thème et le vrai logo inclus', async () => {
  const zip = new AdmZip(), logo = tinyPng(0);
  addBrandLogoAssets(zip, logo, '.png', '#2563eb', '#111827');
  await addBrandGuidePdf(zip, { companyName: 'Atelier Exemple', activity: 'Réparation', accent: '#2563eb', dark: '#111827' }, logo);
  const pdf = zip.getEntry('brand/guide-identite.pdf')?.getData();
  assert.ok(pdf?.subarray(0, 5).equals(Buffer.from('%PDF-')));
  assert.ok(pdf.length > 1000);
  assert.match(pdf.toString('latin1'), /%%EOF/);
});
