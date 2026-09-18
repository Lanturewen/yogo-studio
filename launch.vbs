Option Explicit
Dim shell, files, root, node, finder, line, rc, silent, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root
silent = WScript.Arguments.Named.Exists("silent")
node = files.BuildPath(root, "runtime\node.exe")
If Not files.FileExists(node) Then
  node = ""
  Set finder = shell.Exec("where.exe node.exe")
  Do Until finder.StdOut.AtEndOfStream
    line = Trim(finder.StdOut.ReadLine)
    If files.FileExists(line) Then
      node = line
      Exit Do
    End If
  Loop
End If
If node = "" Then
  MsgBox "Node.js is missing. Use the Windows portable ZIP, or install Node.js 22+ and run setup.cmd.", 48, "Yogo 75 codex"
  WScript.Quit 1
End If
If Not files.FolderExists(files.BuildPath(root, "node_modules\node-hid")) Then
  MsgBox "Dependencies missing. Run setup.cmd first, or use the Windows portable ZIP.", 48, "Yogo 75 codex"
  WScript.Quit 1
End If
command = Chr(34) & node & Chr(34) & " " & Chr(34) & files.BuildPath(root, "launcher.cjs") & Chr(34)
If silent Then command = command & " --silent"
rc = shell.Run(command, 0, True)
If rc <> 0 And Not silent Then MsgBox "Could not start. See .local\server.log or run doctor.cmd.", 48, "Yogo 75 codex"
WScript.Quit rc
