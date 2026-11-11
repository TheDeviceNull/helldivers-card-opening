// Modulo audio condiviso: loop di sottofondo, stinger one-shot, playlist, mute.
// Posizione: assets/audio.js — i file audio stanno in assets/loops/.

const LOOPS_DIR = 'assets/loops/';
const LOOP_VOLUME = 0.15;     // sottofondo non invasivo
const STINGER_VOLUME = 0.3;   // effetti one-shot
const DUCK_FACTOR = 0.4;      // abbassamento del loop durante uno stinger
const FADE_MS = 400;
const MUTE_KEY = 'hd_audio_muted';
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'];

let muted = readMuted();
let current = null;   // { key, audio } traccia attiva
let ducks = 0;        // stinger in corso
let unlocked = false;

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted() {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* storage non disponibile: ignora */
  }
}

const loopSrc = name => `${LOOPS_DIR}${name}.mp3`;
const targetVolume = () => (muted ? 0 : LOOP_VOLUME * (ducks > 0 ? DUCK_FACTOR : 1));

// Fade lineare del volume; ogni elemento ha un solo timer attivo
function fadeTo(audio, target, ms, onDone) {
  clearInterval(audio._fade);
  const start = audio.volume;
  const t0 = performance.now();
  audio._fade = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    audio.volume = Math.min(1, Math.max(0, start + (target - start) * k));
    if (k >= 1) {
      clearInterval(audio._fade);
      onDone?.();
    }
  }, 40);
}

// Se l'autoplay è bloccato il rifiuto viene ignorato: si riprova al primo gesto
function tryPlay(audio) {
  const p = audio.play();
  if (p) p.catch(() => {});
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  for (const ev of UNLOCK_EVENTS) document.removeEventListener(ev, unlock, true);
  if (current && !muted) tryPlay(current.audio);
}
for (const ev of UNLOCK_EVENTS) document.addEventListener(ev, unlock, true);

function switchTrack(key, src, { loop = true, onEnded = null, onError = null } = {}) {
  if (current && current.key === key) return;
  const old = current;
  if (old) {
    old.audio.onended = null;
    old.audio.onerror = null;
    fadeTo(old.audio, 0, FADE_MS, () => {
      old.audio.pause();
      old.audio.removeAttribute('src');
      old.audio.load();
    });
  }
  if (!src) {
    current = null;
    return;
  }
  const audio = new Audio(src);
  audio.loop = loop;
  audio.preload = 'auto';
  audio.volume = 0;
  audio.onended = onEnded;
  audio.onerror = () => onError?.();
  current = { key, audio };
  if (!muted) tryPlay(audio);
  fadeTo(audio, targetVolume(), FADE_MS);
}

// Loop per nome file (senza estensione); null ferma la musica
export function playLoop(name) {
  if (!name) return switchTrack(null, null);
  switchTrack(`loop:${name}`, loopSrc(name));
}

// Stinger one-shot: nome o array (scelta casuale). Il loop viene abbassato mentre suona
export function playStinger(names) {
  if (muted) return;
  const list = Array.isArray(names) ? names : [names];
  const name = list[Math.floor(Math.random() * list.length)];
  const audio = new Audio(loopSrc(name));
  audio.volume = STINGER_VOLUME;
  ducks += 1;
  refreshVolume();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    ducks = Math.max(0, ducks - 1);
    refreshVolume();
  };
  audio.addEventListener('ended', release, { once: true });
  audio.addEventListener('error', release, { once: true });
  const p = audio.play();
  if (p) p.catch(release);
}

function refreshVolume() {
  if (current && !muted) fadeTo(current.audio, targetVolume(), 250);
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Playlist in ordine casuale, in sequenza e senza fine; salta le tracce che non si caricano
export function playPlaylist(urls) {
  const list = Array.isArray(urls) ? urls.filter(u => typeof u === 'string') : [];
  if (list.length === 0) return;
  let queue = [];
  let last = null;
  let failures = 0;
  const next = () => {
    if (queue.length === 0) {
      queue = shuffle(list);
      // evita la stessa traccia due volte di fila al cambio di giro
      if (queue.length > 1 && queue[0] === last) queue.push(queue.shift());
    }
    const src = queue.shift();
    last = src;
    switchTrack(`pl:${src}:${Date.now()}`, src, {
      loop: false,
      onEnded: () => {
        failures = 0;
        next();
      },
      onError: () => {
        failures += 1;
        if (failures < list.length) next();
      },
    });
  };
  next();
}

export function setMuted(value) {
  muted = Boolean(value);
  saveMuted();
  if (current) {
    const audio = current.audio;
    if (muted) {
      fadeTo(audio, 0, FADE_MS / 2, () => audio.pause());
    } else {
      tryPlay(audio);
      fadeTo(audio, targetVolume(), FADE_MS);
    }
  }
  updateButton();
}

function updateButton() {
  const btn = document.getElementById('audio-toggle');
  if (!btn) return;
  btn.textContent = muted ? '🔇' : '🔊';
  btn.title = muted ? 'Attiva audio' : 'Disattiva audio';
  btn.setAttribute('aria-label', btn.title);
  btn.setAttribute('aria-pressed', String(muted));
}

// Pulsante mute nella nav (prima del contenitore auth, se presente)
export function mountMuteButton() {
  const host = document.querySelector('.nav-controls');
  if (!host || document.getElementById('audio-toggle')) return;
  const btn = document.createElement('button');
  btn.id = 'audio-toggle';
  btn.type = 'button';
  btn.className = 'btn-nav-action';
  btn.addEventListener('click', () => setMuted(!muted));
  host.insertBefore(btn, host.querySelector('#auth-container'));
  updateButton();
}
