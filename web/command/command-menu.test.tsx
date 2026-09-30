import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commonMessages } from "@/i18n/messages/common";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/guard" }));

const { CommandMenu, CommandMenuButton, isCommandMenuShortcut, useCommandMenu } = await import("./command-menu");

const ADDRESS = "0x4A9B8E0fC2D16B1D5b6A5e2F1b1C3c1dF0E1a2B3";

function Harness({ locale = "en" as const }: { locale?: "en" | "tr" }) {
  const t = commonMessages[locale];
  const menu = useCommandMenu();
  return (
    <>
      <CommandMenuButton t={t.command} onOpen={menu.openMenu} />
      <CommandMenu
        mounted={menu.mounted}
        open={menu.open}
        onOpenChange={menu.setOpen}
        locale={locale}
        t={t}
        pathname={locale === "en" ? "/guard" : "/tr/guard"}
        currentRoute="guard"
      />
    </>
  );
}

beforeEach(() => push.mockReset());

describe("isCommandMenuShortcut", () => {
  it("accepts ⌘K and Ctrl+K only", () => {
    const base = { key: "k", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    expect(isCommandMenuShortcut({ ...base, metaKey: true })).toBe(true);
    expect(isCommandMenuShortcut({ ...base, ctrlKey: true, key: "K" })).toBe(true);
    expect(isCommandMenuShortcut(base)).toBe(false);
    expect(isCommandMenuShortcut({ ...base, ctrlKey: true, shiftKey: true })).toBe(false);
    expect(isCommandMenuShortcut({ ...base, ctrlKey: true, key: "j" })).toBe(false);
  });
});

describe("CommandMenu", () => {
  it("does not load the dialog until it is opened", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search pages, scenarios and addresses" })).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("opens with Ctrl+K as a named dialog with the search field focused, and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Command menu" });
    const input = within(dialog).getByRole("combobox");
    await waitFor(() => expect(input).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows pages, scenarios and language groups", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Search pages/ }));
    const dialog = await screen.findByRole("dialog");
    for (const name of ["Pages", "Scenarios", "Language"]) expect(within(dialog).getByRole("group", { name })).toBeInTheDocument();
    expect(within(dialog).queryByRole("group", { name: "Address lookup" })).not.toBeInTheDocument();
    const pages = within(within(dialog).getByRole("group", { name: "Pages" })).getAllByRole("option");
    expect(pages.map((o) => o.textContent)).toEqual(["Home", "Console", "Is my position safe?", "Guard", "How it works"]);
  });

  it("navigates to the chosen page and closes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Search pages/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("option", { name: "How it works" }));
    expect(push).toHaveBeenCalledWith("/how-it-works");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("sends a scenario to the console with ?preset=", async () => {
    const user = userEvent.setup();
    render(<Harness locale="tr" />);
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Komut menüsü" });
    const first = within(within(dialog).getByRole("group", { name: "Senaryolar" })).getAllByRole("option")[0];
    await user.click(first);
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/tr\/app\?preset=[a-z-]+$/));
  });

  it("offers a position check only for a valid address", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByRole("combobox");

    await user.type(input, "0x12ab");
    const group = within(dialog).getByRole("group", { name: "Address lookup" });
    expect(within(group).getByRole("option")).toHaveAttribute("aria-disabled", "true");

    await user.clear(input);
    await user.type(input, ADDRESS);
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith(`/wallet?address=${ADDRESS}`);
  });

  it("switches to the same page in the other language", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard("{Meta>}k{/Meta}");
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("option", { name: /Switch to Turkish/ }));
    expect(push).toHaveBeenCalledWith("/tr/guard");
  });
});
