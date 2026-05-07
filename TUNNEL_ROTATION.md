# Tunnel Rotation — Documentazione Operativa

## Panoramica

Il sistema di apertura bustine utilizza un tunnel **Cloudflare Quick Tunnel** (gratuito, nessuna configurazione DNS richiesta) per esporre il backend `CardServer` (porta 9090) su Internet.

Poiché i tunnel Quick Tunnel scadono o cambiano FQDN periodicamente, è stato implementato un sistema di **rotazione automatica** che:

1. Riavvia il tunnel ogni **5 giorni**.
2. Salva il nuovo FQDN nel file `new_tunnel_FQDN.txt`.
3. Sostituisce automaticamente il vecchio FQDN in `index.html`.
4. Esegue un `git commit` + `git push origin main` per aggiornare il frontend su GitHub.

---

## Architettura del Sistema

```
systemd (rotate-tunnel.timer)
    │
    │ ogni 5 giorni
    ▼
joel-tunnel.service
    │
    │ esegue
    ▼
start_tunnel.sh
    ├── Salva OLD_FQDN da new_tunnel_FQDN.txt
    ├── Avvia cloudflared --url http://127.0.0.1:9090
    ├── Attende il nuovo FQDN (timeout 30s)
    ├── Scrive il nuovo FQDN in new_tunnel_FQDN.txt
    ├── sed: sostituisce OLD_FQDN con NEW_FQDN in index.html
    └── git add + commit + push origin main
```

---

## File Coinvolti

| File | Percorso Server | Ruolo |
|---|---|---|
| `start_tunnel.sh` | `~/joel-bot/start_tunnel.sh` | Script principale del tunnel + aggiornamento frontend |
| `new_tunnel_FQDN.txt` | `~/new_tunnel_FQDN.txt` | Ultimo FQDN attivo salvato |
| `tunnel_updates.log` | `~/joel-bot/tunnel_updates.log` | Log di ogni rotazione effettuata |
| `joel-tunnel.service` | `/etc/systemd/system/` | Servizio systemd che esegue lo script |
| `rotate-tunnel.timer` | `/etc/systemd/system/` | Timer systemd che riavvia il servizio ogni 5 giorni |
| `index.html` | `~/joel-bot/helldivers2_cards/index.html` | Frontend — contiene `API_BASE_URL` da aggiornare |

---

## Configurazione Systemd

### `joel-tunnel.service`
```ini
[Unit]
Description=Joel Card Server Quick Tunnel
After=network.target joel-bot.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/joel-bot
ExecStart=/bin/bash /home/ubuntu/joel-bot/start_tunnel.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### `rotate-tunnel.timer`
```ini
[Unit]
Description=Riavvio tunnel Cloudflare ogni 5 giorni

[Timer]
OnBootSec=5d
OnUnitActiveSec=5d
Unit=joel-tunnel.service

[Install]
WantedBy=timers.target
```

---

## Comandi Operativi

### Verificare lo stato del tunnel attivo
```bash
cat ~/new_tunnel_FQDN.txt
```

### Verificare il log delle rotazioni
```bash
cat ~/joel-bot/tunnel_updates.log
```

### Forzare una rotazione manuale
```bash
sudo systemctl restart joel-tunnel.service
```

### Controllare quando avverrà la prossima rotazione
```bash
systemctl list-timers rotate-tunnel.timer
```

### Controllare lo stato del servizio
```bash
sudo systemctl status joel-tunnel.service
```

---

## Note Importanti

- **Primo avvio**: Al primo avvio non è presente un OLD_FQDN, quindi lo script non esegue la sostituzione in `index.html`. Il FQDN viene solo salvato nel file `.txt`. La prima sostituzione avviene al secondo riavvio (prima rotazione).
- **Git credentials**: Le credenziali GitHub (PAT) sono configurate direttamente nell'URL del remote in `.git/config` della repo locale (`~/joel-bot/helldivers2_cards/.git/config`). Non è presente una configurazione git globale sul server.
- **Idempotenza**: Se il nuovo FQDN è identico al vecchio (es. riavvio rapido senza scadenza del tunnel), lo script non esegue nessun commit.
- **GitHub Pages**: La repo `helldivers-card-opening` è configurata per il deploy su GitHub Pages (branch `main`). Ogni push aggiorna automaticamente il sito entro pochi minuti.

---

## Troubleshooting

### Il FQDN non viene aggiornato in `index.html`
1. Verifica che `new_tunnel_FQDN.txt` contenga il vecchio FQDN prima del riavvio.
2. Controlla `tunnel_updates.log` per errori git o sed.
3. Assicurati che `user.name` e `user.email` siano configurati nella repo locale:
   ```bash
   cd ~/joel-bot/helldivers2_cards
   git config --list --local
   ```

### Il tunnel non si avvia
```bash
sudo journalctl -u joel-tunnel.service -n 50
```

### Il timer non si attiva
```bash
sudo systemctl status rotate-tunnel.timer
sudo journalctl -u rotate-tunnel.timer
```
