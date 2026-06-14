Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\ishib\projects\immediate\katmer-defuddle\knowledge-base"
WshShell.Run "cmd /c npm run dev", 0, False
