import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OCT10 } from "@/lib/chain/oct10";
import { ReplayPage } from "./replay-page";

describe("ReplayPage", () => {
  it("states the night from our own reads, with the USDe oracle pin", () => {
    render(<ReplayPage locale="en" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("What Kaskad would have seen on 10 October.");
    expect(screen.getByText(/799 liquidations on Aave V3 Ethereum between 20:00 and 06:00 UTC, \$117\.4M/)).toBeInTheDocument();
    expect(screen.getByText(/\$4,010 before the fall, \$3,457 at 21:20 UTC, −13\.8%/)).toBeInTheDocument();
    expect(screen.getByText(/“Capped USDT\/USD”, at \$1\.0003 before the fall and at the low/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Chainlink ETH\/USD and debt liquidated/ })).toBeInTheDocument();
  });

  it("compares Kaskad with Aave and explains every difference", () => {
    render(<ReplayPage locale="en" />);
    const table = screen.getByRole("columnheader", { name: "Kaskad (predicted)" }).closest("table")!;
    expect(within(table).getByRole("row", { name: /Debt liquidated/ })).toHaveTextContent("$48.3M$26.9M");
    expect(within(table).getByRole("row", { name: /Positions liquidated/ })).toHaveTextContent("283158");
    expect(screen.getByText(/Kaskad predicted \$24\.5M against \$26\.9M that Aave actually liquidated: −9%/)).toBeInTheDocument();
    expect(screen.getByText(/121 positions Kaskad liquidates repaid debt or added collateral/)).toBeInTheDocument();
    expect(screen.getByText(/\(cbBTC, AAVE, LINK, WBTC, and stablecoins\)/)).toBeInTheDocument();
  });

  it("marks the night's drop on the shock curve and links the blocks", () => {
    render(<ReplayPage locale="en" />);
    const night = screen.getAllByRole("row").find((r) => r.getAttribute("aria-current") === "true")!;
    expect(night).toHaveTextContent("this night");
    expect(night).toHaveTextContent("$48.3M");
    expect(screen.getByRole("link", { name: /Book block on Etherscan/ })).toHaveAttribute("href", `https://etherscan.io/block/${OCT10.book.block}`);
    expect(screen.getByText(/20, 50 and 100 blocks all give \$48\.3M/)).toBeInTheDocument();
  });

  it("reads in Turkish with Turkish number formats", () => {
    render(<ReplayPage locale="tr" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Kaskad 10 Ekim'de neyi görürdü?");
    expect(screen.getByText(/Kendini koruyan pozisyonlar hariç Kaskad \$24,5M tahmin etti; Aave'nin gerçekte likide ettiği \$26,9M: −%9/)).toBeInTheDocument();
    expect(screen.getByText(/düşüşten önce de dipte de \$1,0003/)).toBeInTheDocument();
  });
});
