// Hex conversion helpers
function arrayBufferToHex(buffer) {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

function hexToUint8Array(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Base64 conversion helpers
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generates a random 256-bit AES key as a hex string.
 */
export function generateAESKey() {
  const keyBytes = new Uint8Array(32); // 256 bits
  window.crypto.getRandomValues(keyBytes);
  return arrayBufferToHex(keyBytes.buffer);
}

/**
 * Encrypts an ArrayBuffer payload using AES-GCM 256 with a hex key.
 * @param {ArrayBuffer} dataBuffer 
 * @param {string} keyHex 
 * @returns {Promise<{ ciphertext: string, iv: string }>}
 */
export async function encryptPayload(dataBuffer, keyHex) {
  const rawKey = hexToUint8Array(keyHex);
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM

  // Import key
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // Encrypt data
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    cryptoKey,
    dataBuffer
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv.buffer)
  };
}

/**
 * Decrypts a base64 ciphertext with base64 IV and a hex key.
 * @param {string} ciphertextBase64 
 * @param {string} ivBase64 
 * @param {string} keyHex 
 * @returns {Promise<ArrayBuffer>}
 */
export async function decryptPayload(ciphertextBase64, ivBase64, keyHex) {
  const rawKey = hexToUint8Array(keyHex);
  const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
  const ciphertext = base64ToArrayBuffer(ciphertextBase64);

  // Import key
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // Decrypt data
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    cryptoKey,
    ciphertext
  );

  return decryptedBuffer;
}

/**
 * Encrypts a full Vault Object (either text or file)
 * @param {string|File} content - The text message string or a File object
 * @param {string} keyHex - The AES key in hex
 * @returns {Promise<string>} - Stringified JSON representing the encrypted vault payload
 */
export async function encryptVault(content, keyHex) {
  let type = 'text';
  let name = '';
  let mimeType = 'text/plain';
  let dataBuffer;

  if (content instanceof File) {
    type = 'file';
    name = content.name;
    mimeType = content.type;
    dataBuffer = await content.arrayBuffer();
  } else {
    // Text content
    const encoder = new TextEncoder();
    dataBuffer = encoder.encode(content).buffer;
  }

  const { ciphertext, iv } = await encryptPayload(dataBuffer, keyHex);

  const vaultPayload = {
    v: 1, // version
    type,
    name,
    mimeType,
    ciphertext,
    iv
  };

  return JSON.stringify(vaultPayload);
}

/**
 * Decrypts a Vault Object and returns the decrypted results
 * @param {string} vaultJsonStr - The stringified JSON retrieved from IPFS/Filecoin
 * @param {string} keyHex - The decryption AES key in hex
 * @returns {Promise<{ type: string, name: string, mimeType: string, text?: string, fileBlob?: Blob }>}
 */
export async function decryptVault(vaultJsonStr, keyHex) {
  const payload = JSON.parse(vaultJsonStr);
  const decryptedBuffer = await decryptPayload(payload.ciphertext, payload.iv, keyHex);

  if (payload.type === 'file') {
    const fileBlob = new Blob([decryptedBuffer], { type: payload.mimeType });
    return {
      type: 'file',
      name: payload.name,
      mimeType: payload.mimeType,
      fileBlob
    };
  } else {
    // Text content
    const decoder = new TextDecoder();
    const text = decoder.decode(decryptedBuffer);
    return {
      type: 'text',
      name: '',
      mimeType: 'text/plain',
      text
    };
  }
}
