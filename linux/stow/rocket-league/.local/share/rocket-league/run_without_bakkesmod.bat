@echo off
rem Offline play without the injector, for workshop maps loaded through Underpass.
cd /d "%~dp0Binaries\Win64"
start "" Launcher.exe -noeac %*
exit /b 0
