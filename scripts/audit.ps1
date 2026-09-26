param(
  [string]$Dir = "D:\code\projects\daily-plan\src",
  [string]$Pattern = "."
)
$files = Get-ChildItem -Recurse -LiteralPath $Dir -Include *.ts,*.tsx -File
$files | Where-Object { $_.FullName -match $Pattern } | ForEach-Object { $_.FullName }
