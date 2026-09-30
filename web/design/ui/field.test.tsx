import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Field } from "./field";
import { Input } from "./input";

describe("Field", () => {
  it("labels its input", async () => {
    const user = userEvent.setup();
    render(
      <Field label="Wallet address">
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Wallet address" });
    await user.click(screen.getByText("Wallet address"));
    expect(input).toHaveFocus();
  });

  it("describes the input with its hint", () => {
    render(
      <Field label="Wallet address" hint="Any Monad address.">
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Wallet address" });
    expect(input).toHaveAccessibleDescription("Any Monad address.");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks the input invalid and adds the error to its description", () => {
    render(
      <Field label="Wallet address" hint="Any Monad address." error="Not a valid address">
        <Input defaultValue="0x12ab" />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Wallet address" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Any Monad address. Not a valid address");
    expect(screen.getByText("Not a valid address").closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
  });

  it("passes required and disabled to the input and shows the required word", () => {
    render(
      <Field label="Wallet address" required disabled>
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Wallet address" });
    expect(input).toBeRequired();
    expect(input).toBeDisabled();
    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  it("keeps the input's own id and aria-describedby", () => {
    render(
      <>
        <p id="network-note">Monad mainnet only.</p>
        <Field label="Wallet address" hint="Any Monad address." id="address">
          <Input aria-describedby="network-note" />
        </Field>
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Wallet address" });
    expect(input).toHaveAttribute("id", "address");
    expect(input).toHaveAccessibleDescription("Any Monad address. Monad mainnet only.");
  });
});
