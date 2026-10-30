import type AdmZip from 'adm-zip';
import { deflateSync, inflateSync } from 'node:zlib';

const safeColor = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : fallback;
const pngCrcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function pngCrc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = pngCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function decodePngRgba(buffer: Buffer): { width: number; height: number; pixels: Buffer } | null {
  try {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) return null;
    let width=0,height=0,colorType=-1,interlace=-1,seenHeader=false,seenData=false,ended=false,offset=8;
    const compressed:Buffer[]=[];
    while(offset+12<=buffer.length){
      const length=buffer.readUInt32BE(offset);if(length>buffer.length-offset-12)return null;
      const type=buffer.toString('ascii',offset+4,offset+8),start=offset+8,end=start+length;
      if(pngCrc32(buffer.subarray(offset+4,end))!==buffer.readUInt32BE(end))return null;
      if(type==='IHDR'){
        if(seenHeader||length!==13)return null;
        width=buffer.readUInt32BE(start);height=buffer.readUInt32BE(start+4);
        if(buffer[start+8]!==8||buffer[start+10]!==0||buffer[start+11]!==0)return null;
        colorType=buffer[start+9];interlace=buffer[start+12];seenHeader=true;
      }else if(type==='IDAT'){if(!seenHeader)return null;seenData=true;compressed.push(buffer.subarray(start,end));}
      else if(type==='IEND'){if(length!==0)return null;ended=true;break;}
      offset=end+4;
    }
    if(!seenHeader||!seenData||!ended||interlace!==0||![2,6].includes(colorType)||!width||!height||width*height>4_000_000)return null;
    const sourceChannels=colorType===6?4:3,rowBytes=width*sourceChannels,expected=height*(rowBytes+1);
    const decoded=inflateSync(Buffer.concat(compressed),{maxOutputLength:expected});if(decoded.length!==expected)return null;
    const rgba=Buffer.allocUnsafe(width*height*4);let cursor=0,previous=Buffer.alloc(rowBytes);
    const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
    for(let y=0;y<height;y++){
      const filter=decoded[cursor++];if(filter>4)return null;const row=Buffer.allocUnsafe(rowBytes);
      for(let x=0;x<rowBytes;x++){
        const raw=decoded[cursor++],left=x>=sourceChannels?row[x-sourceChannels]:0,up=previous[x]||0,upperLeft=x>=sourceChannels?previous[x-sourceChannels]:0;
        const predictor=filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?paeth(left,up,upperLeft):0;row[x]=(raw+predictor)&255;
      }
      for(let x=0;x<width;x++){const source=x*sourceChannels,target=(y*width+x)*4;rgba[target]=row[source];rgba[target+1]=row[source+1];rgba[target+2]=row[source+2];rgba[target+3]=sourceChannels===4?row[source+3]:255;}
      previous=row;
    }
    return {width,height,pixels:rgba};
  }catch{return null;}
}

function pngChunk(type:string,data:Buffer){
  const kind=Buffer.from(type,'ascii'),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);
  crc.writeUInt32BE(pngCrc32(Buffer.concat([kind,data])));return Buffer.concat([length,kind,data,crc]);
}

function resizedPng(buffer:Buffer,size:number):Buffer|null{
  const source=decodePngRgba(buffer);if(!source)return null;
  const pixels=Buffer.alloc(size*size*4),scale=Math.min(size/source.width,size/source.height),drawWidth=Math.max(1,Math.round(source.width*scale)),drawHeight=Math.max(1,Math.round(source.height*scale)),offsetX=Math.floor((size-drawWidth)/2),offsetY=Math.floor((size-drawHeight)/2);
  for(let y=0;y<drawHeight;y++)for(let x=0;x<drawWidth;x++){
    const sx=Math.min(source.width-1,Math.max(0,Math.floor((x+0.5)/scale))),sy=Math.min(source.height-1,Math.max(0,Math.floor((y+0.5)/scale)));
    const from=(sy*source.width+sx)*4,to=((offsetY+y)*size+offsetX+x)*4;source.pixels.copy(pixels,to,from,from+4);
  }
  const rows=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++)pixels.copy(rows,y*(size*4+1)+1,y*size*4,(y+1)*size*4);
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(rows)),pngChunk('IEND',Buffer.alloc(0))]);
}

function pngAsIco(png:Buffer,size:number):Buffer{
  const header=Buffer.alloc(22);header.writeUInt16LE(0,0);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);
  header[6]=size===256?0:size;header[7]=size===256?0:size;header[8]=0;header[9]=0;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
  return Buffer.concat([header,png]);
}

/** Returns true only when a supported, non-interlaced PNG contains a decoded alpha value below 100%. */
export function pngHasTransparentPixels(buffer: Buffer): boolean {
  try {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) return false;

    let width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = -1;
    const compressed: Buffer[] = [];
    let offset = 8, hasHeader = false, hasImageData = false, ended = false;
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      if (length > buffer.length - offset - 12) return false;
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      const dataStart = offset + 8, dataEnd = dataStart + length;
      if (pngCrc32(buffer.subarray(offset + 4, dataEnd)) !== buffer.readUInt32BE(dataEnd)) return false;
      if (!hasHeader && type !== 'IHDR') return false;
      if (type === 'IHDR') {
        if (hasHeader || length !== 13) return false;
        width = buffer.readUInt32BE(dataStart);
        height = buffer.readUInt32BE(dataStart + 4);
        bitDepth = buffer[dataStart + 8];
        colorType = buffer[dataStart + 9];
        if (buffer[dataStart + 10] !== 0 || buffer[dataStart + 11] !== 0) return false;
        interlace = buffer[dataStart + 12];
        hasHeader = true;
      } else if (type === 'IDAT') {
        hasImageData = true;
        compressed.push(buffer.subarray(dataStart, dataEnd));
      } else if (type === 'IEND') {
        if (length !== 0) return false;
        ended = true;
        break;
      }
      offset = dataEnd + 4;
    }

    // Interlaced, palette, grayscale, and unsupported bit-depth sources are omitted conservatively.
    if (!hasHeader || !hasImageData || !ended || interlace !== 0 || ![8, 16].includes(bitDepth) || ![4, 6].includes(colorType)) return false;
    if (!width || !height || width * height > 16_000_000) return false;
    const channels = colorType === 6 ? 4 : 2;
    const sampleBytes = bitDepth / 8;
    const bytesPerPixel = channels * sampleBytes;
    const rowBytes = width * bytesPerPixel;
    const expectedBytes = height * (rowBytes + 1);
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes > 64 * 1024 * 1024) return false;

    const decoded = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedBytes });
    if (decoded.length !== expectedBytes) return false;
    let cursor = 0, hasTransparency = false;
    let previous = Buffer.alloc(rowBytes);
    const paeth = (a: number, b: number, c: number) => {
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    for (let y = 0; y < height; y++) {
      const filter = decoded[cursor++];
      if (filter > 4) return false;
      const row = Buffer.allocUnsafe(rowBytes);
      for (let x = 0; x < rowBytes; x++) {
        const raw = decoded[cursor++], left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
        const up = previous[x] || 0, upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
        const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : 0;
        row[x] = (raw + predictor) & 0xff;
      }
      for (let x = 0; x < width; x++) {
        const alphaOffset = x * bytesPerPixel + (channels - 1) * sampleBytes;
        const alpha = sampleBytes === 1 ? row[alphaOffset] : row.readUInt16BE(alphaOffset);
        if (alpha < (sampleBytes === 1 ? 255 : 65535)) hasTransparency = true;
      }
      previous = row;
    }
    return hasTransparency;
  } catch {
    return false;
  }
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const rgb = (hex: string) => ({ r: Number.parseInt(hex.slice(1, 3), 16), g: Number.parseInt(hex.slice(3, 5), 16), b: Number.parseInt(hex.slice(5, 7), 16) });
const linear = (channel: number) => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
function contrastRatio(a: string, b: string): number {
  const luminance = (value: string) => { const c = rgb(value); return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b); };
  const first = luminance(a), second = luminance(b);
  return Number(((Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)).toFixed(2));
}

export function addBrandGuideFiles(zip: AdmZip, options: { companyName?: unknown; activity?: unknown; website?: unknown; accent?: unknown; dark?: unknown; font?: unknown; radius?: unknown }): string[] {
  const accent = safeColor(options.accent, '#0B63CE');
  const dark = safeColor(options.dark, '#0B1220');
  const font = options.font === 'serif' ? 'serif' : 'sans';
  const radius = options.radius === 'square' ? 'square' : 'round';
  const fontStack = font === 'serif' ? 'Georgia, "Times New Roman", serif' : 'Arial, Helvetica, sans-serif';
  const radiusValue = radius === 'square' ? '0px' : '16px';
  const entries = new Set(zip.getEntries().map(entry => entry.entryName));
  const logoFiles = [...entries].filter(name => name === 'logo/logo-principal.png' || name === 'logo/logo-principal.jpg' || name === 'logo/logo-principal.jpeg');
  const previewAssets = [
    ['logo principal', logoFiles[0]],
    ['fond clair', 'logo/variantes/logo-fond-clair.svg'],
    ['fond sombre', 'logo/variantes/logo-fond-sombre.svg'],
    ['fond accent', 'logo/variantes/logo-fond-accent.svg'],
    ['icône carrée', 'logo/icone-carree.svg'],
    ['favicon SVG', 'favicon.svg'],
    ['monochrome noir', 'logo/variantes/logo-monochrome-noir.svg'],
    ['monochrome blanc', 'logo/variantes/logo-monochrome-blanc.svg'],
  ].filter((item): item is [string, string] => Boolean(item[1] && entries.has(item[1] as string)));
  const preview = previewAssets.map(([label, filename]) => `<figure><img src="../${escapeHtml(filename)}" alt="${escapeHtml(label)}"><figcaption>${escapeHtml(label)}</figcaption></figure>`).join('');
  const companyName = String(options.companyName ?? '').trim().slice(0, 160);
  const activity = String(options.activity ?? '').trim().slice(0, 240);
  const website = String(options.website ?? '').trim().slice(0, 240);
  const accentText = contrastRatio(accent, '#FFFFFF') >= contrastRatio(accent, '#111827') ? '#FFFFFF' : '#111827';
  const darkText = contrastRatio(dark, '#FFFFFF') >= contrastRatio(dark, '#111827') ? '#FFFFFF' : '#111827';
  const css = `/* Tokens issus du thème de document Aurion. Aucune police propriétaire n'est embarquée. */\n:root {\n  --aurion-brand-accent: ${accent};\n  --aurion-brand-accent-text: ${accentText};\n  --aurion-brand-dark: ${dark};\n  --aurion-brand-dark-text: ${darkText};\n  --aurion-brand-font: ${fontStack};\n  --aurion-brand-radius: ${radiusValue};\n}\n`;
  const companyHeading = companyName ? `<p class="eyebrow">${escapeHtml(companyName)}</p>` : '<p class="eyebrow">Guide d’identité visuelle</p>';
  const details = [activity && `<p><b>Activité</b><br>${escapeHtml(activity)}</p>`, website && `<p><b>Site indiqué</b><br>${escapeHtml(website)}</p>`].filter(Boolean).join('');
  const fileSection = previewAssets.length ? `<section><h2>Ressources disponibles</h2><div class="assets">${preview}</div><p class="note">Les aperçus SVG encadrent l’image source. Ils restent des adaptations d’affichage et ne constituent pas une vectorisation du dessin.</p></section>` : '<section><h2>Logo</h2><p>Aucun logo principal n’est enregistré dans ce bundle. Les variantes correspondantes n’ont pas été générées.</p></section>';
  const guide = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guide de marque — ${escapeHtml(companyName || 'Aurion')}</title><style>:root{font-family:${fontStack};color:#173252;background:#f1f6fc}*{box-sizing:border-box}body{margin:0;padding:28px;line-height:1.55}main{max-width:960px;margin:auto}.eyebrow{text-transform:uppercase;letter-spacing:.12em;color:${accent};font-size:.8rem;font-weight:700}h1,h2{line-height:1.2}h1{font-size:2rem;margin:.25em 0}h2{font-size:1.25rem;margin:0 0 14px}section{margin:22px 0;padding:22px;border:1px solid #d4e0ef;border-radius:${radiusValue};background:#fff;break-inside:avoid}.swatches,.assets{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.swatch,figure{margin:0;padding:14px;border:1px solid #d4e0ef;border-radius:12px;background:#fff}.swatch-color{height:76px;border-radius:8px;background:${accent};color:${accentText};display:grid;place-items:center;font-weight:700}.swatch-color.dark{background:${dark};color:#fff}.swatch code{display:block;margin-top:8px}.assets img{width:100%;height:150px;object-fit:contain;background:repeating-conic-gradient(#edf2f8 0% 25%,#fff 0% 50%) 50%/18px 18px}.assets figcaption{margin-top:8px;font-weight:700}.note{color:#435d7b}.rules{padding-left:1.2em}.footer{border-top:1px solid #d4e0ef;margin-top:24px;padding-top:12px;color:#435d7b;font-size:.9rem}@media(max-width:600px){body{padding:14px}section{padding:16px}.swatches,.assets{grid-template-columns:1fr}}@media print{body{padding:0;background:#fff}section{box-shadow:none}.assets{grid-template-columns:repeat(3,1fr)}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation:none!important;transition:none!important}}</style></head><body><main>${companyHeading}<h1>Guide de marque</h1>${details}<section><h2>Palette enregistrée</h2><div class="swatches"><div class="swatch"><div class="swatch-color">Texte adapté</div><code>Accent ${accent}</code><small>Contraste avec blanc : ${contrastRatio(accent, '#FFFFFF')}:1 · texte conseillé : ${accentText}</small></div><div class="swatch"><div class="swatch-color dark">Texte blanc</div><code>Sombre ${dark}</code><small>Contraste avec blanc : ${contrastRatio(dark, '#FFFFFF')}:1</small></div></div></section>${fileSection}<section><h2>Typographie et forme des documents</h2><p>Famille choisie : <b>${font === 'serif' ? 'sérif' : 'sans sérif'}</b> (${escapeHtml(fontStack)}). Cette famille est fournie par le système ; aucune police n’est incluse.</p><p>Style de bordure choisi : <b>${radius === 'square' ? 'angulaire' : 'arrondi'}</b>.</p></section><section><h2>Règles d’utilisation</h2><ul class="rules"><li>Conserver les proportions du fichier principal et vérifier sa lisibilité à la taille d’usage.</li><li>Choisir la présentation claire ou sombre selon le fond et contrôler le contraste avant diffusion.</li><li>Ne pas recolorer ou modifier le logo sans validation de son propriétaire.</li><li>Les SVG livrés contiennent une image intégrée lorsque leur source est matricielle ; un graphiste doit créer un tracé vectoriel natif si ce format est requis.</li></ul><p class="note">Aucune taille minimale ni zone de protection spécifique n’est déclarée : elles dépendent du dessin réel et doivent être définies après validation visuelle.</p></section><p class="footer">Généré depuis les paramètres de marque Aurion. Les ressources listées correspondent aux fichiers présents dans cette archive.</p></main></body></html>`;
  const accessibleGuide = guide.replace(`.swatch-color.dark{background:${dark};color:#fff}`, `.swatch-color.dark{background:${dark};color:${darkText}}`).replace('>Texte blanc</div>', '>Texte adapté</div>');
  zip.addFile('brand/tokens.css', Buffer.from(css, 'utf8'));
  zip.addFile('brand/guide-identite.html', Buffer.from(accessibleGuide, 'utf8'));
  return ['brand/tokens.css', 'brand/guide-identite.html'];
}

/** Adds a print-ready, single-page PDF brand guide using the saved logo and theme. */
export async function addBrandGuidePdf(zip: AdmZip, options: { companyName?: unknown; activity?: unknown; website?: unknown; accent?: unknown; dark?: unknown; font?: unknown; radius?: unknown }, logo?: Buffer): Promise<void> {
  const PDFDocument = (await import('pdfkit')).default;
  const accent = safeColor(options.accent, '#0B63CE'), dark = safeColor(options.dark, '#0B1220');
  const company = String(options.companyName ?? '').trim().slice(0, 160) || 'Entreprise';
  const activity = String(options.activity ?? '').trim().slice(0, 240);
  const website = String(options.website ?? '').trim().slice(0, 240);
  const fontLabel = options.font === 'serif' ? 'Serif — Georgia / Times New Roman' : 'Sans serif — Arial / Helvetica';
  const radiusLabel = options.radius === 'square' ? 'Angulaire' : 'Arrondi';
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 44, info: { Title: `Guide de marque — ${company}`, Author: 'Aurion' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const left = 44, width = 507;
    doc.roundedRect(left, 38, width, 75, 14).fill(dark);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(21).text(company, left + 20, 54, { width: width - 40, height: 28, ellipsis: true });
    doc.fillColor('#DCE7F5').font('Helvetica').fontSize(9).text('GUIDE D’IDENTITÉ VISUELLE  ·  GÉNÉRÉ AVEC AURION', left + 20, 84, { width: width - 40 });
    doc.fillColor('#172033').font('Helvetica-Bold').fontSize(17).text('Votre identité de marque', left, 134);
    doc.fillColor('#52647B').font('Helvetica').fontSize(9).text('Références pratiques pour présenter votre logo et votre thème de manière cohérente.', left, 158, { width });
    doc.roundedRect(left, 187, width, 142, 12).lineWidth(1).strokeColor('#D7E0EB').stroke();
    doc.fillColor('#52647B').font('Helvetica-Bold').fontSize(8).text('LOGO PRINCIPAL', left + 16, 201, { characterSpacing: 1.1 });
    if (logo?.length) {
      try { doc.image(logo, left + 16, 220, { fit: [width - 32, 94], align: 'center', valign: 'center' }); }
      catch { doc.fillColor('#52647B').font('Helvetica').fontSize(10).text('Le fichier logo est inclus séparément dans le ZIP.', left + 16, 244, { width: width - 32 }); }
    } else {
      doc.fillColor('#52647B').font('Helvetica').fontSize(10).text('Aucun logo n’est encore enregistré dans Aurion.', left + 16, 244, { width: width - 32 });
    }
    doc.fillColor('#172033').font('Helvetica-Bold').fontSize(13).text('Couleurs', left, 354);
    const swatchY = 382, swatchW = 245;
    for (const [index, color, label, textColor] of [[0, accent, 'Accent', contrastRatio(accent, '#FFFFFF') >= contrastRatio(accent, '#111827') ? '#FFFFFF' : '#111827'], [1, dark, 'Sombre', contrastRatio(dark, '#FFFFFF') >= contrastRatio(dark, '#111827') ? '#FFFFFF' : '#111827']] as const) {
      const x = left + index * (swatchW + 17);
      doc.roundedRect(x, swatchY, swatchW, 63, 9).fill(color);
      doc.fillColor(textColor).font('Helvetica-Bold').fontSize(10).text(label, x + 12, swatchY + 12);
      doc.font('Helvetica').fontSize(9).text(color, x + 12, swatchY + 34);
    }
    doc.fillColor('#52647B').font('Helvetica').fontSize(8.5).text(`Contraste de l’accent avec blanc : ${contrastRatio(accent, '#FFFFFF')}:1. Vérifiez la lisibilité pour chaque usage.`, left, 456, { width });
    doc.fillColor('#172033').font('Helvetica-Bold').fontSize(13).text('Style des documents', left, 491);
    doc.fillColor('#52647B').font('Helvetica').fontSize(10).text(`Typographie : ${fontLabel}\nFormes : ${radiusLabel}\nActivité : ${activity || 'Non renseignée'}\nSite indiqué : ${website || 'Non renseigné'}`, left, 516, { width, lineGap: 7 });
    doc.roundedRect(left, 635, width, 85, 10).fill('#F1F6FC');
    doc.fillColor('#172033').font('Helvetica-Bold').fontSize(10).text('Conseils d’utilisation', left + 14, 650);
    doc.fillColor('#52647B').font('Helvetica').fontSize(8.5).text('Conservez les proportions du logo. Vérifiez sa lisibilité sur les fonds clairs et sombres. Les fichiers SVG fournis adaptent l’affichage de l’image source et ne sont pas une vectorisation du dessin.', left + 14, 671, { width: width - 28, height: 38 });
    doc.fillColor('#8492A6').font('Helvetica').fontSize(8).text(`Aurion · ${new Date().toLocaleDateString('fr-FR')} · Les couleurs et typographies reprennent les réglages enregistrés.`, left, 778, { width, align: 'center' });
    doc.end();
  });
  zip.addFile('brand/guide-identite.pdf', buffer);
}

export function brandBundleReadme(companyValue: unknown, assetPaths: string[]): string {
  const company = String(companyValue ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 160) || 'Non renseignée';
  const markdownCompany = company.replace(/([\\`*_{}\[\]()#+.!|>~-])/g, '\\$1');
  const assets = [...new Set(assetPaths)].filter(name => name && name !== 'README.md' && name !== 'README.txt').sort();
  const hasLogo = assets.some(name => /^logo\/logo-principal\.(png|jpe?g)$/i.test(name));
  const monochrome = assets.some(name => name === 'logo/variantes/logo-monochrome-noir.svg' || name === 'logo/variantes/logo-monochrome-blanc.svg');
  return `# Kit d’identité visuelle Aurion\n\nEntreprise : ${markdownCompany}\n\n${hasLogo ? 'Le logo principal ci-dessous est le fichier enregistré dans Aurion.' : 'Aucun logo principal n’est enregistré dans ce bundle ; les variantes de logo n’ont donc pas été générées.'}\n\n## Contenu réellement inclus\n\n${assets.length ? assets.map(name => '- ' + name).join('\n') : '- Aucun actif de marque n’a été ajouté.'}\n\n${hasLogo ? 'Les SVG de présentation incorporent l’image principale et adaptent son cadre ; ils ne redessinent pas automatiquement son tracé. Vérifiez leur rendu à petite taille avant usage.' : ''}\n${monochrome ? 'Les variantes monochromes ne sont fournies que si des pixels transparents ont été vérifiés dans le PNG source.' : 'Aucune variante monochrome n’a été produite : aucune transparence réelle exploitable n’a été confirmée.'}\n\nLe fichier palette.json reste la référence des couleurs et du thème. Le PDF est prêt à partager ou imprimer. Le guide HTML et les tokens CSS présentent également les réglages pour la consultation et intégration. La typographie utilise des familles système, sans police propriétaire embarquée.\n\nAucun jeton OAuth, secret ou fichier d’une autre organisation n’est exporté.\n`;
}
function svgDocument(options: { width: number; height: number; background?: string; accent: string; dark: string; imageData: string; imageMime: string; monochrome?: 'black' | 'white'; rounded?: boolean }): string {
  const { width, height, background, accent, dark, imageData, imageMime, monochrome, rounded } = options;
  const margin = Math.round(Math.min(width, height) * 0.08);
  const filters = monochrome ? `<defs><filter id="aurion-monochrome" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 ${monochrome === 'white' ? 1 : 0} 0 0 0 0 ${monochrome === 'white' ? 1 : 0} 0 0 0 0 ${monochrome === 'white' ? 1 : 0} 0 0 0 1 0"/></filter></defs>` : '';
  const bg = background ? `<rect width="100%" height="100%" fill="${background}"${rounded ? ' rx="100"' : ''}/>` : '';
  const filter = monochrome ? ' filter="url(#aurion-monochrome)"' : '';
  const image = `<image href="data:${imageMime};base64,${imageData}" x="${margin}" y="${margin}" width="${width - 2 * margin}" height="${height - 2 * margin}" preserveAspectRatio="xMidYMid meet"${filter}/>`;
  const title = 'Logo exporté depuis Aurion';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>${filters}${bg}${image}</svg>\n`;
}

/** Adds practical SVG wrappers around the real, uploaded company logo.
 * These are presentation adaptations, not a claim that a raster logo was redrawn as vector artwork.
 */
export function addBrandLogoAssets(zip: AdmZip, buffer: Buffer, extension: string, accentValue: unknown, darkValue: unknown): { originalAdded: boolean; monochromeAdded: boolean; rasterVariantsAdded: string[] } {
  const ext = ['.png', '.jpg', '.jpeg'].includes(extension.toLowerCase()) ? extension.toLowerCase() : '.png';
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  const accent = safeColor(accentValue, '#2563EB');
  const dark = safeColor(darkValue, '#111827');
  const base64 = buffer.toString('base64');
  zip.addFile(`logo/logo-principal${ext}`, buffer);
  const variants: Array<[string, string]> = [
    ['logo/variantes/logo-fond-clair.svg', svgDocument({ width: 1200, height: 600, background: '#FFFFFF', accent, dark, imageData: base64, imageMime: mime })],
    ['logo/variantes/logo-fond-sombre.svg', svgDocument({ width: 1200, height: 600, background: dark, accent, dark, imageData: base64, imageMime: mime })],
    ['logo/variantes/logo-fond-accent.svg', svgDocument({ width: 1200, height: 600, background: accent, accent, dark, imageData: base64, imageMime: mime })],
    ['logo/icone-carree.svg', svgDocument({ width: 512, height: 512, background: accent, accent, dark, imageData: base64, imageMime: mime, rounded: true })],
    ['favicon.svg', svgDocument({ width: 64, height: 64, background: accent, accent, dark, imageData: base64, imageMime: mime, rounded: true })],
  ];
  for (const [name, content] of variants) zip.addFile(name, Buffer.from(content, 'utf8'));

  const rasterVariantsAdded:string[]=[];
  if(ext==='.png'){
    const decoded=decodePngRgba(buffer);
    if(decoded){
      const largest=Math.max(decoded.width,decoded.height);
      for(const size of [1024,512,256,128,64,32]){
        if(size>largest)continue;
        const resized=resizedPng(buffer,size);if(!resized)continue;
        const name=`logo/formats/logo-${size}.png`;zip.addFile(name,resized);rasterVariantsAdded.push(name);
        if(size===32){zip.addFile('logo/favicon.ico',pngAsIco(resized,32));rasterVariantsAdded.push('logo/favicon.ico');}
      }
    }
  }

  // A monochrome filter is useful only when actual transparent pixels were decoded, not merely when the PNG declares an alpha-capable format.
  const hasTransparency = ext === '.png' && pngHasTransparentPixels(buffer);
  if (hasTransparency) {
    zip.addFile('logo/variantes/logo-monochrome-noir.svg', Buffer.from(svgDocument({ width: 1024, height: 1024, accent, dark, imageData: base64, imageMime: mime, monochrome: 'black' }), 'utf8'));
    zip.addFile('logo/variantes/logo-monochrome-blanc.svg', Buffer.from(svgDocument({ width: 1024, height: 1024, accent, dark, imageData: base64, imageMime: mime, monochrome: 'white' }), 'utf8'));
  }
  const previewHtml = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aperçu identité visuelle Aurion</title><style>body{margin:0;padding:24px;font:16px/1.5 system-ui;background:#edf0f4;color:#17202b}main{max-width:1000px;margin:auto}h1{font-size:1.5rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.card{padding:18px;border-radius:16px;border:1px solid #ccd4dd;background:#fff}.card img{display:block;width:100%;height:160px;object-fit:contain}.dark{background:${dark};color:#fff}.accent{background:${accent};color:#fff}small{color:inherit;opacity:.75}</style><main><h1>Identité visuelle — aperçu des variantes générées par Aurion</h1><p>Les variantes reposent sur le logo principal enregistré et le thème configuré. Elles adaptent le fond et le format d’affichage ; elles ne redessinent pas automatiquement le tracé du logo.</p><div class="grid"><section class="card"><img src="logo/variantes/logo-fond-clair.svg" alt="Logo sur fond clair"><b>Fond clair</b></section><section class="card dark"><img src="logo/variantes/logo-fond-sombre.svg" alt="Logo sur fond sombre"><b>Fond sombre</b></section><section class="card accent"><img src="logo/variantes/logo-fond-accent.svg" alt="Logo sur couleur principale"><b>Fond accent</b></section><section class="card"><img src="logo/icone-carree.svg" alt="Icône carrée"><b>Icône / favicon</b></section></div><p><small>Couleur principale : ${accent} · Couleur sombre : ${dark}</small></p></main></html>`;
  zip.addFile('aperçu-identite-visuelle.html', Buffer.from(previewHtml, 'utf8'));
  return { originalAdded: true, monochromeAdded: hasTransparency, rasterVariantsAdded };
}
