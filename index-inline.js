
    let SELECTED_CARDS = [];
    let currentToken = null;
    let _auctionSelectedCardValuation = null;

    let timerInterval = null;

    // ===== AUDIO ENGINE =====
    let soundtracks = [];
    const bgMusic = document.getElementById('bg-music');
    const audioControl = document.getElementById('audio-control');
    let currentTrackIndex = 0;
    let isMuted = true;

    async function loadPlaylist() {
      try {
        const response = await fetch('assets/soundtracks.json');
        soundtracks = await response.json();
        if (soundtracks.length > 0) {
          initPlaylist();
        }
      } catch (e) {
        console.warn("Playlist JSON non trovata o non valida. Caricamento fallback...");
        soundtracks = ['assets/soundtrack.mp3']; // Fallback standard
        initPlaylist();
      }
    }

    function initPlaylist() {
      currentTrackIndex = Math.floor(Math.random() * soundtracks.length);
      loadTrack(currentTrackIndex);
    }

    function loadTrack(index) {
      bgMusic.src = soundtracks[index];
      bgMusic.load();
    }

    function playNextTrack() {
      if (soundtracks.length === 0) return;
      currentTrackIndex = (currentTrackIndex + 1) % soundtracks.length;
      loadTrack(currentTrackIndex);
      if (!isMuted) {
        bgMusic.play().catch(e => console.log("Errore riproduzione automatica"));
      }
    }

    function toggleAudio() {
      if (isMuted) {
        bgMusic.play().catch(e => console.log("Autoplay bloccato"));
        audioControl.classList.remove('muted');
        isMuted = false;
      } else {
        bgMusic.pause();
        audioControl.classList.add('muted');
        isMuted = true;
      }
    }

    function changeVolume(val) {
      bgMusic.volume = val;
    }

    // Set default volume
    bgMusic.volume = 0.45;

    bgMusic.onended = () => playNextTrack();
    loadPlaylist();

    // ===== APERTURA BUSTA =====
    function startOpening() {
      // Attivazione audio al primo click significativo (policy browser)
      if (isMuted && soundtracks.length > 0) {
        toggleAudio();
      }

      const introEl = document.getElementById('screen-intro');
      const openingEl = document.getElementById('screen-opening');
      const packAnim = document.getElementById('pack-anim');
      const flash = document.getElementById('flash');

      // Nascondi intro
      introEl.style.transition = 'opacity 0.3s';
      introEl.style.opacity = '0';
      setTimeout(() => {
        introEl.style.display = 'none';
        openingEl.style.display = 'flex';
      }, 300);

      // Sequenza animazione apertura
      setTimeout(() => {
        // Fase 1: trema
        packAnim.style.transition = 'transform 0.1s ease';
        let shake = 0;
        const shakeInterval = setInterval(() => {
          shake++;
          packAnim.style.transform = `translateX(${(Math.random() - 0.5) * 10}px) rotate(${(Math.random() - 0.5) * 3}deg)`;
          if (shake > 12) {
            clearInterval(shakeInterval);
            packAnim.style.transform = '';
          }
        }, 80);
      }, 300);

      setTimeout(() => {
        // Fase 2: si solleva e si stira
        packAnim.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        packAnim.style.transform = 'scaleY(0.85) scaleX(1.1) translateY(-20px)';
      }, 1400);

      setTimeout(() => {
        // Fase 3: esplode + flash + particelle
        packAnim.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
        packAnim.style.transform = 'scale(2.5) rotate(15deg)';
        packAnim.style.opacity = '0';

        // Flash bianco
        flash.style.transition = 'opacity 0.08s ease';
        flash.style.opacity = '0.9';

        // Particelle
        spawnParticles();

        setTimeout(() => {
          flash.style.transition = 'opacity 0.4s ease';
          flash.style.opacity = '0';
          openingEl.style.display = 'none';
          showCards();
        }, 150);
      }, 1900);
    }

    // ===== PARTICELLE =====
    function spawnParticles() {
      const container = document.getElementById('particles');
      const colors = ['#F5C400', '#C0281C', '#ffffff', '#FFE066', '#FF6B6B'];
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;

      for (let i = 0; i < 60; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const angle = (Math.random() * Math.PI * 2);
        const speed = 80 + Math.random() * 200;
        const size = 3 + Math.random() * 6;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const duration = 0.6 + Math.random() * 0.8;

        p.style.cssText = `
        left: ${cx}px; top: ${cy}px;
        width: ${size}px; height: ${size}px;
        background: ${color};
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        position: absolute;
        opacity: 1;
        transition: none;
      `;
        container.appendChild(p);

        const tx = Math.cos(angle) * speed;
        const ty = Math.sin(angle) * speed;

        requestAnimationFrame(() => {
          p.style.transition = `transform ${duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity ${duration}s ease`;
          p.style.transform = `translate(${tx}px, ${ty}px) rotate(${Math.random() * 360}deg) scale(0)`;
          p.style.opacity = '0';
        });

        setTimeout(() => p.remove(), duration * 1000 + 100);
      }
    }

    // Configurazione Discord OAuth2
    const DISCORD_CLIENT_ID = '1476235147459170434';
    // URI fisso: deve corrispondere ESATTAMENTE a quello registrato nel portale Discord Developer
    const DISCORD_REDIRECT_URI = 'https://thedevicenull.github.io/helldivers-card-opening/';

    let userSessionToken = localStorage.getItem('hd2_session_token') || null;
    let currentUserProfile = null;
    let allCatalogCards = [];
    let userOwnedCollection = [];
    let currentCollectionFilter = 'all';

    // ===== INIZIALIZZAZIONE =====
    window.addEventListener('DOMContentLoaded', async () => {
      const urlParams = new URLSearchParams(window.location.search);
      currentToken = urlParams.get('t');
      const oauthCode = urlParams.get('code');

      // 1. Gestione callback OAuth2 se presente nell'URL
      if (oauthCode) {
        window.history.replaceState({}, document.title, window.location.pathname);
        await handleOAuthCallback(oauthCode);
      } else if (userSessionToken) {
        await fetchUserProfileAndCollection();
      }

      updateAuthUI();

      // 2. Se è presente un token di apertura bustina
      if (currentToken) {
        switchView('intro');
        await validateToken(currentToken);
      } else {
        // Se non c'è token bustina, vai alla collezione
        switchView('collection');
      }
    });

    // ===== GESTIONE VISTE SPA =====
    function switchView(viewName) {
      document.getElementById('screen-intro').style.display = 'none';
      document.getElementById('screen-opening').style.display = 'none';
      document.getElementById('screen-cards').style.display = 'none';
      document.getElementById('screen-loading').style.display = 'none';
      document.getElementById('screen-error').style.display = 'none';
      document.getElementById('screen-collection').style.display = 'none';
      document.getElementById('screen-auction').style.display = 'none';

      if (viewName === 'intro') {
        document.getElementById('screen-intro').style.display = 'flex';
      } else if (viewName === 'collection') {
        document.getElementById('screen-collection').style.display = 'flex';
        loadCollectionData();
      } else if (viewName === 'auction') {
        document.getElementById('screen-auction').style.display = 'flex';
        loadAuctionList();
      }
    }

    // ===== DISCORD OAUTH2 FLUSSO =====
    function loginWithDiscord() {
      const scope = encodeURIComponent('identify');
      const redirectUri = encodeURIComponent(DISCORD_REDIRECT_URI);
      const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}`;
      window.location.href = authUrl;
    }

    async function handleOAuthCallback(code) {
      showLoading(true);
      try {
        const resp = await fetch(`${API_BASE_URL}/auth/discord`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code, redirect_uri: DISCORD_REDIRECT_URI })
        });
        const data = await resp.json();
        if (resp.ok && data.session_token) {
          userSessionToken = data.session_token;
          localStorage.setItem('hd2_session_token', userSessionToken);
          currentUserProfile = data.user;
          await fetchUserProfileAndCollection();
        } else {
          console.error("Autenticazione fallita:", data);
        }
      } catch (err) {
        console.error("Errore OAuth callback:", err);
      } finally {
        showLoading(false);
      }
    }

    async function fetchUserProfileAndCollection() {
      if (!userSessionToken) return;
      try {
        const resp = await fetch(`${API_BASE_URL}/user-collection`, {
          headers: { 'Authorization': `Bearer ${userSessionToken}` }
        });
        if (resp.ok) {
          const data = await resp.json();
          currentUserProfile = data.user;
          userOwnedCollection = data.cards;
          updateAuthUI();
          renderCollectionGrid();
        } else if (resp.status === 401) {
          logoutDiscord();
        }
      } catch (e) {
        console.warn("Impossibile recuperare la collezione utente:", e);
      }
    }

    function logoutDiscord() {
      userSessionToken = null;
      currentUserProfile = null;
      userOwnedCollection = [];
      localStorage.removeItem('hd2_session_token');
      updateAuthUI();
      renderCollectionGrid();
    }

    function updateAuthUI() {
      const container = document.getElementById('auth-container');
      if (currentUserProfile) {
        const avatarUrl = currentUserProfile.avatar
          ? `https://cdn.discordapp.com/avatars/${currentUserProfile.id}/${currentUserProfile.avatar}.png`
          : `./assets/superearth.png`;
        container.innerHTML = `
          <div class="user-profile-badge">
            <img class="user-avatar" src="${avatarUrl}" alt="${currentUserProfile.username}">
            <span class="user-name">${currentUserProfile.global_name || currentUserProfile.username}</span>
            <button onclick="logoutDiscord()" style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:0.75rem; margin-left:4px;" title="Disconnetti">✕</button>
          </div>
        `;
        document.getElementById('collection-user-sub').textContent = `Helldiver ${currentUserProfile.global_name || currentUserProfile.username} — Archivio Sbloccato`;
      } else {
        container.innerHTML = `
          <button class="btn-nav-action btn-discord-login" onclick="loginWithDiscord()">
            <svg style="width:16px; height:16px; fill:currentColor;" viewBox="0 0 127.14 96.36">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.71,32.65-1.82,56.6.39,80.21a105.73,105.73,0,0,0,32.27,16.15,77.7,77.7,0,0,0,7.39-12,67.65,67.65,0,0,1-11.9-5.69c.9-.66,1.81-1.34,2.66-2a75.6,75.6,0,0,0,65.71,0c.85.71,1.75,1.39,2.66,2a67.41,67.41,0,0,1-11.9,5.69,77.67,77.67,0,0,0,7.39,12,106.06,106.06,0,0,0,32.27-16.15C130.2,49.88,126.6,26.24,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
            </svg>
            Login Discord
          </button>
        `;
        document.getElementById('collection-user-sub').textContent = `Effettua il login per visualizzare l'archivio personale`;
      }
    }

    // ===== GESTIONE COLLEZIONE & ALBUM =====
    async function loadCollectionData() {
      if (allCatalogCards.length === 0) {
        try {
          const resp = await fetch(`${API_BASE_URL}/all-cards`);
          if (resp.ok) {
            const data = await resp.json();
            allCatalogCards = data.cards;
          }
        } catch (e) {
          console.warn("Impossibile caricare il catalogo carte completo:", e);
        }
      }
      if (userSessionToken) {
        await fetchUserProfileAndCollection();
      } else {
        renderCollectionGrid();
      }
    }

    function setCollectionFilter(filterType, btnEl) {
      currentCollectionFilter = filterType;
      document.querySelectorAll('.collection-filters .filter-btn').forEach(b => b.classList.remove('active'));
      if (btnEl) btnEl.classList.add('active');
      renderCollectionGrid();
    }

    function renderCollectionGrid() {
      const grid = document.getElementById('collection-grid');
      grid.innerHTML = '';

      const ownedMap = {};
      userOwnedCollection.forEach(c => {
        ownedMap[c.card_id] = c;
      });

      const totalOwnedCount = userOwnedCollection.reduce((sum, c) => sum + (c.copies || 1), 0);
      const uniqueOwnedCount = Object.keys(ownedMap).length;
      const totalCatalogCount = allCatalogCards.length || 1;
      const completionPercent = Math.round((uniqueOwnedCount / totalCatalogCount) * 100);

      document.getElementById('stat-total-owned').textContent = totalOwnedCount;
      document.getElementById('stat-unique-owned').textContent = `${uniqueOwnedCount} / ${totalCatalogCount}`;
      document.getElementById('stat-completion').textContent = `${completionPercent}%`;

      let cardsToDisplay = allCatalogCards.length > 0 ? allCatalogCards : userOwnedCollection.map(c => ({
        id: c.card_id,
        name: c.card_name,
        rarity: c.rarity,
        series: c.series,
        num: c.card_id.split('-')[0]
      }));

      // Filtro
      cardsToDisplay = cardsToDisplay.filter(card => {
        const isOwned = !!ownedMap[card.id];
        if (currentCollectionFilter === 'owned') return isOwned;
        if (currentCollectionFilter === 'missing') return !isOwned;
        if (currentCollectionFilter.startsWith('series-')) {
          const targetSeries = currentCollectionFilter.replace('series-', '');
          return card.series === targetSeries;
        }
        if (currentCollectionFilter === 'rarity-rara') {
          return ['rare', 'rara', 'elite', 'legendary', 'leggendaria'].includes(card.rarity.toLowerCase());
        }
        return true;
      });

      cardsToDisplay.forEach(card => {
        const ownedData = ownedMap[card.id];
        const isOwned = !!ownedData;
        const copies = ownedData ? (ownedData.copies || 1) : 0;

        const cardEl = buildCollectionCardElement(card, isOwned, copies);
        grid.appendChild(cardEl);
      });
    }

    function buildCollectionCardElement(card, isOwned, copies) {
      const el = document.createElement('div');
      const isRare = ['rare', 'elite', 'legendary', 'rara', 'leggendaria'].includes(card.rarity.toLowerCase());
      el.className = `card ${isRare ? 'rare' : 'common'} ${isOwned ? '' : 'locked'}`;

      // Usa s=${userSessionToken} o t=${currentToken} per autenticare la risorsa immagine
      const tokenParam = userSessionToken ? `s=${encodeURIComponent(userSessionToken)}` : (currentToken ? `t=${encodeURIComponent(currentToken)}` : '');
      const imgUrl = `${API_BASE_URL}/collection-card-image?file=${encodeURIComponent(card.id)}&${tokenParam}`;

      el.innerHTML = `
        ${copies > 1 ? `<span class="copies-badge">x${copies}</span>` : ''}
        <div class="card-img-wrapper">
          ${isOwned ? `<img src="${imgUrl}" alt="${card.name}" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';">` : ''}

          <div class="card-placeholder" ${isOwned ? 'style="display:none"' : ''}>
            <div class="card-number">${card.num || '000'}</div>
            ${isOwned ? `<div class="card-codename">${card.name}</div>` : ''}
          </div>
          ${isRare && isOwned ? '<div class="rare-shimmer"></div>' : ''}
        </div>
        <div class="card-footer">
          <div class="card-info-group">
            <span class="card-name">${isOwned ? card.name : '???'}</span>
            <span class="rarity-badge badge-${isRare ? 'rara' : 'comune'}">${card.rarity.toUpperCase()}</span>
          </div>
        </div>
      `;

      // Interattività per carte possedute
      if (isOwned) {
        // Desktop Mouse Hover (3D)
        el.addEventListener('mousemove', (e) => {
          if (window.matchMedia("(pointer: coarse)").matches) return;
          const rect = el.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const xc = rect.width / 2;
          const yc = rect.height / 2;
          const dx = x - xc;
          const dy = y - yc;
          el.style.transform = `scale(2.1) translateY(5%) rotateY(${dx / 12}deg) rotateX(${-dy / 12}deg)`;
        });

        el.addEventListener('mouseleave', () => {
          el.style.transform = '';
        });

        // Mobile/Tablet Touch (Tap to Zoom)
        el.addEventListener('click', (e) => {
          if (!window.matchMedia("(pointer: coarse)").matches) return;
          const isAlreadyActive = el.classList.contains('active-mobile');
          document.querySelectorAll('.card.active-mobile').forEach(c => c.classList.remove('active-mobile'));
          if (!isAlreadyActive) {
            el.classList.add('active-mobile');
          }
        });
      }

      return el;
    }



    async function validateToken(token) {
      showLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/validate?t=${token}`);
        const data = await response.json();

        if (data.valid) {
          // data.cards è un array di stringhe tipo ["001-rarita-serie-nome", ...]
          SELECTED_CARDS = data.cards.map(cardId => {
            const parts = cardId.split('-');
            if (parts.length === 3) {
              return {
                id: cardId,
                num: parts[0],
                rarity: parts[2] || 'comune',
                series: 'CORE',
                name: parts[1].replace(/-/g, ' '),
                filename: `${cardId}.png`
              };
            } else {
              return {
                id: cardId,
                num: parts[0],
                rarity: parts[1] || 'comune',
                series: parts[2] || 'CORE',
                name: parts[3] ? parts[3].replace(/-/g, ' ') : (parts[1] || 'Unknown'),
                filename: `${cardId}.png`
              };
            }
          });

          const seriesCounts = {};
          SELECTED_CARDS.forEach(c => {
            seriesCounts[c.series] = (seriesCounts[c.series] || 0) + 1;
          });
          const dominantSeries = Object.keys(seriesCounts).reduce((a, b) => seriesCounts[a] > seriesCounts[b] ? a : b);

          if (dominantSeries === 'INDD') {
            document.getElementById('pack-img').src = './assets/busta_indd.png';
            document.getElementById('pack-anim').src = './assets/busta_indd.png';
            document.querySelector('.intro-subtitle').textContent = 'I Nemici della Democrazia sono stati individuati. Analizza i dati recuperati dal campo.';
          }

          showLoading(false);
          document.getElementById('screen-intro').style.display = 'flex';
        } else {
          let msg = "Token non valido.";
          if (data.reason === 'expired') msg = "Il tempo per questo premio è scaduto. La gloria è effimera.";
          if (data.reason === 'already_used') msg = "Premio già ritirato. Non provare a ingannare il Ministero.";
          if (data.reason === 'rate_limit_exceeded') msg = "Troppe richieste. Riprova tra un minuto, soldato.";
          showError(msg);
        }
      } catch (err) {
        console.error(err);
        showError("Connessione al Super Destroyer interrotta. Riprova più tardi.");
      }
    }

    function showLoading(show) {
      document.getElementById('screen-loading').style.display = show ? 'flex' : 'none';
      document.getElementById('screen-intro').style.display = 'none';
    }

    function showError(msg) {
      document.getElementById('screen-loading').style.display = 'none';
      document.getElementById('screen-intro').style.display = 'none';
      document.getElementById('screen-error').style.display = 'flex';
      document.getElementById('error-message').textContent = msg;
    }

    // ===== MOSTRA CARTE =====
    function showCards() {
      const cardsScreen = document.getElementById('screen-cards');
      const grid = document.getElementById('cards-grid');
      grid.innerHTML = '';

      cardsScreen.style.display = 'flex';

      const rarityOrder = { 'core': 0, 'comune': 0, 'rare': 1, 'rara': 1, 'elite': 2, 'legendary': 3, 'leggendaria': 3 };
      const sorted = [...SELECTED_CARDS].sort((a, b) =>
        (rarityOrder[a.rarity] || 0) - (rarityOrder[b.rarity] || 0)
      );

      sorted.forEach((card, i) => {
        const el = buildCard(card);
        grid.appendChild(el);

        setTimeout(() => {
          el.classList.add('reveal');
          if (card.rarity === 'rara') {
            setTimeout(() => spawnParticles(), 200);
          }
        }, 100 + i * 120);
      });

      startTimer();
    }

    function buildCard(card) {
      const el = document.createElement('div');
      const isRare = ['rare', 'elite', 'legendary', 'rara', 'leggendaria'].includes(card.rarity);
      el.className = `card ${isRare ? 'rare' : 'common'}`;

      let cardContent = '';
      if (card.isMock) {
        cardContent = `
          <div class="card-placeholder">
            <div class="card-number">${card.num}</div>
            <div class="card-codename">MOCKUP</div>
          </div>
        `;
      } else {
        const imgUrl = `${API_BASE_URL}/card-image?t=${currentToken}&file=${encodeURIComponent(card.id)}`;
        cardContent = `
          <img src="${imgUrl}" alt="${card.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="card-placeholder" style="display:none">
            <div class="card-number">${card.num}</div>
            <div class="card-codename">${card.name}</div>
          </div>
        `;
      }

      el.innerHTML = `
      <div class="card-img-wrapper">
        ${cardContent}
        ${isRare ? '<div class="rare-shimmer"></div>' : ''}
      </div>
      <div class="card-footer">
        <div class="card-info-group">
          <span class="card-name">${card.name}</span>
          <span class="rarity-badge badge-${isRare ? 'rara' : 'comune'}">${card.rarity.toUpperCase()}</span>
        </div>
        <button class="download-icon-btn" title="Scarica Immagine">
          <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        </button>
      </div>
    `;

      const dlBtn = el.querySelector('.download-icon-btn');
      if (dlBtn) {
        dlBtn.onclick = async (e) => {
          e.stopPropagation();
          const fileName = card.filename || `${card.id}.png`;
          const imgUrl = `${API_BASE_URL}/card-image?t=${currentToken}&file=${encodeURIComponent(card.id)}`;
          try {
            const resp = await fetch(imgUrl);
            if (!resp.ok) throw new Error('Fetch fallito');
            const blob = await resp.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(objectUrl);
          } catch (err) {
            console.error('Download fallito:', err);
          }
        };
      }

      el.addEventListener('mousemove', (e) => {
        if (window.matchMedia("(pointer: coarse)").matches) return;
        if (card.isMock) return;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const xc = rect.width / 2;
        const yc = rect.height / 2;
        const dx = x - xc;
        const dy = y - yc;
        el.style.transform = `scale(2.1) translateY(5%) rotateY(${dx / 12}deg) rotateX(${-dy / 12}deg)`;
      });

      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });

      return el;
    }

    // ===== TIMER =====
    function startTimer() {
      const expirationTimestamp = Date.now() + (60 * 60 * 1000);

      const updateFunc = () => {
        const now = Date.now();
        const diff = expirationTimestamp - now;

        if (diff <= 0) {
          clearInterval(timerInterval);
          document.getElementById('timer-display').textContent = '00:00';
          onTimerExpired();
          return;
        }

        const totalSeconds = Math.ceil(diff / 1000);
        const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const s = String(totalSeconds % 60).padStart(2, '0');

        document.getElementById('timer-display').textContent = `${m}:${s}`;

        if (totalSeconds < 300) {
          document.getElementById('timer-display').style.color = '#C0281C';
        }
      };

      updateFunc();
      timerInterval = setInterval(updateFunc, 1000);
    }

    function onTimerExpired() {
      const cardsScreen = document.getElementById('screen-cards');
      cardsScreen.style.transition = 'opacity 1s';
      cardsScreen.style.opacity = '0.2';
      cardsScreen.style.pointerEvents = 'none';
      document.querySelector('.cards-header p').textContent = 'Tempo scaduto. Le carte non sono più disponibili.';
      document.getElementById('timer-display').textContent = '00:00';
    }

    // =====================================================================
    // ===== AUCTION HOUSE — Logica completa =====
    // =====================================================================

    let _auctionSelectedCard = null;  // carta selezionata per la creazione asta
    let _settleTargetAuction = null;  // asta target per il settle
    let _bidTargetAuction = null;     // asta target per il rilancio (bid)
    let _auctionCountdownTimers = []; // handle dei setInterval per i countdown

    // Pulisce tutti i countdown attivi (evita memory leak al refresh)
    function _clearAuctionCountdowns() {
      _auctionCountdownTimers.forEach(id => clearInterval(id));
      _auctionCountdownTimers = [];
    }

    // Toggle banner guida
    function toggleAuctionGuide() {
      const body = document.getElementById('auction-guide-body');
      const arrow = document.getElementById('guide-toggle-arrow');
      if (!body) return;
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'flex';
      if (arrow) arrow.classList.toggle('open', !isOpen);
    }

    // Switcha tra i tab dell'Auction House
    function switchAuctionTab(tab, btnEl) {
      document.querySelectorAll('.auction-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.auction-panel').forEach(p => p.classList.remove('active'));
      if (btnEl) btnEl.classList.add('active');

      if (tab === 'active') {
        document.getElementById('auction-panel-active').classList.add('active');
        loadAuctionList();
      } else if (tab === 'mine') {
        document.getElementById('auction-panel-mine').classList.add('active');
        if (userSessionToken) loadMyAuctions();
        else renderAuctionAuthWall('auction-my-grid');
      } else if (tab === 'create') {
        document.getElementById('auction-panel-create').classList.add('active');
        if (userSessionToken) renderAuctionableCards();
        else renderAuctionAuthWall('auction-selectable-grid');
      } else if (tab === 'guide') {
        document.getElementById('auction-panel-guide').classList.add('active');
      }
    }

    // Messaggio muro auth per le sezioni riservate
    function renderAuctionAuthWall(containerId) {
      document.getElementById(containerId).innerHTML =
        `<div class="auction-empty">⚠️ Effettua il Login Discord per accedere a questa sezione</div>`;
    }

    // ---- CARICAMENTO ASTE ATTIVE ----
    async function loadAuctionList() {
      _clearAuctionCountdowns();
      const grid = document.getElementById('auction-list-grid');
      grid.innerHTML = '<div class="auction-empty">Recupero aste in corso...</div>';

      try {
        const headers = {};
        if (userSessionToken) headers['Authorization'] = `Bearer ${userSessionToken}`;
        const resp = await fetch(`${API_BASE_URL}/auction/list`, { headers });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        grid.innerHTML = '';
        if (!data.auctions || data.auctions.length === 0) {
          grid.innerHTML = '<div class="auction-empty">🛒 Nessuna asta attiva al momento</div>';
          return;
        }
        data.auctions.forEach(a => grid.appendChild(buildAuctionCard(a, false)));
      } catch (e) {
        console.error('[AUCTION] Errore caricamento lista:', e);
        grid.innerHTML = '<div class="auction-empty">Impossibile recuperare le aste. Riprova più tardi.</div>';
      }
    }

    // ---- CARICAMENTO LE MIE ASTE ----
    async function loadMyAuctions() {
      const grid = document.getElementById('auction-my-grid');
      grid.innerHTML = '<div class="auction-empty">Recupero in corso...</div>';

      try {
        const resp = await fetch(`${API_BASE_URL}/auction/my-auctions`, {
          headers: { 'Authorization': `Bearer ${userSessionToken}` }
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        grid.innerHTML = '';
        if (!data.auctions || data.auctions.length === 0) {
          grid.innerHTML = '<div class="auction-empty">Non hai ancora messo nessuna carta all\'asta</div>';
          return;
        }
        data.auctions.forEach(a => grid.appendChild(buildAuctionCard(a, true)));
      } catch (e) {
        console.error('[AUCTION] Errore mie aste:', e);
        grid.innerHTML = '<div class="auction-empty">Errore nel caricamento. Riprova.</div>';
      }
    }

    // ---- COSTRUISCE UNA CARD ASTA (sia pubblica che personale) ----
    function buildAuctionCard(auction, isMine) {
      const el = document.createElement('div');
      const isRare = ['rare', 'rara', 'elite', 'legendary', 'leggendaria'].includes((auction.card_rarity || '').toLowerCase());
      el.className = `auction-card ${isRare ? 'rare-auction' : ''}`;

      // Anteprima immagine (solo se image_url è presente)
      let previewHtml;
      if (auction.image_url) {
        const fullUrl = `${API_BASE_URL}${auction.image_url}`;
        previewHtml = `<img src="${fullUrl}" alt="${auction.card_name}" onerror="this.parentElement.innerHTML=buildAuctionPlaceholder()"`
          + ` style="width:100%;height:100%;object-fit:cover;">`;
      } else {
        previewHtml = `
          <div class="auction-card-preview-placeholder">
            <div class="ph-num">${(auction.card_id || '').split('-')[0] || '?'}</div>
            <div class="ph-label">Classificato</div>
          </div>`;
      }

      // Countdown scadenza
      const countdownId = `acd-${auction.auction_id}`;
      const aucStatus = auction.status || 'active';

      // Status badge (solo per "Le mie aste")
      const statusMap = { active: 'badge-active', completed: 'badge-completed', cancelled: 'badge-cancelled', expired: 'badge-expired' };
      const statusLabel = { active: '● Attiva', completed: '✓ Venduta', cancelled: '✕ Annullata', expired: '⌛ Scaduta' };
      const badgeHtml = isMine
        ? `<span class="auction-status-badge ${statusMap[aucStatus] || ''}">${statusLabel[aucStatus] || aucStatus}</span>`
        : '';

      // Box Rilancio / Miglior Offerente con Nome e Discord ID tra parentesi
      let bidInfoHtml = '';
      if (auction.highest_bid && auction.highest_bidder_name) {
        bidInfoHtml = `
          <div class="auction-bid-row">
            <div class="auction-bid-label">Miglior offerente</div>
            <div class="auction-bid-val">
              <span class="bid-amount">${auction.highest_bid} SC</span>
              <span class="bid-user">da ${auction.highest_bidder_name} <span class="bid-id">(${auction.highest_bidder_id})</span></span>
            </div>
          </div>`;
      } else {
        bidInfoHtml = `
          <div class="auction-bid-row">
            <div class="auction-bid-label">Miglior offerente</div>
            <div class="auction-bid-val no-bids">Nessun rilancio ancora</div>
          </div>`;
      }

      el.innerHTML = `
        <div class="auction-card-preview">${previewHtml}</div>
        <div class="auction-card-info">
          <div class="auction-card-name">${auction.card_name}</div>
          <div class="auction-card-meta">
            <span class="rarity-badge badge-${isRare ? 'rara' : 'comune'}">${(auction.card_rarity || 'comune').toUpperCase()}</span>
            ${badgeHtml}
          </div>
          <div class="auction-seller">🪖 ${auction.seller_username || 'Venditore'}</div>
          <div class="auction-price-row">
            <div>
              <div class="auction-price-label">Prezzo base</div>
              <div class="auction-price-val">${auction.base_price} SC</div>
            </div>
            <div class="auction-countdown" id="${countdownId}">--:--:--</div>
          </div>
          ${bidInfoHtml}
        </div>
        <div class="auction-card-actions" id="actions-${auction.auction_id}"></div>
      `;

      // Avvia countdown per le aste attive
      if (aucStatus === 'active' && auction.expires_at) {
        const timerId = setInterval(() => {
          const el2 = document.getElementById(countdownId);
          if (!el2) { clearInterval(timerId); return; }
          const diff = (auction.expires_at * 1000) - Date.now();
          if (diff <= 0) {
            el2.textContent = 'SCADUTA';
            el2.classList.add('expiring');
            clearInterval(timerId);
            return;
          }
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          el2.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          if (diff < 3 * 3600 * 1000) el2.classList.add('expiring');
        }, 1000);
        _auctionCountdownTimers.push(timerId);
      }

      // Azioni disponibili per la carta
      const actionsEl = el.querySelector(`#actions-${auction.auction_id}`);
      if (isMine && aucStatus === 'active') {
        // Opzioni per il venditore
        const btnSettle = document.createElement('button');
        btnSettle.className = 'btn-auction-action';
        btnSettle.textContent = '✅ Concludi Vendita';
        btnSettle.onclick = () => openSettleModal(auction);

        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn-auction-action btn-auction-danger';
        btnCancel.textContent = '✕ Annulla';
        btnCancel.onclick = () => cancelAuction(auction.auction_id, el);

        actionsEl.appendChild(btnSettle);
        actionsEl.appendChild(btnCancel);
      } else if (!isMine && aucStatus === 'active') {
        // Opzioni per i potenziali acquirenti
        const isMyOwnAuction = currentUserProfile && String(currentUserProfile.id) === String(auction.seller_id);
        if (isMyOwnAuction) {
          const myBadge = document.createElement('span');
          myBadge.className = 'auction-status-badge badge-active';
          myBadge.style.margin = 'auto';
          myBadge.textContent = 'La tua asta';
          actionsEl.appendChild(myBadge);
        } else {
          // Rende tutta la card cliccabile per aprire il popup di rilancio
          el.style.cursor = 'pointer';
          el.title = 'Clicca per fare un\'offerta / rilanciare';
          el.onclick = (e) => {
            if (!e.target.closest('button')) {
              openBidModal(auction);
            }
          };

          const btnBid = document.createElement('button');
          btnBid.className = 'btn-auction-action btn-auction-bid';
          btnBid.textContent = '💎 Fai un\'offerta';
          btnBid.onclick = (e) => {
            e.stopPropagation();
            openBidModal(auction);
          };
          actionsEl.appendChild(btnBid);
        }
      }

      return el;
    }

    // ---- RENDER CARTE SELEZIONABILI PER NUOVA ASTA ----
    async function renderAuctionableCards() {
      const grid = document.getElementById('auction-selectable-grid');
      grid.innerHTML = '<div class="auction-empty">Caricamento collezione...</div>';

      // Assicura che la collezione sia caricata
      if (userOwnedCollection.length === 0) {
        await fetchUserProfileAndCollection();
      }

      // Filtra: solo carte con almeno 1 copia (il lock sbloccato viene verificato lato server)
      const available = userOwnedCollection.filter(c => (c.copies || 1) >= 1);
      grid.innerHTML = '';

      if (available.length === 0) {
        grid.innerHTML = '<div class="auction-empty">Nessuna carta disponibile da mettere all\'asta</div>';
        return;
      }

      available.forEach(card => {
        const cardEl = document.createElement('div');
        const isRare = ['rare', 'rara', 'elite', 'legendary', 'leggendaria'].includes((card.rarity || '').toLowerCase());
        cardEl.className = `auction-selectable-card ${isRare ? 'rare-card' : ''}`;

        const tokenParam = userSessionToken ? `s=${encodeURIComponent(userSessionToken)}` : '';
        const imgUrl = `${API_BASE_URL}/collection-card-image?file=${encodeURIComponent(card.card_id)}&${tokenParam}`;

        cardEl.innerHTML = `
          ${(card.copies || 1) > 1 ? `<span class="sel-copies">x${card.copies}</span>` : ''}
          <img src="${imgUrl}" alt="${card.card_name}" onerror="this.style.display='none'">
          <div class="sel-card-footer">
            <div class="sel-card-name">${card.card_name}</div>
          </div>
        `;

        cardEl.onclick = async () => { await openCreateAuctionModal(card, cardEl); };
        grid.appendChild(cardEl);
      });
    }

    async function loadAuctionCardValuation(cardId) {
      const priceInput = document.getElementById('input-base-price');
      const errEl = document.getElementById('modal-create-error');
      const hintEl = document.getElementById('auction-card-price-hint');

      priceInput.value = '';
      priceInput.min = '1';
      errEl.style.display = 'none';
      hintEl.textContent = 'Calcolo prezzo minimo in corso...';
      hintEl.style.display = 'block';

      try {
        const resp = await fetch(`${API_BASE_URL}/auction/card-valuation?card_id=${encodeURIComponent(cardId)}`);
        const data = await resp.json();

        if (!resp.ok) {
          throw new Error(data.error || 'card_valuation_unavailable');
        }

        const minPrice = Number(data.min_price || 0);
        const copiesInGame = data.copies_in_game !== undefined && data.copies_in_game !== null ? data.copies_in_game : 0;
        _auctionSelectedCardValuation = data;
        priceInput.min = String(Math.max(1, minPrice));
        priceInput.value = String(minPrice || 1);
        hintEl.textContent = `Prezzo minimo consigliato: ${minPrice} SC • copie in gioco: ${copiesInGame}`;
      } catch (error) {
        _auctionSelectedCardValuation = null;
        hintEl.textContent = 'Prezzo minimo non disponibile. Inserisci un valore manuale superiore a 0.';
        console.warn('[AUCTION] Valutazione carta non disponibile:', error);
      }
    }

    // ---- MODAL: CREA ASTA ----
    async function openCreateAuctionModal(card, cardEl) {
      // Deseleziona eventuali selezioni precedenti
      document.querySelectorAll('.auction-selectable-card.selected').forEach(c => c.classList.remove('selected'));
      cardEl.classList.add('selected');
      _auctionSelectedCard = card;
      _auctionSelectedCardValuation = null;

      // Aggiorna anteprima nel modal
      const tokenParam = userSessionToken ? `s=${encodeURIComponent(userSessionToken)}` : '';
      const imgUrl = `${API_BASE_URL}/collection-card-image?file=${encodeURIComponent(card.card_id)}&${tokenParam}`;
      const isRare = ['rare', 'rara', 'elite', 'legendary', 'leggendaria'].includes((card.rarity || '').toLowerCase());
      document.getElementById('modal-create-card-preview').innerHTML = `
        <img src="${imgUrl}" alt="${card.card_name}" style="width:50px;border-radius:5px;" onerror="this.style.display='none'">
        <div class="auction-modal-card-info">
          <strong>${card.card_name}</strong>
          <span class="rarity-badge badge-${isRare ? 'rara' : 'comune'}" style="align-self:flex-start;">${(card.rarity || 'comune').toUpperCase()}</span>
        </div>
      `;

      document.getElementById('input-base-price').value = '';
      document.getElementById('modal-create-error').style.display = 'none';
      document.getElementById('btn-confirm-create').disabled = false;
      document.getElementById('modal-create-auction').style.display = 'flex';
      await loadAuctionCardValuation(card.card_id);
    }

    async function confirmAuctionCreate() {
      if (!_auctionSelectedCard) return;
      const priceInput = document.getElementById('input-base-price');
      const errEl = document.getElementById('modal-create-error');
      const btn = document.getElementById('btn-confirm-create');
      const price = parseInt(priceInput.value, 10);
      const minPrice = Number(_auctionSelectedCardValuation?.min_price || 0);

      if (!price || price <= 0) {
        errEl.textContent = 'Inserisci un prezzo base valido (intero positivo).';
        errEl.style.display = 'block';
        return;
      }

      if (minPrice > 0 && price < minPrice) {
        errEl.textContent = `Prezzo troppo basso. Il minimo consigliato per questa carta è ${minPrice} SC.`;
        errEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Invio in corso...';
      errEl.style.display = 'none';

      try {
        const resp = await fetch(`${API_BASE_URL}/auction/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userSessionToken}`
          },
          body: JSON.stringify({ card_id: _auctionSelectedCard.card_id, base_price: price })
        });
        const data = await resp.json();
        if (resp.ok) {
          closeAuctionModal('modal-create-auction');
          // Passa al tab "le mie aste" e ricarica
          switchAuctionTab('mine', document.getElementById('tab-btn-mine'));
          // Aggiorna la collezione (la carta potrebbe essere bloccata)
          await fetchUserProfileAndCollection();
        } else {
          const errorMessages = {
            auction_cap_reached: 'Hai già 3 aste attive. Chiudine una prima di crearne un\'altra.',
            card_not_owned: 'Carta non trovata nella tua collezione.',
            card_locked: 'La carta è già bloccata da un\'altra asta o scambio.',
            invalid_base_price: 'Prezzo non valido. Deve essere un intero positivo.',
            price_below_minimum: `Prezzo troppo basso. Il minimo per questa carta è ${data.min_price ?? 'n.d.'} SC.`
          };
          errEl.textContent = errorMessages[data.error] || `Errore: ${data.error}`;
          errEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Conferma Asta';
        }
      } catch (e) {
        console.error('[AUCTION] Errore creazione:', e);
        errEl.textContent = 'Errore di connessione. Riprova.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Conferma Asta';
      }
    }

    // ---- MODAL: CONCLUDE VENDITA (SETTLE) ----
    function openSettleModal(auction) {
      _settleTargetAuction = auction;
      const isRare = ['rare', 'rara', 'elite', 'legendary', 'leggendaria'].includes((auction.card_rarity || '').toLowerCase());
      document.getElementById('modal-settle-card-preview').innerHTML = `
        <div class="auction-modal-card-info">
          <strong>${auction.card_name}</strong>
          <span class="rarity-badge badge-${isRare ? 'rara' : 'comune'}" style="align-self:flex-start;">${(auction.card_rarity || 'comune').toUpperCase()}</span>
          <span style="font-size:0.75rem;color:var(--muted);">Prezzo base: ${auction.base_price} SC</span>
        </div>
      `;

      const winnerInfoEl = document.getElementById('modal-settle-winner-info');
      const buyerInput = document.getElementById('input-buyer-id');

      if (auction.highest_bidder_id && auction.highest_bid) {
        winnerInfoEl.innerHTML = `
          <div class="settle-winner-box">
            🏆 <strong>Vincitore Rilanci:</strong> ${auction.highest_bidder_name} <span class="winner-id">(${auction.highest_bidder_id})</span><br>
            💰 <strong>Offerta finale:</strong> ${auction.highest_bid} SC
          </div>
        `;
        buyerInput.value = auction.highest_bidder_id;
      } else {
        winnerInfoEl.innerHTML = `
          <div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px;font-style:italic;">
            Nessun acquirente ha registrato rilanci sul sito per questa asta.
          </div>
        `;
        buyerInput.value = '';
      }

      document.getElementById('modal-settle-error').style.display = 'none';
      document.getElementById('btn-confirm-settle').disabled = false;
      document.getElementById('btn-confirm-settle').textContent = 'Trasferisci Carta';
      document.getElementById('modal-settle-auction').style.display = 'flex';
    }

    async function confirmAuctionSettle() {
      if (!_settleTargetAuction) return;
      const buyerIdInput = document.getElementById('input-buyer-id');
      const errEl = document.getElementById('modal-settle-error');
      const btn = document.getElementById('btn-confirm-settle');
      const buyerId = buyerIdInput.value.trim();

      if (!buyerId || !/^\d{17,20}$/.test(buyerId)) {
        errEl.textContent = 'Inserisci un Discord ID valido (17-20 cifre).';
        errEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Trasferimento...';
      errEl.style.display = 'none';

      try {
        const resp = await fetch(`${API_BASE_URL}/auction/settle`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userSessionToken}`
          },
          body: JSON.stringify({
            auction_id: _settleTargetAuction.auction_id,
            buyer_discord_id: buyerId
          })
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
          closeAuctionModal('modal-settle-auction');
          loadMyAuctions();
          await fetchUserProfileAndCollection();
        } else {
          const errorMessages = {
            auction_not_found: 'Asta non trovata.',
            unauthorized: 'Non sei il venditore di questa asta.',
            auction_not_active: 'L\'asta non è più attiva.',
            auction_lock_not_found: 'Errore interno: lock non trovato. Contatta un admin.',
            auction_lock_mismatch: 'Errore critico di sicurezza. Contatta un admin.'
          };
          errEl.textContent = errorMessages[data.error] || `Errore: ${data.error}`;
          errEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Trasferisci Carta';
        }
      } catch (e) {
        console.error('[AUCTION] Errore settle:', e);
        errEl.textContent = 'Errore di connessione. Riprova.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Trasferisci Carta';
      }
    }

    // ---- MODAL: PIAZZA OFFERTA (BID) ----
    function openBidModal(auction) {
      if (!userSessionToken) {
        alert('Effettua il Login Discord per poter partecipare alle aste e fare offerte!');
        return;
      }
      _bidTargetAuction = auction;
      const isRare = ['rare', 'rara', 'elite', 'legendary', 'leggendaria'].includes((auction.card_rarity || '').toLowerCase());
      
      const tokenParam = userSessionToken ? `s=${encodeURIComponent(userSessionToken)}` : '';
      const imgUrl = `${API_BASE_URL}/collection-card-image?file=${encodeURIComponent(auction.card_id)}&${tokenParam}`;

      document.getElementById('modal-bid-card-preview').innerHTML = `
        <div class="auction-modal-card-info">
          <strong>${auction.card_name}</strong>
          <span class="rarity-badge badge-${isRare ? 'rara' : 'comune'}" style="align-self:flex-start;">${(auction.card_rarity || 'comune').toUpperCase()}</span>
          <span style="font-size:0.75rem;color:var(--muted);">Venditore: 🪖 ${auction.seller_username}</span>
        </div>
      `;

      const minBid = (auction.highest_bid && auction.highest_bid > 0)
        ? auction.highest_bid + 1
        : auction.base_price;

      const currentInfoEl = document.getElementById('modal-bid-current-info');
      if (auction.highest_bid) {
        currentInfoEl.innerHTML = `
          Miglior offerente: <strong>${auction.highest_bidder_name} (${auction.highest_bidder_id})</strong><br>
          Offerta attuale: <strong style="color:var(--yellow);">${auction.highest_bid} SC</strong> &bull; Rilancio minimo: <strong>${minBid} SC</strong>
        `;
      } else {
        currentInfoEl.innerHTML = `
          Nessuna offerta ancora.<br>
          Prezzo base / Offerta minima: <strong style="color:var(--yellow);">${minBid} SC</strong>
        `;
      }

      const input = document.getElementById('input-bid-amount');
      input.min = minBid;
      input.value = minBid;
      document.getElementById('modal-bid-error').style.display = 'none';
      document.getElementById('btn-confirm-bid').disabled = false;
      document.getElementById('btn-confirm-bid').textContent = 'Invia Offerta';
      document.getElementById('modal-bid-auction').style.display = 'flex';
    }

    async function confirmAuctionBid() {
      if (!_bidTargetAuction) return;
      const input = document.getElementById('input-bid-amount');
      const errEl = document.getElementById('modal-bid-error');
      const btn = document.getElementById('btn-confirm-bid');
      const amount = parseInt(input.value, 10);
      const minBid = parseInt(input.min, 10) || 1;

      if (!amount || amount < minBid) {
        errEl.textContent = `L'offerta deve essere di almeno ${minBid} SC.`;
        errEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Invio offerta...';
      errEl.style.display = 'none';

      try {
        const resp = await fetch(`${API_BASE_URL}/auction/bid`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userSessionToken}`
          },
          body: JSON.stringify({
            auction_id: _bidTargetAuction.auction_id,
            bid_amount: amount
          })
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
          closeAuctionModal('modal-bid-auction');
          loadAuctionList();
        } else {
          const errorMessages = {
            unauthorized: 'Sessione scaduta. Ricarica la pagina e rifai il login.',
            cannot_bid_own_auction: 'Non puoi fare offerte sulle tue stesse aste!',
            auction_expired: 'L\'asta è scaduta.',
            auction_not_active: 'L\'asta non è più attiva.',
            bid_too_low: `Offerta troppo bassa. Il rilancio minimo è ${data.min_bid || minBid} SC.`
          };
          errEl.textContent = errorMessages[data.error] || `Errore: ${data.error}`;
          errEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Invia Offerta';
        }
      } catch (e) {
        console.error('[AUCTION] Errore offerta:', e);
        errEl.textContent = 'Errore di connessione. Riprova.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Invia Offerta';
      }
    }

    // ---- ANNULLAMENTO ASTA ----
    async function cancelAuction(auctionId, cardEl) {
      if (!confirm('Sei sicuro di voler annullare questa asta? La carta tornerà disponibile.')) return;

      try {
        const resp = await fetch(`${API_BASE_URL}/auction/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userSessionToken}`
          },
          body: JSON.stringify({ auction_id: auctionId })
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
          loadMyAuctions();
          await fetchUserProfileAndCollection();
        } else {
          alert(`Errore nell'annullamento: ${data.error || 'sconosciuto'}`);
        }
      } catch (e) {
        console.error('[AUCTION] Errore cancel:', e);
        alert('Errore di connessione. Riprova.');
      }
    }

    // ---- CHIUDE UN MODAL ----
    function closeAuctionModal(modalId) {
      document.getElementById(modalId).style.display = 'none';
      _auctionSelectedCard = null;
      _settleTargetAuction = null;
      _bidTargetAuction = null;
      // Rimuovi selezione carte
      document.querySelectorAll('.auction-selectable-card.selected').forEach(c => c.classList.remove('selected'));
    }
  