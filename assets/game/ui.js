/**
 * Controller interfaccia utente per il gioco tattico (game.html).
 * Gestisce:
 *  - Wizard avvio partita (fazione -> pianeta -> missione -> squadra).
 *  - Selezione unità e visualizzazione AP/vita.
 *  - Click su esagoni per movimento, attacco o interazione.
 *  - Pulsanti fine turno e ritirata.
 */

import { getSessionToken, loginWithDiscord } from '../common.js';
import { GameNetworkClient } from './net.js';
import { HexRenderer } from './render.js';
import { pixelToHex, hexDistance } from './hex.js';

class GameUI {
  constructor() {
    this.net = new GameNetworkClient();
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new HexRenderer(this.canvas);

    this.gameState = null;
    this.legalActions = null;
    this.selectedUnitId = null;

    // Stato Wizard
    this.wizardState = {
      planet: null,
      faction: null,
      biome: null,
      missionType: null,
      selectedCards: [],
    };

    this.init();
  }

  async init() {
    this.setupAuthUI();
    this.setupEventListeners();

    const token = getSessionToken();
    if (!token) {
      document.getElementById('wizard-modal').style.display = 'none';
      const unauthModal = document.getElementById('unauth-modal');
      if (unauthModal) unauthModal.style.display = 'flex';
      return;
    }

    const unauthModal = document.getElementById('unauth-modal');
    if (unauthModal) unauthModal.style.display = 'none';

    // Controlla se c'è già una run attiva per riconnessione immediata
    try {
      const stateResp = await this.net.getState();
      if (stateResp.ok && stateResp.run) {
        this.loadActiveRun(stateResp.run);
      } else {
        // Nessuna run attiva: apri il wizard di selezione
        this.openWizard();
      }
    } catch (e) {
      console.error('[UI] Errore verifica stato iniziale:', e);
      this.openWizard();
    }
  }

  setupAuthUI() {
    const token = getSessionToken();
    const btnLogin = document.getElementById('btn-login');
    if (!token) {
      btnLogin.style.display = 'inline-flex';
      btnLogin.onclick = () => loginWithDiscord('game.html');
    } else {
      btnLogin.style.display = 'none';
    }
  }

  setupEventListeners() {
    // Click sulla mappa per eseguire azioni
    this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

    // Fine turno
    document.getElementById('btn-end-turn').addEventListener('click', async () => {
      await this.executeAction({ type: 'end_turn' });
    });

    // Abbandono / Ritirata
    document.getElementById('btn-abandon').addEventListener('click', async () => {
      if (confirm('Sei sicuro di volerti ritirare? La missione sarà considerata persa (score 0).')) {
        const res = await this.net.abandonGame();
        if (res.ok) {
          alert('Operazione abbandonata.');
          this.openWizard();
        }
      }
    });

    // Wizard navigation
    document.getElementById('btn-step-1-next').addEventListener('click', () => {
      document.getElementById('wizard-step-1').style.display = 'none';
      document.getElementById('wizard-step-2').style.display = 'block';
      this.loadWizardMissions();
    });

    document.getElementById('btn-step-2-prev').addEventListener('click', () => {
      document.getElementById('wizard-step-2').style.display = 'none';
      document.getElementById('wizard-step-1').style.display = 'block';
    });

    document.getElementById('btn-step-2-next').addEventListener('click', () => {
      document.getElementById('wizard-step-2').style.display = 'none';
      document.getElementById('wizard-step-3').style.display = 'block';
      this.loadWizardCards();
    });

    document.getElementById('btn-step-3-prev').addEventListener('click', () => {
      document.getElementById('wizard-step-3').style.display = 'none';
      document.getElementById('wizard-step-2').style.display = 'block';
    });

    document.getElementById('btn-start-game').addEventListener('click', async () => {
      await this.startGameFromWizard();
    });
  }

  loadActiveRun(runData) {
    document.getElementById('wizard-modal').style.display = 'none';
    this.gameState = runData.state;
    this.legalActions = runData.legal;

    // Seleziona la prima unità viva
    const firstAlive = (this.gameState.units || []).find(u => u.alive);
    this.selectedUnitId = firstAlive ? firstAlive.unit_id : null;

    this.updateHUD();
    this.updateSidebarUnits();
    this.renderer.updateState(this.gameState, this.legalActions, this.selectedUnitId);
  }

  updateHUD() {
    if (!this.gameState) return;
    document.getElementById('hud-planet-name').textContent = `${this.gameState.planet} (${this.gameState.faction})`;
    document.getElementById('hud-mission-desc').textContent = `Missione: ${this.gameState.mission_type}`;
    document.getElementById('hud-turn-num').textContent = this.gameState.turn;
    document.getElementById('hud-max-turns').textContent = this.gameState.max_turns;
    document.getElementById('hud-kills').textContent = this.gameState.kills || 0;

    const selUnit = (this.gameState.units || []).find(u => u.unit_id === this.selectedUnitId);
    document.getElementById('active-unit-ap').textContent = selUnit ? `AP: ${selUnit.ap}/${selUnit.max_ap}` : 'AP: --';
  }

  updateSidebarUnits() {
    const container = document.getElementById('units-container');
    container.innerHTML = '';

    if (!this.gameState || !this.gameState.units) return;

    for (const u of this.gameState.units) {
      const card = document.createElement('div');
      card.className = `unit-card ${u.unit_id === this.selectedUnitId ? 'active' : ''} ${!u.alive ? 'dead' : ''}`;
      card.onclick = () => {
        if (!u.alive) return;
        this.selectedUnitId = u.unit_id;
        this.updateHUD();
        this.updateSidebarUnits();
        this.renderer.updateState(this.gameState, this.legalActions, this.selectedUnitId);
        this.renderer.centerOn(u.hex);
      };

      const hpPct = Math.max(0, Math.min(100, (u.hp / u.max_hp) * 100));
      const apPct = Math.max(0, Math.min(100, (u.ap / u.max_ap) * 100));

      card.innerHTML = `
        <div class="unit-header">
          <span class="unit-name">${u.name}</span>
          <span class="unit-archetype">${u.archetype} (${u.rarity})</span>
        </div>
        <div class="bar-group">
          <div class="bar-wrapper">
            <span class="bar-label">HP</span>
            <div class="bar-track">
              <div class="bar-fill-hp" style="width: ${hpPct}%;"></div>
            </div>
            <span style="width: 32px; text-align: right;">${u.hp}</span>
          </div>
          <div class="bar-wrapper">
            <span class="bar-label">AP</span>
            <div class="bar-track">
              <div class="bar-fill-ap" style="width: ${apPct}%;"></div>
            </div>
            <span style="width: 32px; text-align: right;">${u.ap}</span>
          </div>
        </div>
      `;
      container.appendChild(card);
    }
  }

  async handleCanvasClick(e) {
    if (!this.gameState || !this.selectedUnitId) return;

    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldX = (screenX - this.renderer.camera.x) / this.renderer.camera.zoom;
    const worldY = (screenY - this.renderer.camera.y) / this.renderer.camera.zoom;
    const hex = pixelToHex(worldX, worldY, this.renderer.radius);

    const legal = (this.legalActions && this.legalActions[this.selectedUnitId]) || {};

    // 1. Controlla se ha cliccato su un nemico attaccabile
    const clickedEnemy = (this.gameState.enemies || []).find(en => en.alive && en.hex[0] === hex.q && en.hex[1] === hex.r);
    if (clickedEnemy && (legal.attack || []).includes(clickedEnemy.enemy_id)) {
      await this.executeAction({
        type: 'attack',
        unit_id: this.selectedUnitId,
        target: clickedEnemy.enemy_id,
      });
      return;
    }

    // 2. Controlla se ha cliccato su un obiettivo interattivo
    const clickedObj = (this.gameState.objectives || []).find(ob => ob.hex[0] === hex.q && ob.hex[1] === hex.r);
    if (clickedObj) {
      if ((legal.interact || []).includes(clickedObj.id)) {
        await this.executeAction({
          type: 'interact',
          unit_id: this.selectedUnitId,
          target: clickedObj.id,
        });
        return;
      }
      if ((legal.attack || []).includes(clickedObj.id)) {
        await this.executeAction({
          type: 'attack',
          unit_id: this.selectedUnitId,
          target: clickedObj.id,
        });
        return;
      }
    }

    // 3. Controlla se è una mossa legale
    const isMoveLegal = (legal.move || []).some(m => m[0] === hex.q && m[1] === hex.r);
    if (isMoveLegal) {
      await this.executeAction({
        type: 'move',
        unit_id: this.selectedUnitId,
        target: [hex.q, hex.r],
      });
      return;
    }

    // 4. Se ha cliccato su un'altra unità del giocatore, selezionala
    const clickedPlayer = (this.gameState.units || []).find(u => u.alive && u.hex[0] === hex.q && u.hex[1] === hex.r);
    if (clickedPlayer) {
      this.selectedUnitId = clickedPlayer.unit_id;
      this.updateHUD();
      this.updateSidebarUnits();
      this.renderer.updateState(this.gameState, this.legalActions, this.selectedUnitId);
    }
  }

  async executeAction(action) {
    try {
      const res = await this.net.sendAction(action);
      if (!res.ok) {
        alert(`Azione rifiutata: ${res.detail || res.error}`);
        return;
      }

      this.gameState = res.state;
      this.legalActions = res.legal;

      this.updateHUD();
      this.updateSidebarUnits();
      this.renderer.updateState(this.gameState, this.legalActions, this.selectedUnitId);

      if (res.status === 'won') {
        alert(`🏆 VITTORIA! Punteggio finale: ${res.score_final}`);
        this.openWizard();
      } else if (res.status === 'lost') {
        alert('💀 SCONFITTA! Squadra annientata o tempo scaduto.');
        this.openWizard();
      }
    } catch (err) {
      console.error('[UI] Errore esecuzione azione:', err);
      alert('Errore di comunicazione con il comando centrale.');
    }
  }

  // ---------------------------------------------------------------------------
  // Gestione Wizard Selezione Missione
  // ---------------------------------------------------------------------------

  async openWizard() {
    this.gameState = null;
    this.renderer.updateState(null, null, null);
    document.getElementById('wizard-modal').style.display = 'flex';
    document.getElementById('wizard-step-1').style.display = 'block';
    document.getElementById('wizard-step-2').style.display = 'none';
    document.getElementById('wizard-step-3').style.display = 'none';

    await this.loadWizardPlanets();
  }

  async loadWizardPlanets() {
    const list = document.getElementById('planets-list');
    list.innerHTML = 'Caricamento pianeti attivi...';

    const res = await this.net.getPlanets();
    list.innerHTML = '';
    const btnNext = document.getElementById('btn-step-1-next');
    btnNext.disabled = true;

    for (const p of res.planets || []) {
      const item = document.createElement('div');
      item.className = 'wizard-item';
      item.innerHTML = `
        <div style="font-family: var(--hd-font-condensed); font-weight: 700; color: #fff;">${p.name}</div>
        <div style="font-size: 0.75rem; color: #aaa;">Fazione: ${p.faction}</div>
        <div style="font-size: 0.75rem; color: #aaa;">Bioma: ${p.biome}</div>
        <div style="font-size: 0.8rem; color: var(--game-accent); margin-top: 0.2rem;">Difficoltà: x${p.difficulty_coef}</div>
      `;
      item.onclick = () => {
        list.querySelectorAll('.wizard-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        this.wizardState.planet = p.name;
        this.wizardState.faction = p.faction;
        this.wizardState.biome = p.biome;
        btnNext.disabled = false;
      };
      list.appendChild(item);
    }
  }

  async loadWizardMissions() {
    const list = document.getElementById('missions-list');
    list.innerHTML = 'Caricamento missioni disponibili...';

    const res = await this.net.getMissions(this.wizardState.faction);
    list.innerHTML = '';
    const btnNext = document.getElementById('btn-step-2-next');
    btnNext.disabled = true;

    for (const m of res.missions || []) {
      const item = document.createElement('div');
      item.className = 'wizard-item';
      item.innerHTML = `
        <div style="font-family: var(--hd-font-condensed); font-weight: 700; color: #fff;">${m.name}</div>
        <div style="font-size: 0.75rem; color: #aaa; margin: 0.2rem 0;">${m.description}</div>
        <div style="font-size: 0.75rem; color: #888;">Max Turni: ${m.max_turns} | Punti Base: ${m.base_score}</div>
      `;
      item.onclick = () => {
        list.querySelectorAll('.wizard-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        this.wizardState.missionType = m.id;
        btnNext.disabled = false;
      };
      list.appendChild(item);
    }
  }

  async loadWizardCards() {
    const list = document.getElementById('cards-list');
    list.innerHTML = 'Caricamento carte disponibili...';

    const res = await this.net.getEligibleCards();
    list.innerHTML = '';
    const btnStart = document.getElementById('btn-start-game');
    this.wizardState.selectedCards = [];
    btnStart.disabled = true;

    for (const c of res.cards || []) {
      const item = document.createElement('div');
      item.className = 'wizard-item';
      item.innerHTML = `
        <div style="font-family: var(--hd-font-condensed); font-weight: 700; color: #fff;">${c.name}</div>
        <div style="font-size: 0.75rem; color: #aaa; text-transform: uppercase;">${c.rarity}</div>
      `;
      item.onclick = () => {
        const idx = this.wizardState.selectedCards.indexOf(c.card_id);
        if (idx >= 0) {
          this.wizardState.selectedCards.splice(idx, 1);
          item.classList.remove('selected');
        } else {
          if (this.wizardState.selectedCards.length >= 4) {
            alert('Puoi selezionare al massimo 4 carte per la squadra.');
            return;
          }
          this.wizardState.selectedCards.push(c.card_id);
          item.classList.add('selected');
        }
        btnStart.disabled = !(this.wizardState.selectedCards.length >= 2 && this.wizardState.selectedCards.length <= 4);
      };
      list.appendChild(item);
    }
  }

  async startGameFromWizard() {
    const payload = {
      planet: this.wizardState.planet,
      faction: this.wizardState.faction,
      biome: this.wizardState.biome,
      mission_type: this.wizardState.missionType,
      card_ids: this.wizardState.selectedCards,
    };

    try {
      const res = await this.net.startGame(payload);
      if (!res.ok) {
        alert(`Impossibile avviare la missione: ${res.error}`);
        return;
      }
      this.loadActiveRun(res);
    } catch (e) {
      console.error('[UI] Errore start game:', e);
      alert('Errore di connessione durante il dispiegamento.');
    }
  }
}

// Avvio immediato o al caricamento del DOM
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => new GameUI());
} else {
  new GameUI();
}
