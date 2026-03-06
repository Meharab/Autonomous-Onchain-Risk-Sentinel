// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LendingProtocol} from "./LendingProtocol.sol";

/**
 * @title RiskGuard
 * @notice Bounded actuator between the Chainlink Runtime Environment (CRE)
 *         and the onchain LendingProtocol.
 *
 * CRE (via its executor address) can:
 * - tighten or loosen the collateral ratio within configured bounds
 * - pause borrowing during crises
 * - adjust the interest slope parameter
 *
 * It cannot:
 * - move user funds
 * - modify user balances directly
 */
contract RiskGuard {
    // -------------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------------

    /// @notice Address authorized to execute risk actions (CRE runtime).
    address public creExecutor;

    /// @notice Target protocol whose parameters are being controlled.
    LendingProtocol public protocol;

    /// @notice Upper and lower bounds for collateral ratio (scaled by 1e18).
    uint256 public maxCollateralRatio;
    uint256 public minCollateralRatio;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event RiskActionExecuted(uint256 riskScore, uint256 newCollateralRatio, bool borrowingPaused);

    event ExecutorUpdated(address oldExecutor, address newExecutor);
    event BoundsUpdated(uint256 oldMin, uint256 oldMax, uint256 newMin, uint256 newMax);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyCRE() {
        require(msg.sender == creExecutor, "RiskGuard: not CRE");
        _;
    }

    // -------------------------------------------------------------------------
    // Construction
    // -------------------------------------------------------------------------

    constructor(address _creExecutor, address _protocol, uint256 _minCollateralRatio, uint256 _maxCollateralRatio) {
        require(_creExecutor != address(0), "RiskGuard: zero executor");
        require(_protocol != address(0), "RiskGuard: zero protocol");
        require(_minCollateralRatio <= _maxCollateralRatio, "RiskGuard: bad bounds");

        creExecutor = _creExecutor;
        protocol = LendingProtocol(_protocol);
        minCollateralRatio = _minCollateralRatio;
        maxCollateralRatio = _maxCollateralRatio;
    }

    // -------------------------------------------------------------------------
    // CRE-controlled actions
    // -------------------------------------------------------------------------

    /**
     * @notice Tighten or relax protocol collateralization requirements.
     * @dev CRE first computes a risk score offchain and maps it to a ratio
     *      within [minCollateralRatio, maxCollateralRatio].
     */
    function hardenProtocol(uint256 newRatio, uint256 riskScore) external onlyCRE {
        require(newRatio >= minCollateralRatio, "RiskGuard: ratio below min");
        require(newRatio <= maxCollateralRatio, "RiskGuard: ratio above max");

        protocol.updateCollateralRatio(newRatio);

        emit RiskActionExecuted(riskScore, newRatio, protocol.borrowingPaused());
    }

    /**
     * @notice Pause new borrowing when CRE classifies regime as CRISIS.
     */
    function pauseBorrowing(uint256 riskScore) external onlyCRE {
        protocol.setBorrowingPaused(true);
        emit RiskActionExecuted(riskScore, protocol.collateralRatio(), true);
    }

    /**
     * @notice Adjust interest rate slope as a softer risk control.
     */
    function adjustInterest(uint256 newSlope, uint256 riskScore) external onlyCRE {
        protocol.updateInterestSlope(newSlope);
        emit RiskActionExecuted(riskScore, protocol.collateralRatio(), protocol.borrowingPaused());
    }

    // -------------------------------------------------------------------------
    // Admin utilities
    // -------------------------------------------------------------------------

    /**
     * @notice Optionally rotate CRE executor (e.g., new CRE configuration).
     * @dev In a production deployment this would likely be governed.
     */
    function setExecutor(address newExecutor) external {
        // For simplicity of the hackathon prototype we allow the current executor
        // to rotate itself. This can be upgraded to a governance-controlled method.
        require(msg.sender == creExecutor, "RiskGuard: only current executor");
        require(newExecutor != address(0), "RiskGuard: zero executor");
        address old = creExecutor;
        creExecutor = newExecutor;
        emit ExecutorUpdated(old, newExecutor);
    }

    /**
     * @notice Optionally adjust allowable bounds for collateral ratio.
     */
    function setBounds(uint256 newMin, uint256 newMax) external {
        require(msg.sender == creExecutor, "RiskGuard: only executor");
        require(newMin <= newMax, "RiskGuard: bad bounds");

        uint256 oldMin = minCollateralRatio;
        uint256 oldMax = maxCollateralRatio;
        minCollateralRatio = newMin;
        maxCollateralRatio = newMax;

        emit BoundsUpdated(oldMin, oldMax, newMin, newMax);
    }
}

