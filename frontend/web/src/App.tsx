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
  size: number;
  type: string;
  encryptedContent: string;
  uploadTime: number;
  owner: string;
  publicValue1: number;
  publicValue2: number;
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
  const [newFileData, setNewFileData] = useState({ name: "", content: "" });
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [decryptedContent, setDecryptedContent] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [stats, setStats] = useState({ totalFiles: 0, encryptedSize: 0, verifiedFiles: 0 });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadFiles();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
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
            size: Number(businessData.publicValue1) || 0,
            type: "encrypted",
            encryptedContent: businessId,
            uploadTime: Number(businessData.timestamp),
            owner: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading file data:', e);
        }
      }
      
      setFiles(filesList);
      updateStats(filesList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load files" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const updateStats = (filesList: FileData[]) => {
    setStats({
      totalFiles: filesList.length,
      encryptedSize: filesList.reduce((sum, file) => sum + file.size, 0),
      verifiedFiles: filesList.filter(f => f.isVerified).length
    });
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
      
      const fileValue = parseInt(newFileData.content) || 0;
      const fileId = `file-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, fileValue);
      
      const tx = await contract.createBusinessData(
        fileId,
        newFileData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        fileValue,
        0,
        "FHE Encrypted File"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Uploading encrypted file..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "File encrypted and uploaded!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadFiles();
      setShowUploadModal(false);
      setNewFileData({ name: "", content: "" });
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

  const decryptFile = async (fileId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const fileData = await contractRead.getBusinessData(fileId);
      if (fileData.isVerified) {
        const storedValue = Number(fileData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "File already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(fileId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(fileId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      await loadFiles();
      
      setTransactionStatus({ visible: true, status: "success", message: "File decrypted successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "File already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadFiles();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const callIsAvailable = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const result = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>CloudVault_Z 🔐</h1>
            <p>FHE Secure Cloud Storage</p>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔒</div>
            <h2>Connect Wallet to Access Secure Storage</h2>
            <p>Your files are encrypted with Fully Homomorphic Encryption for maximum security</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted file system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>CloudVault_Z 🔐</h1>
          <p>FHE Secure Cloud Storage</p>
        </div>
        
        <div className="header-actions">
          <button onClick={callIsAvailable} className="action-btn">Check Availability</button>
          <button onClick={() => setShowUploadModal(true)} className="upload-btn">+ Upload File</button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-panel">
          <div className="stat-card">
            <h3>Total Files</h3>
            <div className="stat-value">{stats.totalFiles}</div>
          </div>
          <div className="stat-card">
            <h3>Encrypted Size</h3>
            <div className="stat-value">{stats.encryptedSize} KB</div>
          </div>
          <div className="stat-card">
            <h3>Verified Files</h3>
            <div className="stat-value">{stats.verifiedFiles}</div>
          </div>
        </div>

        <div className="search-section">
          <div className="search-bar">
            <input 
              type="text" 
              placeholder="Search encrypted files..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button onClick={loadFiles} disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="files-grid">
          {filteredFiles.length === 0 ? (
            <div className="no-files">
              <p>No encrypted files found</p>
              <button onClick={() => setShowUploadModal(true)} className="upload-btn">
                Upload First File
              </button>
            </div>
          ) : (
            filteredFiles.map((file, index) => (
              <div 
                className={`file-card ${file.isVerified ? "verified" : ""}`}
                key={index}
                onClick={() => setSelectedFile(file)}
              >
                <div className="file-icon">📄</div>
                <div className="file-name">{file.name}</div>
                <div className="file-meta">
                  <span>Size: {file.size} KB</span>
                  <span>{new Date(file.uploadTime * 1000).toLocaleDateString()}</span>
                </div>
                <div className="file-status">
                  {file.isVerified ? "✅ Verified" : "🔒 Encrypted"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      
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
          onClose={() => { 
            setSelectedFile(null); 
            setDecryptedContent(null); 
          }} 
          decryptedContent={decryptedContent} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptFile={() => decryptFile(selectedFile.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
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
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'content') {
      const intValue = value.replace(/[^\d]/g, '');
      setFileData({ ...fileData, [name]: intValue });
    } else {
      setFileData({ ...fileData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="upload-modal">
        <div className="modal-header">
          <h2>Upload Encrypted File</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Encryption</strong>
            <p>File content will be encrypted with Zama FHE (Integer only)</p>
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
            <label>File Content (Integer only) *</label>
            <input 
              type="number" 
              name="content" 
              value={fileData.content} 
              onChange={handleChange} 
              placeholder="Enter numeric content..." 
              step="1"
              min="0"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={uploading || isEncrypting || !fileData.name || !fileData.content} 
            className="submit-btn"
          >
            {uploading || isEncrypting ? "Encrypting..." : "Upload Encrypted"}
          </button>
        </div>
      </div>
    </div>
  );
};

const FileDetailModal: React.FC<{
  file: FileData;
  onClose: () => void;
  decryptedContent: number | null;
  isDecrypting: boolean;
  decryptFile: () => Promise<number | null>;
}> = ({ file, onClose, decryptedContent, isDecrypting, decryptFile }) => {
  const handleDecrypt = async () => {
    if (decryptedContent !== null) return;
    await decryptFile();
  };

  return (
    <div className="modal-overlay">
      <div className="file-detail-modal">
        <div className="modal-header">
          <h2>File Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="file-info">
            <div className="info-item">
              <span>File Name:</span>
              <strong>{file.name}</strong>
            </div>
            <div className="info-item">
              <span>Owner:</span>
              <strong>{file.owner.substring(0, 6)}...{file.owner.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Upload Date:</span>
              <strong>{new Date(file.uploadTime * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>File Size:</span>
              <strong>{file.size} KB</strong>
            </div>
          </div>
          
          <div className="content-section">
            <h3>File Content</h3>
            
            <div className="content-row">
              <div className="content-label">Encrypted Content:</div>
              <div className="content-value">
                {file.isVerified && file.decryptedValue ? 
                  `${file.decryptedValue} (Verified)` : 
                  decryptedContent !== null ? 
                  `${decryptedContent} (Decrypted)` : 
                  "🔒 FHE Encrypted"
                }
              </div>
              <button 
                className={`decrypt-btn ${(file.isVerified || decryptedContent !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting..." : 
                 file.isVerified ? "✅ Verified" : 
                 decryptedContent !== null ? "🔄 Re-decrypt" : 
                 "🔓 Decrypt"}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE Encrypted Storage</strong>
                <p>Content is encrypted using Fully Homomorphic Encryption</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;