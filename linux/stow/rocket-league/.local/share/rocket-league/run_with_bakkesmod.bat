@echo off
set "RL_PATH=%~dp0Binaries\Win64"

rem Keep the injector available in the tray without opening its Qt window.
reg add "HKCU\Software\BakkesMod" /v HideOnBoot /t REG_DWORD /d 1 /f >nul 2>&1

rem Let Rocket League initialize before injection; the 2500 ms default crashes under Proton.
reg add "HKCU\Software\BakkesMod" /v InjectionTimeout /t REG_DWORD /d 15000 /f >nul 2>&1

C:
cd "C:\Program Files\BakkesMod"
start "" BakkesMod.exe

rem Spawn the launcher separately so this batch console can close immediately.
cd /d "%RL_PATH%"
start "" Launcher.exe -noeac %*
exit /b 0
