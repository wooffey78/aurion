// Génère la copie navigateur depuis la source unique backend/src/services/pricing.ts.
// Le TypeScript du backend est la seule source de vérité : aucune suppression de texte maison.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'backend', 'src', 'services', 'pricing.ts');
const typescriptPath = path.join(root, 'backend', 'node_modules', 'typescript', 'lib', 'typescript.js');

const ts = await import(pathToFileURL(typescriptPath).href);
const source = readFileSync(sourcePath, 'utf8');
const result = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    isolatedModules: true,
    removeComments: false,
  },
  fileName: sourcePath,
});
if (result.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) {
  throw new Error('Impossible de transpiler backend/src/services/pricing.ts.');
}
writeFileSync(
  path.join(root, 'assets', 'js', 'core', 'pricing.js'),
  '// GÉNÉRÉ depuis backend/src/services/pricing.ts (ne pas modifier à la main : npm run sync-pricing à la racine).\n' + result.outputText,
);
console.log('pricing.js régénéré depuis le moteur TypeScript.');
