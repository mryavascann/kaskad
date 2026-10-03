// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {MockMarketV2} from "./MockMarketV2.sol";
import {RiskOracle} from "./RiskOracle.sol";

/// @title RiskVault: an ERC-4626 vault that moves out of a market when RiskOracle flags it
/// @notice Deposits are spread over the markets whose collateral RiskOracle does not flag. Anyone may
/// call `rebalance()`: it pulls everything out of flagged markets and spreads the idle balance evenly
/// over the others (all idle when every market is flagged). This is what the curators of the vaults
/// lending against xUSD could not do in November 2025: their oracle kept the collateral at par.
/// Withdrawals pull from idle first, then from the markets in order.
contract RiskVault is ERC4626, Ownable2Step {
    using SafeERC20 for IERC20;

    RiskOracle public immutable oracle;
    MockMarketV2[] internal _markets;
    /// @notice A report older than this is not trusted: its market is treated as flagged.
    uint32 public maxReportAge;

    event MarketAdded(address indexed market, uint16 collateralAssetId);
    event Pulled(address indexed market, uint16 collateralAssetId, uint256 amount);
    event Placed(address indexed market, uint16 collateralAssetId, uint256 amount);

    error WrongAsset();

    constructor(address owner_, IERC20 asset_, RiskOracle oracle_, uint32 maxReportAge_)
        ERC20("Kaskad Risk Vault kUSD", "rvkUSD")
        ERC4626(asset_)
        Ownable(owner_)
    {
        oracle = oracle_;
        maxReportAge = maxReportAge_;
    }

    function markets() external view returns (MockMarketV2[] memory) {
        return _markets;
    }

    function addMarket(MockMarketV2 market) external onlyOwner {
        if (address(market.asset()) != asset()) revert WrongAsset();
        _markets.push(market);
        IERC20(asset()).forceApprove(address(market), type(uint256).max);
        emit MarketAdded(address(market), market.collateralAssetId());
    }

    function setMaxReportAge(uint32 maxReportAge_) external onlyOwner {
        maxReportAge = maxReportAge_;
    }

    /// @notice Idle balance plus what the vault has deposited in each market.
    function totalAssets() public view override returns (uint256 total) {
        total = IERC20(asset()).balanceOf(address(this));
        for (uint256 i; i < _markets.length; ++i) {
            total += _markets[i].deposits(address(this));
        }
    }

    /// @notice Whether the vault keeps funds out of `market`: flagged by RiskOracle, or no fresh report.
    function flagged(MockMarketV2 market) public view returns (bool) {
        (bool atRisk,, uint64 published,,) = oracle.state(market.collateralAssetId());
        return atRisk || published == 0 || block.timestamp > uint256(published) + maxReportAge;
    }

    /// @notice Permissionless: out of flagged markets, idle spread evenly over the others.
    function rebalance() external {
        uint256 n = _markets.length;
        bool[] memory bad = new bool[](n);
        uint256 good;
        for (uint256 i; i < n; ++i) {
            MockMarketV2 m = _markets[i];
            bad[i] = flagged(m);
            if (!bad[i]) ++good;
            uint256 inside = m.deposits(address(this));
            if (bad[i] && inside > 0) {
                m.withdraw(inside);
                emit Pulled(address(m), m.collateralAssetId(), inside);
            }
        }
        if (good == 0) return;
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 share = idle / good;
        if (share == 0) return;
        for (uint256 i; i < n; ++i) {
            if (bad[i]) continue;
            _markets[i].deposit(share);
            emit Placed(address(_markets[i]), _markets[i].collateralAssetId(), share);
        }
    }

    /// @dev Pull from the markets in order until the idle balance covers the withdrawal.
    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
    {
        IERC20 token = IERC20(asset());
        uint256 idle = token.balanceOf(address(this));
        for (uint256 i; i < _markets.length && idle < assets; ++i) {
            uint256 inside = _markets[i].deposits(address(this));
            uint256 take = assets - idle < inside ? assets - idle : inside;
            if (take > 0) {
                _markets[i].withdraw(take);
                idle += take;
            }
        }
        super._withdraw(caller, receiver, owner_, assets, shares);
    }
}
