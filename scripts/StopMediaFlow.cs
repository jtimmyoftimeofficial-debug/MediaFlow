using System;
using System.Diagnostics;
using System.IO;

namespace StopMediaFlow
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string launcher = Path.Combine(appDir, "MediaFlow.exe");
            if (File.Exists(launcher))
            {
                string extraArgs = args.Length > 0 ? " " + string.Join(" ", args) : "";
                Process p = Process.Start(new ProcessStartInfo
                {
                    FileName = launcher,
                    Arguments = "--stop" + extraArgs,
                    UseShellExecute = false,
                    CreateNoWindow = true
                });
                p.WaitForExit(5000);
            }
        }
    }
}
