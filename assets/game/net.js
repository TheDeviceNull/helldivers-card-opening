/**
 * Gestione chiamate di rete, seq incrementali e sincronizzazione di stato per il gioco tattico.
 * Riusa fetchApi da common.js garantendo idempotenza e resilienza alla rotazione dei tunnel.
 */

import { fetchApi } from '../common.js';

export class GameNetworkClient {
  constructor() {
    this.currentRunId = null;
    this.currentSeq = 0;
  }

  async getPlanets(faction = '') {
    const query = faction ? `?faction=${encodeURIComponent(faction)}` : '';
    const res = await fetchApi(`/game/planets${query}`);
    return await res.json();
  }

  async getMissions(faction = '') {
    const query = faction ? `?faction=${encodeURIComponent(faction)}` : '';
    const res = await fetchApi(`/game/missions${query}`);
    return await res.json();
  }

  async getEligibleCards() {
    const res = await fetchApi('/game/eligible-cards');
    return await res.json();
  }

  async startGame({ planet, faction, biome, mission_type, card_ids }) {
    const res = await fetchApi('/game/start', {
      method: 'POST',
      body: JSON.stringify({ planet, faction, biome, mission_type, card_ids }),
    });
    const data = await res.json();
    if (data.ok) {
      this.currentRunId = data.run_id;
      this.currentSeq = data.seq;
    }
    return data;
  }

  async getState() {
    const res = await fetchApi('/game/state');
    const data = await res.json();
    if (data.ok && data.run) {
      this.currentRunId = data.run.run_id;
      this.currentSeq = data.run.seq;
    }
    return data;
  }

  async sendAction(action) {
    if (!this.currentRunId) {
      throw new Error('Nessuna partita attiva');
    }

    const nextSeq = this.currentSeq + 1;
    const res = await fetchApi('/game/action', {
      method: 'POST',
      body: JSON.stringify({
        run_id: this.currentRunId,
        seq: nextSeq,
        action: action,
      }),
    });

    const data = await res.json();
    if (data.ok) {
      this.currentSeq = data.seq;
    }
    return data;
  }

  async abandonGame() {
    if (!this.currentRunId) return { ok: true };
    const res = await fetchApi('/game/abandon', {
      method: 'POST',
      body: JSON.stringify({ run_id: this.currentRunId }),
    });
    const data = await res.json();
    if (data.ok) {
      this.currentRunId = null;
      this.currentSeq = 0;
    }
    return data;
  }

  async getLeaderboard(month = '') {
    const query = month ? `?month=${encodeURIComponent(month)}` : '';
    const res = await fetchApi(`/game/leaderboard${query}`);
    return await res.json();
  }
}
