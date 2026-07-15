$content = Get-Content "C:\Users\papu\.gemini\antigravity\brain\5f3d1595-6881-4f18-aaac-0731793b5279\.system_generated\steps\5486\content.md" -Raw
# Find the full config builder function
$regex = [regex]'.{0,50}workerPath:new Bs.{0,400}'
$found = $regex.Matches($content)
foreach ($item in $found) {
    Write-Output "=== config builder ==="
    Write-Output $item.Value
    Write-Output "---"
}
