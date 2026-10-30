type LocalAiMessage = { prompt: string; images?: string[]; maxTokens?: number };

const DEFAULT_MODEL = 'qwen3.5:4b';
const enabled = () => String(process.env.AURION_AI_PROVIDER || ((process.env.NODE_ENV || 'development') === 'development' ? 'local' : 'managed')).trim().toLowerCase() === 'local';

function endpoint(path: string): string {
  const raw = String(process.env.AURION_OLLAMA_URL || 'http://127.0.0.1:11434').trim();
  let url: URL;
  try { url = new URL(raw); } catch { throw Object.assign(new Error('Adresse du moteur local invalide. Utilisez uniquement Ollama sur la machine Aurion.'), { statusCode: 503 }); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw Object.assign(new Error('Pour protéger les données, Ollama doit écouter uniquement sur la machine Aurion (127.0.0.1).'), { statusCode: 503 });
  }
  return new URL(path, url).toString();
}

export function localAiEnabled(): boolean { return enabled(); }
export function configuredLocalModel(): string {
  const model = String(process.env.AURION_LOCAL_LLM_MODEL || DEFAULT_MODEL).trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,120}$/.test(model) ? model : DEFAULT_MODEL;
}

export async function localAiStatus() {
  const model = configuredLocalModel();
  if (!enabled()) return { enabled: false, available: false, model, mode: 'managed' as const };
  try {
    const response = await fetch(endpoint('/api/tags'), { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return { enabled: true, available: false, model, mode: 'local' as const, reason: 'Ollama ne répond pas.' };
    const data: any = await response.json().catch(() => ({}));
    const models = Array.isArray(data.models) ? data.models : [];
    const installedModel = models.find((item: any) => [item.name, item.model].some((name: unknown) => String(name || '').split(':')[0] === model.split(':')[0] && (!model.includes(':') || String(name || '') === model)));
    const installed = Boolean(installedModel);
    return { enabled: true, available: installed, model, ...(installedModel?.digest ? { digest: String(installedModel.digest) } : {}), mode: 'local' as const, reason: installed ? undefined : 'Modèle local non installé.' };
  } catch {
    return { enabled: true, available: false, model, mode: 'local' as const, reason: 'Ollama est absent ou arrêté sur cet ordinateur.' };
  }
}

export async function generateLocalJson({ prompt, images = [], maxTokens = 1800 }: LocalAiMessage): Promise<any> {
  if (!enabled()) throw Object.assign(new Error('Le moteur IA local n’est pas sélectionné.'), { statusCode: 503 });
  const model = configuredLocalModel();
  try {
    const response = await fetch(endpoint('/api/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        keep_alive: '10m',
        messages: [{ role: 'user', content: prompt.slice(0, 120000), ...(images.length ? { images: images.slice(0, 3) } : {}) }],
        options: { temperature: 0.1, num_predict: Math.max(128, Math.min(6000, Math.round(maxTokens))) },
      }),
      signal: AbortSignal.timeout(120000),
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = String(data?.error || '').toLowerCase();
      if (response.status === 404 || detail.includes('not found')) throw Object.assign(new Error(`Le modèle ${model} n’est pas installé. Installez Ollama puis exécutez « ollama pull ${model} ». Aucun service cloud n’a été utilisé.`), { statusCode: 503 });
      throw Object.assign(new Error('Ollama n’a pas pu analyser ces informations. Réessayez ou utilisez la saisie manuelle.'), { statusCode: 502 });
    }
    const raw = String(data?.message?.content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Le modèle local n’a pas retourné un JSON exploitable. Réessayez ou utilisez la saisie manuelle.'), { statusCode: 502 }); }
  } catch (error: any) {
    if (error?.statusCode) throw error;
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw Object.assign(new Error('L’analyse locale dépasse le délai prévu. Réessayez avec moins de texte ou un modèle plus rapide.'), { statusCode: 504 });
    if (error instanceof TypeError) throw Object.assign(new Error('Ollama est absent ou arrêté. Démarrez Ollama sur cet ordinateur. Aucune donnée n’a été envoyée vers un service cloud.'), { statusCode: 503 });
    throw error;
  }
}
