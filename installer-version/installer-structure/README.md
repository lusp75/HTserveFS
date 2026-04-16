# Struttura Installer per Htservefs

Questa cartella contiene la struttura organizzata per la creazione dell'installer con Inno Setup.

## Struttura delle cartelle:

```
installer-structure/
├── bin/                    # Eseguibile principale
│   └── htservefs.exe      # Eseguibile rinominato
├── assets/                # Asset del frontend
│   ├── assets/            # CSS, JS compilati
│   ├── favicon.svg
│   ├── htservefs-icon.svg
│   ├── htservefs-icon.ico
│   └── index.html
├── config/                # File di configurazione
│   └── config-installer.json
└── docs/                  # Documentazione
    └── README.txt
```

## Note:
- L'eseguibile è configurato per cercare gli asset nella cartella `assets/` relativa alla sua posizione
- La configurazione di sicurezza valida tutti gli asset prima del caricamento
- Il file di configurazione può essere personalizzato dall'utente dopo l'installazione