import type AdmZip from 'adm-zip';

const safeColor = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : fallback;

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
export function addBrandLogoAssets(zip: AdmZip, buffer: Buffer, extension: string, accentValue: unknown, darkValue: unknown): { originalAdded: boolean; monochromeAdded: boolean } {
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

  // A monochrome filter only gives a useful silhouette when the source contains transparency.
  const hasTransparency = ext === '.png' && buffer.length > 26 && ([4, 6].includes(buffer[25]) || buffer.includes(Buffer.from('tRNS')));
  if (hasTransparency) {
    zip.addFile('logo/variantes/logo-monochrome-noir.svg', Buffer.from(svgDocument({ width: 1024, height: 1024, accent, dark, imageData: base64, imageMime: mime, monochrome: 'black' }), 'utf8'));
    zip.addFile('logo/variantes/logo-monochrome-blanc.svg', Buffer.from(svgDocument({ width: 1024, height: 1024, accent, dark, imageData: base64, imageMime: mime, monochrome: 'white' }), 'utf8'));
  }
  const previewHtml = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aperçu identité visuelle Aurion</title><style>body{margin:0;padding:24px;font:16px/1.5 system-ui;background:#edf0f4;color:#17202b}main{max-width:1000px;margin:auto}h1{font-size:1.5rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.card{padding:18px;border-radius:16px;border:1px solid #ccd4dd;background:#fff}.card img{display:block;width:100%;height:160px;object-fit:contain}.dark{background:${dark};color:#fff}.accent{background:${accent};color:#fff}small{color:inherit;opacity:.75}</style><main><h1>Identité visuelle — aperçu des variantes générées par Aurion</h1><p>Les variantes reposent sur le logo principal enregistré et le thème configuré. Elles adaptent le fond et le format d’affichage ; elles ne redessinent pas automatiquement le tracé du logo.</p><div class="grid"><section class="card"><img src="logo/variantes/logo-fond-clair.svg" alt="Logo sur fond clair"><b>Fond clair</b></section><section class="card dark"><img src="logo/variantes/logo-fond-sombre.svg" alt="Logo sur fond sombre"><b>Fond sombre</b></section><section class="card accent"><img src="logo/variantes/logo-fond-accent.svg" alt="Logo sur couleur principale"><b>Fond accent</b></section><section class="card"><img src="logo/icone-carree.svg" alt="Icône carrée"><b>Icône / favicon</b></section></div><p><small>Couleur principale : ${accent} · Couleur sombre : ${dark}</small></p></main></html>`;
  zip.addFile('aperçu-identite-visuelle.html', Buffer.from(previewHtml, 'utf8'));
  return { originalAdded: true, monochromeAdded: hasTransparency };
}
