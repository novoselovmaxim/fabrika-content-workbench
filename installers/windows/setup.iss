; Фабрика Контента — Inno Setup Installer
#define MyAppName "Фабрика Контента"
#define MyAppVersion "1.0.1"
#define MyAppPublisher "Фабрика Контента"
#define MyAppURL "http://localhost:3001"
#define MyAppExeName "fabrika-server-win.exe"

[Setup]
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
OutputDir=..\..\releases
OutputBaseFilename=FabrikaContent-Setup-{#MyAppVersion}
PrivilegesRequired=admin
DisableProgramGroupPage=yes

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Files]
Source: "..\..\dist-bin\fabrika-server-win.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\app\dist\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\migrations\*"; DestDir: "{app}\migrations"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\version.txt"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\content"; Permissions: users-modify
Name: "{app}\content\exports"; Permissions: users-modify
Name: "{app}\content\prompts"; Permissions: users-modify
Name: "{app}\content\templates"; Permissions: users-modify

[Icons]
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"

[Tasks]
Name: "desktopicon"; Description: "Создать иконку на рабочем столе"; GroupDescription: "Дополнительно:"; Flags: checkedonce

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Запустить {#MyAppName}"; Flags: nowait postinstall skipifsilent shellexec

[UninstallRun]
Filename: "taskkill"; Parameters: "/f /im {#MyAppExeName}"; Flags: runhidden
