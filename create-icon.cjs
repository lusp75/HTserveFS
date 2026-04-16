const fs = require('fs');

// Fallback: crea un'icona semplice senza Canvas
function createSimpleIcon() {
  // Crea un'icona ICO molto semplice (16x16, monocromatica)
  const iconData = Buffer.from([
    // ICO header
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10,
    0x00, 0x00, 0x01, 0x00, 0x20, 0x00, 0x68, 0x04,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    // Bitmap header
    0x28, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00,
    0x20, 0x00, 0x00, 0x00, 0x01, 0x00, 0x20, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ]);
  
  // Aggiungi pixel data (16x16 = 256 pixel * 4 bytes RGBA)
  const pixelData = Buffer.alloc(16 * 16 * 4);
  
  // Riempi con un pattern semplice (blu con bordo bianco)
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const offset = (y * 16 + x) * 4;
      
      if (x === 0 || x === 15 || y === 0 || y === 15) {
        // Bordo bianco
        pixelData[offset] = 255;     // B
        pixelData[offset + 1] = 255; // G
        pixelData[offset + 2] = 255; // R
        pixelData[offset + 3] = 255; // A
      } else {
        // Interno blu
        pixelData[offset] = 235;     // B
        pixelData[offset + 1] = 99;  // G
        pixelData[offset + 2] = 37;  // R
        pixelData[offset + 3] = 255; // A
      }
    }
  }
  
  // AND mask (tutti trasparenti)
  const andMask = Buffer.alloc(16 * 16 / 8);
  
  const fullIcon = Buffer.concat([iconData, pixelData, andMask]);
  fs.writeFileSync('./public/htservefs-icon.ico', fullIcon);
  
  console.log('Icona ICO creata: ./public/htservefs-icon.ico');
}

// Crea l'icona ICO semplice
console.log('Creando icona ICO semplice...');
createSimpleIcon();