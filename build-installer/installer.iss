; Inno Setup Script for MediaFlow Standalone Windows Application
; Generates a self-contained, native desktop application installer

#define MyAppName "MediaFlow"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "MediaFlow"
#define MyAppURL "https://github.com/jtimmyoftimeofficial-debug/MediaFlow"
#define MyAppExeName "MediaFlow.exe"

[Setup]
AppId={{C47291A6-B647-497B-8A87-99E85827C429}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={userpf}\{#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist-installer
OutputBaseFilename=MediaFlow-Setup-1.0.0
SetupIconFile=assets\app.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\assets\app.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "assets\app.ico"; DestDir: "{app}\assets"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\app.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\app.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill"; Parameters: "/F /IM MediaFlow.exe"; Flags: runhidden waituntilterminated
