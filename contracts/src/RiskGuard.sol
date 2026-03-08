// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
// Deployed Address on Sepolia Testnet: 0xa3b3B1afE42caFC83298a2F37BcE1D318a021626

import {LendingProtocol} from "./LendingProtocol.sol";
import {ReceiverTemplate} from "./interfaces/ReceiverTemplate.sol";

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
contract RiskGuard is ReceiverTemplate {
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

    /// @notice Constructor sets the Chainlink Forwarder address for security
    /// @param _forwarderAddress The address of the Chainlink KeystoneForwarder contract
    /// @dev For Sepolia testnet, use: 0x15fc6ae953e024d975e77382eeec56a9101f9f88
    constructor(address _creExecutor, address _protocol, uint256 _minCollateralRatio, uint256 _maxCollateralRatio, address _forwarderAddress) ReceiverTemplate(_forwarderAddress) {
        require(_creExecutor != address(0), "RiskGuard: zero executor");
        require(_protocol != address(0), "RiskGuard: zero protocol");
        require(_minCollateralRatio <= _maxCollateralRatio, "RiskGuard: bad bounds");

        creExecutor = _creExecutor; // 0x55F710a5509f4a8a8fE8a41dF476e51daD401454
        protocol = LendingProtocol(_protocol); // 0x07a5f52d58Ce686a628af8bBbC202c19240F460b
        minCollateralRatio = _minCollateralRatio; // 1500000000000000000 ~ 150%
        maxCollateralRatio = _maxCollateralRatio; // 2000000000000000000 ~ 200%
    }

    // ================================================================
    // │                      CRE Entry Point                         │
    // ================================================================

    /// @inheritdoc ReceiverTemplate
    /// @dev Routes to either pause borrowing or harden protocol & adjust interest based on risk score.
    ///      - risk score > 80 → Pause borrowing
    ///      - risk score <= 80 → Harden protocol & adjust interest
    function _processReport(bytes calldata report) internal override {
        (uint256 newRatio, uint256 riskScore, uint256 newSlope) = abi.decode(report, (uint256, uint256, uint256));
        if (riskScore > 80) {
             // In a real implementation, the risk score thresholds and corresponding actions
             // would be carefully calibrated based on the protocol's risk management framework.
             // For this hackathon prototype, we use a simple threshold for demonstration.
             pauseBorrowing(riskScore);
        } else {
             hardenProtocol(newRatio, riskScore);
             adjustInterest(newSlope, riskScore);
        }
    }

    // -------------------------------------------------------------------------
    // CRE-controlled actions
    // -------------------------------------------------------------------------

    /**
     * @notice Tighten or relax protocol collateralization requirements.
     * @dev CRE first computes a risk score offchain and maps it to a ratio
     *      within [minCollateralRatio, maxCollateralRatio].
     */
    function hardenProtocol(uint256 newRatio, uint256 riskScore) public onlyCRE {
        require(newRatio >= minCollateralRatio, "RiskGuard: ratio below min");
        require(newRatio <= maxCollateralRatio, "RiskGuard: ratio above max");

        protocol.updateCollateralRatio(newRatio);

        emit RiskActionExecuted(riskScore, newRatio, protocol.borrowingPaused());
    }

    /**
     * @notice Pause new borrowing when CRE classifies regime as CRISIS.
     */
    function pauseBorrowing(uint256 riskScore) public onlyCRE {
        protocol.setBorrowingPaused(true);
        emit RiskActionExecuted(riskScore, protocol.collateralRatio(), true);
    }

    /**
     * @notice Adjust interest rate slope as a softer risk control.
     */
    function adjustInterest(uint256 newSlope, uint256 riskScore) public onlyCRE {
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
    function setExecutor(address newExecutor) external onlyCRE {
        // For simplicity of the hackathon prototype we allow the current executor
        // to rotate itself. This can be upgraded to a governance-controlled method.
        require(newExecutor != address(0), "RiskGuard: zero executor");
        address old = creExecutor;
        creExecutor = newExecutor;
        emit ExecutorUpdated(old, newExecutor);
    }

    /**
     * @notice Optionally adjust allowable bounds for collateral ratio.
     */
    function setBounds(uint256 newMin, uint256 newMax) external onlyCRE{
        require(newMin <= newMax, "RiskGuard: bad bounds");

        uint256 oldMin = minCollateralRatio;
        uint256 oldMax = maxCollateralRatio;
        minCollateralRatio = newMin;
        maxCollateralRatio = newMax;

        emit BoundsUpdated(oldMin, oldMax, newMin, newMax);
    }
}

