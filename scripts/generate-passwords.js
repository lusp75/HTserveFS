/**
 * Script per generare password hash per HtserveFS
 * Genera hash bcrypt compatibili con il sistema di autenticazione
 */

import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generatePasswordHashes() {
  const saltRounds = 12;
  
  console.log('Generazione password hash per HtserveFS...');
  
  // Password da hashare
  const passwords = {
    admin: 'admin',
    user: 'password'
  };
  
  const hashes = {};
  
  for (const [username, password] of Object.entries(passwords)) {
    console.log(`Generazione hash per ${username}...`);
    const hash = await bcrypt.hash(password, saltRounds);
    hashes[username] = hash;
    console.log(`${username}: ${hash}`);
  }
  
  // Leggi il config.json esistente
  const configPath = path.join(__dirname, '..', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Aggiorna gli utenti
  config.auth.users = [
    {
      username: 'admin',
      password_hash: hashes.admin,
      role: 'admin'
    },
    {
      username: 'user',
      password_hash: hashes.user,
      role: 'read-write'
    }
  ];
  
  // Salva il config aggiornato
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  console.log('\nConfig.json aggiornato con successo!');
  console.log('Credenziali disponibili:');
  console.log('- admin / admin (ruolo: admin)');
  console.log('- user / password (ruolo: read-write)');
}

generatePasswordHashes().catch(console.error);