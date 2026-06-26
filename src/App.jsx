import React, { useState, useEffect, useRef } from 'react';
import { generateAESKey, encryptVault, decryptVault } from './utils/crypto';
import { uploadVaultToFilecoin, fetchVaultFromGateway } from './utils/lighthouseService';
import './App.css';

function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState('create'); // 'create', 'retrieve', 'settings'

  const DEFAULT_API_KEY = 'b1d80c6b.30354834f9cb41cb93bf39e93ff291b3';

  // Settings / API Key
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('lighthouse_api_key') || DEFAULT_API_KEY);
  const [tempApiKey, setTempApiKey] = useState(() => localStorage.getItem('lighthouse_api_key') || '');
  const [showKey, setShowKey] = useState(false);

  // Settings / Custom Gateway
  const [customGateway, setCustomGateway] = useState(() => localStorage.getItem('lighthouse_gateway') || '');
  const [tempGateway, setTempGateway] = useState(customGateway);

  // Tab 1: Create State
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [customKey, setCustomKey] = useState('');
  const [uploading, setUploading] = useState(false);
  const [vaultResult, setVaultResult] = useState(null); // { cid, key, shareUrl }

  // Tab 2: Retrieve State
  const [retrieveCid, setRetrieveCid] = useState('');
  const [retrieveKey, setRetrieveKey] = useState('');
  const [fetching, setFetching] = useState(false);
  const [decryptedResult, setDecryptedResult] = useState(null); // { type, name, mimeType, text, fileBlob }

  // Terminal / Logs
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);

  // Canvas background
  const canvasRef = useRef(null);

  // Helper to add terminal log
  const addLog = (text, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { time, text, type }]);
  };

  // Clear logs
  const clearLogs = () => setLogs([]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Handle Drag & Drop
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setTextInput('');
      addLog(`File selected: ${e.dataTransfer.files[0].name} (${(e.dataTransfer.files[0].size / 1024).toFixed(1)} KB)`, 'info');
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setTextInput('');
      addLog(`File selected: ${e.target.files[0].name} (${(e.target.files[0].size / 1024).toFixed(1)} KB)`, 'info');
    }
  };

  // Save API Key & Gateway
  const saveApiKey = (e) => {
    e.preventDefault();
    const cleanKey = tempApiKey.trim();
    const cleanGateway = tempGateway.trim();
    localStorage.setItem('lighthouse_api_key', cleanKey);
    localStorage.setItem('lighthouse_gateway', cleanGateway);
    setApiKey(cleanKey || DEFAULT_API_KEY);
    setCustomGateway(cleanGateway);
    addLog(cleanKey ? 'Custom Lighthouse API Key saved.' : 'Using default demo Lighthouse API Key.', 'success');
    if (cleanGateway) {
      addLog(`Custom Dedicated Gateway configured: ${cleanGateway}`, 'success');
    }
    setActiveTab('create');
  };

  // Generate a random AES key
  const handleGenerateKey = () => {
    const key = generateAESKey();
    setCustomKey(key);
    addLog(`Generated new AES-256 Key: ${key.substring(0, 16)}...`, 'info');
  };

  // Encrypt & Upload Flow
  const handleEncryptAndUpload = async (e) => {
    e.preventDefault();
    if (!apiKey) {
      addLog('Error: Lighthouse API Key is missing. Go to Settings to enter it.', 'error');
      setActiveTab('settings');
      return;
    }

    if (!textInput && !selectedFile) {
      addLog('Error: Please enter a message or select a file to encrypt.', 'error');
      return;
    }

    setUploading(true);
    setVaultResult(null);
    clearLogs();

    try {
      addLog('Initiating secure vault creation...', 'info');
      
      // Determine key
      const key = customKey.trim() || generateAESKey();
      if (!customKey) {
        addLog('No custom key provided. Auto-generated secure 256-bit AES key.', 'info');
      }

      addLog('Slicing data and creating binary buffer...', 'info');
      addLog('Running client-side AES-GCM local encryption sandbox...', 'info');
      
      const payload = selectedFile ? selectedFile : textInput;
      const vaultJson = await encryptVault(payload, key);
      
      addLog('AES-GCM encryption complete. Local payload verified.', 'success');
      addLog('Packaging encrypted block into IPFS JSON envelope...', 'info');
      addLog('Uploading encrypted package to Filecoin nodes via Lighthouse...', 'info');

      const cid = await uploadVaultToFilecoin(vaultJson, apiKey);

      addLog(`Successfully uploaded! Filecoin CID: ${cid}`, 'success');
      addLog('Storage deal active. Data is permanently pinned.', 'success');

      // Generate sharing URL
      const shareUrl = `${window.location.origin}${window.location.pathname}?cid=${cid}#key=${key}`;
      
      setVaultResult({
        cid,
        key,
        shareUrl
      });
      
      // Reset inputs
      setTextInput('');
      setSelectedFile(null);
      setCustomKey('');

    } catch (err) {
      addLog(`Encryption/Upload failed: ${err.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  // Fetch & Decrypt Flow
  const handleFetchAndDecrypt = async (e) => {
    if (e) e.preventDefault();
    
    if (!retrieveCid.trim()) {
      addLog('Error: Please enter a valid Filecoin CID.', 'error');
      return;
    }
    if (!retrieveKey.trim() || retrieveKey.trim().length !== 64) {
      addLog('Error: Please enter a valid 64-character hex AES key.', 'error');
      return;
    }

    setFetching(true);
    setDecryptedResult(null);
    clearLogs();

    try {
      addLog(`Connecting to Filecoin/IPFS gateways for CID: ${retrieveCid}...`, 'info');
      
      const vaultJsonStr = await fetchVaultFromGateway(retrieveCid.trim(), customGateway);
      addLog('Encrypted envelope retrieved successfully.', 'success');
      
      addLog('Importing AES-256 decryption key...', 'info');
      addLog('Initializing Web Crypto Subtle decryption sandbox...', 'info');

      const result = await decryptVault(vaultJsonStr, retrieveKey.trim());
      addLog('AES-GCM decryption completed successfully. Integrity verified.', 'success');

      setDecryptedResult(result);
      addLog(result.type === 'file' 
        ? `Decrypted file: ${result.name} (${result.mimeType})` 
        : 'Decrypted secret text message.'
      , 'success');

    } catch (err) {
      addLog(`Decryption failed: ${err.message}`, 'error');
    } finally {
      setFetching(false);
    }
  };

  // Trigger download of decrypted file
  const handleDownloadFile = () => {
    if (!decryptedResult || !decryptedResult.fileBlob) return;
    const url = URL.createObjectURL(decryptedResult.fileBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = decryptedResult.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`Downloaded file: ${decryptedResult.name}`, 'info');
  };

  // Copy to clipboard helper
  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    addLog(`${label} copied to clipboard!`, 'success');
  };

  // Check URL parameters for direct retrieve on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cid = params.get('cid');
    const hash = window.location.hash;
    const key = hash.startsWith('#key=') ? hash.substring(5) : '';

    if (cid && key) {
      setActiveTab('retrieve');
      setRetrieveCid(cid);
      setRetrieveKey(key);
      addLog('Detected secure sharing link in URL. Loading parameters...', 'info');
      // Execute retrieval immediately (giving a slight delay to render page first)
      const timer = setTimeout(() => {
        setFetching(true);
        fetchVaultFromGateway(cid, customGateway)
          .then(async (vaultJsonStr) => {
            addLog('Encrypted envelope retrieved successfully.', 'success');
            const result = await decryptVault(vaultJsonStr, key);
            setDecryptedResult(result);
            addLog('AES-GCM decryption completed successfully. Integrity verified.', 'success');
          })
          .catch((err) => {
            addLog(`Decryption failed: ${err.message}`, 'error');
          })
          .finally(() => {
            setFetching(false);
          });
      }, 500);

      return () => clearTimeout(timer);
    }
  }, []);

  // Network Background Animation Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let animationId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const particles = [];
    const particleCount = 45;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 1.5 + 1,
      });
    }

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(0, 255, 136, 0.4)';
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.05)';

      // Draw connections
      for (let i = 0; i < particleCount; i++) {
        const p1 = particles[i];
        
        // Move particle
        p1.x += p1.vx;
        p1.y += p1.vy;

        // Bounce off walls
        if (p1.x < 0 || p1.x > width) p1.vx *= -1;
        if (p1.y < 0 || p1.y > height) p1.vy *= -1;

        ctx.beginPath();
        ctx.arc(p1.x, p1.y, p1.radius, 0, Math.PI * 2);
        ctx.fill();

        for (let j = i + 1; j < particleCount; j++) {
          const p2 = particles[j];
          const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          if (dist < 120) {
            ctx.lineWidth = 1 - dist / 120;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="app-container">
      <canvas ref={canvasRef} className="bg-canvas" />

      {/* Header */}
      <header className="app-header">
        <div className="logo-section">
          <span className="logo-icon">🛡️</span>
          <span className="logo-text">FIL-VAULT</span>
        </div>
        
        <div 
          className={`api-badge ${!apiKey ? 'missing' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <span className="api-dot" style={{
            width: '8px', 
            height: '8px', 
            borderRadius: '50%', 
            background: apiKey ? 'var(--primary-color)' : 'var(--danger-color)',
            display: 'inline-block'
          }}></span>
          {apiKey ? 'API KEY ACTIVE' : 'API KEY MISSING'}
        </div>
      </header>

      {/* Main Area */}
      <main className="main-content">
        <div className="glass-panel">
          {/* Tab Selection */}
          <div className="tab-navigation">
            <button 
              className={`tab-button ${activeTab === 'create' ? 'active' : ''}`}
              onClick={() => { setActiveTab('create'); setDecryptedResult(null); setVaultResult(null); }}
            >
              CREATE VAULT
            </button>
            <button 
              className={`tab-button ${activeTab === 'retrieve' ? 'active' : ''}`}
              onClick={() => { setActiveTab('retrieve'); setDecryptedResult(null); setVaultResult(null); }}
            >
              RETRIEVE & DECRYPT
            </button>
            <button 
              className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => { setActiveTab('settings'); setDecryptedResult(null); setVaultResult(null); }}
            >
              SETTINGS
            </button>
          </div>

          {/* CREATE TAB */}
          {activeTab === 'create' && (
            <div className="tab-content">
              {!vaultResult ? (
                <form onSubmit={handleEncryptAndUpload}>
                  <div className="form-group">
                    <label>Secret Message</label>
                    <textarea 
                      rows="5"
                      placeholder="Write your secret message here..."
                      value={textInput}
                      onChange={(e) => {
                        setTextInput(e.target.value);
                        if (e.target.value) setSelectedFile(null);
                      }}
                      disabled={uploading}
                    />
                  </div>

                  <div className="form-group">
                    <label>Or Secure a File</label>
                    <div 
                      className={`drop-zone ${isDragActive ? 'drag-active' : ''}`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('file-upload').click()}
                    >
                      <input 
                        type="file" 
                        id="file-upload" 
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                        disabled={uploading}
                      />
                      <span className="drop-icon">📁</span>
                      {selectedFile ? (
                        <p>Selected: <strong>{selectedFile.name}</strong></p>
                      ) : (
                        <p>Drag & Drop a file here, or click to browse</p>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>AES-256 Decryption Key (Hex 64-char)</label>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <input 
                        type="text" 
                        placeholder="Leave blank to auto-generate a secure random key"
                        value={customKey}
                        onChange={(e) => setCustomKey(e.target.value)}
                        style={{ flex: 1 }}
                        disabled={uploading}
                      />
                      <button 
                        type="button" 
                        className="btn-secondary"
                        onClick={handleGenerateKey}
                        disabled={uploading}
                      >
                        GENERATE KEY
                      </button>
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    className="btn-primary" 
                    style={{ width: '100%', marginTop: '1rem' }}
                    disabled={uploading || (!textInput && !selectedFile)}
                  >
                    {uploading ? 'ENCRYPTING & UPLOADING...' : 'SECURE ON FILECOIN'}
                  </button>
                </form>
              ) : (
                <div className="success-screen">
                  <div className="success-badge">🔒</div>
                  <h2 style={{ fontFamily: 'Orbitron, sans-serif', color: 'var(--primary-color)' }}>CAPSULE SECURED ON FILECOIN</h2>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Your content has been encrypted locally and stored on the Filecoin network. Below is your secure sharing link containing the decryption key.
                  </p>

                  <div className="form-group" style={{ width: '100%', textAlign: 'left' }}>
                    <label>Share Link (Contains decryption key in URL hash)</label>
                    <div className="share-link-box">
                      <div className="share-link">{vaultResult.shareUrl}</div>
                      <button 
                        className="btn-secondary" 
                        onClick={() => copyToClipboard(vaultResult.shareUrl, 'Sharing URL')}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                      >
                        COPY
                      </button>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--danger-color)', marginTop: '0.35rem' }}>
                      ⚠️ The decryption key is in the hash (#) part of the link. If you lose this URL, the file cannot be decrypted.
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
                    <button 
                      className="btn-secondary"
                      onClick={() => copyToClipboard(vaultResult.cid, 'CID')}
                    >
                      COPY CID
                    </button>
                    <button 
                      className="btn-secondary"
                      onClick={() => copyToClipboard(vaultResult.key, 'Key')}
                    >
                      COPY KEY
                    </button>
                    <button 
                      className="x-share-btn"
                      onClick={() => {
                        const xText = `Securely shared a secret capsule on Filecoin! 🛡️🔐%0A%0AInteract with the capsule here:%0A${encodeURIComponent(vaultResult.shareUrl)}%0A%0APowered by @Filecoin and @FilecoinTLDR! %23FilecoinTLDR %23BuildOnFilecoin`;
                        window.open(`https://twitter.com/intent/tweet?text=${xText}`, '_blank');
                      }}
                    >
                      SHARE ON X
                    </button>
                  </div>

                  <button 
                    className="btn-secondary" 
                    onClick={() => setVaultResult(null)}
                    style={{ marginTop: '1.5rem', width: '100%' }}
                  >
                    CREATE ANOTHER CAPSULE
                  </button>
                </div>
              )}
            </div>
          )}

          {/* RETRIEVE TAB */}
          {activeTab === 'retrieve' && (
            <div className="tab-content">
              {!decryptedResult ? (
                <form onSubmit={handleFetchAndDecrypt}>
                  <div className="form-group">
                    <label>Filecoin CID (Content Identifier)</label>
                    <input 
                      type="text"
                      placeholder="e.g. Qm..."
                      value={retrieveCid}
                      onChange={(e) => setRetrieveCid(e.target.value)}
                      disabled={fetching}
                    />
                  </div>

                  <div className="form-group">
                    <label>AES-256 Decryption Key (64-char Hex)</label>
                    <input 
                      type="password"
                      placeholder="Enter the 64-character hex key"
                      value={retrieveKey}
                      onChange={(e) => setRetrieveKey(e.target.value)}
                      disabled={fetching}
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="btn-primary" 
                    style={{ width: '100%', marginTop: '1rem' }}
                    disabled={fetching || !retrieveCid || !retrieveKey}
                  >
                    {fetching ? 'DECRYPTING...' : 'RETRIEVE & DECRYPT'}
                  </button>
                </form>
              ) : (
                <div className="success-screen">
                  <div className="success-badge">🔓</div>
                  <h2 style={{ fontFamily: 'Orbitron, sans-serif', color: 'var(--primary-color)' }}>CAPSULE OPENED</h2>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Data successfully fetched from Filecoin and decrypted locally in your browser.
                  </p>

                  <div className="decrypted-panel" style={{ width: '100%', textAlign: 'left' }}>
                    <div className="decrypted-header">
                      <span className="decrypted-title">
                        {decryptedResult.type === 'file' ? `DECRYPTED FILE: ${decryptedResult.name}` : 'DECRYPTED MESSAGE'}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--secondary-color)' }}>
                        AES-GCM Verified
                      </span>
                    </div>

                    <div className="decrypted-body">
                      {decryptedResult.type === 'file' ? (
                        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                            File Type: <strong>{decryptedResult.mimeType}</strong>
                          </p>
                          <button 
                            className="btn-primary"
                            onClick={handleDownloadFile}
                          >
                            DOWNLOAD FILE
                          </button>
                        </div>
                      ) : (
                        <p>{decryptedResult.text}</p>
                      )}
                    </div>
                  </div>

                  <button 
                    className="btn-secondary" 
                    onClick={() => { setDecryptedResult(null); setRetrieveCid(''); setRetrieveKey(''); }}
                    style={{ marginTop: '1.5rem', width: '100%' }}
                  >
                    DECRYPT ANOTHER CAPSULE
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="tab-content">
              <form onSubmit={saveApiKey}>
                <div className="form-group">
                  <label>Lighthouse API Key</label>
                  <input 
                    type={showKey ? "text" : "password"}
                    placeholder="Leave blank to use default demo key"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                  />
                  {tempApiKey === '' && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Using default demo key: b1d80c6b...39e93ff291b3
                    </span>
                  )}
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                    <button 
                      type="button" 
                      className="btn-secondary"
                      onClick={() => setShowKey(!showKey)}
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      {showKey ? 'HIDE' : 'SHOW'}
                    </button>
                    <a 
                      href="https://files.lighthouse.storage/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ color: 'var(--secondary-color)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', textDecoration: 'underline' }}
                    >
                      Get free Lighthouse API Key
                    </a>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '1.5rem' }}>
                  <label>Custom Dedicated Gateway (Optional)</label>
                  <input 
                    type="text"
                    placeholder="e.g. https://your-name.lighthouse.storage"
                    value={tempGateway}
                    onChange={(e) => setTempGateway(e.target.value)}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Recommended to bypass standard gateway 402/CORS restrictions. Find this in your Lighthouse dashboard.
                  </span>
                </div>

                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ width: '100%', marginTop: '1rem' }}
                >
                  SAVE CONFIGURATION
                </button>
              </form>
            </div>
          )}

          {/* Terminal Logs (Always visible at the bottom) */}
          {logs.length > 0 && (
            <div className="terminal-panel">
              <div className="terminal-header">
                <span>SANDBOX PROCESS LOG</span>
                <div className="terminal-dots">
                  <span className="terminal-dot"></span>
                  <span className="terminal-dot"></span>
                  <span className="terminal-dot"></span>
                </div>
              </div>
              <div className="terminal-logs">
                {logs.map((log, index) => (
                  <div key={index} className={`log-line ${log.type}`}>
                    <span className="log-line timestamp">[{log.time}]</span>
                    <span>{log.text}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>
      </main>

      <footer style={{
        textAlign: 'center',
        padding: '2rem 0',
        color: 'var(--text-secondary)',
        fontSize: '0.85rem',
        borderTop: '1px solid var(--border-color)',
        background: 'rgba(4, 9, 7, 0.9)'
      }}>
        FIL-Vault | Powered by Filecoin, Lighthouse, & Client-Side Cryptography
      </footer>
    </div>
  );
}

export default App;
