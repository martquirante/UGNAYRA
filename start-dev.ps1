# UGNAYRA — Local Development Launcher (PowerShell)
$ErrorActionPreference = 'Stop'

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  UGNAYRA — School-Based Social Networking Platform" -ForegroundColor Yellow
Write-Host "  Starting Local Development Environment..." -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Resolve PHP executable (prefer PATH PHP 8.2+, fallback to XAMPP PHP)
$phpCmd = Get-Command php -ErrorAction SilentlyContinue
if ($phpCmd) {
    $phpExe = $phpCmd.Source
} elseif (Test-Path 'C:\xampp\php\php.exe') {
    $phpExe = 'C:\xampp\php\php.exe'
} else {
    Write-Host "[ERROR] PHP executable not found on PATH or C:\xampp\php\php.exe." -ForegroundColor Red
    exit 1
}

$phpDir = Split-Path -Parent $phpExe
$loadedMods = & $phpExe -m 2>$null
$extArgs = @("-d `"extension_dir=$phpDir\ext`"")
foreach ($ext in @('openssl', 'mbstring', 'curl', 'fileinfo', 'pdo_pgsql')) {
    if ($loadedMods -notcontains $ext) {
        $extArgs += "-d extension=$ext"
    }
}
$extArgString = $extArgs -join ' '

# 1. Start Backend on http://127.0.0.1:8080
Write-Host "[1/2] Starting PHP REST API Backend on http://127.0.0.1:8080 ..." -ForegroundColor Green
Write-Host "      Using PHP: $phpExe" -ForegroundColor DarkGray
$backendCmd = "Set-Location '$baseDir'; & '$phpExe' $extArgString -S 127.0.0.1:8080 -t backend/public backend/public/index.php"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

# 2. Start Frontend on http://127.0.0.1:3000 (Clean SPA URLs without '#')
Write-Host "[2/2] Starting Frontend SPA Web Server on http://127.0.0.1:3000 ..." -ForegroundColor Green
$frontendCmd = "Set-Location '$baseDir'; python scripts/spa-server.py 3000 frontend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

# 3. Launch Browser
Start-Sleep -Seconds 2
Write-Host "Opening UGNAYRA at http://127.0.0.1:3000 ..." -ForegroundColor Yellow
Start-Process "http://127.0.0.1:3000"

Write-Host ""
Write-Host "UGNAYRA is live!" -ForegroundColor Green
Write-Host "- Frontend:    http://127.0.0.1:3000"
Write-Host "- Backend API: http://127.0.0.1:8080/api/v1/health"
Write-Host ""
Write-Host "Demo Credentials (after running database/schema.sql + seeders in Supabase):"
Write-Host "- Student:   student1@school.edu   / Ugnayra@2026!"
Write-Host "- Teacher:   teacher1@school.edu   / Ugnayra@2026!"
Write-Host "- Personnel: personnel1@school.edu / Ugnayra@2026!"
