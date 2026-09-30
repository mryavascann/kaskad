import { Copy, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Button, ButtonArrow } from "@/design/ui/button";
import { ButtonLink } from "@/design/ui/button-link";
import { Disclosure } from "@/design/ui/disclosure";
import { Field } from "@/design/ui/field";
import { Input, addressInputProps } from "@/design/ui/input";
import { Label } from "@/design/ui/label";
import { DocBlock, DocSection, SpecGrid, Specimen } from "../_components/doc";
import {
  AddressCheckDemo,
  AdvancedSettingsDemo,
  BookSegmentedDemo,
  BookTabsDemo,
  BorrowerChipsDemo,
  ConfirmDialogDemo,
  DialogDemo,
  DisabledSliderDemo,
  DurationSliderDemo,
  OracleModeDemo,
  PoolDepthPopoverDemo,
  PopoverSurfacePreview,
  ResultTabsDemo,
  SearchClearDemo,
  SettingsPopoverDemo,
  ShockChipsDemo,
  ShockSliderDemo,
  SoundSwitchDemo,
  SwitchStatesDemo,
  TermDemo,
  ToneChipsDemo,
  TooltipDemo,
  TooltipSurfacePreview,
} from "./controls-demos";

/** A control with its state name underneath. `still`: a picture of a state (hover, focus), inert. */
function State({ name, still = false, children }: { name: string; still?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2.5">
      <div inert={still}>{children}</div>
      <Label>{name}</Label>
    </div>
  );
}

export function ControlsSection() {
  return (
    <DocSection
      id="controls"
      index="10"
      kicker="Components"
      title="Controls"
      description="Setting up a shock should feel like adjusting an instrument: precise, tactile, quiet. Every control has hover, press and focus states, works from the keyboard and keeps a 24px hit target (44px for touch-first actions)."
    >
      <DocBlock title="Button" note="One primary per view. Press feedback is a 2% scale, nothing under reduced motion.">
        <SpecGrid cols={2}>
          <Specimen label="Variants" meta={'variant="primary | secondary | ghost | alarm"'}>
            <Button variant="primary">Run the stress test</Button>
            <Button>Is my position safe?</Button>
            <Button variant="ghost">Reset</Button>
            <Button variant="alarm">Try to borrow</Button>
          </Specimen>
          <Specimen label="Sizes" meta={'size="sm | md | lg | icon"'}>
            <Button size="sm">Small</Button>
            <Button>Medium</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Copy link">
              <Copy />
            </Button>
          </Specimen>
          <Specimen label="States" meta="hover · focus-visible · disabled · loading" bodyClassName="gap-x-6 gap-y-5">
            <State name="Rest">
              <Button>Preview</Button>
            </State>
            <State name="Hover" still>
              <Button className="border-line-strong bg-elev-1">Preview</Button>
            </State>
            <State name="Focus" still>
              <Button className="outline-2 outline-offset-2 outline-monad-hi">Preview</Button>
            </State>
            <State name="Disabled">
              <Button disabled>Preview</Button>
            </State>
            <State name="Loading">
              <Button variant="primary" loading>
                Sending
              </Button>
            </State>
          </Specimen>
          <Specimen label="As a link" meta="<ButtonLink> · <ButtonArrow />">
            <ButtonLink href="/app" variant="primary">
              Open the console <ButtonArrow />
            </ButtonLink>
            <ButtonLink href="#overlays" variant="ghost">
              See overlays <ButtonArrow />
            </ButtonLink>
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Slider" note="Radix Slider. Arrows step, PageUp / PageDown step ×10, Home / End jump to the ends.">
        <Specimen
          label="Shock slider"
          meta="value · onValueChange · onValueCommit · toneForValue · ticks · majorEvery · marks · formatValue · showValue"
          bodyClassName="p-5 sm:p-8"
        >
          <ShockSliderDemo />
        </Specimen>
        <SpecGrid cols={2}>
          <Specimen label="Neutral, ticks only" meta={'tone="neutral" · ticks={20} · majorEvery={5}'} bodyClassName="p-5 sm:p-8">
            <DurationSliderDemo />
          </Specimen>
          <Specimen label="Disabled" meta="disabled" bodyClassName="p-5 sm:p-8">
            <DisabledSliderDemo />
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Segmented" note="Radio group: arrows move focus and selection together; the selection never clears.">
        <SpecGrid cols={2}>
          <Specimen label="Oracle mode, with descriptions" meta="options[{ value, label, description, icon }] · aria-label">
            <OracleModeDemo />
          </Specimen>
          <Specimen label="Small" meta={'size="sm"'}>
            <BookSegmentedDemo />
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Tabs" note="Underline slides with spring.soft (instant under reduced motion). Scrolls sideways on narrow screens.">
        <SpecGrid cols={2}>
          <Specimen label="Result views" meta="Tabs · TabsList · TabsTrigger · TabsContent" bodyClassName="items-start">
            <ResultTabsDemo />
          </Specimen>
          <Specimen label="With count" meta="<TabsTrigger count={n}>" bodyClassName="items-start">
            <BookTabsDemo />
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Switch" note={'role="switch" · the label is part of the hit area'}>
        <SpecGrid cols={2}>
          <Specimen label="Sound, off by default" meta="checked · onCheckedChange · label">
            <SoundSwitchDemo />
          </Specimen>
          <Specimen label="Sizes and states" meta={'size="sm | md" · disabled · aria-label'}>
            <SwitchStatesDemo />
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Chips" note="Toggle chips (aria-pressed) in a labelled group that wraps.">
        <SpecGrid cols={3}>
          <Specimen label="Shock presets" meta="mono · pressed · tone">
            <ShockChipsDemo />
          </Specimen>
          <Specimen label="Sample borrowers" meta={'size="md" · icon'}>
            <BorrowerChipsDemo />
          </Specimen>
          <Specimen label="Tones, multi-select" meta="tone · icon={toneIcon[tone]}">
            <ToneChipsDemo />
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Input and Field" note="Field wires id, aria-describedby and aria-invalid to its Input. Borders keep 3:1 contrast.">
        <SpecGrid cols={3}>
          <Specimen label="Default" meta="<Field label> · <Input mono leading>" bodyClassName="items-start">
            <Field label="Wallet address" className="w-full">
              <Input mono placeholder="0x…" leading={<Wallet />} {...addressInputProps} />
            </Field>
          </Specimen>
          <Specimen label="With hint" meta="hint → aria-describedby" bodyClassName="items-start">
            <Field label="Wallet address" hint="Any Monad address." className="w-full">
              <Input mono placeholder="0x…" leading={<Wallet />} {...addressInputProps} />
            </Field>
          </Specimen>
          <Specimen label="Invalid" meta="error → aria-invalid" bodyClassName="items-start">
            <Field label="Wallet address" error="Not a valid address" className="w-full">
              <Input mono defaultValue="0x12ab" leading={<Wallet />} {...addressInputProps} />
            </Field>
          </Specimen>
          <Specimen label="Disabled" meta="disabled" bodyClassName="items-start">
            <Field label="Wallet address" hint="Connect a wallet to fill this in." disabled className="w-full">
              <Input mono placeholder="0x…" leading={<Wallet />} {...addressInputProps} />
            </Field>
          </Specimen>
          <Specimen label="Sizes" meta={'size="sm | md | lg"'} bodyClassName="flex-col items-stretch gap-3">
            <Input size="sm" aria-label="Small input" placeholder="Small · 32px" />
            <Input aria-label="Medium input" placeholder="Medium · 44px" />
            <Input size="lg" aria-label="Large input" placeholder="Large · 52px" />
          </Specimen>
          <Specimen label="Trailing action" meta="trailing={<InputAction>}" bodyClassName="items-start">
            <SearchClearDemo />
          </Specimen>
        </SpecGrid>
        <Specimen label="Is my position safe?" meta="required · validation on blur · Paste / Clear · addressInputProps" bodyClassName="p-5 sm:p-8">
          <AddressCheckDemo />
        </Specimen>
      </DocBlock>
    </DocSection>
  );
}

export function OverlaysSection() {
  return (
    <DocSection
      id="overlays"
      index="11"
      kicker="Components"
      title="Overlays"
      description="Explanations and confirmations that float above the page. They open where the question is asked, close with Escape and hand focus back to where it was."
    >
      <DocBlock title="Tooltip" note="Hover or keyboard focus, 300ms delay. Labels icon-only buttons; never the only place for information.">
        <SpecGrid cols={2} className="lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Specimen label="Icon buttons, sides, shortcut" meta="<Tooltip content side> · <TooltipProvider> at the root">
            <TooltipDemo />
          </Specimen>
          <Specimen label="Open (picture)" meta="tooltipSurface" bodyClassName="justify-center">
            <TooltipSurfacePreview />
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Term" note="Inline jargon explainer: click, tap, Enter or Space; hover with a mouse. Escape returns focus.">
        <Specimen label="In a sentence" meta="<Term title description>children</Term>" bodyClassName="p-5 sm:p-8">
          <TermDemo />
        </Specimen>
      </DocBlock>

      <DocBlock title="Popover" note="Radix Popover on bg-elev-2, 22rem max. Arrow optional.">
        <SpecGrid cols={3}>
          <Specimen label="Readout with arrow" meta='arrow · side="bottom" · align="start"'>
            <PoolDepthPopoverDemo />
          </Specimen>
          <Specimen label="Controls inside" meta="<PopoverClose> · Switch">
            <SettingsPopoverDemo />
          </Specimen>
          <Specimen label="Open (picture)" meta="popoverSurface" bodyClassName="justify-center">
            <PopoverSurfacePreview />
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Dialog" note="Bottom sheet on phones, centered from 40rem. Focus is trapped and returns to the trigger.">
        <SpecGrid cols={2}>
          <Specimen label="Dialog" meta="DialogContent · DialogHeader · DialogTitle · DialogDescription · DialogFooter · DialogClose">
            <DialogDemo />
          </Specimen>
          <Specimen label="ConfirmDialog, for transactions of 1 MON or more" meta="open · onOpenChange · tone · onConfirm · busy">
            <ConfirmDialogDemo />
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Disclosure" note="Native details / summary: keyboard and find-in-page work without JavaScript.">
        <SpecGrid cols={2}>
          <Specimen label="Plain" meta="summary · children" bodyClassName="items-start">
            <Disclosure summary="How was this calculated?">
              <p className="max-w-md">
                Every borrower is replayed through the shock in one transaction: the price drops block by block, liquidators repay
                what they profitably can and sell the collateral into the pool, and whatever stays uncovered is bad debt.
              </p>
            </Disclosure>
          </Specimen>
          <Specimen label="Panel, mono summary" meta={'variant="panel" · mono'} bodyClassName="items-start">
            <AdvancedSettingsDemo />
          </Specimen>
        </SpecGrid>
      </DocBlock>
    </DocSection>
  );
}
