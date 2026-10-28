// Modulo helper condiviso per il sito statico Helldivers 2
import { getApiBaseUrl, DISCORD_CLIENT_ID, DISCORD_REDIRECT_URI, STRATAGEM_ICON_BASE, PLACEHOLDER_ICON } from './config.js';

export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function num(val, fallback = 0) {
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

export function safeSnowflake(id) {
  const s = String(id || '');
  return /^\d{17,20}$/.test(s) ? s : '';
}

export function getSessionToken() {
  return localStorage.getItem('hd2_session_token') || null;
}

export function setSessionToken(token) {
  if (token) {
    localStorage.setItem('hd2_session_token', token);
  } else {
    localStorage.removeItem('hd2_session_token');
  }
}

export async function fetchApi(path, options = {}) {
  const token = getSessionToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let baseUrl = await getApiBaseUrl();
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

  try {
    const resp = await fetch(url, { ...options, headers });
    if (resp.status === 401) {
      setSessionToken(null);
    }
    return resp;
  } catch (error) {
    // Se fallisce per tunnel ruotato / TypeError, ricarica index.html per recuperare il nuovo endpoint
    if (error instanceof TypeError && !path.startsWith('http')) {
      console.warn('[API] Errore di connessione. Tentativo di re-fetch del tunnel Cloudflare da index.html...');
      try {
        baseUrl = await getApiBaseUrl(true);
        const retryUrl = `${baseUrl}${path}`;
        const retryResp = await fetch(retryUrl, { ...options, headers });
        if (retryResp.status === 401) {
          setSessionToken(null);
        }
        return retryResp;
      } catch (retryError) {
        throw retryError;
      }
    }
    throw error;
  }
}

export function loginWithDiscord(postLoginTarget = '') {
  const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
  localStorage.setItem('hd2_oauth_state', state);
  localStorage.setItem('hd2_oauth_state_exp', (Date.now() + 600000).toString());
  if (postLoginTarget) {
    localStorage.setItem('hd2_post_login', postLoginTarget);
  }
  const scope = encodeURIComponent('identify');
  const redirectUri = encodeURIComponent(DISCORD_REDIRECT_URI);
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
  window.location.href = authUrl;
}

export function stratagemIcon(iconName, catalogVersion = '') {
  const base = STRATAGEM_ICON_BASE.endsWith('/') ? STRATAGEM_ICON_BASE : `${STRATAGEM_ICON_BASE}/`;
  const url = `${base}${iconName}${catalogVersion ? `?v=${encodeURIComponent(catalogVersion)}` : ''}`;
  return url;
}

export function attachIconFallback(imgEl) {
  if (!imgEl) return;
  imgEl.addEventListener('error', () => {
    imgEl.src = PLACEHOLDER_ICON;
  }, { once: true });
}
