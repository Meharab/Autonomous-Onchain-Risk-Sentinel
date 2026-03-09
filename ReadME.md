> # Architecture of the **Autonomous Risk Sentinel Protocol**.
A Chainlink CRE-powered system that continuously monitors protocol risk and automatically triggers defensive actions onchain.

The system connects:

- onchain protocol state
- offchain market data
- deterministic risk computation
- and automated protocol safeguards

All orchestrated through Chainlink Runtime Environment workflows.

## 0. System Overview

The system is a closed-loop risk control framework composed of three primary layers:

1. **Blockchain Layer** – Deterministic state machine and enforcement logic
2. **CRE Orchestration Layer** – Offchain risk computation and decision execution
3. **Execution Layer** – triggers onchain actions

First is the **Blockchain Layer**, where we have two smart contracts.

`LendingProtocol` simulates a lending protocol with collateral deposits and borrowing.

`RiskGuard` acts as the protocol’s defensive control module, capable of adjusting collateral requirements or pausing borrowing.

Second is the **CRE Orchestration Layer**, which continuously monitors the system.

The CRE workflow fetches:

- onchain protocol state
- external market data from APIs
- and oracle price feeds.

Then it computes a protocol risk score and decides whether the protocol needs to harden its defenses.

Finally, the **Execution Layer** triggers onchain actions through the RiskGuard contract.

The control loop is:

```bash
Observe → Quantify → Decide → Execute → Emit
```

## 1. High-Level Architecture Diagram

```bash
                    ┌──────────────────────┐
                    │   External Systems   │
                    │----------------------│
                    │  Binance API         │
                    │  Volatility API      │
                    │  Liquidity API       │
                    └──────────┬───────────┘
                               │
                               ▼
                   ┌───────────────────────┐
                   │   CRE Workflow        │
                   │-----------------------│
                   │  1. Fetch Offchain    │
                   │  2. Fetch Onchain     │
                   │  3. Compute Risk      │
                   │  4. Decision Engine   │
                   │  5. Submit Tx         │
                   └──────────┬────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────────┐
        │             Blockchain Layer             │
        │------------------------------------------│
        │  LendingProtocol.sol                     │
        │  RiskGuard.sol                           │
        └──────────────────────────────────────────┘
```

## 2. Blockchain Layer

The blockchain layer enforces state transitions and parameter changes.

It contains **two smart contracts**:

1. `LendingProtocol.sol`
2. `RiskGuard.sol`

### 2.1 `LendingProtocol.sol`

#### Purpose

A minimal lending protocol used to simulate collateralized borrowing.

It exposes adjustable risk parameters that can be dynamically modified by `RiskGuard`.


#### Core Responsibilities

* Manage deposits
* Manage borrowing
* Track utilization
* Enforce collateral constraints
* Expose adjustable parameters


#### State Variables

##### i. Economic State

```solidity
uint256 public totalCollateral;
uint256 public totalDebt;
```

These represent protocol-wide exposure.


##### ii. Risk Parameters

```solidity
uint256 public collateralRatio;        // e.g., 150% scaled by 1e18
uint256 public interestSlope;          // interest rate slope parameter
bool public borrowingPaused;
```

These are dynamically adjustable.


##### iii. Accounting

```solidity
mapping(address => uint256) public collateralBalance;
mapping(address => uint256) public debtBalance;
```

Tracks user positions.


#### Core Functions

##### i. `deposit()`

Adds collateral.

Invariant:

$$
\Huge totalCollateral = \sum collateralBalance[i]
$$


##### ii. `borrow(uint256 amount)`

Conditions:

$$
\Huge \frac{collateralBalance[user] \cdot P}{debtBalance[user] + amount}
\ge collateralRatio
$$

Also:

```solidity
require(!borrowingPaused);
```


##### iii. `repay(uint256 amount)`

Reduces user debt and totalDebt.


##### iv. `liquidate(address user)`

Triggered when:

$$
\Huge \frac{C \cdot P}{B} < collateralRatio
$$

For simplicity in hackathon context, we simulate liquidation behavior.


#### Adjustable Functions (Callable Only by RiskGuard)

```solidity
function updateCollateralRatio(uint256 newRatio)
function updateInterestSlope(uint256 newSlope)
function setBorrowingPaused(bool state)
```

Access restricted.


#### Invariants

1. Collateral ratio always within bounds:

$$
\Huge 100\text{ Percent (1e18) } \leq \text{collateralRatio} \leq 200\text{ Percent (2e18) }
$$

2. No borrowing when paused.

3. Utilization defined as:

$$
\Huge U = \frac{totalDebt}{totalCollateral}
$$


#### Failure Modes

* Over-tightening ratio can freeze borrowing.
* Under-tightening during crisis causes liquidation cascades.

This is why control logic lives offchain.



### 2.2 `RiskGuard.sol`

#### Purpose

Acts as the enforcement gateway between CRE and LendingProtocol.

It prevents arbitrary manipulation while allowing controlled emergency response.


#### Responsibilities

* Receive risk mitigation instructions
* Validate bounds
* Forward updates to LendingProtocol
* Emit risk events


#### State Variables

```solidity
address public creExecutor;
LendingProtocol public protocol;
uint256 public maxCollateralRatio;
uint256 public minCollateralRatio;
```


#### Core Functions

##### i. `hardenProtocol(uint256 newRatio)`

Checks:

```solidity
require(msg.sender == creExecutor);
require(newRatio <= maxCollateralRatio);
require(newRatio >= minCollateralRatio);
```

Then:

```solidity
protocol.updateCollateralRatio(newRatio);
```


##### ii. `pauseBorrowing()`

Calls:

```solidity
protocol.setBorrowingPaused(true);
```


##### iii. `adjustInterest(uint256 newSlope)`

For dynamic rate hardening.


#### Events

```solidity
event RiskActionExecuted(
    uint256 riskScore,
    uint256 newCollateralRatio,
    bool borrowingPaused
);
```

This is critical for demo traceability.


#### Security Model

CRE has authority, but:

* Ratio bounds enforced
* No arbitrary fund movement
* No user balance manipulation

RiskGuard is a **bounded actuator**.



## 3. CRE Orchestration Layer

This is the intelligence layer.

CRE orchestrates:

1. Data fetching
2. Risk computation
3. Decision logic
4. Onchain transaction execution


### 3.1 Workflow Components


#### Step 1 — Onchain State Fetch

Fetch:

* Oracle price
* totalCollateral
* totalDebt
* collateralRatio
* borrowingPaused

Derived metric:

$$
\Huge U = \frac{totalDebt}{totalCollateral}
$$


#### Step 2 — Offchain Data Fetch

From APIs:

* Binance ETH price
* 24h volatility
* Liquidity depth


#### Step 3 — Risk Engine

Compute:

$$
\Huge D = \frac{|P_{cex} - P_{oracle}|}{P_{oracle}}
$$

$$
\Huge \mathcal{R} = \alpha D + \beta V + \gamma U
$$

Where:

* (D) = price deviation
* (V) = volatility
* (U) = utilization


#### Step 4 — Regime Classification

```bash
if R < 0.15 → NORMAL
if 0.15 <= R < 0.25 → STRESSED
if R >= 0.25 → CRISIS
```


#### Step 5 — Action Mapping

| Regime   | Action                           |
| -------- | -------------------------------- |
| NORMAL   | No action                        |
| STRESSED | Increase collateral ratio        |
| CRISIS   | Increase ratio + pause borrowing |


#### Step 6 — Execution

CRE submits transaction to:

```solidity
RiskGuard.hardenProtocol(...)
RiskGuard.pauseBorrowing()
```

Transaction hash recorded.


### Determinism Property

Risk computation is pure and reproducible.

Given identical inputs:

$$
\Huge \mathcal{R}(t) = f(D,V,U)
$$

Same output → same action.

This matters for verifiability.



## 4. External Data Layer

This layer provides non-onchain signals.


### 4.1 Binance Price API

Purpose:

Detect early divergence before oracle updates.


### 4.2 Volatility Source

Can compute:

$$
\Huge V = \sqrt{\frac{1}{n} \sum (r_i - \bar{r})^2}
$$

Where:

$$
\Huge r_i = \log\left(\frac{P_i}{P_{i-1}}\right)
$$

Even simple rolling standard deviation is sufficient.


### 4.3 Liquidity Depth API

Optional but powerful.

Measures how thin order books are.

Thin liquidity increases cascade probability.


## 5. System-Wide Invariants

1. Collateral ratio bounded.
2. CRE cannot drain funds.
3. BorrowingPaused only toggled by RiskGuard.
4. Risk score only influences parameter updates — not balances.


## 6. End-to-End Execution Example

### Normal Market

* D = 0.01
* V = 0.02
* U = 0.60

$$
\Huge \mathcal{R} = 0.08
$$

No action.


### Crisis Scenario

* D = 0.12
* V = 0.15
* U = 0.85

$$
\Huge \mathcal{R} = 0.30
$$

CRE:

1. Calls hardenProtocol(170%)
2. Calls pauseBorrowing()
3. Emits RiskActionExecuted

Visible on Tenderly.



## 7. Architectural Strength

This design:

* Separates intelligence from enforcement
* Uses CRE as verifiable orchestration
* Keeps onchain logic minimal
* Provides measurable risk adaptation
* Demonstrates real-world financial engineering principles

This is autonomous.

It is a **dynamic systemic risk controller**.
