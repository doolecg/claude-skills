# Keeps a newly opened Minecraft window behind the user's active window: remembers the foreground window, waits for
# the game window, sends it to the bottom without activating it and gives focus back.
Add-Type @"
using System; using System.Runtime.InteropServices;
public class BG {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
"@
$prev = [BG]::GetForegroundWindow()
$deadline = (Get-Date).AddMinutes(6)
$done = @{}
while ((Get-Date) -lt $deadline) {
  Get-Process java, javaw -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like 'Minecraft*' } | ForEach-Object {
    $h = $_.MainWindowHandle
    if ([BG]::GetForegroundWindow() -eq $h) {
      [BG]::SetWindowPos($h, [IntPtr]1, 0, 0, 0, 0, 0x13) | Out-Null
      [BG]::SetForegroundWindow($prev) | Out-Null
      $done[$h] = $true
    }
  }
  Start-Sleep -Milliseconds 250
}
