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
} from "@chainlink/cre-sdk"
import { encodeFunctionData, decodeFunctionResult, zeroAddress } from "viem"
import { Oracle } from "../contracts/abi"

// EvmConfig defines the configuration for a single EVM chain.
type EvmConfig = {
  oracleAddress: string
  chainName: string
}

type Config = {
  schedule: string
  apiUrl: string
  evms: EvmConfig[]
}

type CEX = {
  price: bigint
}

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

const onCronTrigger = (runtime: Runtime<Config>): number => {
  runtime.log("Hello, Calculator! Workflow triggered.")
  // Use runInNodeMode to execute the offchain fetch.
  // The API returns the price of ETH/USDC, so each node can get a different result.
  // We use median consensus to find a single, trusted value.
  // Step 1: Fetch offchain data (from Part 2)
  const cexPrice = runtime.runInNodeMode(fetchCEXResult, consensusMedianAggregation())().result()

  runtime.log(`Successfully fetched and aggregated price result: ${cexPrice}`)

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

  // Encode the function call using the Oracle ABI
  const _volatilityCallData = encodeFunctionData({
    abi: Oracle,
    functionName: "getETHUSDVolatility",
  })

  // Call the contract
  const volatilityContractCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: evmConfig.oracleAddress as `0x${string}`,
        data: _volatilityCallData,
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
  return ((0.5*D)+(0.5*V))
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
