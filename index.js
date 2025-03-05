const { Web3 } = require('web3');
const { ethers } = require('ethers');
const fs = require('fs').promises;
const axios = require('axios');
const chalk = require('chalk');
const cliProgress = require('cli-progress');
const {HttpsProxyAgent} = require('https-proxy-agent');
const ora = require('ora');
const path = require('path');
const crypto = require('crypto');
const _ = require('lodash');

// Import modules from src directory
const NFTManager = require('./src/nft_manager');
const ContractDeployer = require('./src/deploy_contract');
const ERC20TokenDeployer = require('./src/erc20_token');
const TransferManager = require('./src/transfer_manager');
const BridgeManager = require('./src/bridge_manager');

// Default configuration
const DEFAULT_CONFIG = {
    "enable_transfer": true,
    "gas_price_multiplier": 1.1,
    "max_retries": 5,
    "base_wait_time": 10,
    "transfer_amount_percentage": 90
};

// Load configuration from YAML or JSON
async function loadConfig() {
    try {
        // Try to load JSON config
        const jsonExists = await fs.access('config.json').then(() => true).catch(() => false);
        if (jsonExists) {
            console.log(chalk.green(`${getTimestamp()} ✓ Found config.json`));
            const jsonContent = await fs.readFile('config.json', 'utf8');
            return JSON.parse(jsonContent);
        }
        
        console.log(chalk.yellow(`${getTimestamp()} ⚠ No configuration file found, using defaults`));
        return DEFAULT_CONFIG;
    } catch (error) {
        console.log(chalk.red(`${getTimestamp()} ✗ Error loading configuration: ${error.message}`));
        return DEFAULT_CONFIG;
    }
}

function getTimestamp(walletNum = null) {
    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-US', { hour12: false });
    if (walletNum !== null) {
        return `[${timestamp} - Wallet ${walletNum}]`;
    }
    return `[${timestamp}]`;
}

class EnhancedFaucetClaimer {
    constructor(config = {}) {
        // Set default config first
        this.config = DEFAULT_CONFIG;
        this.maxRetries = DEFAULT_CONFIG.max_retries;
        this.baseWaitTime = DEFAULT_CONFIG.base_wait_time;
        // Merge with provided config
        if (config) {
            this.config = { ...DEFAULT_CONFIG, ...config };
            this.maxRetries = this.config.max_retries;
            this.baseWaitTime = this.config.base_wait_time;
        }
        // Other initializations
        this.proxies = [];
        this.currentProxy = null;
        this.retryCodes = new Set([408, 429, 500, 502, 503, 504]);
        this.currentWalletNum = 0;
        
        // Setup web3 connection for Ithaca
        this.rpcUrl = "https://odyssey.ithaca.xyz";
        this.web3 = new Web3(this.rpcUrl);
    }

    async initialize() {
        // Load proxies after construction
        this.proxies = await this.loadProxies();
        return this;
    }

    async loadProxies() {
        try {
            const proxyFile = await fs.readFile('proxy.txt', 'utf8');
            const proxies = proxyFile.split('\n').map(line => line.trim()).filter(line => line);
            console.log(chalk.green(`${getTimestamp()} ✓ Successfully loaded proxies`));
            return proxies;
        } catch (error) {
            console.log(chalk.yellow(`${getTimestamp()} ⚠ proxy.txt not found, will use direct connection`));
            return [];
        }
    }

    getRandomProxy() {
        if (this.proxies.length > 0) {
            this.currentProxy = this.proxies[Math.floor(Math.random() * this.proxies.length)];
            return this.currentProxy;
        }
        return null;
    }

    getProxiesDict() {
        if (this.currentProxy) {
            if (this.currentProxy.startsWith('http')) {
                return {
                    'http': this.currentProxy,
                    'https': this.currentProxy
                };
            }
            return {
                'http': `http://${this.currentProxy}`,
                'https': `http://${this.currentProxy}`
            };
        }
        return null;
    }

    exponentialBackoff(attempt) {
        const waitTime = Math.min(300, this.baseWaitTime * (2 ** attempt));
        const jitter = 0.5 + Math.random();
        return Math.floor(waitTime * jitter);
    }

    async makeRequestWithRetry(method, url, options = {}) {
        let attempt = 0;
        
        // Handle proxy configuration
        if (this.currentProxy) {
            // Create proxy agent
            const proxyUrl = this.currentProxy.startsWith('http') ? 
                this.currentProxy : 
                `http://${this.currentProxy}`;
            
            const httpsAgent = new HttpsProxyAgent(proxyUrl);
            options.httpsAgent = httpsAgent;
            options.proxy = false; // Disable axios proxy handling
        }
        
        // Set appropriate timeout
        if (!options.timeout) {
            options.timeout = 30000;
        }
        
        while (attempt < this.maxRetries) {
            try {
                const response = await axios({
                    method,
                    url,
                    ...options,
                    validateStatus: null // Don't throw error on any status
                });
                
                // Check status code
                if (!this.retryCodes.has(response.status)) {
                    return { response, success: true };
                }
                
                const waitTime = this.exponentialBackoff(attempt);
                console.log(chalk.yellow(`${getTimestamp(this.currentWalletNum)} ⚠ Got status ${response.status}, retrying in ${waitTime}s...`));
                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                
                this.getRandomProxy();
                // Update proxy agent if proxy changed
                if (this.currentProxy) {
                    const newProxyUrl = this.currentProxy.startsWith('http') ? 
                        this.currentProxy : 
                        `http://${this.currentProxy}`;
                    options.httpsAgent = new HttpsProxyAgent(newProxyUrl);
                }
                
            } catch (error) {
                const waitTime = this.exponentialBackoff(attempt);
                console.log(chalk.red(`${getTimestamp(this.currentWalletNum)} ✗ Request error: ${error.message}`));
                
                if (error.response) {
                    console.log(chalk.cyan(`${getTimestamp(this.currentWalletNum)} Server response:`),
                        typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : error.response.data);
                }
                
                console.log(chalk.yellow(`${getTimestamp(this.currentWalletNum)} ⚠ Retrying in ${waitTime}s...`));
                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                
                this.getRandomProxy();
                // Update proxy agent if proxy changed
                if (this.currentProxy) {
                    const newProxyUrl = this.currentProxy.startsWith('http') ? 
                        this.currentProxy : 
                        `http://${this.currentProxy}`;
                    options.httpsAgent = new HttpsProxyAgent(newProxyUrl);
                }
            }
            
            attempt++;
        }
        
        return { response: null, success: false };
    }

    getAddressFromPk(privateKey) {
        try {
            if (!privateKey.startsWith('0x')) {
                privateKey = '0x' + privateKey;
            }
            const account = this.web3.eth.accounts.privateKeyToAccount(privateKey);
            return account.address;
        } catch (error) {
            console.log(chalk.red(`${getTimestamp(this.currentWalletNum)} ✗ Error generating address: ${error.message}`));
            return null;
        }
    }

    async processWallet(privateKey) {
        // Initialize managers with the private key and configuration
        const transferManager = new TransferManager(privateKey, this.config);
        transferManager.setWalletNum(this.currentWalletNum);
        
        const bridgeManager = new BridgeManager(privateKey, this.config.bridge || {});
        bridgeManager.setWalletNum(this.currentWalletNum);
        
        // Step 1: Execute ETH transfers
        await transferManager.executeTransferOperations();
        
        // Step 2: Execute bridge operations
        await bridgeManager.executeBridgeOperations();
        
        return true;
    }
}

async function countdownTimer(hours = 25) {
    const totalSeconds = hours * 3600;
    let remainingSeconds = totalSeconds;

    while (remainingSeconds > 0) {
        const hours = Math.floor(remainingSeconds / 3600);
        const minutes = Math.floor((remainingSeconds % 3600) / 60);
        const seconds = remainingSeconds % 60;

        // Clear previous line and update countdown
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(
            chalk.blue(`${getTimestamp()} Next cycle in: `) + 
            chalk.yellow(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`)
        );

        await new Promise(resolve => setTimeout(resolve, 1000));
        remainingSeconds--;
    }

    // Clear the countdown line
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    console.log(chalk.green(`${getTimestamp()} ✓ Countdown completed!`));
}

async function main() {
    while (true) {
        console.log(chalk.blue.bold('\n=== Ithaca Testnet Automation ===\n'));

        try {
            // Load configuration
            const config = await loadConfig();
            console.log(chalk.green(`${getTimestamp()} ✓ Configuration loaded`));
            
            // Load private keys
            const privateKeys = (await fs.readFile('pk.txt', 'utf8'))
                .split('\n')
                .map(line => line.trim())
                .filter(line => line);

            console.log(chalk.green(`${getTimestamp()} ✓ Found ${privateKeys.length} private keys`));

            console.log(chalk.blue.bold(`${getTimestamp()} Initializing automation...`));

            // Create and initialize the main handler
            const claimer = await new EnhancedFaucetClaimer(config).initialize();

            // Process wallets
            console.log(chalk.blue.bold(`\nProcessing ${privateKeys.length} wallets...\n`));

            for (let i = 0; i < privateKeys.length; i++) {
                claimer.currentWalletNum = i + 1;
                const pk = privateKeys[i];

                console.log(chalk.blue.bold(`\n=== Processing Wallet ${i + 1}/${privateKeys.length} ===\n`));

                const proxy = claimer.getRandomProxy();
                if (proxy) {
                    console.log(chalk.cyan(`${getTimestamp(i + 1)} ℹ Using proxy: ${proxy}`));
                }

                const address = claimer.getAddressFromPk(pk);
                if (address) {
                    console.log(chalk.green(`${getTimestamp(i + 1)} ✓ Processing address: ${address}`));

                    // Process wallet operations
                    await claimer.processWallet(pk);
                    
                    // Process NFT operations
                    try {
                        console.log(chalk.blue.bold(`\n=== Running NFT Operations for Wallet ${i + 1} ===\n`));
                        
                        // Initialize NFT manager with wallet's private key and current config
                        const nftManager = new NFTManager(pk, config);
                        nftManager.setWalletNum(i + 1);
                        
                        // Execute NFT operations (compile, deploy, mint, burn)
                        await nftManager.executeNFTOperations();
                        
                    } catch (error) {
                        console.log(chalk.red(`${getTimestamp(i + 1)} ✗ Error in NFT operations: ${error.message}`));
                    }
                    
                    // Process contract operations
                    try {
                        console.log(chalk.blue.bold(`\n=== Running Contract Operations for Wallet ${i + 1} ===\n`));
                        
                        // Initialize contract deployer with wallet's private key and current config
                        const contractDeployer = new ContractDeployer(pk, config.contract || {});
                        contractDeployer.setWalletNum(i + 1);
                        
                        // Execute contract operations (compile, deploy, interact)
                        await contractDeployer.executeContractOperations();
                        
                    } catch (error) {
                        console.log(chalk.red(`${getTimestamp(i + 1)} ✗ Error in contract operations: ${error.message}`));
                    }
                    
                    // Process ERC20 token operations
                    try {
                        console.log(chalk.blue.bold(`\n=== Running ERC20 Token Operations for Wallet ${i + 1} ===\n`));
                        
                        // Initialize ERC20 token deployer with wallet's private key and current config
                        const erc20Deployer = new ERC20TokenDeployer(pk, config);
                        erc20Deployer.setWalletNum(i + 1);
                        
                        // Execute ERC20 token operations (compile, deploy, mint, burn)
                        await erc20Deployer.executeTokenOperations();
                        
                    } catch (error) {
                        console.log(chalk.red(`${getTimestamp(i + 1)} ✗ Error in ERC20 token operations: ${error.message}`));
                    }
                }

                if (i < privateKeys.length - 1) {
                    const waitTime = Math.floor(Math.random() * 11) + 5; // 5-15 seconds
                    console.log(chalk.yellow(`\n${getTimestamp(i + 1)} Waiting ${waitTime} seconds before next wallet...\n`));
                    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                }
            }

            console.log(chalk.green.bold('\nWallet processing completed! Starting 25-hour countdown...\n'));

            // Start the 25-hour countdown
            await countdownTimer(25);

        } catch (error) {
            console.error(chalk.red(`\nError: ${error.message}`));
            process.exit(1);
        }
    }
}

main().catch(console.error);