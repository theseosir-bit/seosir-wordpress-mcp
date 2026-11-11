# Seosir MCP - Windows-only, local development (loopback bound)
# The WordPress Application Password is read privately from the clipboard and used only for this process.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$mcpFolder = Join-Path $projectRoot 'mcp'
if (-not (Test-Path (Join-Path $mcpFolder 'package.json'))) {
  throw 'Cannot find mcp/package.json. Extract the full ZIP first.'
}
$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) {
  throw 'Node.js and npm not found. Install Node.js 22 LTS and open a new PowerShell window.'
}
if (-not (Test-Path (Join-Path $mcpFolder 'node_modules'))) {
  throw 'Dependencies not installed. Run: cd mcp; npm install; npm run typecheck; then launch this file again.'
}
# Fail before reading any credentials if TypeScript still does not compile.
Push-Location $mcpFolder
try {
  & npm.cmd run typecheck
  if ($LASTEXITCODE -ne 0) { throw 'TypeScript typecheck failed. Resolve the listed errors before launching MCP.' }
} finally { Pop-Location }
# Verified on the user's Windows setup: reading the copied Application Password
# from the clipboard works, while Read-Host -AsSecureString + paste returned empty.
# Copy the private, unexposed Application Password from WordPress immediately
# before launching this script. The password is never printed or saved to disk.
$rawClipboard = Get-Clipboard -Raw
if ([string]::IsNullOrWhiteSpace($rawClipboard)) {
  throw 'Clipboard is empty. Copy a private NEW Application Password from WordPress, then retry.'
}
$wpPassword = [regex]::Replace($rawClipboard, '[^A-Za-z0-9]', '')
Write-Host ('CLIENT normalized_password_length: ' + $wpPassword.Length)
if ($wpPassword.Length -ne 24) {
  $wpPassword = $null
  $rawClipboard = $null
  throw 'Expected 24 alphanumeric characters. Nothing was started.'
}
# Clear the sensitive clipboard before starting the long-running server.
try { Set-Clipboard -Value ' ' -ErrorAction Stop }
catch { Write-Warning 'Could not clear clipboard. Please clear it manually.' }
$rawClipboard = $null
$random = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($random) } finally { $rng.Dispose() }
$token = ([BitConverter]::ToString($random)).Replace('-', '').ToLowerInvariant()

$env:WP_URL = 'https://seosir.ir'
$env:WP_USERNAME = 'mcp-editor'
$env:WP_APPLICATION_PASSWORD = $wpPassword
$env:APP_ENV = 'development'
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
# Only an HTTPS metadata identifier during local development, NOT a reachable server.
$env:PUBLIC_MCP_URL = 'https://mcp.example.com/mcp'
$env:DEV_BEARER_TOKEN = $token
$env:ENABLE_ELEMENTOR_WRITES = 'false'
$wpPassword = $null

Write-Host ''
Write-Host 'LOCAL-ONLY MCP endpoint: http://127.0.0.1:3000/mcp'
Write-Host 'For MCP Inspector, use header:'
Write-Host ('Authorization: Bearer ' + $token)
Write-Host 'Do not send this token, the WordPress password, or screenshots with credentials to chat.'
Write-Host 'Keep this window open. Press Ctrl+C to stop the MCP server.'
Write-Host ''
try {
  Push-Location $mcpFolder
  & npm.cmd run dev
} finally {
  Pop-Location
  foreach($key in @('WP_APPLICATION_PASSWORD','DEV_BEARER_TOKEN','WP_URL','WP_USERNAME','APP_ENV','HOST','PORT','PUBLIC_MCP_URL','ENABLE_ELEMENTOR_WRITES')) {
    Remove-Item ("Env:\"+$key) -ErrorAction SilentlyContinue
  }
}
