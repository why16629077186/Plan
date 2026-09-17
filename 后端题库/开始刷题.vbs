Option Explicit
Dim fso, sh, folder, html, edge, chrome
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
html = folder & "\index.html"
If Not fso.FileExists(html) Then
  MsgBox "Cannot find index.html. Put this file in the quiz folder.", 16, "Quiz"
  WScript.Quit 1
End If

edge = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Microsoft\Edge\Application\msedge.exe"
If Not fso.FileExists(edge) Then edge = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe"
If Not fso.FileExists(edge) Then edge = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe"

chrome = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Google\Chrome\Application\chrome.exe"
If Not fso.FileExists(chrome) Then chrome = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe"
If Not fso.FileExists(chrome) Then chrome = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe"

If fso.FileExists(edge) Then
  sh.Run """" & edge & """ --app=""" & html & """", 1, False
ElseIf fso.FileExists(chrome) Then
  sh.Run """" & chrome & """ --app=""" & html & """", 1, False
Else
  sh.Run """" & html & """", 1, False
End If
