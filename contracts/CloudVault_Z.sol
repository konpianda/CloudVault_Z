pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract CloudStorage is ZamaEthereumConfig {
    struct EncryptedFile {
        string fileId;
        euint32 encryptedContent;
        euint32 encryptedKeywords;
        address owner;
        uint256 timestamp;
        bool isSearchable;
    }

    mapping(string => EncryptedFile) private encryptedFiles;
    mapping(address => string[]) private userFiles;
    mapping(bytes32 => string[]) private keywordIndex;

    event FileUploaded(string indexed fileId, address indexed owner);
    event FileSearchEnabled(string indexed fileId);
    event FileDeleted(string indexed fileId);

    constructor() ZamaEthereumConfig() {}

    function uploadFile(
        string calldata fileId,
        externalEuint32 encryptedContent,
        externalEuint32 encryptedKeywords,
        bytes calldata contentProof,
        bytes calldata keywordsProof
    ) external {
        require(bytes(encryptedFiles[fileId].fileId).length == 0, "File already exists");

        euint32 content = FHE.fromExternal(encryptedContent, contentProof);
        euint32 keywords = FHE.fromExternal(encryptedKeywords, keywordsProof);

        require(FHE.isInitialized(content), "Invalid encrypted content");
        require(FHE.isInitialized(keywords), "Invalid encrypted keywords");

        encryptedFiles[fileId] = EncryptedFile({
            fileId: fileId,
            encryptedContent: content,
            encryptedKeywords: keywords,
            owner: msg.sender,
            timestamp: block.timestamp,
            isSearchable: false
        });

        FHE.allowThis(encryptedFiles[fileId].encryptedContent);
        FHE.allowThis(encryptedFiles[fileId].encryptedKeywords);

        userFiles[msg.sender].push(fileId);

        emit FileUploaded(fileId, msg.sender);
    }

    function enableSearch(
        string calldata fileId,
        bytes calldata contentProof,
        bytes calldata keywordsProof
    ) external {
        require(bytes(encryptedFiles[fileId].fileId).length > 0, "File does not exist");
        require(encryptedFiles[fileId].owner == msg.sender, "Only owner can enable search");
        require(!encryptedFiles[fileId].isSearchable, "Search already enabled");

        FHE.allowThis(encryptedFiles[fileId].encryptedContent);
        FHE.allowThis(encryptedFiles[fileId].encryptedKeywords);

        encryptedFiles[fileId].isSearchable = true;

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(encryptedFiles[fileId].encryptedKeywords);

        keywordIndex[FHE.toBytes32(encryptedFiles[fileId].encryptedKeywords)] = [fileId];

        emit FileSearchEnabled(fileId);
    }

    function searchFiles(externalEuint32 keyword, bytes calldata proof) external view returns (string[] memory) {
        euint32 encryptedKeyword = FHE.fromExternal(keyword, proof);
        require(FHE.isInitialized(encryptedKeyword), "Invalid encrypted keyword");

        bytes32 keywordHash = FHE.toBytes32(encryptedKeyword);
        return keywordIndex[keywordHash];
    }

    function deleteFile(string calldata fileId) external {
        require(bytes(encryptedFiles[fileId].fileId).length > 0, "File does not exist");
        require(encryptedFiles[fileId].owner == msg.sender, "Only owner can delete");

        delete encryptedFiles[fileId];

        uint256 index;
        for (uint256 i = 0; i < userFiles[msg.sender].length; i++) {
            if (keccak256(bytes(userFiles[msg.sender][i])) == keccak256(bytes(fileId))) {
                index = i;
                break;
            }
        }
        userFiles[msg.sender][index] = userFiles[msg.sender][userFiles[msg.sender].length - 1];
        userFiles[msg.sender].pop();

        emit FileDeleted(fileId);
    }

    function getUserFiles() external view returns (string[] memory) {
        return userFiles[msg.sender];
    }

    function getFileDetails(string calldata fileId) external view returns (
        address owner,
        uint256 timestamp,
        bool isSearchable
    ) {
        require(bytes(encryptedFiles[fileId].fileId).length > 0, "File does not exist");
        return (
            encryptedFiles[fileId].owner,
            encryptedFiles[fileId].timestamp,
            encryptedFiles[fileId].isSearchable
        );
    }

    function getEncryptedContent(string calldata fileId) external view returns (euint32) {
        require(bytes(encryptedFiles[fileId].fileId).length > 0, "File does not exist");
        return encryptedFiles[fileId].encryptedContent;
    }

    function getEncryptedKeywords(string calldata fileId) external view returns (euint32) {
        require(bytes(encryptedFiles[fileId].fileId).length > 0, "File does not exist");
        require(encryptedFiles[fileId].isSearchable, "Search not enabled for this file");
        return encryptedFiles[fileId].encryptedKeywords;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}

