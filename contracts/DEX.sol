// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Interface to interact with ERC20 tokens (like the ones you want to trade)
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract DEX {
    // State variables
    address public tokenA;
    address public tokenB;
    
    // Reserves strictly track the assets held by this contract
    uint256 public reserveA;
    uint256 public reserveB;
    
    uint256 public totalLiquidity;
    mapping(address => uint256) public liquidity;
    
    // Events
    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidityMinted);
    event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidityBurned);
    event Swap(address indexed trader, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    
    /// @notice Initialize the DEX with two token addresses
    constructor(address _tokenA, address _tokenB) {
        tokenA = _tokenA;
        tokenB = _tokenB;
    }
    
    /// @notice Helper to calculate square root (Babylonian method)
    /// @dev Used for calculating initial liquidity (Geometric Mean)
    function sqrt(uint y) internal pure returns (uint z) {
        if (y > 3) {
            z = y;
            uint x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    /// @notice Helper to find the minimum of two numbers
    function min(uint x, uint y) internal pure returns (uint z) {
        z = x < y ? x : y;
    }

    /// @notice Add liquidity to the pool
    function addLiquidity(uint256 amountA, uint256 amountB) 
        external 
        returns (uint256 liquidityMinted) 
    {
        // 1. Transfer tokens from user to contract
        require(IERC20(tokenA).transferFrom(msg.sender, address(this), amountA), "Transfer A failed");
        require(IERC20(tokenB).transferFrom(msg.sender, address(this), amountB), "Transfer B failed");

        // 2. Calculate LP tokens to mint
        if (totalLiquidity == 0) {
            // If first time, liquidity = sqrt(x * y) - Uniswap V2 formula
            liquidityMinted = sqrt(amountA * amountB);
        } else {
            // If subsequent time, liquidity is proportional to share of pool
            // min( (amountA * total) / reserveA, (amountB * total) / reserveB )
            uint256 liquidityA = (amountA * totalLiquidity) / reserveA;
            uint256 liquidityB = (amountB * totalLiquidity) / reserveB;
            liquidityMinted = min(liquidityA, liquidityB);
        }

        require(liquidityMinted > 0, "Insufficient liquidity minted");

        // 3. Update state
        liquidity[msg.sender] += liquidityMinted;
        totalLiquidity += liquidityMinted;
        
        // Update reserves AFTER the logic (sync with actual balance)
        reserveA = IERC20(tokenA).balanceOf(address(this));
        reserveB = IERC20(tokenB).balanceOf(address(this));

        emit LiquidityAdded(msg.sender, amountA, amountB, liquidityMinted);
    }
    
    /// @notice Remove liquidity from the pool
    function removeLiquidity(uint256 liquidityAmount) 
        external 
        returns (uint256 amountA, uint256 amountB) 
    {
        require(liquidity[msg.sender] >= liquidityAmount, "Not enough LP tokens");
        require(liquidityAmount > 0, "Amount invalid");

        // 1. Calculate amount of tokens to return
        // amount = (shares / totalShares) * reserve
        amountA = (liquidityAmount * reserveA) / totalLiquidity;
        amountB = (liquidityAmount * reserveB) / totalLiquidity;

        // 2. Burn LP tokens
        liquidity[msg.sender] -= liquidityAmount;
        totalLiquidity -= liquidityAmount;

        // 3. Transfer tokens back to user
        require(IERC20(tokenA).transfer(msg.sender, amountA), "Transfer A failed");
        require(IERC20(tokenB).transfer(msg.sender, amountB), "Transfer B failed");

        // Update reserves
        reserveA = IERC20(tokenA).balanceOf(address(this));
        reserveB = IERC20(tokenB).balanceOf(address(this));

        emit LiquidityRemoved(msg.sender, amountA, amountB, liquidityAmount);
    }
    
    /// @notice Swap token A for token B
    function swapAForB(uint256 amountAIn) 
        external 
        returns (uint256 amountBOut) 
    {
        require(amountAIn > 0, "Invalid amount");

        // 1. Calculate output amount (including fees)
        amountBOut = getAmountOut(amountAIn, reserveA, reserveB);

        // 2. Transfer Token A from user to contract
        require(IERC20(tokenA).transferFrom(msg.sender, address(this), amountAIn), "Transfer A failed");

        // 3. Transfer Token B from contract to user
        require(IERC20(tokenB).transfer(msg.sender, amountBOut), "Transfer B failed");

        // 4. Update reserves
        reserveA = IERC20(tokenA).balanceOf(address(this));
        reserveB = IERC20(tokenB).balanceOf(address(this));

        emit Swap(msg.sender, tokenA, tokenB, amountAIn, amountBOut);
    }
    
    /// @notice Swap token B for token A
    function swapBForA(uint256 amountBIn) 
        external 
        returns (uint256 amountAOut) 
    {
        require(amountBIn > 0, "Invalid amount");

        // 1. Calculate output amount (including fees)
        amountAOut = getAmountOut(amountBIn, reserveB, reserveA);

        // 2. Transfer Token B from user to contract
        require(IERC20(tokenB).transferFrom(msg.sender, address(this), amountBIn), "Transfer B failed");

        // 3. Transfer Token A from contract to user
        require(IERC20(tokenA).transfer(msg.sender, amountAOut), "Transfer A failed");

        // 4. Update reserves
        reserveA = IERC20(tokenA).balanceOf(address(this));
        reserveB = IERC20(tokenB).balanceOf(address(this));

        emit Swap(msg.sender, tokenB, tokenA, amountBIn, amountAOut);
    }
    
    /// @notice Get current price of token A in terms of token B
    // NOTE: This returns a raw ratio. To get a decimal value in a frontend, 
    // you might want to return (reserveB * 1e18) / reserveA
    function getPrice() external view returns (uint256 price) {
        if (reserveA == 0 || reserveB == 0) return 0;
        // Simple price = y / x. 
        // We multiply by 1000 to keep some precision since Solidity has no decimals.
        return (reserveB * 1000) / reserveA;
    }
    
    /// @notice Get current reserves
    function getReserves() external view returns (uint256 _reserveA, uint256 _reserveB) {
        return (reserveA, reserveB);
    }
    
    /// @notice Calculate amount of token B received for given amount of token A
    /// @notice Implements the Constant Product Formula with 0.3% fee
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) 
        public 
        pure 
        returns (uint256 amountOut) 
    {
        require(amountIn > 0, "Invalid input amount");
        require(reserveIn > 0 && reserveOut > 0, "Invalid reserves");

        // Formula with fee:
        // dy = (y * dx * 997) / (x * 1000 + dx * 997)
        
        // 1. Apply fee (0.3% fee means 99.7% goes to swap)
        // We multiply by 997/1000
        uint256 amountInWithFee = amountIn * 997;
        
        // 2. Calculate Numerator
        uint256 numerator = amountInWithFee * reserveOut;
        
        // 3. Calculate Denominator
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        
        return numerator / denominator;
    }
}