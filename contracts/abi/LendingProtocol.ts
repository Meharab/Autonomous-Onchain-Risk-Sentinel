export const LendingProtocol = [
    { 
        type: "constructor", 
        inputs: [
            { name: "_riskGuard", type: "address", internalType: "address" }, 
            { name: "_initialCollateralRatio", type: "uint256", internalType: "uint256" }, 
            { name: "_initialInterestSlope", type: "uint256", internalType: "uint256" }
        ], 
        stateMutability: "nonpayable" 
    }, 
    { 
        type: "function", 
        name: "MAX_COLLATERAL_RATIO", 
        inputs: [], 
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }], 
        stateMutability: "view" 
    }, 
    { 
        type: "function", 
        name: "MIN_COLLATERAL_RATIO", 
        inputs: [], 
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }], 
        stateMutability: "view" 
    }, 
    { 
        type: "function", 
        name: "borrow", 
        inputs: [{ name: "amount", type: "uint256", internalType: "uint256" }], 
        outputs: [], 
        stateMutability: "nonpayable" 
    }, 
    { 
        type: "function", 
        name: "borrowingPaused", 
        inputs: [], 
        outputs: [{ name: "", type: "bool", internalType: "bool" }], 
        stateMutability: "view" 
    }, 
    { 
        type: "function", 
        name: "collateralBalance", 
        inputs: [{ name: "user", type: "address", internalType: "address" }], 
        outputs: [{ name: "amount", type: "uint256", internalType: "uint256" }], 
        stateMutability: "view" 
    }, 
    { 
        type: "function", 
        name: "collateralRatio", 
        inputs: [], 
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }], 
        stateMutability: "view" 
    }, 
    { 
        type: "function", 
        name: "debtBalance", 
        inputs: [{ name: "user", type: "address", internalType: "address" }], 
        outputs: [{ name: "amount", type: "uint256", internalType: "uint256" }], 
        stateMutability: "view" 
    }, 
    { 
        type: "function", 
        name: "deposit", 
        inputs: [], 
        outputs: [], 
        stateMutability: "payable" 
    }, 
    { 
        type: "function", 
        name: "interestSlope", 
        inputs: [], 
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }], 
        stateMutability: "view" 
    }, 
    { 
        type: "function", 
        name: "liquidate", 
        inputs: [{ name: "user", type: "address", internalType: "address" }], 
        outputs: [], 
        stateMutability: "nonpayable" 
    }, 
    { 
        type: "function", 
        name: "repay", 
        inputs: [{ name: "amount", type: "uint256", internalType: "uint256" }], 
        outputs: [], 
        stateMutability: "nonpayable" 
    }, 
    { 
        type: "function", 
        name: "riskGuard", 
        inputs: [], 
        outputs: [{ name: "", type: "address", internalType: "address" }], 
        stateMutability: "view" 
    }, 
    { 
        type: "function", 
        name: "setBorrowingPaused", 
        inputs: [{ name: "newState", type: "bool", internalType: "bool" }], 
        outputs: [], 
        stateMutability: "nonpayable" 
    }, 
    { 
        type: "function", 
        name: "totalCollateral", 
        inputs: [], 
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }], 
        stateMutability: "view" 
    }, 
    { 
        type: "function", 
        name: "totalDebt", 
        inputs: [], 
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }], 
        stateMutability: "view" 
    }, 
    { 
        type: "function", 
        name: "updateCollateralRatio", 
        inputs: [{ name: "newRatio", type: "uint256", internalType: "uint256" }], 
        outputs: [], 
        stateMutability: "nonpayable" 
    }, 
    { 
        type: "function", 
        name: "updateInterestSlope", 
        inputs: [{ name: "newSlope", type: "uint256", internalType: "uint256" }], 
        outputs: [], 
        stateMutability: "nonpayable" 
    }, 
    { 
        type: "event", 
        name: "Borrowed", 
        inputs: [
            { name: "user", type: "address", indexed: true, internalType: "address" }, 
            { name: "amount", type: "uint256", indexed: false, internalType: "uint256" }
        ], 
        anonymous: false 
    }, 
    { 
        type: "event", 
        name: "BorrowingPausedSet", 
        inputs: [
            { name: "oldState", type: "bool", indexed: false, internalType: "bool" }, 
            { name: "newState", type: "bool", indexed: false, internalType: "bool" }
        ], 
        anonymous: false 
    }, 
    { 
        type: "event", 
        name: "CollateralRatioUpdated", 
        inputs: [
            { name: "oldRatio", type: "uint256", indexed: false, internalType: "uint256" }, 
            { name: "newRatio", type: "uint256", indexed: false, internalType: "uint256" }
        ], 
        anonymous: false 
    }, 
    { 
        type: "event", 
        name: "Deposited", 
        inputs: [
            { name: "user", type: "address", indexed: true, internalType: "address" }, 
            { name: "amount", type: "uint256", indexed: false, internalType: "uint256" }
        ], 
        anonymous: false 
    }, 
    { 
        type: "event", 
        name: "InterestSlopeUpdated", 
        inputs: [
            { name: "oldSlope", type: "uint256", indexed: false, internalType: "uint256" }, 
            { name: "newSlope", type: "uint256", indexed: false, internalType: "uint256" }
        ], 
        anonymous: false 
    }, 
    { 
        type: "event", 
        name: "Liquidated", 
        inputs: [
            { name: "user", type: "address", indexed: true, internalType: "address" }, 
            { name: "repaidDebt", type: "uint256", indexed: false, internalType: "uint256" }, 
            { name: "seizedCollateral", type: "uint256", indexed: false, internalType: "uint256" }
        ], 
        anonymous: false 
    }, 
    { 
        type: "event", 
        name: "Repaid", 
        inputs: [
            { name: "user", type: "address", indexed: true, internalType: "address" }, 
            { name: "amount", type: "uint256", indexed: false, internalType: "uint256" }
        ], 
        anonymous: false 
    }
] as const