using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
[assembly: AssemblyTitle("Paperboat")]
[assembly: AssemblyDescription("Paperboat local PDF reader launcher")]
[assembly: AssemblyVersion("0.5.0.0")]
internal static class PaperboatLauncher {
    [STAThread]
    private static void Main(string[] args) {
        try {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string script = Path.Combine(root, "Start-Paperboat.ps1");
            if (!File.Exists(script) || !File.Exists(Path.Combine(root, "engine", "web", "viewer.html"))) {
                MessageBox.Show("Please extract the entire Paperboat ZIP before launching.", "Paperboat");
                return;
            }
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
            info.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + script + "\"";
            if (args.Length > 0 && File.Exists(args[0]) && String.Equals(Path.GetExtension(args[0]), ".pdf", StringComparison.OrdinalIgnoreCase))
                info.Arguments += " -OpenPath \"" + args[0].Replace("\"", "") + "\"";
            info.WorkingDirectory = root;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            Process.Start(info);
        } catch (Exception e) { MessageBox.Show(e.Message, "Paperboat"); }
    }
}
