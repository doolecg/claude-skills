# Keeps a newly opened app window behind the user's active window: remembers the foreground window, waits for a window
# of the given process(es) whose title matches, sends it to the bottom without activating it and gives focus back.
# Start it BEFORE launching the app. Usage:
#   powershell -ExecutionPolicy Bypass -File background.ps1 [-TitleLike 'Minecraft*'] [-Process java,javaw] [-Minutes 6]
param([string]$TitleLike = 'Minecraft*', [string[]]$Process = @('java', 'javaw'), [int]$Minutes = 6)
Add-Type @"
using System; using System.Runtime.InteropServices;
public class BG {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
"@
$prev = [BG]::GetForegroundWindow()
$deadline = (Get-Date).AddMinutes($Minutes)
while ((Get-Date) -lt $deadline) {
  Get-Process $Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like $TitleLike } | ForEach-Object {
    $h = $_.MainWindowHandle
    if ([BG]::GetForegroundWindow() -eq $h) {
      [BG]::SetWindowPos($h, [IntPtr]1, 0, 0, 0, 0, 0x13) | Out-Null   # HWND_BOTTOM, NOSIZE|NOMOVE|NOACTIVATE
      [BG]::SetForegroundWindow($prev) | Out-Null
    }
  }
  Start-Sleep -Milliseconds 250
}
