/**
 * Motore di rendering Canvas 2D per il gioco tattico.
 * Ottimizzato per dispositivi mobile e 60 FPS:
 *  - Mappa statica disegnata su OffscreenCanvas in cache.
 *  - Viewport con Pan & Zoom fluido.
 *  - Fog of War dinamica calcolata dal server.
 *  - Evidenziazione esagoni legali (movimento verde, attacco rosso, interazione oro).
 */

import { hexToPixel, pixelToHex, toOffset, fromOffset } from './hex.js';

const SQRT3 = Math.sqrt(3.0);

// Colori terreno
const TERRAIN_COLORS = {
  0: '#141824', // Pianura / aperta
  1: '#1e283c', // Ruvido / fango / neve
  2: '#0b0d13', // Impassabile / roccia / scogliera
  3: '#152b1e', // Copertura / vegetazione
};

export class HexRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.radius = 26.0; // raggio esagono in pixel sullo schermo
    this.camera = { x: 0, y: 0, zoom: 1.0 };
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    this.terrainCached = false;

    this.gameState = null;
    this.legalActions = null;
    this.selectedUnitId = null;
    this.hoverHex = null;

    this.setupEvents();
    this.resize();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    this.width = parent.clientWidth;
    this.height = parent.clientHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.render();
  }

  setupEvents() {
    window.addEventListener('resize', () => this.resize());

    // Pan con mouse / touch
    this.canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.dragStart = { x: e.clientX - this.camera.x, y: e.clientY - this.camera.y };
    });

    window.addEventListener('pointermove', (e) => {
      if (this.isDragging) {
        this.camera.x = e.clientX - this.dragStart.x;
        this.camera.y = e.clientY - this.dragStart.y;
        this.render();
      } else {
        // Calcolo hover hex
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldX = (screenX - this.camera.x) / this.camera.zoom;
        const worldY = (screenY - this.camera.y) / this.camera.zoom;
        const hex = pixelToHex(worldX, worldY, this.radius);
        if (!this.hoverHex || this.hoverHex.q !== hex.q || this.hoverHex.r !== hex.r) {
          this.hoverHex = hex;
          this.render();
        }
      }
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    // Zoom con rotella
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const newZoom = Math.max(0.4, Math.min(2.5, this.camera.zoom * zoomFactor));

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.camera.x = mouseX - (mouseX - this.camera.x) * (newZoom / this.camera.zoom);
      this.camera.y = mouseY - (mouseY - this.camera.y) * (newZoom / this.camera.zoom);
      this.camera.zoom = newZoom;
      this.render();
    }, { passive: false });
  }

  centerOn(hex) {
    if (!hex) return;
    const { x, y } = hexToPixel(hex[0], hex[1], this.radius);
    this.camera.x = this.width / 2 - x * this.camera.zoom;
    this.camera.y = this.height / 2 - y * this.camera.zoom;
    this.render();
  }

  updateState(state, legal, selectedUnitId = null) {
    const isNewMap = !this.gameState || this.gameState.cols !== state.cols || this.gameState.rows !== state.rows;
    this.gameState = state;
    this.legalActions = legal;
    this.selectedUnitId = selectedUnitId;

    if (isNewMap || !this.terrainCached) {
      this.cacheTerrain();
      // Centra sul primo giocatore o sullo spawn
      if (state.units && state.units.length > 0) {
        this.centerOn(state.units[0].hex);
      } else if (state.spawn_hex) {
        this.centerOn(state.spawn_hex);
      }
    }
    this.render();
  }

  cacheTerrain() {
    if (!this.gameState || !this.gameState.terrain_b64) return;
    const cols = this.gameState.cols;
    const rows = this.gameState.rows;

    const rawStr = atob(this.gameState.terrain_b64);
    const terrain = new Uint8Array(rawStr.length);
    for (let i = 0; i < rawStr.length; i++) {
      terrain[i] = rawStr.charCodeAt(i);
    }

    const { x: maxX, y: maxY } = hexToPixel(cols, rows, this.radius);
    this.offscreenCanvas.width = Math.ceil(maxX + this.radius * 3);
    this.offscreenCanvas.height = Math.ceil(maxY + this.radius * 3);

    const ctx = this.offscreenCtx;
    ctx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const hex = fromOffset(col, row);
        const { x, y } = hexToPixel(hex.q, hex.r, this.radius);
        const tCode = terrain[row * cols + col];
        this.drawHexPath(ctx, x, y, this.radius);
        ctx.fillStyle = TERRAIN_COLORS[tCode] || '#111';
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    this.terrainCached = true;
  }

  drawHexPath(ctx, x, y, radius) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const hx = x + radius * Math.cos(angle);
      const hy = y + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (!this.gameState) {
      ctx.fillStyle = '#666';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('In attesa della mappa tattica...', this.width / 2, this.height / 2);
      return;
    }

    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    // 1. Disegna terreno prerenderizzato in cache
    if (this.terrainCached) {
      ctx.drawImage(this.offscreenCanvas, 0, 0);
    }

    // 2. Fog of War (maschera scura per esagoni non visibili)
    const visibleSet = new Set((this.gameState.visible_hexes || []).map(h => `${h[0]},${h[1]}`));
    const rows = this.gameState.rows;
    const cols = this.gameState.cols;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const hex = fromOffset(c, r);
        const key = `${hex.q},${hex.r}`;
        if (!visibleSet.has(key)) {
          const { x, y } = hexToPixel(hex.q, hex.r, this.radius);
          this.drawHexPath(ctx, x, y, this.radius);
          ctx.fillStyle = 'rgba(6, 8, 12, 0.78)';
          ctx.fill();
        }
      }
    }

    // 3. Evidenziazione azioni legali per l'unità selezionata
    if (this.selectedUnitId && this.legalActions && this.legalActions[this.selectedUnitId]) {
      const legal = this.legalActions[this.selectedUnitId];

      // Mosse possibili (Verde tenue)
      for (const m of legal.move || []) {
        const { x, y } = hexToPixel(m[0], m[1], this.radius);
        this.drawHexPath(ctx, x, y, this.radius - 2);
        ctx.fillStyle = 'rgba(34, 197, 94, 0.28)';
        ctx.fill();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // 4. Disegna Obiettivi
    for (const obj of this.gameState.objectives || []) {
      const { x, y } = hexToPixel(obj.hex[0], obj.hex[1], this.radius);
      ctx.save();
      ctx.fillStyle = obj.completed ? '#10b981' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Icona obiettivo
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const icon = obj.obj_type === 'extraction' ? 'E' : (obj.obj_type === 'destroy_target' ? 'X' : 'O');
      ctx.fillText(icon, x, y);
      ctx.restore();
    }

    // 5. Disegna Nemici (visibili dalla FoW)
    for (const enemy of this.gameState.enemies || []) {
      if (!enemy.alive) continue;
      const { x, y } = hexToPixel(enemy.hex[0], enemy.hex[1], this.radius);

      ctx.save();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Iniziale nemico
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(enemy.name.charAt(0), x, y);

      // Barra HP sopra la testa
      const barW = 18;
      const barH = 3;
      const hpPct = Math.max(0, enemy.hp / enemy.max_hp);
      ctx.fillStyle = '#111';
      ctx.fillRect(x - barW / 2, y - 16, barW, barH);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x - barW / 2, y - 16, barW * hpPct, barH);
      ctx.restore();
    }

    // 6. Disegna Unità Giocatore
    for (const unit of this.gameState.units || []) {
      if (!unit.alive) continue;
      const { x, y } = hexToPixel(unit.hex[0], unit.hex[1], this.radius);
      const isSelected = unit.unit_id === this.selectedUnitId;

      ctx.save();
      // Cerchio selezione
      if (isSelected) {
        ctx.strokeStyle = '#ffe800';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Sigla unità
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(unit.name.charAt(0), x, y);

      // Barra HP sopra la testa
      const barW = 20;
      const barH = 3;
      const hpPct = Math.max(0, unit.hp / unit.max_hp);
      ctx.fillStyle = '#111';
      ctx.fillRect(x - barW / 2, y - 17, barW, barH);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(x - barW / 2, y - 17, barW * hpPct, barH);
      ctx.restore();
    }

    // 7. Hover cursore
    if (this.hoverHex) {
      const { x, y } = hexToPixel(this.hoverHex.q, this.hoverHex.r, this.radius);
      this.drawHexPath(ctx, x, y, this.radius);
      ctx.strokeStyle = 'rgba(255, 232, 0, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }
}
