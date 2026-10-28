// Configurazione dinamica condivisa: eredita l'API_BASE_URL da index.html o localStorage
export const SITE_BASE_URL = new URL('.', location.href).href;
export const INDEX_HTML_URL = new URL('index.html', location.href).href;
export const DISCORD_CLIENT_ID = '1476235147459170434';
export const DISCORD_REDIRECT_URI = new URL('index.html', location.href).href;
export const STRATAGEM_ICON_BASE = new URL('assets/stratagems/', location.href).href;
export const PLACEHOLDER_ICON = new URL('assets/stratagems/_placeholder.svg', location.href).href;

// Cache in-memory del baseUrl risolto dinamicamente
let _cachedApiBaseUrl = localStorage.getItem('hd2_api_base_url') || null;

export async function getApiBaseUrl(forceRefresh = false) {
  if (_cachedApiBaseUrl && !forceRefresh) {
    return _cachedApiBaseUrl;
  }

  try {
    const pageUrl = new URL(INDEX_HTML_URL);
    pageUrl.searchParams.set('_t', Date.now().toString());
    const resp = await fetch(pageUrl.href, { cache: 'no-store' });
    if (!resp.ok) {
      throw new Error(`Impossibile leggere index.html: HTTP ${resp.status}`);
    }
    const html = await resp.text();
    const match = html.match(/const\s+API_BASE_URL\s*=\s*(['"])(https:\/\/[^'"]+)\1\s*;/);
    if (!match) {
      throw new Error('Costante API_BASE_URL non trovata in index.html.');
    }
    const resolvedUrl = new URL(match[2]).origin;
    _cachedApiBaseUrl = resolvedUrl;
    localStorage.setItem('hd2_api_base_url', resolvedUrl);
    return resolvedUrl;
  } catch (err) {
    console.error('[CONFIG] Errore risoluzione API_BASE_URL da index.html:', err);
    if (_cachedApiBaseUrl) return _cachedApiBaseUrl;
    throw err;
  }
}
