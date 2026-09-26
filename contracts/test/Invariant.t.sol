// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Base} from "./Base.t.sol";
import {Kaskad} from "../src/Kaskad.sol";

/// @dev Random callers run random scenarios; ghost variables record any violation.
contract Handler is Test {
    Kaskad internal kaskad;
    uint32 internal n;

    uint256 public calls;
    uint256 public violations;
    uint256 public maxRoundsSeen;

    constructor(Kaskad k, uint32 n_) {
        kaskad = k;
        n = n_;
    }

    function simulate(uint256 actorSeed, uint16 shock, uint16 steps, uint16 rounds, uint32 positions, uint16 fb)
        external
    {
        fb = uint16(bound(fb, 0, 10_000));
        shock = uint16(bound(shock, 0, 10_000));
        steps = uint16(bound(steps, 1, 20));
        rounds = uint16(bound(rounds, 1, 20));
        positions = uint32(bound(positions, 1, n));
        address actor = address(uint160(bound(actorSeed, 1, 1000)));
        vm.prank(actor);
        (, Kaskad.Result memory r) = kaskad.simulate(Kaskad.Scenario(9, shock, steps, rounds, positions, fb));
        ++calls;
        if (r.totalLiquidated > r.totalDebt) ++violations;
        if (r.badDebt + r.stuckDebt > r.totalDebt) ++violations;
        if (r.finalPrice > r.startPrice) ++violations;
        if (r.rounds > uint256(steps) * rounds) ++violations;
        uint256 prev = r.startPrice;
        for (uint256 i; i < r.log.length; ++i) {
            if (r.log[i].priceWad > prev) ++violations;
            prev = r.log[i].priceWad;
        }
        if (r.rounds > maxRoundsSeen) maxRoundsSeen = r.rounds;
    }
}

contract KaskadInvariantTest is Base {
    Handler internal handler;
    bytes32 internal bookHash;
    uint32 internal constant N = 120;

    function setUp() public override {
        super.setUp();
        vm.prank(owner);
        kaskad.setAsset(SYRUP, 1e18, 20_000_000e18); // shallow pool: real cascades
        _loadSynthetic(SYRUP, N, 42);
        bookHash = _hash();
        handler = new Handler(kaskad, N);
        targetContract(address(handler));
    }

    function invariant_noViolations() public view {
        assertEq(handler.violations(), 0);
    }

    function invariant_bookUnchanged() public view {
        assertEq(_hash(), bookHash);
        assertEq(kaskad.bookLength(SYRUP), N);
    }

    function invariant_ownerUnchanged() public view {
        assertEq(kaskad.owner(), owner);
    }

    function _hash() internal view returns (bytes32 h) {
        for (uint256 i; i < N; ++i) {
            h = keccak256(abi.encode(h, kaskad.rawSlot(SYRUP, i)));
        }
    }
}
