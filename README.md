# CloudVault: FHE-based Secure Cloud Storage

CloudVault is a privacy-preserving cloud storage solution that harnesses the power of Zama's Fully Homomorphic Encryption (FHE) technology. By allowing users to store their files securely while enabling operations such as keyword searches on encrypted data, CloudVault transforms the way we think about data privacy and security in the cloud.

## The Problem

In today's digital landscape, data privacy concerns are at an all-time high. Traditional cloud storage solutions expose sensitive information to potential breaches, unauthorized access, and data leaks. When users upload documents to the cloud, they often do so without knowing who can access their cleartext data. This poses significant risks, especially for businesses and individuals handling confidential information. The need for robust security measures that protect data at all times, even in storage and during processing, has never been more critical.

## The Zama FHE Solution

CloudVault addresses these privacy and security gaps by utilizing Fully Homomorphic Encryption, which allows computations to be performed directly on encrypted data without the need for decryption. This means that user data remains confidential even while it is being processed. Using Zama's powerful libraries, such as fhevm, CloudVault can execute keyword searches and other operations securely, ensuring that sensitive information is never exposed in cleartext.

For example, with FHE, a user can perform searches on their stored documents without ever revealing the contents of those documents to the cloud provider, maintaining complete data sovereignty and privacy.

## Key Features

- 🔒 **End-to-End Encryption:** All files are encrypted before they are stored, ensuring data privacy.
- 🔍 **Keyword Search on Encrypted Data:** Perform searches without decrypting files, preserving confidentiality.
- 🌐 **Data Sovereignty:** Users retain ownership and control over their data, compliant with data regulations.
- 👥 **Collaborative Workflows:** Share encrypted files securely within teams without exposing sensitive information.
- 📁 **Folder and File Management:** Organize files effortlessly while maintaining strong security protocols.
- 🗂️ **Searchable File Listings:** Quickly find files based on keywords without compromising security.

## Technical Architecture & Stack

CloudVault is built using a modern technology stack designed to seamlessly integrate with Zama's FHE solutions. Here’s a breakdown of the architecture:

- **Frontend:** React.js for a responsive user interface.
- **Backend:** Node.js to handle server-side logic.
- **Database:** An encrypted database solution for storing metadata.
- **Core Privacy Engine:** Zama's FHE libraries - Concrete ML and fhevm - for secure data processing.

## Smart Contract / Core Logic

For secure file sharing and management, CloudVault employs smart contracts. Below is a simplified Solidity snippet that illustrates how CloudVault leverages FHE for secure operations:

```solidity
pragma solidity ^0.8.0;

import "path/to/fhevm.sol";

contract CloudVault {
    mapping(address => string) private encryptedFiles;

    function uploadFile(string memory fileHash) public {
        // Encrypt and store the file hash
        encryptedFiles[msg.sender] = TFHE.encrypt(fileHash);
    }

    function searchFile(string memory keyword) public view returns (string memory) {
        // Perform computation on encrypted data
        return TFHE.search(keyword, encryptedFiles[msg.sender]);
    }

    function decryptFile() public view returns (string memory) {
        return TFHE.decrypt(encryptedFiles[msg.sender]);
    }
}
```

## Directory Structure

To give you an understanding of the project structure, here’s how it is organized:

```
CloudVault/
├── .gitignore
├── package.json
├── src/
│   ├── App.js
│   ├── main.js
│   └── components/
│       ├── FileUpload.js
│       └── Search.js
├── contracts/
│   └── CloudVault.sol
├── scripts/
│   └── main.py
└── README.md
```

## Installation & Setup

To get started with CloudVault, follow these steps:

### Prerequisites

- Node.js (v14 or above)
- npm (Node package manager)
- Python (v3.7 or above)
- Ensure you have the necessary Zama library installed.

### Installation Steps

1. **Install Node.js dependencies:**
   ```bash
   npm install 
   npm install fhevm
   ```

2. **Install Python dependencies:**
   ```bash
   pip install concrete-ml
   ```

3. **Compile the smart contracts:**
   ```bash
   npx hardhat compile
   ```

4. **Setting up the database** (if applicable).

## Build & Run

To run CloudVault, use the following commands:

1. **Start the backend server:**
   ```bash
   npm run start
   ```

2. **Run the frontend application:**
   ```bash
   npm run dev
   ```

3. **Execute any scripts as necessary:**
   ```bash
   python scripts/main.py
   ```

## Acknowledgements

We would like to extend our sincere gratitude to Zama for providing the open-source FHE primitives that make projects like CloudVault possible. Their innovative solutions enable developers to create secure and private applications, fostering a safer digital environment for all users.

---

By leveraging Zama's cutting-edge Fully Homomorphic Encryption technology, CloudVault is committed to safeguarding user data while ensuring ease of access and collaboration in the cloud.

