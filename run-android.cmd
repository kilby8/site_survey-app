@echo off
setlocal
set "ANDROID_SDK=%C:\Users\carpe\AppData\Local%\Android\Sdk"
set "ANDROID_HOME=%%ANDROID_SDK%%"
set "ANDROID_SDK_ROOT=%%ANDROID_SDK%%"
set "PATH=%%ANDROID_SDK%%\platform-tools;%%ANDROID_SDK%%\emulator;%%ANDROID_SDK%%\cmdline-tools\latest\bin;%C:\Program Files\Android\openjdk\jdk-21.0.8\bin;C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot\bin;C:\Python314\Scripts\;C:\Python314\;C:\Program Files\Oculus\Support\oculus-runtime;C:\Windows\system32;C:\Windows;C:\Windows\System32\Wbem;C:\Windows\System32\WindowsPowerShell\v1.0\;C:\Windows\System32\OpenSSH\;C:\Program Files (x86)\NVIDIA Corporation\PhysX\Common;C:\Program Files\dotnet\;C:\Program Files\CubeCoders Limited\AMP\;C:\Program Files (x86)\PuTTY\;C:\Program Files\NVIDIA Corporation\NVIDIA app\NvDLISR;C:\WINDOWS\system32;C:\WINDOWS;C:\WINDOWS\System32\Wbem;C:\WINDOWS\System32\WindowsPowerShell\v1.0\;C:\WINDOWS\System32\OpenSSH\;C:\Program Files (x86)\Windows Kits\10\Windows Performance Toolkit\;C:\ProgramData\chocolatey\bin;D:\cursor\resources\app\bin;C:\Program Files\nodejs\;C:\Program Files\Git\cmd;C:\Program Files\Docker\Docker\resources\bin;C:\Users\carpe\AppData\Local\Programs\Python\Launcher\;C:\Users\carpe\AppData\Local\Microsoft\WindowsApps;C:\Users\carpe\AppData\Local\Programs\Ollama;C:\Users\carpe\.dotnet\tools;C:\Users\carpe\.lmstudio\bin;C:\Users\carpe\AppData\Local\Programs\cursor\resources\app\bin;C:\Users\carpe\AppData\Local\GitHubDesktop\bin;C:\Users\carpe\AppData\Roaming\npm;C:\Users\carpe\.dotnet\tools;C:\Program Files\Microsoft Visual Studio\18\Community\Common7\IDE\PrivateAssemblies\runtimes\win-x64\native;C:\Program Files\Git\cmd%"
echo Checking Android tools...
where adb || (echo adb not found & exit /b 1)
where emulator || (echo emulator not found & exit /b 1)
adb --version
adb start-server
adb devices
cd /d mobile || (echo mobile folder not found & exit /b 1)
call npm install || exit /b 1
call npm run android || exit /b 1
echo.
echo Finished. Press any key...
pause
endlocal
