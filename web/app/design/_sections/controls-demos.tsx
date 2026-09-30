"use client";

import {
  ClipboardPaste,
  Copy,
  Database,
  Download,
  FlaskConical,
  Info,
  RotateCcw,
  Search,
  Share2,
  UserRound,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { DEPLOYMENT, UI_ASSETS } from "@/lib/kaskad/config";
import { cn } from "@/lib/utils";
import { Button, ButtonArrow } from "@/design/ui/button";
import { Chip, ChipGroup } from "@/design/ui/chip";
import { ConfirmDialog, Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/design/ui/dialog";
import { Disclosure } from "@/design/ui/disclosure";
import { Field } from "@/design/ui/field";
import { HonestyTag } from "@/design/ui/honesty";
import { Input, InputAction, addressInputProps } from "@/design/ui/input";
import { Kbd } from "@/design/ui/kbd";
import { Label } from "@/design/ui/label";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger, popoverSurface } from "@/design/ui/popover";
import { Segmented } from "@/design/ui/segmented";
import { Slider } from "@/design/ui/slider";
import { Switch } from "@/design/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/design/ui/tabs";
import { Term } from "@/design/ui/term";
import { toneIcon, toneText, type Tone } from "@/design/ui/tone";
import { Tooltip, TooltipProvider, tooltipSurface } from "@/design/ui/tooltip";

/* ── Shared sample data (real config values or obviously generic copy; no invented metrics) ── */

const SHOCK_PRESETS = [0.1, 0.5, 1, 3, 5, 10, 20, 30];
const percent = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
const shockText = (v: number) => `−${v.toFixed(1)}%`;
/** Visual intensity only: calm below 1 %, warn below 10 %, liq from 10 %. */
const shockTone = (v: number): Tone => (v < 1 ? "calm" : v < 10 ? "warn" : "liq");

const count = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const syrup = DEPLOYMENT.assets[9];
const isEthereumBook = (symbol: string) => symbol.includes("(Ethereum)");
const shortSymbol = (symbol: string) => symbol.replace("-8OCT2026", "").replace(" (Ethereum)", "");
const monadBooks = UI_ASSETS.filter((a) => !isEthereumBook(a.symbol));
const ethereumBooks = UI_ASSETS.filter((a) => isEthereumBook(a.symbol));

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Stand-in for a value the page fills in at runtime (never a made-up number). */
function Slot({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-tag border border-dashed border-line-strong px-1 font-mono text-fg-1">{`{${children}}`}</span>
  );
}

function Readout({ items }: { items: { term: string; value: ReactNode }[] }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1.5">
      {items.map(({ term, value }) => (
        <div key={term} className="flex items-baseline gap-2">
          <dt className="label-mono text-fg-3">{term}</dt>
          <dd className="font-mono text-caption text-fg-1">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Slider ── */

const SHOCK = { min: 0, max: 50, step: 0.1 } as const;

/** Keyboard map of the shock slider, derived from its own range and step. */
function SliderKeys() {
  const keys = [
    { caps: [["←", "Left arrow"], ["→", "Right arrow"]], effect: `${percent(SHOCK.step)} per step` },
    { caps: [["PgUp", "Page up"], ["PgDn", "Page down"]], effect: `${percent(SHOCK.step * 10)} per step` },
    { caps: [["Home", ""], ["End", ""]], effect: `${percent(SHOCK.min)} / ${percent(SHOCK.max)}` },
  ];
  return (
    <ul aria-label="Keyboard" className="flex flex-wrap gap-x-6 gap-y-2 text-caption text-fg-3">
      {keys.map(({ caps, effect }) => (
        <li key={effect} className="flex items-center gap-1.5">
          {caps.map(([cap, name]) => (
            <Kbd key={cap} size="sm" label={name || undefined}>
              {cap}
            </Kbd>
          ))}
          <span className="ml-1">{effect}</span>
        </li>
      ))}
    </ul>
  );
}

export function ShockSliderDemo() {
  const [shock, setShock] = useState(3);
  const [committed, setCommitted] = useState(3);
  const tone = shockTone(shock);
  return (
    <div className="flex w-full flex-col gap-4">
      <Slider
        label="Price drop"
        value={shock}
        onValueChange={setShock}
        onValueCommit={setCommitted}
        min={SHOCK.min}
        max={SHOCK.max}
        step={SHOCK.step}
        ticks={50}
        majorEvery={10}
        marks={SHOCK_PRESETS.map((v) => ({ value: v, label: percent(v) }))}
        marksLabel="Shock presets"
        formatValue={shockText}
        showValue
        toneForValue={shockTone}
      />
      <Readout
        items={[
          { term: "onValueChange", value: shockText(shock) },
          { term: "onValueCommit", value: shockText(committed) },
          { term: "tone", value: <span className={toneText[tone]}>{tone}</span> },
        ]}
      />
      <SliderKeys />
    </div>
  );
}

export function DurationSliderDemo() {
  const [blocks, setBlocks] = useState(20);
  return (
    <Slider
      className="w-full"
      label="Duration"
      value={blocks}
      onValueChange={setBlocks}
      min={1}
      max={100}
      step={1}
      ticks={20}
      majorEvery={5}
      tone="neutral"
      showValue
      formatValue={(v) => `${v} blocks`}
    />
  );
}

export function DisabledSliderDemo() {
  return (
    <Slider
      className="w-full"
      label="Waves per block"
      value={3}
      onValueChange={() => {}}
      min={1}
      max={20}
      ticks={19}
      showValue
      formatValue={(v) => `${v} waves`}
      disabled
    />
  );
}

/* ── Segmented ── */

const ORACLE_MODES = [
  { value: "external", label: "External price (Chainlink / rate)", description: "What Aave uses" },
  { value: "pool", label: "Pool spot price", description: "Worst case: oracle follows the pool" },
] as const;

export function OracleModeDemo() {
  const [mode, setMode] = useState<(typeof ORACLE_MODES)[number]["value"]>("external");
  return <Segmented className="w-full" aria-label="Oracle price source" options={ORACLE_MODES} value={mode} onValueChange={setMode} />;
}

export function BookSegmentedDemo() {
  const [book, setBook] = useState<"real" | "calibrated">("real");
  return (
    <Segmented
      size="sm"
      className="w-full max-w-sm"
      aria-label="Position book"
      value={book}
      onValueChange={setBook}
      options={[
        { value: "real", label: `Real · ${compact.format(syrup.realPositions)}`, icon: Database },
        { value: "calibrated", label: `Calibrated · ${compact.format(syrup.calibratedPositions)}`, icon: FlaskConical },
      ]}
    />
  );
}

/* ── Tabs ── */

function PanelPlaceholder({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-40 flex-col justify-between gap-6 rounded-panel border border-dashed border-line-2 bg-bg bg-grid p-5 [--grid-cell:24px]">
      <Label>Panel · {title}</Label>
      <p className="max-w-md text-body-sm text-fg-2">{children}</p>
    </div>
  );
}

export function ResultTabsDemo() {
  return (
    <Tabs defaultValue="monte-carlo" className="w-full">
      <TabsList aria-label="Result views">
        <TabsTrigger value="monte-carlo">Monte Carlo</TabsTrigger>
        <TabsTrigger value="stress-curve">Stress curve</TabsTrigger>
        <TabsTrigger value="two-networks">Two networks</TabsTrigger>
      </TabsList>
      <TabsContent value="monte-carlo">
        <PanelPlaceholder title="Monte Carlo">Many random shocks around the chosen one, and how bad debt spreads across them.</PanelPlaceholder>
      </TabsContent>
      <TabsContent value="stress-curve">
        <PanelPlaceholder title="Stress curve">Bad debt at each shock size, for both oracle modes.</PanelPlaceholder>
      </TabsContent>
      <TabsContent value="two-networks">
        <PanelPlaceholder title="Two networks">The same shock on Monad and on Ethereum, side by side.</PanelPlaceholder>
      </TabsContent>
    </Tabs>
  );
}

export function BookTabsDemo() {
  const books = [
    { value: "monad", label: "Monad", assets: monadBooks },
    { value: "ethereum", label: "Ethereum", assets: ethereumBooks },
  ];
  return (
    <Tabs defaultValue="monad" className="w-full">
      <TabsList aria-label="Books by network">
        {books.map((book) => (
          <TabsTrigger key={book.value} value={book.value} count={book.assets.length}>
            {book.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {books.map((book) => (
        <TabsContent key={book.value} value={book.value}>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 font-mono text-body-sm text-fg-2">
            {book.assets.map((asset) => (
              <li key={asset.id}>{shortSymbol(asset.symbol)}</li>
            ))}
          </ul>
        </TabsContent>
      ))}
    </Tabs>
  );
}

/* ── Switch ── */

export function SoundSwitchDemo() {
  const [sound, setSound] = useState(false);
  const Icon = sound ? Volume2 : VolumeX;
  return (
    <Switch
      checked={sound}
      onCheckedChange={setSound}
      label={
        <span className="inline-flex items-center gap-2">
          <Icon aria-hidden className="size-4 text-fg-3" />
          Sound
        </span>
      }
    />
  );
}

export function SwitchStatesDemo() {
  const sizes = [
    ["md", "Medium"],
    ["sm", "Small"],
  ] as const;
  return (
    <div className="grid grid-cols-[auto_repeat(3,minmax(0,max-content))] items-center gap-x-8 gap-y-4">
      <span />
      <Label>Off</Label>
      <Label>On</Label>
      <Label>Disabled</Label>
      {sizes.map(([size, name]) => (
        <Fragment key={size}>
          <Label>{size}</Label>
          <Switch size={size} aria-label={`${name}, off`} />
          <Switch size={size} aria-label={`${name}, on`} defaultChecked />
          <span className="flex items-center gap-3">
            <Switch size={size} aria-label={`${name}, disabled`} disabled />
            <Switch size={size} aria-label={`${name}, disabled and on`} disabled defaultChecked />
          </span>
        </Fragment>
      ))}
    </div>
  );
}

/* ── Chips ── */

export function ShockChipsDemo() {
  const [shock, setShock] = useState(3);
  return (
    <ChipGroup aria-label="Shock presets">
      {SHOCK_PRESETS.map((v) => (
        <Chip key={v} mono pressed={shock === v} tone={shockTone(v)} onClick={() => setShock(v)}>
          {percent(v)}
        </Chip>
      ))}
    </ChipGroup>
  );
}

const SAMPLE_BORROWERS = [
  "Largest syrupUSDC borrower",
  "Largest WETH borrower",
  "Closest to liquidation",
  "Largest PT-AUSD borrower",
];

export function BorrowerChipsDemo() {
  const [picked, setPicked] = useState(SAMPLE_BORROWERS[0]);
  return (
    <ChipGroup aria-label="Sample borrowers">
      {SAMPLE_BORROWERS.map((name) => (
        <Chip key={name} size="md" icon={UserRound} pressed={picked === name} onClick={() => setPicked(name)}>
          {name}
        </Chip>
      ))}
    </ChipGroup>
  );
}

const TONE_CHIPS: [Tone, string][] = [
  ["neutral", "Neutral"],
  ["calm", "Calm"],
  ["warn", "Warning"],
  ["liq", "Liquidation"],
  ["safe", "Safe"],
  ["monad", "Monad"],
];

export function ToneChipsDemo() {
  const [on, setOn] = useState<Set<Tone>>(() => new Set(["calm", "warn", "liq", "safe"]));
  const toggle = (tone: Tone) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(tone)) next.delete(tone);
      else next.add(tone);
      return next;
    });
  return (
    <ChipGroup aria-label="Filter by status">
      {TONE_CHIPS.map(([tone, name]) => (
        <Chip key={tone} tone={tone} icon={toneIcon[tone]} pressed={on.has(tone)} onClick={() => toggle(tone)}>
          {name}
        </Chip>
      ))}
    </ChipGroup>
  );
}

/* ── Input + Field ── */

export function AddressCheckDemo() {
  const [address, setAddress] = useState("");
  const [touched, setTouched] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = address.trim();
  const error = touched && trimmed && !ADDRESS.test(trimmed) ? "Not a valid address" : undefined;

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setAddress(text.trim());
      setTouched(true);
    } catch {
      inputRef.current?.focus();
    }
  };

  return (
    <form
      className="flex w-full flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        setChecked(ADDRESS.test(trimmed) ? trimmed : null);
      }}
    >
      <Field label="Wallet address" hint="Any Monad address. Checking it is a free eth_call; nothing is signed." error={error} required>
        <Input
          ref={inputRef}
          mono
          name="address"
          placeholder="0x…"
          leading={<Wallet />}
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            setChecked(null);
          }}
          onBlur={() => setTouched(Boolean(address))}
          {...addressInputProps}
          trailing={
            address ? (
              <InputAction
                aria-label="Clear address"
                onClick={() => {
                  setAddress("");
                  setTouched(false);
                  setChecked(null);
                  inputRef.current?.focus();
                }}
              >
                <X aria-hidden />
              </InputAction>
            ) : (
              <InputAction onClick={paste}>
                <ClipboardPaste aria-hidden />
                Paste
              </InputAction>
            )
          }
        />
      </Field>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" variant="primary">
          Is my position safe? <ButtonArrow />
        </Button>
        <p role="status" className="text-caption text-fg-3">
          {checked ? "Valid address. The page would now run the check (demo: nothing is sent)." : ""}
        </p>
      </div>
    </form>
  );
}

export function SearchClearDemo() {
  const [query, setQuery] = useState("syrupUSDC");
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Field label="Filter books" className="w-full">
      <Input
        ref={inputRef}
        type="search"
        leading={<Search />}
        placeholder="Symbol"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        trailing={
          query ? (
            <InputAction
              aria-label="Clear filter"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              <X aria-hidden />
            </InputAction>
          ) : undefined
        }
      />
    </Field>
  );
}

/* ── Tooltip ── */

export function TooltipDemo() {
  const actions = [
    { label: "Copy link", icon: Copy },
    { label: "Share result", icon: Share2 },
    { label: "Download CSV", icon: Download },
    { label: "Reset view", icon: RotateCcw },
  ];
  return (
    <TooltipProvider>
      <div className="flex flex-col items-start gap-6">
        <div role="toolbar" aria-label="Result actions" className="flex w-fit items-center gap-1 rounded-control border border-line-2 bg-bg p-1">
          {actions.map(({ label, icon: Icon }) => (
            <Tooltip key={label} content={label}>
              <Button variant="ghost" size="icon" aria-label={label} className="size-9">
                <Icon />
              </Button>
            </Tooltip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <Tooltip key={side} side={side} content={`Opens on the ${side}`}>
              <Button size="sm">{side}</Button>
            </Tooltip>
          ))}
          <Tooltip
            content={
              <span className="flex items-center gap-2">
                Toggle the layout grid
                <Kbd size="sm">G</Kbd>
              </span>
            }
          >
            <Button size="sm" variant="ghost">
              With a shortcut
            </Button>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ── Term ── */

export function TermDemo() {
  return (
    <p className="max-w-2xl text-lead text-fg-2">
      Kaskad walks every Aave borrower on Monad through the shock. A position whose{" "}
      <Term title="Health factor" description="Collateral value × liquidation threshold ÷ debt. Below 1.0, anyone may repay part of the debt and take collateral at a discount.">
        health factor
      </Term>{" "}
      falls below 1 can be liquidated; when the pool is too shallow to absorb the seized collateral, what is left becomes{" "}
      <Term title="Stuck debt" description="Debt that is already liquidatable but cannot be cleared right now, because the pool is too shallow to sell the collateral into.">
        stuck debt
      </Term>
      . Dragging the slider runs a free{" "}
      <Term
        title="eth_call"
        description="A read-only call that a node runs against the current chain state. It costs nothing and changes nothing; the same code can later run as a real transaction, as proof."
      >
        <code className="font-mono text-[0.92em]">eth_call</code>
      </Term>
      : nothing is signed or sent.
    </p>
  );
}

/* ── Popover ── */

/** Pool depth of syrupUSDC, straight from the deployment config. */
function PoolDepthReadout() {
  return (
    <>
      <div className="flex items-center justify-between gap-6">
        <Label>Pool depth · {syrup.symbol}</Label>
        <HonestyTag kind={syrup.depthIsAssumption ? "assumption" : "measured"} />
      </div>
      <p className="mt-2 font-mono text-metric-sm text-fg-1">{usdCompact.format(syrup.depthUsd)}</p>
      <p className="mt-3 text-caption text-fg-3">{syrup.depthNote}</p>
    </>
  );
}

export function PoolDepthPopoverDemo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm">
          <Info />
          Pool depth
        </Button>
      </PopoverTrigger>
      <PopoverContent arrow side="bottom" align="start" aria-label="Pool depth, syrupUSDC">
        <PoolDepthReadout />
      </PopoverContent>
    </Popover>
  );
}

/* Pictures of open states (not interactive), drawn with the components' own surface classes. */

export function TooltipSurfacePreview() {
  return (
    <div aria-hidden className="flex flex-col items-center gap-1.5">
      <span className={cn(tooltipSurface, "whitespace-nowrap")}>Copy link</span>
      <span className="grid size-9 place-items-center rounded-control bg-elev-2 text-fg-1 [&_svg]:size-4">
        <Copy />
      </span>
    </div>
  );
}

export function PopoverSurfacePreview() {
  return (
    <div aria-hidden className={cn(popoverSurface, "w-full max-w-88")}>
      <PoolDepthReadout />
    </div>
  );
}

export function SettingsPopoverDemo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost">
          Display settings
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72" aria-label="Display settings">
        <div className="flex items-center justify-between">
          <Label>Display</Label>
          <PopoverClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close" className="-m-2 size-8">
              <X />
            </Button>
          </PopoverClose>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <Switch label="Sound" className="w-full justify-between" />
          <Switch label="Show the layout grid" className="w-full justify-between" />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Dialog ── */

export function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>About this data</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <Label>Source</Label>
          <DialogTitle>Real positions, replayed on testnet</DialogTitle>
          <DialogDescription>
            Every borrower is read from Aave on Monad mainnet at one block and copied into the engine on Monad testnet, where the
            shock runs.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-panel border border-line bg-bg p-4">
          <dt className="label-mono text-fg-3">Read at block</dt>
          <dd className="font-mono text-body-sm text-fg-1">{count.format(DEPLOYMENT.source.block)}</dd>
          <dt className="label-mono text-fg-3">Borrowers</dt>
          <dd className="font-mono text-body-sm text-fg-1">{count.format(DEPLOYMENT.source.borrowersWithDebt)}</dd>
          <dt className="label-mono text-fg-3">Engine chain</dt>
          <dd className="font-mono text-body-sm text-fg-1">{DEPLOYMENT.chainId}</dd>
        </dl>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="primary">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialogDemo() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        variant="primary"
        onClick={() => {
          setStatus("");
          setOpen(true);
        }}
      >
        Prove on-chain <ButtonArrow />
      </Button>
      <p role="status" className="min-h-5 text-caption text-fg-3">
        {status}
      </p>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="warn"
        title="Send this transaction?"
        description={
          <>
            This transaction costs about <Slot>cost</Slot> MON on testnet; the sponsor pays.
          </>
        }
        confirmLabel="Send transaction"
        busy={busy}
        onConfirm={() => {
          setBusy(true);
          timer.current = setTimeout(() => {
            setBusy(false);
            setOpen(false);
            setStatus("Demo: confirmed, nothing was sent.");
          }, 1400);
        }}
      >
        <Readout
          items={[
            { term: "Network", value: `Monad testnet · ${DEPLOYMENT.chainId}` },
            { term: "Gas limit", value: <Slot>gasLimit</Slot> },
          ]}
        />
      </ConfirmDialog>
    </div>
  );
}

/* ── Disclosure ── */

export function AdvancedSettingsDemo() {
  const [blocks, setBlocks] = useState(20);
  const [waves, setWaves] = useState(3);
  return (
    <Disclosure variant="panel" mono summary="Advanced settings" className="w-full">
      <div className="flex flex-col gap-4">
        <Slider label="Duration" value={blocks} onValueChange={setBlocks} min={1} max={100} ticks={20} majorEvery={5} tone="neutral" showValue formatValue={(v) => `${v} blocks`} />
        <Slider label="Waves per block" value={waves} onValueChange={setWaves} min={1} max={20} ticks={19} tone="neutral" showValue formatValue={(v) => `${v} waves`} />
      </div>
    </Disclosure>
  );
}
