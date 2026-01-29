# VitalTrack - Fix Windows Firewall for Local Development
# Run as Administrator!

Write-Host "VitalTrack Network Fixer" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# 1. Check for Admin privileges
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: You must run this script as Administrator!" -ForegroundColor Red
    Write-Host "Right-click this file or your terminal and select 'Run as administrator'."
    exit
}

# 2. Add Firewall Rule
$RuleName = "VitalTrack-Backend-8000"
$Port = 8000

Write-Host "Checking Windows Firewall rules..."
$ExistingRule = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue

if ($ExistingRule) {
    Write-Host "✅ Firewall rule '$RuleName' already exists." -ForegroundColor Green
} else {
    Write-Host "Creating firewall rule to allow phone connection..."
    New-NetFirewallRule -DisplayName $RuleName `
                        -Direction Inbound `
                        -LocalPort $Port `
                        -Protocol TCP `
                        -Action Allow `
                        -Profile Private,Public `
                        -Description "Allow inbound access to VitalTrack Backend for mobile testing"
    Write-Host "✅ AND DONE! Firewall opened on Port $Port." -ForegroundColor Green
}

# 3. Verify IP
$IP = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "*Wi-Fi*" -ErrorAction SilentlyContinue).IPAddress
if (!$IP) {
    $IP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.InterfaceAlias -notlike "*vEthernet*" }).IPAddress | Select-Object -First 1
}

Write-Host ""
Write-Host "YOUR LOCAL IP IS: $IP" -ForegroundColor Yellow
Write-Host "Make sure vitaltrack-mobile/.env matches this IP!"

Write-Host ""
Write-Host "Press Enter to exit..."
Read-Host
