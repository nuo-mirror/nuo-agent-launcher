$ErrorActionPreference = 'Stop'
$root = 'c:\Users\Administrator\Desktop\nuo agent launcher'
$tmp = "$env:TEMP\seedresearch\pkgs"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$pkgs = @('deepslate', 'md5', 'pako', 'gl-matrix', 'charenc', 'crypt', 'is-buffer')
foreach ($p in $pkgs) {
  $meta = (curl.exe -skL --max-time 60 "https://registry.npmjs.org/$p/latest") | ConvertFrom-Json
  $url = $meta.dist.tarball
  $tgz = "$tmp\$p.tgz"
  curl.exe -skL --max-time 120 $url -o $tgz
  $ex = "$tmp\$p"
  New-Item -ItemType Directory -Force -Path $ex | Out-Null
  tar -xzf $tgz -C $ex
  $dest = "$root\node_modules\$p"
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  Copy-Item -Recurse "$ex\package" $dest
  Write-Output "$p@$($meta.version) installed"
}
