#!/usr/bin/env bash
# Report of numeric literals in UI code, grouped by file, for a human to review (brief section 9:
# "every number on screen comes from the chain or preview; no hardcoded numbers").
#
# Scans views/ shell/ viz/ three/ app/ i18n/messages/ (*.ts, *.tsx) and skips tests, fixtures, CSS and
# token files, app/design (the component showcase) and app/api (server routes, not UI). On each line it
# drops comments, imports, className/class strings and style-ish units, then reports the numbers left,
# except the obvious non-metrics: 0, 1, 2, 10, 100, 1000, 10_000 (bps math), 1e18-style scaling
# (10n ** 18n), hex, and CSS sizes (px, rem, ms, deg, vh, vw...). Percentages in copy ("3%") ARE reported. It is a review aid: expect
# false positives (animation timings, SVG geometry, array slots) and read them with the file.
#
# Usage: scripts/hardcoded-numbers.sh [--summary]   (run from web/ or anywhere inside it)
set -euo pipefail

cd "$(dirname "$0")/.."

DIRS=(views shell viz three app i18n/messages)
existing=()
for d in "${DIRS[@]}"; do [[ -d $d ]] && existing+=("$d"); done

list_files() {
  if command -v rg >/dev/null 2>&1 && rg --version >/dev/null 2>&1; then
    rg --files "${existing[@]}" -g '*.ts' -g '*.tsx'
  else
    find "${existing[@]}" -type f \( -name '*.ts' -o -name '*.tsx' \)
  fi
}

# Copy and page code first (where a literal is most likely a metric), then viz/ and three/, where most
# literals are geometry, easing and shader constants.
files=$(list_files |
  grep -Ev '\.(test|spec)\.tsx?$|/__fixtures__/|/fixtures?/|\.d\.ts$|(^|/)tokens?\.tsx?$|/tokens/|^app/design/|^app/api/' |
  awk '{ print (($0 ~ /^(viz|three)\//) ? "2" : "1") "\t" $0 }' | sort | cut -f2)

summary_only=0
[[ ${1:-} == "--summary" ]] && summary_only=1

# shellcheck disable=SC2086
printf '%s\n' $files | SUMMARY_ONLY=$summary_only perl -e '
use strict; use warnings;
my %ok = map { $_ => 1 } qw(0 1 2 10 100 1000 10000 10_000 1_000 0.5);
my $summary_only = $ENV{SUMMARY_ONLY};
my (%count, $total, $nfiles, $geo_banner);
while (my $file = <STDIN>) {
  chomp $file;
  open(my $fh, "<", $file) or next;
  my $in_block = 0; my @hits;
  while (my $line = <$fh>) {
    my $n = $.;
    my $s = $line;
    # Block comments (JSDoc and /* */), line comments, imports.
    if ($in_block) { if ($s =~ s{^.*?\*/}{}) { $in_block = 0 } else { next } }
    $s =~ s{/\*.*?\*/}{}g;
    if ($s =~ s{/\*.*$}{}) { $in_block = 1 }
    next if $s =~ /^\s*(import|export \* from|\*)/;
    next if $s =~ /export const (revalidate|runtime|dynamic|maxDuration)\b|max-age=/;   # framework config
    $s =~ s{(^|[^:"\x27`])//.*$}{$1};
    # className / class strings, template class lists, cn(...) string args, style units, hex, addresses.
    $s =~ s{class(Name)?=\{?(["\x27`]).*?\2\}?}{}g;
    $s =~ s{\b(cn|cva|clsx)\((.*)\)}{}g;
    $s =~ s{"[^"]*\b(?:[a-z]+-)+\[?[\d.]+[^"]*"}{""}g;      # "h-5 w-28", "size-4": tailwind utilities
    $s =~ s{\b0x[0-9a-fA-F]+\b}{}g;
    $s =~ s{#[0-9a-fA-F]{3,8}\b}{}g;
    $s =~ s{\b\d+(\.\d+)?(px|rem|em|ms|s|deg|vh|vw|dvh|svh|fr|ch|x)\b}{}g;
    $s =~ s{\b10n\s*\*\*\s*\d+n\b}{}g;
    $s =~ s{\b\d+e\d+\b}{}g;
    $s =~ s{\b(h[1-6]|x[12]|y[12]|r[xy]?|c[xy])\b}{}g;       # tag / svg attribute names
    my @nums;
    while ($s =~ /(?<![\w.\-\$#\[])(-?\d[\d_]*(?:\.\d+)?)n?(?![\w])/g) {
      my $v = $1; my $abs = $v; $abs =~ s/^-//;
      next if $ok{$abs};
      push @nums, $v;
    }
    next unless @nums;
    (my $text = $line) =~ s/^\s+|\s+$//g;
    $text = substr($text, 0, 140) . "…" if length($text) > 140;
    push @hits, sprintf("  %5d  [%s]  %s", $n, join(", ", @nums), $text);
    $count{$file} += scalar @nums; $total += scalar @nums;
  }
  close $fh;
  next unless @hits;
  $nfiles++;
  if (!$summary_only && !$geo_banner && $file =~ m{^(viz|three)/}) { $geo_banner = 1; print "\n\n######## viz/ and three/: mostly geometry, easing and shader constants ########\n"; }
  unless ($summary_only) { print "\n== $file (", scalar(@hits), " lines)\n", join("\n", @hits), "\n"; }
}
print "\n-- summary: ", ($total // 0), " literals in ", ($nfiles // 0), " files\n";
for my $f (sort { $count{$b} <=> $count{$a} || $a cmp $b } keys %count) { printf "  %4d  %s%s\n", $count{$f}, $f, ($f =~ m{^(viz|three)/} ? "  (geometry-heavy)" : ""); }
'
