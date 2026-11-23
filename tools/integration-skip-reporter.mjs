// Reporter Node minimal : écrit un événement JSON par test terminé.
// Utilisé par tools/integration-skip-gate.mjs pour attribuer chaque test à son fichier,
// ce que la sortie TAP de Node ne permet pas lorsque plusieurs fichiers sont exécutés.
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const destination = process.env.AURION_TEST_EVENTS;
if (!destination) {
  throw new Error('AURION_TEST_EVENTS doit pointer vers le fichier JSONL du rapport d’intégration.');
}

export default async function* reporter(source) {
  mkdirSync(path.dirname(destination), { recursive: true });
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const data = event.data ?? {};
    const details = data.details ?? {};
    // Les suites (describe) ne sont pas des tests : seuls les cas comptent dans le rapport.
    if (event.type === 'test:pass' && details.type !== 'test') continue;
    appendFileSync(destination, JSON.stringify({
      type: event.type === 'test:fail' ? 'fail' : 'pass',
      name: data.name,
      file: data.file,
      nesting: data.nesting,
      skip: data.skip ?? details.skip ?? false,
      todo: data.todo ?? details.todo ?? false,
      suite: details.type === 'suite',
      durationMs: details.duration_ms,
    }) + '\n');
  }
}
