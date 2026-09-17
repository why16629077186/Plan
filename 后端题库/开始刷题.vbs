Option Explicit
Dim fso, sh, folder, ps1, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = folder & "\start-quiz.ps1"
If Not fso.FileExists(ps1) Then
  MsgBox "Cannot find start-quiz.ps1", 16, "Quiz"
  WScript.Quit 1
End If
cmd = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & ps1 & """"
sh.Run cmd, 0, False
