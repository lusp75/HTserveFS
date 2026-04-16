; Script Inno Setup per HtserveFS
; Versione: 1.0.1
; Data: Agosto 2025

#define MyAppName "HtserveFS"
#define MyAppVersion "1.0.1"
#define MyAppPublisher "HtserveFS Team"
#define MyAppURL "https://github.com/htservefs/htservefs"
#define MyAppExeName "htservefs.exe"
#define MyAppDescription "File Server Application with Web Interface"

[Setup]
; Informazioni di base dell'applicazione
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
AppCopyright=Copyright (C) 2025 {#MyAppPublisher}
VersionInfoVersion={#MyAppVersion}
VersionInfoDescription={#MyAppDescription}

; Percorsi di installazione
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=
InfoBeforeFile=
InfoAfterFile=

; Output dell'installer
OutputDir=installer-output
OutputBaseFilename=HtserveFS-{#MyAppVersion}-Setup
SetupIconFile=htservefs-icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern

; Privilegi e compatibilità
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
MinVersion=6.1sp1

; Opzioni di disinstallazione
UninstallDisplayIcon={app}\bin\{#MyAppExeName}
UninstallDisplayName={#MyAppName} {#MyAppVersion}

[Languages]
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1
Name: "startmenuicon"; Description: "Crea icona nel menu Start"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "Avvia automaticamente con Windows"; GroupDescription: "Opzioni di avvio"; Flags: unchecked

[Files]
; Eseguibile principale
Source: "installer-structure\bin\htservefs.exe"; DestDir: "{app}\bin"; Flags: ignoreversion

; Asset del frontend
Source: "installer-structure\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

; File di configurazione
Source: "installer-structure\config\config-installer.json"; DestDir: "{app}\config"; Flags: ignoreversion; DestName: "config-installer.json"

; Documentazione
Source: "installer-structure\docs\*"; DestDir: "{app}\docs"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "installer-structure\README.md"; DestDir: "{app}"; Flags: ignoreversion

; File di supporto (opzionali)
; Source: "vcredist_x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: VCRedistNeedsInstall

[Icons]
; Icona sul desktop
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\bin\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\assets\htservefs-icon.ico"

; Icona nel menu Start
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\bin\{#MyAppExeName}"; Tasks: startmenuicon; IconFilename: "{app}\assets\htservefs-icon.ico"

; Icona nella barra di avvio rapido
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#MyAppName}"; Filename: "{app}\bin\{#MyAppExeName}"; Tasks: quicklaunchicon; IconFilename: "{app}\assets\htservefs-icon.ico"

; Collegamento alla documentazione
Name: "{autoprograms}\{#MyAppName}\Documentazione"; Filename: "{app}\docs\README.txt"; Tasks: startmenuicon

; Collegamento per disinstallare
Name: "{autoprograms}\{#MyAppName}\Disinstalla {#MyAppName}"; Filename: "{uninstallexe}"; Tasks: startmenuicon

[Registry]
; Avvio automatico (opzionale)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#MyAppName}"; ValueData: """{app}\bin\{#MyAppExeName}"""; Tasks: autostart

; Registrazione dell'applicazione
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "DisplayName"; ValueData: "{#MyAppName} {#MyAppVersion}"
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "DisplayVersion"; ValueData: "{#MyAppVersion}"
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "Publisher"; ValueData: "{#MyAppPublisher}"
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "URLInfoAbout"; ValueData: "{#MyAppURL}"
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "DisplayIcon"; ValueData: "{app}\bin\{#MyAppExeName}"
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}"; ValueType: string; ValueName: "InstallLocation"; ValueData: "{app}"

[Run]
; Esegui l'applicazione dopo l'installazione
Filename: "{app}\bin\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

; Apri la documentazione
Filename: "{app}\docs\README.txt"; Description: "Apri la documentazione"; Flags: postinstall skipifsilent shellexec unchecked

[UninstallDelete]
; Rimuovi file di log e configurazione creati durante l'uso
Type: files; Name: "{app}\*.log"
Type: files; Name: "{app}\config.json"
Type: files; Name: "{app}\*.pem"

[UninstallRun]
; Ferma il servizio se in esecuzione prima della disinstallazione
Filename: "{cmd}"; Parameters: "/c taskkill /f /im {#MyAppExeName} >nul 2>&1"; Flags: runhidden

[Code]
// Funzioni Pascal Script per controlli avanzati

// Controlla se Visual C++ Redistributable è necessario
function VCRedistNeedsInstall: Boolean;
begin
  // Implementa controllo per VC++ Redistributable se necessario
  Result := False;
end;

// Funzione chiamata prima dell'installazione
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  
  // Controlla se l'applicazione è già in esecuzione
  if CheckForMutexes('HtserveFS-Mutex') then
  begin
    if MsgBox('HtserveFS è attualmente in esecuzione. Chiudere l''applicazione prima di continuare l''installazione?', 
              mbConfirmation, MB_YESNO) = IDYES then
    begin
      // Tenta di chiudere l'applicazione
      Exec('taskkill', '/f /im {#MyAppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end
    else
    begin
      Result := False;
    end;
  end;
end;

// Funzione chiamata dopo l'installazione
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Crea il file di configurazione di default se non esiste
    if not FileExists(ExpandConstant('{app}\config.json')) then
    begin
      FileCopy(ExpandConstant('{app}\config\config-installer.json'), 
               ExpandConstant('{app}\config.json'), False);
    end;
  end;
end;

// Funzione chiamata durante la disinstallazione
function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  
  // Ferma l'applicazione se in esecuzione
  if CheckForMutexes('HtserveFS-Mutex') then
  begin
    if MsgBox('HtserveFS è attualmente in esecuzione. Chiudere l''applicazione per continuare la disinstallazione?', 
              mbConfirmation, MB_YESNO) = IDYES then
    begin
      Exec('taskkill', '/f /im {#MyAppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end
    else
    begin
      Result := False;
    end;
  end;
end;