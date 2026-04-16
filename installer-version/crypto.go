package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
)

// generateKey generates a 32-byte key using a fixed salt
// This ensures the same key is used across all HtserveFS executables
func generateKey() []byte {
	// Use a fixed key base for all HtserveFS instances
	// This allows config files to be portable between different executables
	keyBase := "htservefs-universal-key-2024"
	salt := "htservefs-crypto-salt-secure"
	keyData := keyBase + salt
	
	hash := sha256.Sum256([]byte(keyData))
	return hash[:]
}

// encrypt encrypts plaintext using AES-GCM
func encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	
	key := generateKey()
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	
	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// decrypt decrypts ciphertext using AES-GCM
func decrypt(ciphertext string) (string, error) {
	if ciphertext == "" {
		return "", nil
	}
	
	// Check if it's already decrypted (for backward compatibility)
	if !isEncrypted(ciphertext) {
		return ciphertext, nil
	}
	
	key := generateKey()
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	
	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", err
	}
	
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext too short")
	}
	
	nonce, cipherData := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, cipherData, nil)
	if err != nil {
		return "", err
	}
	
	return string(plaintext), nil
}

// isEncrypted checks if a string is base64 encoded (indicating it's encrypted)
// Excludes bcrypt hashes which start with $2a$, $2b$, $2x$, or $2y$
func isEncrypted(s string) bool {
	// Check if it's a bcrypt hash (should NEVER be encrypted)
	if len(s) >= 7 && s[0] == '$' && s[1] == '2' && (s[2] == 'a' || s[2] == 'b' || s[2] == 'x' || s[2] == 'y') && s[3] == '$' {
		// Additional check: bcrypt hashes have format $2x$cost$salt+hash
		// They should be exactly 60 characters long
		if len(s) == 60 {
			return false
		}
	}
	
	// If it's already a long base64 string, it's likely encrypted
	_, err := base64.StdEncoding.DecodeString(s)
	return err == nil && len(s) > 60 // Encrypted strings are much longer than bcrypt
}

// encryptSensitiveConfig encrypts sensitive fields in the config
// CRITICAL FIX: Do NOT encrypt bcrypt hashes - they must remain pure
func encryptSensitiveConfig(cfg *AppConfig) error {
	// Encrypt JWT secret only
	if cfg.Auth.JWTSecret != "" && !isEncrypted(cfg.Auth.JWTSecret) {
		encrypted, err := encrypt(cfg.Auth.JWTSecret)
		if err != nil {
			return err
		}
		cfg.Auth.JWTSecret = encrypted
	}
	
	// DO NOT ENCRYPT PASSWORD HASHES - they are bcrypt and must stay pure
	// This was causing the corruption bug where all users stopped working
	// after creating a new user
	
	return nil
}

// decryptSensitiveConfig decrypts sensitive fields in the config
// CRITICAL FIX: Do NOT decrypt bcrypt hashes - they must remain pure
func decryptSensitiveConfig(cfg *AppConfig) error {
	// Decrypt JWT secret only
	if cfg.Auth.JWTSecret != "" {
		decrypted, err := decrypt(cfg.Auth.JWTSecret)
		if err != nil {
			return err
		}
		cfg.Auth.JWTSecret = decrypted
	}
	
	// DO NOT DECRYPT PASSWORD HASHES - they are bcrypt and must stay pure
	// This was causing the corruption bug where encrypted hashes couldn't be verified
	
	return nil
}