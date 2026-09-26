// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Minimal lending market stand-in for the demo. No tokens move; it only records
/// borrows so a paused market is visible (borrow reverts).
contract MockMarket is Ownable2Step {
    string public name;
    address public guard;
    bool public borrowPaused;
    uint16 public maxLtvBps;
    uint256 public totalBorrowed;

    event GuardSet(address indexed guard);
    event BorrowPausedSet(bool paused, address indexed by);
    event MaxLtvSet(uint16 maxLtvBps, address indexed by);
    event Borrowed(address indexed borrower, uint256 amount);

    error BorrowIsPaused();
    error NotAuthorized();
    error InvalidLtv();
    error ZeroAmount();

    modifier onlyGuardOrOwner() {
        if (msg.sender != guard && msg.sender != owner()) revert NotAuthorized();
        _;
    }

    constructor(address owner_, string memory name_, uint16 maxLtvBps_) Ownable(owner_) {
        if (maxLtvBps_ > 10_000) revert InvalidLtv();
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

    function borrow(uint256 amount) external {
        if (borrowPaused) revert BorrowIsPaused();
        if (amount == 0) revert ZeroAmount();
        totalBorrowed += amount;
        emit Borrowed(msg.sender, amount);
    }
}
