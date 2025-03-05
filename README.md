# 1th4ca Testnet Automation Tool

## Overview

This is a comprehensive automation tool for interacting with the 1th4ca blockchain testnet. This tool helps developers and testers automate various blockchain operations including ETH self-transfers, smart contract deployment, NFT operations, ERC20 token management, and bridging ETH between Sepolia and 1th4ca testnets.

## Features

- **ETH Self-Transfers**: Perform self-transfers to maintain wallet activity
- **Smart Contract Deployment**: Deploy and interact with custom smart contracts
- **ERC20 Token Management**: Create, mint, and burn ERC20 tokens
- **NFT Operations**: Create NFT collections, mint NFTs, and burn tokens
- **ETH Bridging**: Bridge ETH between Sepolia and 1th4ca testnets (both directions)
- **Proxy Support**: Rotate through proxy servers for distributed operations
- **Configurable Workflows**: Detailed configuration options via JSON

## Installation

```bash
# Clone the repository
git clone https://github.com/Usernameusernamenotavailbleisnot/1th4ca.git
cd 1th4ca

# Install dependencies
npm install
```

## Configuration

The tool is configured via the `config.json` file. Here's an overview of the main configuration options:

```json
{
  "enable_transfer": true,           // Enable/disable ETH self-transfers
  "gas_price_multiplier": 1.1,       // Gas price multiplier for faster confirmations
  "max_retries": 5,                  // Maximum retry attempts for operations
  "base_wait_time": 10,              // Base wait time between retries
  "transfer_amount_percentage": 90,  // Percentage of balance to transfer
  "nft": { ... },                    // NFT operation configuration
  "contract": { ... },               // Contract deployment configuration
  "erc20": { ... },                  // ERC20 token configuration
  "bridge": {                        // ETH bridging configuration
    "enable_sepolia_to_ithaca": true,
    "enable_ithaca_to_sepolia": true,
    "sepolia_to_ithaca": {
      "min_amount": 0.0001,
      "max_amount": 0.001,
      "wait_for_confirmation": true,
      "max_wait_time": 300000
    },
    "ithaca_to_sepolia": {
      "min_amount": 0.0001,
      "max_amount": 0.001,
      "wait_for_confirmation": false
    },
    "max_retries": 3
  }
}
```

## Setup

1. **Add Private Keys**: Add your private keys to `pk.txt`, one per line:
   ```
   0x1234567890abcdef...
   0x9876543210abcdef...
   ```

2. **Add Proxies (Optional)**: Add HTTP proxies to `proxy.txt`, one per line:
   ```
   http://user:password@ip:port
   http://user:password@ip:port
   ```

## Usage

```bash
# Start the automation tool
npm start
```

The tool will process each wallet from the `pk.txt` file, performing the enabled operations as configured in `config.json`. The operations include:

1. Performing ETH self-transfers on 1th4ca
2. Bridging ETH from Sepolia to 1th4ca (if enabled)
3. Bridging ETH from 1th4ca to Sepolia (if enabled)
4. Deploying and interacting with smart contracts
5. Creating, minting, and burning ERC20 tokens
6. Creating NFT collections and minting/burning NFTs

## Smart Contract Operations

The tool supports deploying and interacting with various types of smart contracts:

- **Basic contracts**: Simple contracts with state variables
- **ERC20 tokens**: Fungible token contracts with customizable parameters
- **NFT collections**: Non-fungible token contracts with minting and burning capabilities

## ETH Bridge Configuration

The tool allows you to configure ETH bridging in both directions:

```json
"bridge": {
  "enable_sepolia_to_ithaca": true,
  "enable_ithaca_to_sepolia": true,
  "sepolia_to_ithaca": {
    "min_amount": 0.0001,
    "max_amount": 0.001,
    "wait_for_confirmation": true,
    "max_wait_time": 300000
  },
  "ithaca_to_sepolia": {
    "min_amount": 0.0001,
    "max_amount": 0.001,
    "wait_for_confirmation": false
  },
  "max_retries": 3
}
```

## NFT Configuration

```json
"nft": {
  "enable_nft": true,
  "mint_count": {
    "min": 2,
    "max": 10
  },
  "burn_percentage": 20,
  "supply": {
    "min": 100,
    "max": 1000
  }
}
```

## Runtime Output

The tool provides detailed console output with color-coding:
- Green: Successful operations
- Red: Errors
- Yellow: Warnings
- Blue: Operation headings
- Cyan: Informational messages

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This tool is for educational and testing purposes only. Please use responsibly and in accordance with the terms of service of the networks you interact with.
