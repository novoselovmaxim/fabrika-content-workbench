$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Фабрика Контента.lnk")
$Shortcut.TargetPath = "$PSScriptRoot\start.bat"
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.WindowStyle = 7
$Shortcut.Description = "Фабрика Контента — editor platform for content management"
$Shortcut.Save()
Write-Host "Ярлык создан на рабочем столе!"
