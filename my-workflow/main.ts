import {
  CronCapability,
  cre,
  HTTPClient,
  handler,
  consensusMedianAggregation,
  Runner,
  type NodeRuntime,
  type Runtime,
  getNetwork,
  LAST_FINALIZED_BLOCK_NUMBER,
  encodeCallMsg,
  bytesToHex,
  hexToBase64,
  TxStatus,
} from "@chainlink/cre-sdk"
import { encodeFunctionData, decodeFunctionResult, zeroAddress, parseAbiParameters, encodeAbiParameters } from "viem"
import { Oracle, LendingProtocol, RiskGuard } from "../contracts/abi"

// EvmConfig defines the configuration for a single EVM chain.
type EvmConfig = {
  chainName: string
  oracleAddress: string
  lendingProtocolAddress: string
  riskGuardAddress: string
  gasLimit: string
}

type Config = {
  schedule: string
  apiUrl: string
  evms: EvmConfig[]
}

type CEX = {
  price: bigint
}

const myAddress = "0x55F710a5509f4a8a8fE8a41dF476e51daD401454";

/** ABI parameters for settlement report (outcome is uint8 for Prediction enum) */
const Risk_PARAMS = parseAbiParameters("uint256 newRatio, uint256 riskScore, uint256 newSlope");

const initWorkflow = (config: Config) => {
  const cron = new CronCapability()

  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)]
}

// fetchCEXResult is the function passed to the runInNodeMode helper.
// It contains the logic for making the request and parsing the response.
// fetchCEXResult is the function passed to the runInNodeMode helper.
const fetchCEXResult = (nodeRuntime: NodeRuntime<Config>): bigint => {
  const httpClient = new HTTPClient()

  const req = {
    url: nodeRuntime.config.apiUrl,
    method: "GET" as const,
  }

  // Send the request using the HTTP client
  const resp = httpClient.sendRequest(nodeRuntime, req).result()

  // The Binance API returns the result as a raw string in the body.
  // We need to parse it into a bigint.
  const bodyText = new TextDecoder().decode(resp.body)
  const parsed = JSON.parse(bodyText);
  const priceString = parsed.price;          // "2150.97000000"
  const priceNumber = parseInt(priceString); // 2150
  nodeRuntime.log(`Fetched result from API: price is ${priceNumber} and raw response is ${bodyText.trim()}`)

  return BigInt(priceNumber)
}

const onCronTrigger = (runtime: Runtime<Config>): string => {
  runtime.log("Hello, Calculator! Workflow triggered.")
  // Use runInNodeMode to execute the offchain fetch.
  // The API returns the price of ETH/USDC, so each node can get a different result.
  // We use median consensus to find a single, trusted value.
  // Step 1: Fetch offchain data (from Part 2)
  const cexPrice = runtime.runInNodeMode(fetchCEXResult, consensusMedianAggregation())().result()

  runtime.log(`Successfully fetched and aggregated price result: ${cexPrice}`)

  // ---------------------------------------------------------------------------------------------------------

  // Get the first EVM configuration from the list.
  const evmConfig = runtime.config.evms[0]

  // Step 2: Read onchain data using the EVM client
  // Convert the human-readable chain name to a chain selector
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: evmConfig.chainName,
    isTestnet: true,
  })
  
  if (!network) {
    throw new Error(`Unknown chain name: ${evmConfig.chainName}`)
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)

  // ----------------------------------------------------------------------------------------------------------------

  // Encode the function call using the Oracle ABI
  const priceCallData = encodeFunctionData({
    abi: Oracle,
    functionName: "getETHUSDPrice",
  })

  // Call the contract
  const priceContractCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: evmConfig.oracleAddress as `0x${string}`,
        data: priceCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result()

  // Decode the result
  const oraclePrice = decodeFunctionResult({
    abi: Oracle,
    functionName: "getETHUSDPrice",
    data: bytesToHex(priceContractCall.data),
  }) as bigint

  runtime.log(`Successfully read onchain value: ${oraclePrice}`)

  // Step 3: Combine the results
  const D = Math.abs(Number(cexPrice - oraclePrice)) / Number(oraclePrice);
  runtime.log(`Final calculated result: ${D}`)

  // **********************************************************************

  // Encode the function call using the Oracle ABI
  const volatilityCallData = encodeFunctionData({
    abi: Oracle,
    functionName: "getETHUSDVolatility",
  })
  
  // Call the contract
  const volatilityContractCall = evmClient
  .callContract(runtime, {
    call: encodeCallMsg({
      from: zeroAddress,
      to: evmConfig.oracleAddress as `0x${string}`,
      data: volatilityCallData,
    }),
    blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
  })
  .result()
  
  // Decode the result
  const oracleVolatility = decodeFunctionResult({
    abi: Oracle,
    functionName: "getETHUSDVolatility",
    data: bytesToHex(volatilityContractCall.data),
  }) as bigint
  
  runtime.log(`Successfully read onchain value: ${oracleVolatility}`)
  
  const V = parseFloat(oracleVolatility.toString()) / 100000

  // ----------------------------------------------------------------------------------------------------------------
  
  // Encode the function call using the Oracle ABI
  const debtCallData = encodeFunctionData({
    abi: LendingProtocol,
    functionName: "debtBalance",
    args: [myAddress],
  })

  // Call the contract
  const debtContractCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: evmConfig.lendingProtocolAddress as `0x${string}`,
        data: debtCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result()

  // Decode the result
  const totalDebt = decodeFunctionResult({
    abi: LendingProtocol,
    functionName: "debtBalance",
    data: bytesToHex(debtContractCall.data),
  }) as bigint

  runtime.log(`Successfully read onchain value: ${totalDebt}`)

  // **********************************************************************************

  // Encode the function call using the Oracle ABI
  const collateralCallData = encodeFunctionData({
    abi: LendingProtocol,
    functionName: "collateralBalance",
    args: [myAddress],
  })

  // Call the contract
  const collateralContractCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: evmConfig.lendingProtocolAddress as `0x${string}`,
        data: collateralCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result()

  // Decode the result
  const totalCollateral = decodeFunctionResult({
    abi: LendingProtocol,
    functionName: "collateralBalance",
    data: bytesToHex(collateralContractCall.data),
  }) as bigint

  runtime.log(`Successfully read onchain value: ${totalCollateral}`)

  const U = parseFloat(totalCollateral.toString()) / parseFloat(totalDebt.toString())

  runtime.log(`Final calculated result: ${U}`)

  const R = ((0.5*D)+(0.3*V)+(0.2*U)) * 100

  runtime.log(`Final risk score: ${R}`)

  // -------------------------------------------------------------------------------------------------------
  if (R > 50) {
    runtime.log(`Risk score ${R} exceeds threshold, pausing borrowing...`)
    try {
      runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      runtime.log("CRE Workflow: Trigger - Risk Guard Intervention");
      runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      // ─────────────────────────────────────────────────────────────
      // Step 4: Write settlement report to contract (EVM Write)
      // ─────────────────────────────────────────────────────────────
      runtime.log("[Step 4] Generating settlement report...");

      // ─────────────────────────────────────────────────────────────
      // Step 3: Encode the market data for the smart contract
      // ─────────────────────────────────────────────────────────────
      runtime.log("[Step 3] Encoding market data...");

      // Encode report data
      const reportData = encodeAbiParameters(Risk_PARAMS, [
        BigInt(1500000000000000000), BigInt(Math.round(R)), BigInt(10000000000000000)
      ]);

      // ─────────────────────────────────────────────────────────────
      // Step 4: Generate a signed CRE report
      // ─────────────────────────────────────────────────────────────
      runtime.log("[Step 4] Generating CRE report...");

      const reportResponse = runtime
        .report({
          encodedPayload: hexToBase64(reportData),
          encoderName: "evm",
          signingAlgo: "ecdsa",
          hashingAlgo: "keccak256",
        })
        .result();

      // ─────────────────────────────────────────────────────────────
      // Step 5: Write the report to the smart contract
      // ─────────────────────────────────────────────────────────────
      runtime.log(`[Step 5] Writing to contract: ${evmConfig.riskGuardAddress}`);

      const writeResult = evmClient
        .writeReport(runtime, {
          receiver: evmConfig.riskGuardAddress,
          report: reportResponse,
          gasConfig: {
            gasLimit: evmConfig.gasLimit,
          },
        })
        .result();

      // ─────────────────────────────────────────────────────────────
      // Step 6: Check result and return transaction hash
      // ─────────────────────────────────────────────────────────────
      if (writeResult.txStatus === TxStatus.SUCCESS) {
        const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
        runtime.log(`[Step 6] ✓ Transaction successful: ${txHash}`);
        runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        return txHash;
      }

      throw new Error(`Transaction failed with status: ${writeResult.txStatus}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      runtime.log(`[ERROR] ${msg}`);
      runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      throw err;
    }
  } else {
    runtime.log(`Risk score ${R} is within acceptable range.`)
    return `Risk score ${R} is within acceptable range.`
  }
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
