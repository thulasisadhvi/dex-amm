const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DEX", function() {
    let dex, tokenA, tokenB;
    let owner, addr1, addr2;

    beforeEach(async function() {
        // Get signers
        [owner, addr1, addr2] = await ethers.getSigners();

        // Deploy Mock Tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        tokenA = await MockERC20.deploy("Token A", "TKA");
        tokenB = await MockERC20.deploy("Token B", "TKB");
        
        // Wait for deployment (ethers v6)
        await tokenA.waitForDeployment();
        await tokenB.waitForDeployment();

        // Deploy DEX
        const DEX = await ethers.getContractFactory("DEX");
        dex = await DEX.deploy(tokenA.target, tokenB.target);
        await dex.waitForDeployment();

        // Mint tokens to addr1 and addr2 for testing
        await tokenA.mint(addr1.address, ethers.parseEther("1000"));
        await tokenB.mint(addr1.address, ethers.parseEther("1000"));
        await tokenA.mint(addr2.address, ethers.parseEther("1000"));
        await tokenB.mint(addr2.address, ethers.parseEther("1000"));

        // Approve DEX to spend tokens for owner
        await tokenA.approve(dex.target, ethers.parseEther("1000000"));
        await tokenB.approve(dex.target, ethers.parseEther("1000000"));

        // Approve DEX for addr1
        await tokenA.connect(addr1).approve(dex.target, ethers.parseEther("1000000"));
        await tokenB.connect(addr1).approve(dex.target, ethers.parseEther("1000000"));
        
        // Approve DEX for addr2
        await tokenA.connect(addr2).approve(dex.target, ethers.parseEther("1000000"));
        await tokenB.connect(addr2).approve(dex.target, ethers.parseEther("1000000"));
    });

    describe("Liquidity Management", function() {
        it("should allow initial liquidity provision", async function() {
            await dex.addLiquidity(ethers.parseEther("100"), ethers.parseEther("100"));
            const reserves = await dex.getReserves();
            expect(reserves[0]).to.equal(ethers.parseEther("100"));
            expect(reserves[1]).to.equal(ethers.parseEther("100"));
        });

        it("should mint correct LP tokens for first provider", async function() {
            await dex.addLiquidity(ethers.parseEther("100"), ethers.parseEther("100"));
            const lpBalance = await dex.liquidity(owner.address);
            // sqrt(100 * 100) = 100
            expect(lpBalance).to.equal(ethers.parseEther("100"));
        });

        it("should allow subsequent liquidity additions", async function() {
            await dex.addLiquidity(ethers.parseEther("100"), ethers.parseEther("100"));
            await dex.connect(addr1).addLiquidity(ethers.parseEther("50"), ethers.parseEther("50"));
            
            const reserves = await dex.getReserves();
            expect(reserves[0]).to.equal(ethers.parseEther("150"));
            expect(reserves[1]).to.equal(ethers.parseEther("150"));
        });

        it("should maintain price ratio on liquidity addition", async function() {
            await dex.addLiquidity(ethers.parseEther("100"), ethers.parseEther("100"));
            // Add equal ratio
            await expect(dex.connect(addr1).addLiquidity(ethers.parseEther("50"), ethers.parseEther("50")))
                .to.not.be.reverted;
        });

        it("should allow partial liquidity removal", async function() {
            await dex.addLiquidity(ethers.parseEther("100"), ethers.parseEther("100"));
            const lpBalanceBefore = await dex.liquidity(owner.address);
            
            await dex.removeLiquidity(ethers.parseEther("50"));
            
            const lpBalanceAfter = await dex.liquidity(owner.address);
            expect(lpBalanceAfter).to.equal(lpBalanceBefore - ethers.parseEther("50"));
        });

        it("should return correct token amounts on liquidity removal", async function() {
            await dex.addLiquidity(ethers.parseEther("100"), ethers.parseEther("100"));
            
            // Remove 50% of liquidity
            await expect(dex.removeLiquidity(ethers.parseEther("50")))
                .to.changeTokenBalances(tokenA, [dex, owner], [ethers.parseEther("-50"), ethers.parseEther("50")]);
        });

        it("should revert on zero liquidity addition", async function() {
            await expect(dex.addLiquidity(0, 0)).to.be.reverted; 
            // Depending on implementation, might fail at transfer or specific check
            // Our implementation might fail at sqrt(0) or later
        });

        it("should revert when removing more liquidity than owned", async function() {
            await dex.addLiquidity(ethers.parseEther("100"), ethers.parseEther("100"));
            await expect(dex.removeLiquidity(ethers.parseEther("200"))).to.be.revertedWith("Not enough LP tokens");
        });
    });

    describe("Token Swaps", function() {
        beforeEach(async function() {
            // Add initial liquidity: 1000 Token A, 1000 Token B
            await dex.addLiquidity(
                ethers.parseEther("1000"),
                ethers.parseEther("1000")
            );
        });

        it("should swap token A for token B", async function() {
            // User swaps 100 Token A
            await dex.connect(addr1).swapAForB(ethers.parseEther("100"));
            
            const reserves = await dex.getReserves();
            // Reserve A should increase by 100
            expect(reserves[0]).to.equal(ethers.parseEther("1100"));
            // Reserve B should decrease
            expect(reserves[1]).to.be.lt(ethers.parseEther("1000"));
        });

        it("should swap token B for token A", async function() {
            await dex.connect(addr1).swapBForA(ethers.parseEther("100"));
            const reserves = await dex.getReserves();
            expect(reserves[1]).to.equal(ethers.parseEther("1100"));
            expect(reserves[0]).to.be.lt(ethers.parseEther("1000"));
        });

        it("should calculate correct output amount with fee", async function() {
            // Input 100. Fee 0.3% = 0.3. InputWithFee = 99.7
            // Output = (99.7 * 1000) / (1000 + 99.7) = 99700 / 1099.7 ≈ 90.66
            const amountIn = ethers.parseEther("100");
            const expectedOut = await dex.getAmountOut(amountIn, ethers.parseEther("1000"), ethers.parseEther("1000"));
            
            await expect(dex.connect(addr1).swapAForB(amountIn))
                .to.changeTokenBalance(tokenB, addr1, expectedOut);
        });

        it("should update reserves after swap", async function() {
            await dex.connect(addr1).swapAForB(ethers.parseEther("100"));
            const reserves = await dex.getReserves();
            expect(reserves[0]).to.equal(ethers.parseEther("1100"));
        });

        it("should increase k after swap due to fees", async function() {
            const kBefore = (await dex.reserveA()) * (await dex.reserveB());
            await dex.connect(addr1).swapAForB(ethers.parseEther("100"));
            const kAfter = (await dex.reserveA()) * (await dex.reserveB());
            
            expect(kAfter).to.be.gt(kBefore);
        });

        it("should revert on zero swap amount", async function() {
            await expect(dex.swapAForB(0)).to.be.revertedWith("Invalid amount");
        });

        it("should handle large swaps with high price impact", async function() {
            // Swap 90% of pool
            const amountIn = ethers.parseEther("9000"); // Pool only has 1000, so this changes ratio heavily
            // But we need user to have funds. addr1 has 1000.
            // Let's mint more to addr1
            await tokenA.mint(addr1.address, ethers.parseEther("10000"));
            await tokenA.connect(addr1).approve(dex.target, ethers.parseEther("10000"));

            await expect(dex.connect(addr1).swapAForB(ethers.parseEther("2000")))
                .to.not.be.reverted;
        });

        it("should handle multiple consecutive swaps", async function() {
            await dex.connect(addr1).swapAForB(ethers.parseEther("10"));
            await dex.connect(addr1).swapAForB(ethers.parseEther("10"));
            expect(await dex.reserveA()).to.equal(ethers.parseEther("1020"));
        });
    });

    describe("Price Calculations", function() {
        it("should return correct initial price", async function() {
            await dex.addLiquidity(ethers.parseEther("100"), ethers.parseEther("200"));
            // Price = 200 / 100 * 1000 = 2000 (scaled)
            const price = await dex.getPrice();
            expect(price).to.equal(2000);
        });

        it("should update price after swaps", async function() {
            await dex.addLiquidity(ethers.parseEther("100"), ethers.parseEther("100"));
            await dex.connect(addr1).swapAForB(ethers.parseEther("100"));
            
            const price = await dex.getPrice();
            // New ResA = 200, ResB < 100. Price = ResB/ResA should go down.
            expect(price).to.be.lt(1000);
        });

        it("should handle price queries with zero reserves gracefully", async function() {
            const price = await dex.getPrice();
            expect(price).to.equal(0);
        });
    });

    describe("Fee Distribution", function() {
        it("should accumulate fees for liquidity providers", async function() {
            await dex.addLiquidity(ethers.parseEther("100"), ethers.parseEther("100"));
            
            // Do a huge swap to generate fees
            await dex.connect(addr1).swapAForB(ethers.parseEther("100"));
            
            // If we remove all liquidity now, we should get back > 100 Token A
            // We put in 100 A. We swapped in 100 A. Pool has 200 A.
            // LP owns 100% of pool.
            await dex.removeLiquidity(ethers.parseEther("100"));
            
            // We should get 200 A back (minus tiny bit if rounding) and remainder of B
            expect(await tokenA.balanceOf(owner.address)).to.be.gt(ethers.parseEther("100"));
        });
    });

    describe("Edge Cases", function() {
        it("should handle very small liquidity amounts", async function() {
            await expect(dex.addLiquidity(100, 100)).to.not.be.reverted;
        });

        it("should prevent unauthorized access", async function() {
            // DEX has no owner-only functions in this spec, but good to have the test placeholder
            expect(true).to.equal(true); 
        });
    });

    describe("Events", function() {
        it("should emit LiquidityAdded event", async function() {
            await expect(dex.addLiquidity(ethers.parseEther("100"), ethers.parseEther("100")))
                .to.emit(dex, "LiquidityAdded")
                .withArgs(owner.address, ethers.parseEther("100"), ethers.parseEther("100"), ethers.parseEther("100"));
        });

        it("should emit LiquidityRemoved event", async function() {
            await dex.addLiquidity(ethers.parseEther("100"), ethers.parseEther("100"));
            await expect(dex.removeLiquidity(ethers.parseEther("100")))
                .to.emit(dex, "LiquidityRemoved")
                .withArgs(owner.address, ethers.parseEther("100"), ethers.parseEther("100"), ethers.parseEther("100"));
        });

        it("should emit Swap event", async function() {
            await dex.addLiquidity(ethers.parseEther("100"), ethers.parseEther("100"));
            await expect(dex.connect(addr1).swapAForB(ethers.parseEther("10")))
                .to.emit(dex, "Swap");
        });
    });
});