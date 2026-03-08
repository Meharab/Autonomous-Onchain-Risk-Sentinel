// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
// Deployed Address on Sepolia Testnet: 0x07a5f52d58Ce686a628af8bBbC202c19240F460b
/**
 * @title LendingProtocol
 * @notice Minimal ETH-collateral / USDC-debt lending model used for risk monitoring.
 *
 * Roles:
 * - Users: deposit ETH collateral and borrow a synthetic "USDC" amount (pure accounting).
 * - RiskGuard: adjusts risk parameters (collateral ratio, interest slope, pause flag).
 *
 * This contract intentionally keeps logic simple and deterministic. It does not
 * integrate a real price oracle; instead, it exposes hooks where CRE can
 * reason about system state offchain and apply bounded adjustments via RiskGuard.
 */
contract LendingProtocol {
    // -------------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------------

    /// @dev Address allowed to adjust risk parameters. Expected to be RiskGuard.
    address public riskGuard;

    /// @dev Collateralization requirement, scaled by 1e18 (e.g. 150% = 1.5e18).
    uint256 public collateralRatio;

    /// @dev Interest slope parameter; interpretation left to offchain analytics.
    uint256 public interestSlope;

    /// @dev Flag to halt new borrowing during stressed or crisis regimes.
    bool public borrowingPaused;

    /// @dev Lower and upper bounds enforced for collateralRatio.
    uint256 public constant MIN_COLLATERAL_RATIO = 1e18; // 100%
    uint256 public constant MAX_COLLATERAL_RATIO = 2e18; // 200%

    // -------------------------------------------------------------------------
    // Economic State
    // -------------------------------------------------------------------------

    /// @notice Total ETH collateral deposited in the protocol.
    uint256 public totalCollateral;

    /// @notice Total outstanding debt notionally denominated in USDC.
    uint256 public totalDebt;

    // -------------------------------------------------------------------------
    // Accounting
    // -------------------------------------------------------------------------

    mapping(address user => uint256 amount) public collateralBalance;
    mapping(address user => uint256 amount) public debtBalance;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Deposited(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Liquidated(address indexed user, uint256 repaidDebt, uint256 seizedCollateral);

    event CollateralRatioUpdated(uint256 oldRatio, uint256 newRatio);
    event InterestSlopeUpdated(uint256 oldSlope, uint256 newSlope);
    event BorrowingPausedSet(bool oldState, bool newState);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyRiskGuard() {
        require(msg.sender == riskGuard, "LendingProtocol: not riskGuard");
        _;
    }

    // -------------------------------------------------------------------------
    // Construction
    // -------------------------------------------------------------------------

    constructor(uint256 _initialCollateralRatio, uint256 _initialInterestSlope) {
        _setCollateralRatio(_initialCollateralRatio); // 1500000000000000000 ~ 150%
        interestSlope = _initialInterestSlope; // 10000000000000000 ~ 0.01
    }

    // -------------------------------------------------------------------------
    // User-facing functions
    // -------------------------------------------------------------------------

    /**
     * @notice Deposit ETH as collateral.
     */
    function deposit() external payable {
        require(msg.value > 0, "LendingProtocol: zero deposit");

        collateralBalance[msg.sender] += msg.value;
        totalCollateral += msg.value;

        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Borrow a notional amount of USDC against deposited collateral.
     * @dev For simplicity this only updates accounting and does not transfer tokens.
     * @param amount Amount of debt units to open.
     */
    function borrow(uint256 amount) external {
        require(!borrowingPaused, "LendingProtocol: borrowing paused");
        require(amount > 0, "LendingProtocol: zero borrow");
        require(collateralBalance[msg.sender] > 0, "LendingProtocol: no collateral");

        // In a real implementation we would use an oracle price for ETH and USDC here.
        // For this prototype, CRE computes safety offchain and we enforce only that
        // the user has some collateral; liquidations will simulate stress behavior.

        debtBalance[msg.sender] += amount;
        totalDebt += amount;

        emit Borrowed(msg.sender, amount);
    }

    /**
     * @notice Repay outstanding debt.
     * @dev For demo purposes we do not handle actual USDC transfers.
     */
    function repay(uint256 amount) external {
        require(amount > 0, "LendingProtocol: zero repay");
        uint256 userDebt = debtBalance[msg.sender];
        require(userDebt > 0, "LendingProtocol: no debt");

        uint256 repayAmount = amount > userDebt ? userDebt : amount;
        debtBalance[msg.sender] = userDebt - repayAmount;
        totalDebt -= repayAmount;

        emit Repaid(msg.sender, repayAmount);
    }

    /**
     * @notice Simulated liquidation: clear all user debt and seize their collateral.
     * @dev In a real protocol this would require checking price-based health factors.
     *      Here, CRE will determine ex ante when the system is under stress and
     *      adjust parameters to reduce the probability of reaching this path.
     */
    function liquidate(address user) external {
        uint256 userDebt = debtBalance[user];
        uint256 userColl = collateralBalance[user];
        require(userDebt > 0, "LendingProtocol: no debt to liquidate");
        require(userColl > 0, "LendingProtocol: no collateral to seize");

        debtBalance[user] = 0;
        collateralBalance[user] = 0;

        totalDebt -= userDebt;
        totalCollateral -= userColl;

        emit Liquidated(user, userDebt, userColl);
    }

    // -------------------------------------------------------------------------
    // RiskGuard-controlled parameter updates
    // -------------------------------------------------------------------------

    function setRiskGuard(address _riskGuard) external {
        require(_riskGuard != address(0), "LendingProtocol: zero riskGuard");
        riskGuard = _riskGuard;
    }

    function updateCollateralRatio(uint256 newRatio) external onlyRiskGuard {
        _setCollateralRatio(newRatio);
    }

    function updateInterestSlope(uint256 newSlope) external onlyRiskGuard {
        uint256 oldSlope = interestSlope;
        interestSlope = newSlope;
        emit InterestSlopeUpdated(oldSlope, newSlope);
    }

    function setBorrowingPaused(bool newState) external onlyRiskGuard {
        bool oldState = borrowingPaused;
        borrowingPaused = newState;
        emit BorrowingPausedSet(oldState, newState);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    function _setCollateralRatio(uint256 newRatio) internal {
        require(
            newRatio >= MIN_COLLATERAL_RATIO && newRatio <= MAX_COLLATERAL_RATIO, "LendingProtocol: ratio out of bounds"
        );
        uint256 oldRatio = collateralRatio;
        collateralRatio = newRatio;
        emit CollateralRatioUpdated(oldRatio, newRatio);
    }
}