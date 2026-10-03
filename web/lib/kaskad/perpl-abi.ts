// Perpl Exchange (Monad mainnet 0x34B6…2a6F): the view functions the Perps risk panel reads.
// Trimmed from PerplFoundation/dex-sdk crates/sdk/abi/dex/Exchange.json (REVISION rc_v1.1.7-203-g0e5902dd).

export const perplExchangeAbi = [
  {
    "type": "function",
    "name": "getLiquidationInfo",
    "inputs": [
      {
        "name": "perpId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "liquidationInfo",
        "type": "tuple",
        "internalType": "struct LiquidationInfo",
        "components": [
          {
            "name": "liqInsAmtPer100K",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "liqUserAmtPer100K",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "liqProtocolAmtPer100K",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "btlPriceThreshPer100K",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "btlInsAmtPer100K",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "btlUserAmtPer100K",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "btlBuyerAmtPer100K",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "btlProtocolAmtPer100K",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "btlRestrictBuyers",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getMarginFractions",
    "inputs": [
      {
        "name": "perpId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lotLNS",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "perpInitMarginFracHdths",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "perpMaintMarginFracHdths",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "dynamicInitMarginFracHdths",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "oiMaxLNS",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "unityDescentThreshHdths",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "overColDescentThreshHdths",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPerpetualInfoV2",
    "inputs": [
      {
        "name": "perpId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "perpetualInfo",
        "type": "tuple",
        "internalType": "struct PerpetualInfoV2",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "symbol",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "priceDecimals",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lotDecimals",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "linkFeedId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "priceTolPer100K",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "marginTol",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "marginTolDecimals",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "refPriceMaxAgeSec",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "positionBalanceCNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "insuranceBalanceCNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "markPNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "markTimestamp",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lastPNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lastTimestamp",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "oraclePNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "oracleTimestampSec",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "longOpenInterestLNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "shortOpenInterestLNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fundingStartBlock",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fundingRatePct100k",
            "type": "int16",
            "internalType": "int16"
          },
          {
            "name": "absFundingClampPctPer100K",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum PerpStatusEnum"
          },
          {
            "name": "basePricePNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxBidPriceONS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minBidPriceONS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxAskPriceONS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minAskPriceONS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "numOrders",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "ignOracle",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "fundingSumScalingExp",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPositionsV2",
    "inputs": [
      {
        "name": "perpId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "pageStartPositionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "positionsPerPage",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "positions",
        "type": "tuple[]",
        "internalType": "struct PositionInfoV2[]",
        "components": [
          {
            "name": "accountId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "nextNodeId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "prevNodeId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "positionType",
            "type": "uint8",
            "internalType": "enum PositionEnum"
          },
          {
            "name": "depositCNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "pricePNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lotLNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "entryBlock",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "pnlCNS",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "deltaPnlCNS",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "premiumPnlCNS",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "priceResiduePNSQ16",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "numPositions",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "markPricePNS",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "markPriceValid",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  }
] as const;
