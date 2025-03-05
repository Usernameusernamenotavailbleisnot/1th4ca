const { Web3 } = require('web3');
const axios = require('axios');
const chalk = require('chalk');
const ora = require('ora');

function getTimestamp(walletNum = null) {
    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-US', { hour12: false });
    if (walletNum !== null) {
        return `[${timestamp} - Wallet ${walletNum}]`;
    }
    return `[${timestamp}]`;
}

class BridgeManager {
    constructor(privateKey, config = {}) {
        // Default bridge configuration
        this.defaultConfig = {
            enable_sepolia_to_ithaca: true,
            enable_ithaca_to_sepolia: true,
            sepolia_to_ithaca: {
                min_amount: 0.0001,
                max_amount: 0.001,
                wait_for_confirmation: true,
                max_wait_time: 300000, // 5 minutes
            },
            ithaca_to_sepolia: {
                min_amount: 0.0001,
                max_amount: 0.001,
                wait_for_confirmation: false,
            },
            gas_price_multiplier: 1.1,
            max_retries: 3
        };
        
        // Load configuration, merging with defaults
        this.config = { ...this.defaultConfig, ...config };
        
        // Setup web3 connections
        this.ithacaRpc = "https://odyssey.ithaca.xyz";
        this.sepoliaRpc = "https://ethereum-sepolia-rpc.publicnode.com"; // Using a public Sepolia RPC
        
        this.ithacaWeb3 = new Web3(this.ithacaRpc);
        this.sepoliaWeb3 = new Web3(this.sepoliaRpc);
        
        // Chain IDs
        this.ithacaChainId = 911867;
        this.sepoliaChainId = 11155111;
        
        // Bridge contract addresses
        this.sepoliaBridgeContract = "0x9228665c0D8f9Fc36843572bE50B716B81e042BA"; // From transaction data
        this.ithacaBridgeContract = "0x4200000000000000000000000000000000000010"; // From transaction data
        
        // Setup account
        if (!privateKey.startsWith('0x')) {
            privateKey = '0x' + privateKey;
        }
        
        // Create account on both networks
        this.ithacaAccount = this.ithacaWeb3.eth.accounts.privateKeyToAccount(privateKey);
        this.sepoliaAccount = this.sepoliaWeb3.eth.accounts.privateKeyToAccount(privateKey);
        
        this.walletNum = null;
    }
    
    setWalletNum(num) {
        this.walletNum = num;
    }
    
    // Get routes from the SuperBridge API
    async getBridgeRoutes(fromChainId, toChainId, amount) {
        try {
            // Set proper headers matching the browser request
            const headers = {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'content-type': 'application/json',
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
                'origin': 'https://odyssey-fba0638ec5f46615.testnets.rollbridge.app',
                'referer': 'https://odyssey-fba0638ec5f46615.testnets.rollbridge.app/',
                'sec-ch-ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'cross-site',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
            };

            // Get current gas prices from each chain to use in the request
            let fromGasPrice = "378787194";  // Default Sepolia gas price from your example
            let toGasPrice = "1000000302";   // Default Ithaca gas price from your example
            
            try {
                if (fromChainId === this.sepoliaChainId) {
                    const gasPrice = await this.sepoliaWeb3.eth.getGasPrice();
                    fromGasPrice = gasPrice.toString();
                } else if (fromChainId === this.ithacaChainId) {
                    const gasPrice = await this.ithacaWeb3.eth.getGasPrice();
                    toGasPrice = gasPrice.toString();
                }
            } catch (error) {
                console.log(chalk.yellow(`${getTimestamp(this.walletNum)} ⚠ Could not get gas price, using default values`));
            }

            // In case the account to use is on the source chain
            const senderAccount = fromChainId === this.sepoliaChainId ? this.sepoliaAccount : this.ithacaAccount;
            
            const payload = {
                "host": "odyssey-fba0638ec5f46615.testnets.rollbridge.app",
                "amount": amount.toString(),
                "fromChainId": fromChainId.toString(),
                "toChainId": toChainId.toString(),
                "fromTokenAddress": "0x0000000000000000000000000000000000000000",
                "toTokenAddress": "0x0000000000000000000000000000000000000000",
                "fromTokenDecimals": 18,
                "toTokenDecimals": 18,
                "fromGasPrice": fromGasPrice,
                "toGasPrice": toGasPrice,
                "graffiti": "superbridge",
                "recipient": senderAccount.address,
                "sender": senderAccount.address,
                "forceViaL1": false
            };
            
            console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Requesting bridge routes`));
            //console.log(JSON.stringify(payload, null, 2));
            
            const response = await axios.post('https://api.superbridge.app/api/v2/bridge/routes', payload, { headers });
            
            return response.data;
        } catch (error) {
            console.log(chalk.red(`${getTimestamp(this.walletNum)} ✗ Error getting bridge routes: ${error.message}`));
            if (error.response) {
                console.log(chalk.red(`Response data:`, JSON.stringify(error.response.data)));
            }
            return null;
        }
    }
    
    // Bridge ETH from Sepolia to Ithaca
    async bridgeSepoliaToIthaca() {
        if (!this.config.enable_sepolia_to_ithaca) {
            console.log(chalk.yellow(`${getTimestamp(this.walletNum)} ⚠ Sepolia to Ithaca bridging disabled in config`));
            return true;
        }
        
        console.log(chalk.blue.bold(`${getTimestamp(this.walletNum)} Bridging ETH from Sepolia to Ithaca...`));
        
        try {
            // Check Sepolia balance
            const sepoliaBalance = BigInt(await this.sepoliaWeb3.eth.getBalance(this.sepoliaAccount.address));
            const displaySepoliaBalance = this.sepoliaWeb3.utils.fromWei(sepoliaBalance.toString(), 'ether');
            
            console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Sepolia balance: ${parseFloat(displaySepoliaBalance).toFixed(5)} ETH`));
            
            if (sepoliaBalance === BigInt(0)) {
                console.log(chalk.yellow(`${getTimestamp(this.walletNum)} ⚠ No Sepolia ETH to bridge`));
                return true;
            }
            
            // Determine bridge amount
            const minBridge = this.config.sepolia_to_ithaca?.min_amount || 0.0001;
            const maxBridge = this.config.sepolia_to_ithaca?.max_amount || 0.001;
            
            // Random amount between min and max with 5 decimal places
            let bridgeAmount = minBridge + Math.random() * (maxBridge - minBridge);
            // Round to 5 decimal places
            bridgeAmount = Math.round(bridgeAmount * 100000) / 100000;
            
            // Ensure we leave some for gas by taking the minimum
            bridgeAmount = Math.min(parseFloat(displaySepoliaBalance) * 0.9, bridgeAmount);
            
            if (bridgeAmount <= 0) {
                console.log(chalk.yellow(`${getTimestamp(this.walletNum)} ⚠ Bridge amount too small`));
                return true;
            }
            
            const bridgeWei = this.sepoliaWeb3.utils.toWei(bridgeAmount.toString(), 'ether');
            console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Will bridge ${bridgeAmount.toFixed(5)} ETH`));
            
            // Get bridge route from API
            const routes = await this.getBridgeRoutes(
                this.sepoliaChainId,
                this.ithacaChainId,
                bridgeWei
            );
            
            if (!routes || !routes.results || routes.results.length === 0) {
                console.log(chalk.red(`${getTimestamp(this.walletNum)} ✗ No valid bridge routes found`));
                return false;
            }
            
            const route = routes.results[0];
            const txData = route.result.initiatingTransaction;
            
            // Get current nonce and gas price
            const nonce = await this.sepoliaWeb3.eth.getTransactionCount(this.sepoliaAccount.address);
            const gasPrice = BigInt(await this.sepoliaWeb3.eth.getGasPrice());
            const adjustedGasPrice = (gasPrice * BigInt(Math.floor(this.config.gas_price_multiplier * 100)) / BigInt(100)).toString();
            
            // Estimate gas instead of using a fixed value
            const estimatedGas = await this.sepoliaWeb3.eth.estimateGas({
                from: this.sepoliaAccount.address,
                to: txData.to,
                data: txData.data,
                value: txData.value.toString()
            });
            
            // Create transaction object
            const tx = {
                from: this.sepoliaAccount.address,
                to: txData.to,
                data: txData.data,
                value: txData.value.toString(),
                gas: Math.floor(Number(estimatedGas) * 1.5), // Add 50% buffer to be safe
                gasPrice: adjustedGasPrice,
                nonce: nonce,
                chainId: parseInt(txData.chainId)
            };
            
            console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Sending bridge transaction to contract: ${txData.to}`));
            console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Estimated gas: ${estimatedGas}, using: ${tx.gas}`));
            
            // Sign and send transaction
            const signedTx = await this.sepoliaWeb3.eth.accounts.signTransaction(tx, this.sepoliaAccount.privateKey);
            const receipt = await this.sepoliaWeb3.eth.sendSignedTransaction(signedTx.rawTransaction);
            
            console.log(chalk.green(`${getTimestamp(this.walletNum)} ✓ Bridge transaction sent: ${receipt.transactionHash}`));
            console.log(chalk.green(`${getTimestamp(this.walletNum)} ✓ Sepolia Explorer: https://sepolia.etherscan.io/tx/${receipt.transactionHash}`));
            
            // Wait for confirmation if enabled
            if (this.config.sepolia_to_ithaca?.wait_for_confirmation) {
                console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Waiting for bridge confirmation...`));
                
                const startTime = Date.now();
                const maxWaitTime = this.config.sepolia_to_ithaca?.max_wait_time || 300000; // 5 minutes default
                let confirmed = false;
                
                while (!confirmed && (Date.now() - startTime) < maxWaitTime) {
                    console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Checking Ithaca balance...`));
                    
                    // Get initial and new balance
                    const newBalance = BigInt(await this.ithacaWeb3.eth.getBalance(this.ithacaAccount.address));
                    
                    if (newBalance > BigInt(0)) {
                        console.log(chalk.green(`${getTimestamp(this.walletNum)} ✓ ETH received on Ithaca! Balance: ${parseFloat(this.ithacaWeb3.utils.fromWei(newBalance.toString(), 'ether')).toFixed(5)} ETH`));
                        confirmed = true;
                        break;
                    }
                    
                    // Wait before checking again
                    console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ No ETH received yet, waiting 30 seconds...`));
                    await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds
                }
                
                if (!confirmed) {
                    console.log(chalk.yellow(`${getTimestamp(this.walletNum)} ⚠ Timed out waiting for bridge confirmation. The funds may arrive later.`));
                }
            }
            
            return true;
            
        } catch (error) {
            console.log(chalk.red(`${getTimestamp(this.walletNum)} ✗ Error bridging from Sepolia to Ithaca: ${error.message}`));
            return false;
        }
    }
    
    // Bridge ETH from Ithaca to Sepolia
    async bridgeIthacaToSepolia() {
        if (!this.config.enable_ithaca_to_sepolia) {
            console.log(chalk.yellow(`${getTimestamp(this.walletNum)} ⚠ Ithaca to Sepolia bridging disabled in config`));
            return true;
        }
        
        console.log(chalk.blue.bold(`${getTimestamp(this.walletNum)} Bridging ETH from Ithaca to Sepolia...`));
        
        try {
            // Check Ithaca balance
            const ithacaBalance = BigInt(await this.ithacaWeb3.eth.getBalance(this.ithacaAccount.address));
            const displayIthacaBalance = this.ithacaWeb3.utils.fromWei(ithacaBalance.toString(), 'ether');
            
            console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Ithaca balance: ${parseFloat(displayIthacaBalance).toFixed(5)} ETH`));
            
            if (ithacaBalance === BigInt(0)) {
                console.log(chalk.yellow(`${getTimestamp(this.walletNum)} ⚠ No Ithaca ETH to bridge`));
                return true;
            }
            
            // Determine bridge amount
            const minBridge = this.config.ithaca_to_sepolia?.min_amount || 0.0001;
            const maxBridge = this.config.ithaca_to_sepolia?.max_amount || 0.001;
            
            // Random amount between min and max with 5 decimal places
            let bridgeAmount = minBridge + Math.random() * (maxBridge - minBridge);
            // Round to 5 decimal places
            bridgeAmount = Math.round(bridgeAmount * 100000) / 100000;
            
            // Ensure we leave some for gas by taking the minimum
            bridgeAmount = Math.min(parseFloat(displayIthacaBalance) * 0.9, bridgeAmount);
            
            if (bridgeAmount <= 0) {
                console.log(chalk.yellow(`${getTimestamp(this.walletNum)} ⚠ Bridge amount too small`));
                return true;
            }
            
            const bridgeWei = this.ithacaWeb3.utils.toWei(bridgeAmount.toString(), 'ether');
            console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Will bridge ${bridgeAmount.toFixed(5)} ETH`));
            
            // Get bridge route
            const routes = await this.getBridgeRoutes(
                this.ithacaChainId,
                this.sepoliaChainId,
                bridgeWei
            );
            
            if (!routes || !routes.results || routes.results.length === 0) {
                console.log(chalk.red(`${getTimestamp(this.walletNum)} ✗ No valid bridge routes found`));
                return false;
            }
            
            const route = routes.results[0];
            const txData = route.result.initiatingTransaction;
            
            // Get current nonce and gas price
            const nonce = await this.ithacaWeb3.eth.getTransactionCount(this.ithacaAccount.address);
            const gasPrice = BigInt(await this.ithacaWeb3.eth.getGasPrice());
            const adjustedGasPrice = (gasPrice * BigInt(Math.floor(this.config.gas_price_multiplier * 100)) / BigInt(100)).toString();
            
            // Estimate gas instead of using a fixed value
            const estimatedGas = await this.ithacaWeb3.eth.estimateGas({
                from: this.ithacaAccount.address,
                to: txData.to,
                data: txData.data,
                value: txData.value.toString()
            });
            
            // Create transaction object
            const tx = {
                from: this.ithacaAccount.address,
                to: txData.to,
                data: txData.data,
                value: txData.value.toString(),
                gas: Math.floor(Number(estimatedGas) * 1.5), // Add 50% buffer to be safe
                gasPrice: adjustedGasPrice,
                nonce: nonce,
                chainId: parseInt(txData.chainId)
            };
            
            console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Sending bridge transaction to contract: ${txData.to}`));
            console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Estimated gas: ${estimatedGas}, using: ${tx.gas}`));
            
            // Sign and send transaction
            const signedTx = await this.ithacaWeb3.eth.accounts.signTransaction(tx, this.ithacaAccount.privateKey);
            const receipt = await this.ithacaWeb3.eth.sendSignedTransaction(signedTx.rawTransaction);
            
            console.log(chalk.green(`${getTimestamp(this.walletNum)} ✓ Bridge transaction sent: ${receipt.transactionHash}`));
            console.log(chalk.green(`${getTimestamp(this.walletNum)} ✓ Ithaca Explorer: https://odyssey-explorer.ithaca.xyz/tx/${receipt.transactionHash}`));
            
            // For Ithaca to Sepolia, we don't wait for confirmation as per requirements
            console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Bridge initiated successfully. Funds will arrive on Sepolia later.`));
            
            return true;
            
        } catch (error) {
            console.log(chalk.red(`${getTimestamp(this.walletNum)} ✗ Error bridging from Ithaca to Sepolia: ${error.message}`));
            return false;
        }
    }
    
    // Run the full bridging operations
    async executeBridgeOperations() {
        console.log(chalk.blue.bold(`${getTimestamp(this.walletNum)} Starting bridge operations...`));
        
        try {
            // Step 1: Bridge from Sepolia to Ithaca if enabled
            if (this.config.enable_sepolia_to_ithaca) {
                let success = false;
                let attempts = 0;
                const maxRetries = this.config.max_retries || 3;
                
                while (!success && attempts < maxRetries) {
                    attempts++;
                    
                    console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Attempting Sepolia to Ithaca bridge (Attempt ${attempts}/${maxRetries})...`));
                    success = await this.bridgeSepoliaToIthaca();
                    
                    if (!success && attempts < maxRetries) {
                        const waitTime = Math.pow(2, attempts) * 1000;
                        console.log(chalk.yellow(`${getTimestamp(this.walletNum)} ⚠ Retrying in ${waitTime/1000}s...`));
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                }
                
                if (!success) {
                    console.log(chalk.red(`${getTimestamp(this.walletNum)} ✗ Failed to bridge from Sepolia to Ithaca after ${maxRetries} attempts`));
                }
            }
            
            // Step 2: Bridge from Ithaca to Sepolia if enabled
            if (this.config.enable_ithaca_to_sepolia) {
                let success = false;
                let attempts = 0;
                const maxRetries = this.config.max_retries || 3;
                
                while (!success && attempts < maxRetries) {
                    attempts++;
                    
                    console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Attempting Ithaca to Sepolia bridge (Attempt ${attempts}/${maxRetries})...`));
                    success = await this.bridgeIthacaToSepolia();
                    
                    if (!success && attempts < maxRetries) {
                        const waitTime = Math.pow(2, attempts) * 1000;
                        console.log(chalk.yellow(`${getTimestamp(this.walletNum)} ⚠ Retrying in ${waitTime/1000}s...`));
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                }
                
                if (!success) {
                    console.log(chalk.red(`${getTimestamp(this.walletNum)} ✗ Failed to bridge from Ithaca to Sepolia after ${maxRetries} attempts`));
                }
            }
            
            console.log(chalk.green(`${getTimestamp(this.walletNum)} ✓ Bridge operations completed!`));
            return true;
            
        } catch (error) {
            console.log(chalk.red(`${getTimestamp(this.walletNum)} ✗ Error in bridge operations: ${error.message}`));
            return false;
        }
    }
}

module.exports = BridgeManager;