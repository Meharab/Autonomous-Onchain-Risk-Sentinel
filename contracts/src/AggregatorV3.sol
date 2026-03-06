// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract AggregatorV3 {
  AggregatorV3Interface internal priceFeed;
  AggregatorV3Interface internal volatilityFeed;

  constructor(address _price, address _volatility) {
    priceFeed = AggregatorV3Interface(_price); // 0x694AA1769357215DE4FAC081bf1f309aDC325306
    volatilityFeed = AggregatorV3Interface(_volatility); // 0x31D04174D0e1643963b38d87f26b0675Bb7dC96e
  }

  function getETHUSDPrice() public view returns (int256) {
    (,int256 answer,,,) = priceFeed.latestRoundData();
    return answer;
  }

  function getETHUSDVolatility() public view returns (int256) {
    (,int256 answer,,,) = volatilityFeed.latestRoundData();
    return answer;
  }
}
