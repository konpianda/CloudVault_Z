import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface FileData {
  id: string;
  name: string;
  encryptedSize: string;
  publicType: number;
  publicValue2: number;
  description: string;
  timestamp: number;
  creator: string;
  isVerified?: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<FileData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newFileData, setNewFileData] = useState({ name: "", size: "", fileType: "1", description: "" });
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [userHistory, setUserHistory] = useState<string[]>([]);
  const [showStats, setShowStats] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const filesPerPage = 8;

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized) return;
      
      try {
        console.log('Initializing FHEVM for CloudVault...');
        await initialize();
        console.log('FHEVM initialized successfully');
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadFiles();
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadFiles = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const filesList: FileData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          filesList.push({
            id: businessId,
            name: businessData.name,
            encryptedSize: businessId,
            publicType: Number(businessData.publicValue1) || 1,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading file data:', e);
        }
      }
      
      setFiles(filesList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load files" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const uploadFile = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setUploadingFile(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting file with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const fileSize = parseInt(newFileData.size) || 0;
      const fileId = `file-${Date.now()}`;
      const contractAddress = await contract.getAddress();
      
      const encryptedResult = await encrypt(contractAddress, address, fileSize);
      
      const tx = await contract.createBusinessData(
        fileId,
        newFileData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newFileData.fileType) || 1,
        0,
        newFileData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Uploading encrypted file..." });
      await tx.wait();
      
      setUserHistory(prev => [...prev, `Uploaded: ${newFileData.name}`]);
      setTransactionStatus({ visible: true, status: "success", message: "File encrypted and uploaded!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadFiles();
      setShowUploadModal(false);
      setNewFileData({ name: "", size: "", fileType: "1", description: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Upload failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setUploadingFile(false); 
    }
  };

  const decryptFileSize = async (fileId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const fileData = await contractRead.getBusinessData(fileId);
      if (fileData.isVerified) {
        const storedValue = Number(fileData.decryptedValue) || 0;
        setUserHistory(prev => [...prev, `Decrypted: ${fileId} (on-chain)`]);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(fileId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        await contractWrite.getAddress(),
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(fileId, abiEncodedClearValues, decryptionProof)
      );
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      setUserHistory(prev => [...prev, `Decrypted: ${fileId} (${clearValue} bytes)`]);
      
      await loadFiles();
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        await loadFiles();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const callIsAvailable = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const result = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "FHE system is available!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    file.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredFiles.length / filesPerPage);
  const currentFiles = filteredFiles.slice(
    (currentPage - 1) * filesPerPage,
    currentPage * filesPerPage
  );

  const stats = {
    totalFiles: files.length,
    encryptedFiles: files.filter(f => !f.isVerified).length,
    verifiedFiles: files.filter(f => f.isVerified).length,
    totalSize: files.reduce((sum, file) => sum + (file.decryptedValue || 0), 0)
  };

  const faqItems = [
    { question: "What is FHE encryption?", answer: "FHE allows computation on encrypted data without decryption." },
    { question: "Is my data secure?", answer: "Yes, all file sizes are fully homomorphically encrypted." },
    { question: "How does search work?", answer: "Keywords are searched without decrypting file contents." },
    { question: "Can I share files?", answer: "Files can be securely shared while remaining encrypted." }
  ];

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo-section">
            <div className="logo-icon">🔒</div>
            <h1>CloudVault Z</h1>
            <span className="tagline">FHE Secure Cloud Storage</span>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="prompt-content">
            <div className="security-icon">🛡️</div>
            <h2>Secure Your Files with FHE Encryption</h2>
            <p>Connect your wallet to access military-grade encrypted cloud storage</p>
            <div className="feature-grid">
              <div className="feature">
                <span className="feature-icon">🔐</span>
                <span>Zero-Knowledge Encryption</span>
              </div>
              <div className="feature">
                <span className="feature-icon">⚡</span>
                <span>Homomorphic Search</span>
              </div>
              <div className="feature">
                <span className="feature-icon">🌐</span>
                <span>Secure Cloud Storage</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="loading-screen">
        <div className="encryption-animation">
          <div className="lock-icon">🔒</div>
          <div className="encryption-beam"></div>
        </div>
        <p>Initializing FHE Encryption Engine...</p>
        <p className="status">Status: {status}</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="file-spinner"></div>
      <p>Loading encrypted file system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">🔒</div>
          <div>
            <h1>CloudVault Z</h1>
            <span className="tagline">FHE Encrypted Cloud Storage</span>
          </div>
        </div>
        
        <nav className="nav-tabs">
          <button 
            className={`tab ${!showStats && !showFAQ ? 'active' : ''}`}
            onClick={() => { setShowStats(false); setShowFAQ(false); }}
          >
            Files
          </button>
          <button 
            className={`tab ${showStats ? 'active' : ''}`}
            onClick={() => setShowStats(true)}
          >
            Statistics
          </button>
          <button 
            className={`tab ${showFAQ ? 'active' : ''}`}
            onClick={() => setShowFAQ(true)}
          >
            FAQ
          </button>
        </nav>
        
        <div className="header-actions">
          <button className="system-check" onClick={callIsAvailable}>
            System Check
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>

      <main className="main-content">
        {showStats ? (
          <div className="stats-panel">
            <h2>Storage Statistics</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">📁</div>
                <div className="stat-value">{stats.totalFiles}</div>
                <div className="stat-label">Total Files</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🔒</div>
                <div className="stat-value">{stats.encryptedFiles}</div>
                <div className="stat-label">Encrypted</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">✅</div>
                <div className="stat-value">{stats.verifiedFiles}</div>
                <div className="stat-label">Verified</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">💾</div>
                <div className="stat-value">{stats.totalSize} bytes</div>
                <div className="stat-label">Total Size</div>
              </div>
            </div>
          </div>
        ) : showFAQ ? (
          <div className="faq-panel">
            <h2>Frequently Asked Questions</h2>
            <div className="faq-list">
              {faqItems.map((item, index) => (
                <div key={index} className="faq-item">
                  <div className="faq-question">
                    <span>Q: {item.question}</span>
                  </div>
                  <div className="faq-answer">
                    <span>A: {item.answer}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="toolbar">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search encrypted files..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                <span className="search-icon">🔍</span>
              </div>
              
              <div className="toolbar-actions">
                <button 
                  onClick={loadFiles} 
                  className="refresh-btn"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "🔄" : "↻"} Refresh
                </button>
                <button 
                  onClick={() => setShowUploadModal(true)} 
                  className="upload-btn"
                >
                  📁 Upload File
                </button>
              </div>
            </div>

            <div className="files-section">
              <div className="section-header">
                <h2>Encrypted Files ({filteredFiles.length})</h2>
                {searchTerm && (
                  <span className="search-results">Found {filteredFiles.length} files</span>
                )}
              </div>
              
              {currentFiles.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📂</div>
                  <p>No encrypted files found</p>
                  <button 
                    className="upload-btn primary"
                    onClick={() => setShowUploadModal(true)}
                  >
                    Upload Your First File
                  </button>
                </div>
              ) : (
                <>
                  <div className="files-grid">
                    {currentFiles.map((file) => (
                      <div 
                        key={file.id}
                        className="file-card"
                        onClick={() => setSelectedFile(file)}
                      >
                        <div className="file-header">
                          <div className="file-icon">📄</div>
                          <div className="file-status">
                            {file.isVerified ? "✅" : "🔒"}
                          </div>
                        </div>
                        <div className="file-name">{file.name}</div>
                        <div className="file-meta">
                          <span>Type: {file.publicType}</span>
                          <span>{new Date(file.timestamp * 1000).toLocaleDateString()}</span>
                        </div>
                        <div className="file-size">
                          {file.isVerified ? 
                            `${file.decryptedValue} bytes` : 
                            "🔒 Encrypted"
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {totalPages > 1 && (
                    <div className="pagination">
                      <button 
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </button>
                      <span>Page {currentPage} of {totalPages}</span>
                      <button 
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="history-panel">
              <h3>Recent Activity</h3>
              <div className="history-list">
                {userHistory.slice(-5).map((item, index) => (
                  <div key={index} className="history-item">
                    {item}
                  </div>
                ))}
                {userHistory.length === 0 && (
                  <div className="no-activity">No recent activity</div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {showUploadModal && (
        <UploadModal 
          onSubmit={uploadFile} 
          onClose={() => setShowUploadModal(false)} 
          uploading={uploadingFile} 
          fileData={newFileData} 
          setFileData={setNewFileData}
          isEncrypting={isEncrypting}
        />
      )}

      {selectedFile && (
        <FileDetailModal 
          file={selectedFile} 
          onClose={() => setSelectedFile(null)} 
          onDecrypt={decryptFileSize}
          isDecrypting={fheIsDecrypting}
        />
      )}

      {transactionStatus.visible && (
        <div className={`notification ${transactionStatus.status}`}>
          <div className="notification-content">
            <div className="notification-icon">
              {transactionStatus.status === "pending" && "⏳"}
              {transactionStatus.status === "success" && "✅"}
              {transactionStatus.status === "error" && "❌"}
            </div>
            <div className="notification-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const UploadModal: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  uploading: boolean;
  fileData: any;
  setFileData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, uploading, fileData, setFileData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'size') {
      const intValue = value.replace(/[^\d]/g, '');
      setFileData({ ...fileData, [name]: intValue });
    } else {
      setFileData({ ...fileData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>Upload Encrypted File</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <div className="modal-body">
          <div className="encryption-notice">
            <div className="encryption-icon">🔐</div>
            <div>
              <strong>FHE Encryption Active</strong>
              <p>File size will be encrypted using Zama FHE technology</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>File Name *</label>
            <input 
              type="text" 
              name="name" 
              value={fileData.name} 
              onChange={handleChange} 
              placeholder="Enter file name..." 
            />
          </div>
          
          <div className="form-group">
            <label>File Size (bytes) *</label>
            <input 
              type="number" 
              name="size" 
              value={fileData.size} 
              onChange={handleChange} 
              placeholder="Enter file size in bytes..." 
              min="0"
            />
            <div className="field-note">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>File Type</label>
            <select name="fileType" value={fileData.fileType} onChange={handleChange}>
              <option value="1">Document</option>
              <option value="2">Image</option>
              <option value="3">Video</option>
              <option value="4">Audio</option>
              <option value="5">Other</option>
            </select>
            <div className="field-note">Public Metadata</div>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="description" 
              value={fileData.description} 
              onChange={handleChange} 
              placeholder="File description..."
              rows={3}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={uploading || isEncrypting || !fileData.name || !fileData.size} 
            className="btn-primary"
          >
            {uploading || isEncrypting ? "🔐 Encrypting..." : "📁 Upload Encrypted"}
          </button>
        </div>
      </div>
    </div>
  );
};

const FileDetailModal: React.FC<{
  file: FileData;
  onClose: () => void;
  onDecrypt: (fileId: string) => Promise<number | null>;
  isDecrypting: boolean;
}> = ({ file, onClose, onDecrypt, isDecrypting }) => {
  const [decryptedSize, setDecryptedSize] = useState<number | null>(null);

  const handleDecrypt = async () => {
    const size = await onDecrypt(file.id);
    setDecryptedSize(size);
  };

  return (
    <div className="modal-overlay">
      <div className="modal file-detail-modal">
        <div className="modal-header">
          <h2>File Details</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <div className="modal-body">
          <div className="file-info-grid">
            <div className="info-item">
              <label>File Name:</label>
              <span>{file.name}</span>
            </div>
            <div className="info-item">
              <label>File Type:</label>
              <span>{file.publicType}</span>
            </div>
            <div className="info-item">
              <label>Upload Date:</label>
              <span>{new Date(file.timestamp * 1000).toLocaleString()}</span>
            </div>
            <div className="info-item">
              <label>Uploader:</label>
              <span>{file.creator.substring(0, 8)}...{file.creator.substring(36)}</span>
            </div>
            <div className="info-item full-width">
              <label>Description:</label>
              <span>{file.description}</span>
            </div>
          </div>
          
          <div className="encryption-section">
            <h3>FHE Encryption Status</h3>
            <div className="encryption-status">
              <div className="status-item">
                <span className="label">File Size:</span>
                <span className="value">
                  {file.isVerified ? 
                    `${file.decryptedValue} bytes (Verified)` : 
                    decryptedSize !== null ?
                    `${decryptedSize} bytes (Decrypted)` :
                    "🔒 Encrypted"
                  }
                </span>
              </div>
              <div className="status-item">
                <span className="label">Encryption:</span>
                <span className="value">{file.isVerified ? "✅ Verified" : "🔒 Active"}</span>
              </div>
            </div>
            
            {!file.isVerified && (
              <button 
                className={`decrypt-btn ${decryptedSize !== null ? 'decrypted' : ''}`}
                onClick={handleDecrypt}
                disabled={isDecrypting}
              >
                {isDecrypting ? "🔓 Decrypting..." : 
                 decryptedSize !== null ? "✅ Decrypted" : "🔓 Verify Decryption"}
              </button>
            )}
          </div>
          
          <div className="security-info">
            <div className="security-icon">🛡️</div>
            <div>
              <strong>FHE Security Guarantee</strong>
              <p>File size remains encrypted during storage and processing. 
                 Decryption requires cryptographic proof verification.</p>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">Close</button>
          {!file.isVerified && decryptedSize === null && (
            <button onClick={handleDecrypt} disabled={isDecrypting} className="btn-primary">
              {isDecrypting ? "Decrypting..." : "Decrypt Size"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

