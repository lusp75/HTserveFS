HtserveFS - File Server Application
====================================

Versione: 1.0.1
Data: Agosto 2025

DESCRIZIONE
-----------
HtserveFS è un'applicazione server per la condivisione e gestione di file attraverso
un'interfaccia web moderna e sicura.

CARATTERISTICHE PRINCIPALI
--------------------------
- Interfaccia web responsive e moderna
- Autenticazione utenti con controllo ruoli
- Gestione sicura dei file con validazione
- Supporto HTTPS con certificati auto-generati
- Monitoraggio sistema e statistiche
- Throttling del traffico configurabile
- Logging avanzato con rotazione file

INSTALLAZIONE
-------------
L'installer ha copiato i seguenti componenti:

- Eseguibile principale: bin\htservefs.exe
- Asset frontend: assets\ (interfaccia web)
- Configurazione: config\config-installer.json
- Documentazione: docs\

CONFIGURAZIONE
--------------
Il file config\config-installer.json contiene tutte le impostazioni dell'applicazione:

- Percorso asset frontend
- Configurazione server (porta, TLS)
- Utenti e autenticazione
- Condivisioni file
- Impostazioni sicurezza
- Throttling e logging

USO
---
1. Eseguire bin\htservefs.exe
2. Aprire il browser su http://localhost:8000
3. Accedere con:
   - Username: admin, Password: admin (amministratore)
   - Username: user, Password: password (utente standard)

SICUREZZA
---------
- Cambiare le password di default dopo il primo accesso
- Configurare HTTPS per l'uso in produzione
- Verificare le condivisioni file configurate
- Controllare le impostazioni di throttling

SUPPORTO
--------
Per assistenza e aggiornamenti, consultare la documentazione del progetto.

LICENZA
-------
Questo software è distribuito secondo i termini della licenza del progetto.