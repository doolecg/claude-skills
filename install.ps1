# Adds the dooles-tools marketplace to Claude Code and installs its mods.
#   .\install.ps1                          everything
#   .\install.ps1 sidebar,bottom-bar             just those
# Safe to run again: it refreshes the marketplace and updates what's installed.
param([string[]] $Plugins)

$ErrorActionPreference = 'Stop'
$Market = 'dooles-tools'
$Repo = 'doolecg/dooles-tools'

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host 'Claude Code (claude) is not on PATH. Install it first: https://claude.com/claude-code' -ForegroundColor Red
    exit 1
}

$known = claude plugin marketplace list 2>$null | Out-String
if ($known -match [regex]::Escape($Market)) {
    Write-Host "Updating marketplace $Market..."
    claude plugin marketplace update $Market
} else {
    Write-Host "Adding marketplace $Repo..."
    claude plugin marketplace add $Repo
}
if ($LASTEXITCODE) { Write-Host 'Could not reach the marketplace. Is git signed in to GitHub?' -ForegroundColor Red; exit 1 }

if (-not $Plugins) {
    $manifest = Join-Path $PSScriptRoot '.claude-plugin\marketplace.json'
    if (-not (Test-Path $manifest)) { $manifest = Join-Path $env:USERPROFILE ".claude\plugins\marketplaces\$Market\.claude-plugin\marketplace.json" }
    $Plugins = (Get-Content $manifest -Raw | ConvertFrom-Json).plugins | ForEach-Object { $_.name }
}

$failed = @()
foreach ($p in $Plugins) {
    Write-Host "Installing $p..."
    claude plugin install "$p@$Market"
    if ($LASTEXITCODE) { $failed += $p }
}

Write-Host ''
if ($failed) { Write-Host "Failed: $($failed -join ', ')" -ForegroundColor Red; exit 1 }
Write-Host "Done. Restart Claude Code, then run /plugin to browse, enable or update them." -ForegroundColor Green
