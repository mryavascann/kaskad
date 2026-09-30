import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Wallet, X } from "lucide-react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Input, InputAction, addressInputProps } from "./input";

describe("Input", () => {
  it("renders a text input with mono text and a hidden leading icon", () => {
    render(<Input aria-label="Wallet address" mono leading={<Wallet data-testid="icon" />} placeholder="0x…" />);
    const input = screen.getByRole("textbox", { name: "Wallet address" });
    expect(input).toHaveClass("font-mono");
    expect(screen.getByTestId("icon").closest("[aria-hidden]")).toHaveAttribute("aria-hidden", "true");
  });

  it("sets aria-invalid and the liq border when invalid", () => {
    render(<Input aria-label="Wallet address" invalid />);
    const input = screen.getByRole("textbox", { name: "Wallet address" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.parentElement?.className).toContain("border-liq");
  });

  it("focuses the input when the shell padding or icon is clicked", async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Wallet address" leading={<Wallet data-testid="icon" />} />);
    await user.click(screen.getByTestId("icon"));
    expect(screen.getByRole("textbox", { name: "Wallet address" })).toHaveFocus();
  });

  it("hosts trailing actions that work from the keyboard", async () => {
    const user = userEvent.setup();
    function Clearable() {
      const [value, setValue] = useState("0x12ab");
      return (
        <Input
          aria-label="Wallet address"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          trailing={
            <InputAction aria-label="Clear address" onClick={() => setValue("")}>
              <X />
            </InputAction>
          }
        />
      );
    }
    render(<Clearable />);
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Clear address" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "Wallet address" })).toHaveValue("");
  });

  it("switches off spell check, autocorrect and autofill for addresses", () => {
    render(<Input aria-label="Wallet address" {...addressInputProps} />);
    const input = screen.getByRole("textbox", { name: "Wallet address" });
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("autocapitalize", "off");
    expect(input).toHaveAttribute("inputmode", "text");
  });

  it("puts className on the input and shellClassName on the shell", () => {
    render(<Input aria-label="Amount" className="text-right" shellClassName="max-w-40" size="sm" />);
    const input = screen.getByRole("textbox", { name: "Amount" });
    expect(input).toHaveClass("text-right");
    expect(input.parentElement).toHaveClass("max-w-40", "h-8");
  });
});
