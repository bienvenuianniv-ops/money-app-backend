# =========================
# money_app API helpers (PowerShell)
# Save as: .\scripts\api-test.ps1
# Usage:
#   . .\scripts\api-test.ps1     # (dot-source) charge les fonctions dans la session courante
#   Login-User "770000000" "1234"
#   $dst = Login-User "772222222" "1234"
#   $toWalletId = Get-WalletId $dst.token
#   Do-Transfer -Token $global:tokenSrc -ToWalletId $toWalletId -Amount 1500 -Fee 0
#   Replay-LastTransfer
# =========================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Base URL
$global:BASE = "http://localhost:4000"

# Stockage session (dans la même fenêtre)
$global:tokenSrc = $null
$global:last = [ordered]@{
  idemKey    = $null
  body       = $null
  toWalletId = $null
  amount     = $null
  fee        = $null
}

function Invoke-Api {
  param(
    [Parameter(Mandatory=$true)][ValidateSet("GET","POST","PUT","PATCH","DELETE")] [string]$Method,
    [Parameter(Mandatory=$true)] [string]$Path,
    [hashtable]$Headers = @{},
    [string]$Body = $null
  )

  $uri = $global:BASE + $Path

  try {
    if ($null -ne $Body) {
      return Invoke-WebRequest -Method $Method -Uri $uri -Headers $Headers -ContentType "application/json" -Body $Body -UseBasicParsing
    } else {
      return Invoke-WebRequest -Method $Method -Uri $uri -Headers $Headers -UseBasicParsing
    }
  } catch {
    $resp = $_.Exception.Response
    if ($null -eq $resp) { throw }

    $status = [int]$resp.StatusCode
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $text = $reader.ReadToEnd()
    $reader.Close()

    # Retour "façon curl" mais propre
    return [pscustomobject]@{
      StatusCode = $status
      Content    = $text
      Headers    = @{}
    }
  }
}

function Login-User {
  param(
    [Parameter(Mandatory=$true)][string]$Phone,
    [Parameter(Mandatory=$true)][string]$Pin,
    [switch]$AsSource
  )

  $body = ('{"phone":"' + $Phone + '","pin":"' + $Pin + '"}')
  $r = Invoke-Api -Method POST -Path "/auth/login" -Headers @{} -Body $body

  $json = $null
  try { $json = $r.Content | ConvertFrom-Json } catch { $json = $null }

  if ($r.StatusCode -ne 200 -or $null -eq $json -or -not $json.token) {
    "LOGIN($Phone) -> $($r.StatusCode)"
    $r.Content
    return [pscustomobject]@{ ok=$false; status=$r.StatusCode; token=$null; raw=$r.Content }
  }

  if ($AsSource) { $global:tokenSrc = $json.token }

  "LOGIN($Phone) -> $($r.StatusCode) tokenLen=$($json.token.Length)"
  return [pscustomobject]@{ ok=$true; status=$r.StatusCode; token=$json.token }
}

function Get-WalletId {
  param([Parameter(Mandatory=$true)][string]$Token)

  $r = Invoke-Api -Method GET -Path "/wallet" -Headers @{ "Authorization"=("Bearer " + $Token) }

  $json = $null
  try { $json = $r.Content | ConvertFrom-Json } catch { $json = $null }

  if ($r.StatusCode -ne 200 -or $null -eq $json -or $null -eq $json.wallet -or -not $json.wallet.id) {
    "GET /wallet -> $($r.StatusCode)"
    $r.Content
    return $null
  }

  return $json.wallet.id
}

function Do-Transfer {
  param(
    [Parameter(Mandatory=$true)][string]$Token,
    [Parameter(Mandatory=$true)][string]$ToWalletId,
    [int]$Amount = 1500,
    [int]$Fee = 0,
    [string]$IdempotencyKey = $null,
    [string]$Label = "FIRST"
  )

  if ([string]::IsNullOrWhiteSpace($IdempotencyKey)) {
    $IdempotencyKey = [guid]::NewGuid().ToString()
  }

  $body = ('{"toWalletId":"' + $ToWalletId + '","amount":' + $Amount + ',"fee":' + $Fee + '}')

  # stocker pour replay
  $global:last.idemKey = $IdempotencyKey
  $global:last.body = $body
  $global:last.toWalletId = $ToWalletId
  $global:last.amount = $Amount
  $global:last.fee = $Fee

  "IDEMPOTENCY-KEY=$IdempotencyKey"
  "BODY=$body"

  $r = Invoke-Api -Method POST -Path "/transactions/transfer" -Headers @{
    "Content-Type"="application/json";
    "Authorization"=("Bearer " + $Token);
    "Idempotency-Key"=$IdempotencyKey
  } -Body $body

  "$Label -> $($r.StatusCode)"
  $r.Content
  return $r
}

function Replay-LastTransfer {
  param(
    [Parameter(Mandatory=$true)][string]$Token,
    [string]$Label = "REPLAY"
  )

  if (-not $global:last.idemKey -or -not $global:last.body) {
    "Aucun transfert à rejouer (last.idemKey/last.body vide)."
    return
  }

  $r = Invoke-Api -Method POST -Path "/transactions/transfer" -Headers @{
    "Content-Type"="application/json";
    "Authorization"=("Bearer " + $Token);
    "Idempotency-Key"=$global:last.idemKey
  } -Body $global:last.body

  "$Label -> $($r.StatusCode)"
  $r.Content
  return $r
}

function Me {
  param([Parameter(Mandatory=$true)][string]$Token)

  $r = Invoke-Api -Method GET -Path "/me" -Headers @{ "Authorization"=("Bearer " + $Token) }
  "ME -> $($r.StatusCode)"
  $r.Content
  return $r
}

"Loaded: Login-User, Get-WalletId, Do-Transfer, Replay-LastTransfer, Me"