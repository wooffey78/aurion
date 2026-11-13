/**
 * Politique de sortie commune à tous les contrôles CI Aurion.
 * La baseline historique sert uniquement au diagnostic et ne transforme
 * jamais un échec courant en succès.
 */
export function parseTapFailures(output = '') {
  return [...String(output).matchAll(/^\\s*not ok \\d+ - (.+?)\\s*$/gm)]
    .map(match => match[1].trim());
}

export function evaluateCommand({ exitCode, output = '' } = {}) {
  const failures = parseTapFailures(output);
  const normalizedExitCode = Number.isInteger(exitCode) ? exitCode : 1;
  return {
    ok: normalizedExitCode === 0 && failures.length === 0,
    exitCode: normalizedExitCode,
    failures,
  };
}

export function compareWithBaseline(observed = [], historical = []) {
  const observedSet = new Set(observed);
  const historicalSet = new Set(historical);
  return {
    newFailures: observed.filter(name => !historicalSet.has(name)),
    stillHistorical: observed.filter(name => historicalSet.has(name)),
    resolvedHistorical: historical.filter(name => !observedSet.has(name)),
  };
}
