// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Lending market stand-in for the RiskOracle demo: lenders (the vault) deposit and withdraw a
/// real ERC-20; borrowing is only recorded, so a paused market is visible (borrow reverts). Its loans
/// are backed by one collateral, `collateralAssetId` (a Kaskad book), which is what RiskOracle stresses.
contract MockMarketV2 is Ownable2Step {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    uint16 public immutable collateralAssetId;
    string public name;
    address public guard;
    bool public borrowPaused;
    uint16 public maxLtvBps;
    uint256 public totalBorrowed;
    uint256 public totalDeposits;
    mapping(address lender => uint256) public deposits;

    event GuardSet(address indexed guard);
    event BorrowPausedSet(bool paused, address indexed by);
    event MaxLtvSet(uint16 maxLtvBps, address indexed by);
    event Borrowed(address indexed borrower, uint256 amount);
    event Deposited(address indexed lender, uint256 amount);
    event Withdrawn(address indexed lender, uint256 amount);

    error BorrowIsPaused();
    error NotAuthorized();
    error InvalidLtv();
    error ZeroAmount();
    error InsufficientDeposit();

    modifier onlyGuardOrOwner() {
        if (msg.sender != guard && msg.sender != owner()) revert NotAuthorized();
        _;
    }

    constructor(address owner_, IERC20 asset_, uint16 collateralAssetId_, string memory name_, uint16 maxLtvBps_)
        Ownable(owner_)
    {
        if (maxLtvBps_ > 10_000) revert InvalidLtv();
        asset = asset_;
        collateralAssetId = collateralAssetId_;
        name = name_;
        maxLtvBps = maxLtvBps_;
    }

    function setGuard(address guard_) external onlyOwner {
        guard = guard_;
        emit GuardSet(guard_);
    }

    function setBorrowPaused(bool paused) external onlyGuardOrOwner {
        borrowPaused = paused;
        emit BorrowPausedSet(paused, msg.sender);
    }

    function setMaxLtv(uint16 maxLtvBps_) external onlyGuardOrOwner {
        if (maxLtvBps_ > 10_000) revert InvalidLtv();
        maxLtvBps = maxLtvBps_;
        emit MaxLtvSet(maxLtvBps_, msg.sender);
    }

    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        deposits[msg.sender] += amount;
        totalDeposits += amount;
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (amount > deposits[msg.sender]) revert InsufficientDeposit();
        deposits[msg.sender] -= amount;
        totalDeposits -= amount;
        asset.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function borrow(uint256 amount) external {
        if (borrowPaused) revert BorrowIsPaused();
        if (amount == 0) revert ZeroAmount();
        totalBorrowed += amount;
        emit Borrowed(msg.sender, amount);
    }
}
