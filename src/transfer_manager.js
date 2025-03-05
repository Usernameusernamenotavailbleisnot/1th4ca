const { Web3 } = require('web3');
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

class TransferManager {
    constructor(privateKey, config = {}) {
        // Default configuration
        this.defaultConfig = {
            enable_transfer: true,
            gas_price_multiplier: 1.1,
            transfer_amount_percentage: 90,
        };
        
        // Load configuration, merging with defaults
        this.config = { ...this.defaultConfig, ...config };
        
        // Setup web3 connection
        this.rpcUrl = "https://odyssey.ithaca.xyz";
        this.web3 = new Web3(this.rpcUrl);
        
        // Setup account
        if (!privateKey.startsWith('0x')) {
            privateKey = '0x' + privateKey;
        }
        this.account = this.web3.eth.accounts.privateKeyToAccount(privateKey);
        this.walletNum = null;
    }
    
    setWalletNum(num) {
        this.walletNum = num;
    }
    
    async transferToSelf() {
        if (!this.config.enable_transfer) {
            console.log(chalk.yellow(`${getTimestamp(this.walletNum)} ⚠ ETH transfer disabled in config`));
            return true;
        }

        console.log(chalk.blue.bold(`${getTimestamp(this.walletNum)} Transferring ETH to self...`));
        try {
            const balance = BigInt(await this.web3.eth.getBalance(this.account.address));
            const displayBalance = this.web3.utils.fromWei(balance.toString(), 'ether');
            
            if (balance === BigInt(0)) {
                console.log(chalk.yellow(`${getTimestamp(this.walletNum)} ⚠ No balance to transfer`));
                return true;
            }

            console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Current balance: ${parseFloat(displayBalance).toFixed(5)} ETH`));

            // Get current gas price and apply multiplier
            const gasPrice = BigInt(await this.web3.eth.getGasPrice());
            const adjustedGasPrice = gasPrice * BigInt(Math.floor(this.config.gas_price_multiplier * 100)) / BigInt(100);
            
            const transaction = {
                nonce: await this.web3.eth.getTransactionCount(this.account.address),
                to: this.account.address,
                from: this.account.address,
                data: '0x',
                chainId: 911867, // Ithaca testnet
                gas: '21000',
                gasPrice: adjustedGasPrice.toString()
            };

            // Calculate gas cost and transfer amount
            const gasCost = BigInt(transaction.gas) * adjustedGasPrice;
            const transferPercentage = BigInt(this.config.transfer_amount_percentage);
            let transferAmount = (balance * transferPercentage / BigInt(100)) - gasCost;
            
            // Convert to ETH for display and rounding
            let transferAmountEth = parseFloat(this.web3.utils.fromWei(transferAmount.toString(), 'ether'));
            
            // Round to 5 decimal places
            transferAmountEth = Math.round(transferAmountEth * 100000) / 100000;
            
            // Convert back to wei with the rounded amount
            transferAmount = BigInt(this.web3.utils.toWei(transferAmountEth.toString(), 'ether'));

            if (transferAmount <= 0) {
                console.log(chalk.yellow(`${getTimestamp(this.walletNum)} ⚠ Balance too low to cover gas`));
                return true;
            }
            
            console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Will transfer ${transferAmountEth.toFixed(5)} ETH to self`));
            
            transaction.value = transferAmount.toString();

            // Sign and send transaction
            const signed = await this.web3.eth.accounts.signTransaction(transaction, this.account.privateKey);
            const receipt = await this.web3.eth.sendSignedTransaction(signed.rawTransaction);
            
            console.log(chalk.green(`${getTimestamp(this.walletNum)} ✓ Transfer successful: ${receipt.transactionHash}`));
            console.log(chalk.green(`${getTimestamp(this.walletNum)} ✓ Explorer: https://odyssey-explorer.ithaca.xyz/tx/${receipt.transactionHash}`));
            return true;
            
        } catch (error) {
            console.log(chalk.red(`${getTimestamp(this.walletNum)} ✗ Error transferring: ${error.message}`));
            return false;
        }
    }
    
    // Run the full transfer operation
    async executeTransferOperations() {
        console.log(chalk.blue.bold(`${getTimestamp(this.walletNum)} Starting ETH transfer operations...`));
        
        try {
            let success = false;
            let attempts = 0;
            const maxRetries = this.config.max_retries || 3;
            
            while (!success && attempts < maxRetries) {
                attempts++;
                
                console.log(chalk.cyan(`${getTimestamp(this.walletNum)} ℹ Attempting ETH self-transfer (Attempt ${attempts}/${maxRetries})...`));
                success = await this.transferToSelf();
                
                if (!success && attempts < maxRetries) {
                    const waitTime = Math.pow(2, attempts) * 1000;
                    console.log(chalk.yellow(`${getTimestamp(this.walletNum)} ⚠ Retrying in ${waitTime/1000}s...`));
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
            
            if (!success) {
                console.log(chalk.red(`${getTimestamp(this.walletNum)} ✗ Failed to transfer ETH after ${maxRetries} attempts`));
                return false;
            }
            
            console.log(chalk.green(`${getTimestamp(this.walletNum)} ✓ ETH transfer operations completed successfully!`));
            return true;
            
        } catch (error) {
            console.log(chalk.red(`${getTimestamp(this.walletNum)} ✗ Error in ETH transfer operations: ${error.message}`));
            return false;
        }
    }
}

module.exports = TransferManager;