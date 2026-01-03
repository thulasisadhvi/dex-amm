# Decentralized Exchange (AMM)

A simplified Automated Market Maker (AMM) Decentralized Exchange built with Solidity and Hardhat. This project implements the Constant Product Formula (`x * y = k`) to allow users to swap tokens and provide liquidity.

## Features

- **Liquidity Provision:** Users can add liquidity to the pool and receive LP tokens.
- **Token Swapping:** Swap between Token A and Token B using the automated pricing formula.
- **Fees:** A 0.3% trading fee is applied to swaps and distributed to liquidity providers.
- **Slippage Protection:** Pricing updates automatically based on reserve ratios.

## Technology Stack

- **Solidity** (Smart Contracts)
- **Hardhat** (Development Framework)
- **Ethers.js** (Interaction)
- **Docker** (Containerized Environment)

## Prerequisites

- Node.js v18+
- Docker (optional, for containerized run)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/thulasisadhvi/dex-amm
   cd dex-amm

2. Install dependencies:
```bash
npm install

```

## Usage

### Compile Contracts

```bash
npx hardhat compile

```

### Run Tests

This project includes 25+ test cases covering edge cases, liquidity management, and swaps.

```bash
npx hardhat test

```

### Run Code Coverage

```bash
npx hardhat coverage

```

## Docker Usage

To run the entire test suite in an isolated environment:

```bash
# Build and run
docker-compose up --build

```

## Contract Details

* **DEX.sol**: Main exchange logic.
* **MockERC20.sol**: Test tokens (Token A and Token B) for simulating trades.

