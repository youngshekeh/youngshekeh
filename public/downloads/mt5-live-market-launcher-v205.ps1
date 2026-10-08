# THE FATHER ANALYTICS V205 · Read-only MT5 XAUUSD activation launcher
# Requires TFA_LIVE_BRIDGE_ID, TFA_LIVE_BRIDGE_KEY and TFA_MT5_SYMBOL in this PowerShell session.
# It never logs in to MT5 and contains no order-create, modify, close or cancel path.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Stop-V205([string]$Message) {
  Write-Host ("V205 BLOCKED · " + $Message) -ForegroundColor Red
  Write-Host "Orders OFF · Capital 0R"
  exit 2
}

if ($env:OS -ne "Windows_NT" -and -not $IsWindows) { Stop-V205 "Windows is required." }
if ([string]::IsNullOrWhiteSpace($env:TFA_LIVE_BRIDGE_ID)) { Stop-V205 "TFA_LIVE_BRIDGE_ID is missing." }
if ([string]::IsNullOrWhiteSpace($env:TFA_LIVE_BRIDGE_KEY)) { Stop-V205 "TFA_LIVE_BRIDGE_KEY is missing." }
if ([string]::IsNullOrWhiteSpace($env:TFA_MT5_SYMBOL)) { $env:TFA_MT5_SYMBOL = "XAUUSD" }
if ($env:TFA_MT5_SYMBOL -notmatch "^XAUUSD") { Stop-V205 "The configured symbol must begin with XAUUSD." }

$work = Join-Path $env:TEMP "tfa-gold-live"
New-Item -ItemType Directory -Force -Path $work | Out-Null
$doctor = Join-Path $work "mt5-live-market-doctor.py"
$relay = Join-Path $work "mt5-live-market-bridge.py"

Write-Host "V205 · Preparing read-only Gold relay..." -ForegroundColor Cyan
Invoke-WebRequest "https://thefatheranalytics.com/downloads/mt5-live-market-doctor.py" -OutFile $doctor
Invoke-WebRequest "https://thefatheranalytics.com/downloads/mt5-live-market-bridge.py" -OutFile $relay
python -m pip install MetaTrader5==5.0.6231
if ($LASTEXITCODE -ne 0) { Stop-V205 "MetaTrader5 Python package installation failed." }

Write-Host "STEP 1/4 · V201 local doctor" -ForegroundColor Cyan
python $doctor
if ($LASTEXITCODE -ne 0) { Stop-V205 "V201 prerequisite check failed. No tick was sent." }

Write-Host "STEP 2/4 · V200 one-shot XAUUSD smoke test" -ForegroundColor Cyan
python $relay --once
if ($LASTEXITCODE -ne 0) { Stop-V205 "The one-shot relay failed. Continuous mode was not started." }

Write-Host "STEP 3/4 · V204 first-tick confirmation" -ForegroundColor Cyan
$activation = $null
for ($i = 0; $i -lt 12; $i++) {
  Start-Sleep -Seconds 5
  try {
    $activation = Invoke-RestMethod "https://thefatheranalytics.com/api/gold-activation-orchestrator-v204"
    Write-Host ("V204 · " + $activation.state + " · gates " + $activation.phase.passed_gates + "/" + $activation.phase.total)
    if ($activation.gates.first_tick_accepted.pass -eq $true) { break }
  } catch {
    Write-Host "V204 check unavailable; retrying..."
  }
}
if ($null -eq $activation -or $activation.gates.first_tick_accepted.pass -ne $true) {
  Stop-V205 "V204 did not confirm the first accepted tick within 60 seconds."
}

Write-Host "STEP 4/4 · Continuous read-only streaming" -ForegroundColor Green
Write-Host "Keep this PowerShell window open. Ctrl+C stops the relay. Orders remain OFF."
$restartCount = 0
while ($restartCount -lt 5) {
  python $relay
  if ($LASTEXITCODE -eq 0) { break }
  $restartCount++
  Write-Host ("Relay exited unexpectedly. Restart " + $restartCount + "/5 in 5 seconds...") -ForegroundColor Yellow
  Start-Sleep -Seconds 5
}
if ($LASTEXITCODE -ne 0) { Stop-V205 "Relay stopped repeatedly. Re-run V201 diagnostics before trying again." }
