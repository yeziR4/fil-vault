import lighthouse from '@lighthouse-web3/sdk';

/**
 * Uploads a text payload (stringified JSON vault) to Filecoin via Lighthouse.
 * @param {string} vaultJsonStr 
 * @param {string} apiKey 
 * @returns {Promise<string>} - The CID (Content Identifier)
 */
export async function uploadVaultToFilecoin(vaultJsonStr, apiKey) {
  if (!apiKey) {
    throw new Error('Lighthouse API Key is required for upload.');
  }

  // Convert the stringified vault JSON into a file object for the browser
  const blob = new Blob([vaultJsonStr], { type: 'application/json' });
  const file = new File([blob], 'vault.json', { type: 'application/json' });

  // lighthouse.upload expects a FileList or File[] in browser environments
  const response = await lighthouse.upload([file], apiKey);

  if (response && response.data && response.data.Hash) {
    return response.data.Hash;
  } else {
    throw new Error('Upload failed: Invalid response from Lighthouse SDK.');
  }
}

/**
 * Fetches the encrypted vault payload from Filecoin/IPFS gateways with automatic failover.
 * @param {string} cid 
 * @returns {Promise<string>} - The stringified JSON vault payload
 */
export async function fetchVaultFromGateway(cid) {
  if (!cid) {
    throw new Error('CID is required for retrieval.');
  }

  // Clean CID of any leading/trailing spaces
  const cleanCid = cid.trim();

  // List of gateways for robust retrieval
  const gateways = [
    `https://gateway.lighthouse.storage/ipfs/${cleanCid}`,
    `https://cloudflare-ipfs.com/ipfs/${cleanCid}`,
    `https://ipfs.io/ipfs/${cleanCid}`
  ];

  let lastError = null;

  for (const gatewayUrl of gateways) {
    try {
      console.log(`Attempting retrieval from gateway: ${gatewayUrl}`);
      
      const response = await fetch(gatewayUrl);
      if (response.ok) {
        const text = await response.text();
        // Basic verification that we got a valid JSON vault object back
        if (text.includes('ciphertext') && text.includes('iv')) {
          console.log(`Successfully retrieved vault from: ${gatewayUrl}`);
          return text;
        }
      }
    } catch (err) {
      console.warn(`Gateway retrieve failed: ${gatewayUrl}`, err);
      lastError = err;
    }
  }

  throw new Error(`Failed to retrieve vault from Filecoin/IPFS. (Last error: ${lastError ? lastError.message : 'Unknown gateway error'})`);
}
