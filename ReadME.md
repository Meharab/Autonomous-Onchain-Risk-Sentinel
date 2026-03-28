# Autonomous Risk Sentinel Protocol

A Chainlink CRE-powered system that continuously monitors protocol risk and automatically triggers defensive actions onchain.

The system connects:

- Monitors onchain DeFi protocol health (TVL, collateral ratio, oracle deviations)
- Pulls external market volatility data (CEX APIs)
- Runs risk analysis offchain
- Triggers protective actions automatically onchain

All orchestrated through Chainlink Runtime Environment workflows.



## System Overview

From the first principles, this system is a **closed-loop risk control framework** for a DeFi protocol; composed of three primary layers:

1. **Blockchain Layer** – Deterministic state machine and enforcement logic
2. **CRE Orchestration Layer** – Offchain risk computation and decision execution
3. **Execution Layer** – triggers onchain actions

First is the **Blockchain Layer**, where we have two smart contracts.

- `LendingProtocol` simulates a lending protocol with collateral deposits and borrowing.

- `RiskGuard` acts as the protocol’s defensive control module, capable of adjusting collateral requirements or pausing borrowing.

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

### Concrete Example Use Case

Let’s say we simulate:

- A lending protocol
- With collateral asset X
- If price volatility > threshold
- Or CEX price deviates from oracle price
- Or reserve ratio drops

Then automatically:

- Increase collateral ratio
- Pause new borrowing
- Trigger circuit breaker
- Notify governance



## High-Level Architecture Diagram

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
                    ┌────────────────────────┐
                    │  Blockchain Layer      │
                    │------------------------│
                    │  LendingProtocol.sol   │
                    │  RiskGuard.sol         │
                    └────────────────────────┘
```

In control theory terms:

* The lending protocol is the plant.
* Market signals are disturbances.
* CRE workflow is the controller.
* `RiskGuard` contract is the actuator.

We can decompose this into 3 domains:

1. Onchain execution layer
2. Offchain orchestration layer (CRE)
3. Data ingestion layer



## Blockchain Layer

The blockchain layer enforces state transitions and parameter changes.

It contains **two smart contracts**:

1. `LendingProtocol.sol`
2. `RiskGuard.sol`

### 1. `LendingProtocol.sol`

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

##### **i. Economic State**

```solidity
uint256 public totalCollateral;
uint256 public totalDebt;
```

These represent protocol-wide exposure.


##### **ii. Risk Parameters**

```solidity
uint256 public collateralRatio; // e.g., 150% scaled by 1e18
uint256 public interestSlope;   // interest rate slope parameter
bool public borrowingPaused;
```

These are dynamically adjustable.


##### **iii. Accounting**

```solidity
mapping(address => uint256) public collateralBalance;
mapping(address => uint256) public debtBalance;
```

Tracks user positions.


#### Core Functions

##### i. `deposit()`

Adds collateral.

Invariant:

```math
\Huge totalCollateral = \sum collateralBalance[i]
```


##### ii. `borrow(uint256 amount)`

Conditions:

```math
\Huge \frac{collateralBalance[user] \cdot P}{debtBalance[user] + amount}
\ge collateralRatio
```

Also:

```solidity
require(!borrowingPaused);
```


##### iii. `repay(uint256 amount)`

Reduces user debt and totalDebt.


##### iv. `liquidate(address user)`

Triggered when:

```math
\Huge \frac{C \cdot P}{B} < collateralRatio
```

For simplicity in hackathon (MVP) context, we simulate liquidation behavior.


#### Adjustable Functions (Callable Only by RiskGuard)
The important design decision:

Parameter changes must be externalized.

So instead of hardcoding:

```solidity
uint256 public liquidationThreshold = 150;
```

We allow:

```solidity
function updateCollateralRatio(uint256 newRatio)
```

But only callable by RiskGuard.

```solidity
function updateCollateralRatio(uint256 newRatio)
function updateInterestSlope(uint256 newSlope)
function setBorrowingPaused(bool state)
```

Access restricted.


#### Invariants

1. Collateral ratio always within bounds:

```math
\Huge 100\%\text{ (1e18) } \leq \text{collateralRatio} \leq 200\%\text{ (2e18) }
```

2. No borrowing when paused.

3. Utilization defined as:

```math
\Huge U = \frac{totalDebt}{totalCollateral}
```


#### Failure Modes

* Over-tightening ratio can freeze borrowing.
* Under-tightening during crisis causes liquidation cascades.

This is why control logic lives offchain.



### 2. `RiskGuard.sol`

#### Purpose

Acts as the enforcement gateway between CRE and LendingProtocol.

It prevents arbitrary manipulation while allowing controlled emergency response. This is the actuator.

Key properties:

* Has authority over protocol parameters
* Only CRE workflow executor can call it
* Emits structured events


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

#### Modifier

```solidity
modifier onlyCRE() {
    require(msg.sender == creExecutor);
}
```

This contract should be kept thin. It only forwards to `LendingProtocol`.


#### Security Model

CRE has authority, but:

* Ratio bounds enforced
* No arbitrary fund movement
* No user balance manipulation

RiskGuard is a **bounded actuator**.



## CRE Orchestration Layer

This is the intelligence layer. This is the core of the project. CRE becomes the risk engine.

CRE orchestrates:

1. Data fetching
2. Risk computation
3. Decision logic
4. Onchain transaction execution


### Workflow Components


#### Step 1: Onchain State Fetch

Fetch:

* Oracle price
* `totalCollateral`
* `totalDebt`
* `collateralRatio`
* `borrowingPaused`

Derived metric (**Utilization**):

```math
\Huge U = \frac{totalDebt}{totalCollateral}
```

Important design detail:

Normalized all data and kept everything in comparable scale.


#### Step 2: Offchain Data Fetch

**From APIs:**

* Binance ETH price
* 24h volatility
* Liquidity depth


#### Step 3: Risk Engine

Let:

- $P_{cex}$ = CEX price
- $P_{oracle}$ = Oracle price
- 𝑉 = Volatility index
- 𝑅 = Reserve ratio

**Compute:**

```math
\Huge D = \frac{|P_{cex} - P_{oracle}|}{P_{oracle}}
```

**Risk function:**
This must be deterministic. We define:

```math
\Huge \mathcal{R} = \alpha D + \beta V + \gamma U
```

Where:

* (D) = price deviation
* (V) = volatility (24h)
* (U) = utilization stress


#### Step 4: Regime Classification

Weights are constants. Thresholds:

Trigger if: **𝑅 > 𝜏**

Where **𝜏** is a threshold value

```bash
if R < 0.15 → NORMAL
if 0.15 <= R < 0.25 → STRESSED
if R >= 0.25 → CRISIS
```


#### Step 5: Action Mapping

MapPING regime → action.

| Regime   | Action                           |
| -------- | -------------------------------- |
| NORMAL   | No action                        |
| STRESSED | Increase collateral ratio        |
| CRISIS   | Increase ratio + pause borrowing |


#### Step 6: Execution

If action triggered:

CRE submits transaction to:

```solidity
RiskGuard.hardenProtocol(newRatio)
```

Or:

```solidity
RiskGuard.pauseBorrowing()
```

CRE logs:

* Input data
* Risk score
* Decision
* Tx hash

This creates verifiable execution trace. Transaction hash recorded.


### Determinism Property

Risk computation is pure and reproducible.

Given identical inputs:

```math
\Huge \mathcal{R}(t) = f(D,V,U)
```

Same output → same action.

This matters for verifiability.



## External Data Layer

This layer provides non-onchain signals.


### 1. Binance Price API (multiple CREXs)

Purpose:

- Detect early divergence before oracle updates.


### 2. Volatility Source (if API unavailable)

Can compute:

```math
\Huge V = \sqrt{\frac{1}{n} \sum (r_i - \bar{r})^2}
```

Where:

```math
\Huge r_i = \log\left(\frac{P_i}{P_{i-1}}\right)
```

Even simple rolling standard deviation is sufficient.


### 3. Liquidity Depth API (Optional but Powerful)

Measures how thin order books are.

Thin liquidity increases cascade probability.


## System-Wide Invariants

1. Collateral ratio bounded.
2. CRE cannot drain funds.
3. `BorrowingPaused` only toggled by RiskGuard.
4. Risk score only influences parameter updates not balances.


## Control Loop Behavior

We now formalize the closed-loop dynamic.

Let:

* $\lambda(t)$ = collateral ratio
* $\mathcal{R}(t)$ = risk score

We define policy:

```math
\Huge 
\lambda(t+1) =
\begin{cases}
\lambda(t) & \text{if } \mathcal{R} < \tau_1 ;\
\lambda(t) + \Delta_1 & \text{if } \tau_1 \le \mathcal{R} < \tau_2 ;\
\lambda(t) + \Delta_2 & \text{if } \mathcal{R} \ge \tau_2 ;\
\end{cases}
```

This is dynamic risk adaptation.

Traditional DeFi uses:

```math
\Huge 
\lambda = \text{constant}
```

This protocol uses:

```math
\Huge 
\lambda = f(\mathcal{R}(t))
```


## End-to-End Execution Example

### Normal Market

* D = 0.01
* V = 0.02
* U = 0.60

```math
\Huge \mathcal{R} = 0.08
```

No action.


### Crisis Scenario

* D = 0.12
* V = 0.15
* U = 0.85

```math
\Huge \mathcal{R} = 0.30
```

CRE:

1. Calls `hardenProtocol(170%)`
2. Calls `pauseBorrowing()`
3. Emits `RiskActionExecuted`

Visible on Tenderly.



## Security Considerations

We must restrict:

* Only whitelisted workflows can call RiskGuard
* No arbitrary parameter changes
* Hard-coded max bounds
* Avoid building a governance bypass nightmare.



## Failure Modes & Mitigations

We must anticipate issues.

### Case 1: API failure

CRE:

* Must fail safely
* If missing data → do nothing

### Case 2: Oracle glitch

We detect abnormal deviation, but require confirmation across 2 sources.

### Case 3 — Overreaction

We cap:

```solidity
maxCollateralRatio = 200%
```

Prevents runaway tightening.



## Architectural Strength

This design:

* Separates intelligence from enforcement
* Uses CRE as verifiable orchestration
* Keeps onchain logic minimal
* Provides measurable risk adaptation
* Demonstrates real-world financial engineering principles

This is **autonomous preventative stabilization logic**.



## How AI Can Be Used (Future)

Use AI for:

- Risk classification
- Anomaly detection
- Stress simulation

Example:

- Feed volatility + liquidity metrics
- LLM explains risk category
- Decision logic is still rule-based

This is autonomous. It is a **dynamic systemic risk controller**.
