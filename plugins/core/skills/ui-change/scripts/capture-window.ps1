# Captures a window to a PNG without focusing, raising or clicking it (PrintWindow, PW_RENDERFULLCONTENT).
# Usage: powershell -ExecutionPolicy Bypass -File capture-window.ps1 -Out shot.png (-ProcessId 1234 | -Title "substring") [-List]
# -List prints visible top-level windows (pid, handle, size, title) and exits.
param([string]$Out, [int]$ProcessId = 0, [string]$Title = '', [switch]$List)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class CW {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public static List<IntPtr> Visible() {
    var l = new List<IntPtr>();
    EnumWindows((h, p) => { if (IsWindowVisible(h) && GetWindowTextLength(h) > 0) l.Add(h); return true; }, IntPtr.Zero);
    return l;
  }
  public static string Text(IntPtr h) { var s = new StringBuilder(GetWindowTextLength(h) + 1); GetWindowText(h, s, s.Capacity); return s.ToString(); }
  public static uint Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h, out p); return p; }
}
"@
[CW]::SetProcessDPIAware() | Out-Null
$wins = foreach ($h in [CW]::Visible()) {
  $r = New-Object CW+RECT; [CW]::GetWindowRect($h, [ref]$r) | Out-Null
  [pscustomobject]@{ Pid = [CW]::Pid($h); Handle = $h; W = $r.R - $r.L; H = $r.B - $r.T; Title = [CW]::Text($h) }
}
if ($List) { $wins | Where-Object { $_.W -gt 50 } | Format-Table -AutoSize | Out-String -Width 200; exit 0 }
if (-not $Out) { Write-Error 'need -Out'; exit 2 }
$m = $wins | Where-Object { $_.W -gt 50 -and $_.H -gt 50 -and
  (($ProcessId -gt 0 -and $_.Pid -eq $ProcessId) -or ($Title -ne '' -and $_.Title -like "*$Title*")) } | Select-Object -First 1
if (-not $m) { Write-Error 'window not found (use -List)'; exit 1 }
$bmp = New-Object System.Drawing.Bitmap $m.W, $m.H
$g = [System.Drawing.Graphics]::FromImage($bmp); $dc = $g.GetHdc()
$ok = [CW]::PrintWindow($m.Handle, $dc, 2)
$g.ReleaseHdc($dc); $g.Dispose()
if (-not $ok) { Write-Error 'PrintWindow failed'; exit 1 }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
Write-Output "$Out  $($m.W)x$($m.H)  '$($m.Title)'  pid $($m.Pid)"
