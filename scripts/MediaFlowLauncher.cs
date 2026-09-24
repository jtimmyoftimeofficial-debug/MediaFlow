using System;
using System.IO;
using System.Net;
using System.Diagnostics;
using System.Threading;
using System.Drawing;
using System.Windows.Forms;
using System.Text;

namespace MediaFlowLauncher
{
    static class Program
    {
        public const string AppTitle = "MediaFlow";
        public const string Port = "3001";
        public const string HealthCheckUrl = "http://127.0.0.1:3001/api/settings";
        public const string AppUrl = "http://127.0.0.1:3001";

        public static Process NodeProcess;
        public static StreamWriter LogWriter;
        public static string LogFilePath;
        public static string PidFilePath;
        public static string AppBaseDir;

        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
            }
            catch {}

            try
            {
                AppBaseDir = AppDomain.CurrentDomain.BaseDirectory;

                // Setup log directory in %LOCALAPPDATA%\MediaFlow
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string appDataDir = Path.Combine(localAppData, "MediaFlow");
                if (!Directory.Exists(appDataDir))
                {
                    Directory.CreateDirectory(appDataDir);
                }

                LogFilePath = Path.Combine(appDataDir, "mediaflow.log");
                PidFilePath = Path.Combine(appDataDir, "mediaflow.pid");

                // Initialize log writer early
                LogWriter = new StreamWriter(new FileStream(LogFilePath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite))
                {
                    AutoFlush = true
                };
                Log("=======================================================");
                Log(string.Format("MediaFlow Launcher invoked with args: {0}", 
                    args != null && args.Length > 0 ? string.Join(" ", args) : "(none)"));

                // Allow stopping via command line argument: MediaFlow.exe --stop [--quiet]
                if (args != null && args.Length > 0 && (args[0].Equals("--stop", StringComparison.OrdinalIgnoreCase) || 
                                                        args[0].Equals("/stop", StringComparison.OrdinalIgnoreCase) ||
                                                        args[0].Equals("-stop", StringComparison.OrdinalIgnoreCase)))
                {
                    bool quiet = false;
                    for (int i = 1; i < args.Length; i++)
                    {
                        if (args[i].Equals("--quiet", StringComparison.OrdinalIgnoreCase) ||
                            args[i].Equals("/quiet", StringComparison.OrdinalIgnoreCase) ||
                            args[i].Equals("/s", StringComparison.OrdinalIgnoreCase) ||
                            args[i].Equals("-q", StringComparison.OrdinalIgnoreCase))
                        {
                            quiet = true;
                        }
                    }
                    StopAllMediaFlowInstances(quiet);
                    return;
                }

                // Check if server is already running and responding
                Log("Checking if server is already running on port " + Port + "...");
                if (IsServerResponding())
                {
                    Log("Server is already running! Opening browser to " + AppUrl);
                    OpenBrowser(AppUrl);
                    return;
                }
                Log("No existing server detected. Starting new backend instance...");
                Log("Base Directory: " + AppBaseDir);

                // Locate node.exe
                string[] possibleNodePaths = new string[]
                {
                    Path.Combine(AppBaseDir, "bin", "node.exe"),
                    Path.Combine(AppBaseDir, "node.exe")
                };
                string nodeExe = null;
                foreach (string p in possibleNodePaths)
                {
                    if (File.Exists(p))
                    {
                        nodeExe = p;
                        break;
                    }
                }

                if (nodeExe == null)
                {
                    string msg = "Required runtime binary (node.exe) was not found in:\n" + Path.Combine(AppBaseDir, "bin", "node.exe") + "\n\nPlease reinstall MediaFlow.";
                    Log("[FATAL] " + msg);
                    MessageBox.Show(msg, "MediaFlow - Startup Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }
                Log("Node Executable found: " + nodeExe);

                // Locate index.js entry point
                string[] possibleScriptPaths = new string[]
                {
                    Path.Combine(AppBaseDir, "dist", "server", "server", "index.js"),
                    Path.Combine(AppBaseDir, "dist", "server", "index.js"),
                    Path.Combine(AppBaseDir, "dist", "dist", "server", "server", "index.js"),
                    Path.Combine(AppBaseDir, "server", "server", "index.js"),
                    Path.Combine(AppBaseDir, "server", "index.js")
                };
                string serverScript = null;
                foreach (string p in possibleScriptPaths)
                {
                    if (File.Exists(p))
                    {
                        serverScript = p;
                        break;
                    }
                }

                if (serverScript == null)
                {
                    string msg = "Application entry script (index.js) was not found in:\n" + Path.Combine(AppBaseDir, "dist", "server", "server", "index.js") + "\n\nPlease reinstall MediaFlow.";
                    Log("[FATAL] " + msg);
                    MessageBox.Show(msg, "MediaFlow - Startup Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }
                Log("Server Script found: " + serverScript);

                // Prepend bin directory to PATH
                string binDir = Path.Combine(AppBaseDir, "bin");
                string currentPath = Environment.GetEnvironmentVariable("PATH") ?? "";
                string updatedPath = binDir + ";" + currentPath;

                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = "\"" + serverScript + "\"",
                    WorkingDirectory = AppBaseDir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };

                startInfo.EnvironmentVariables["PATH"] = updatedPath;
                startInfo.EnvironmentVariables["PORT"] = Port;
                startInfo.EnvironmentVariables["HOST"] = "127.0.0.1";

                NodeProcess = new Process { StartInfo = startInfo };
                NodeProcess.OutputDataReceived += (s, e) =>
                {
                    if (e.Data != null)
                    {
                        Log("[NODE] " + e.Data);
                    }
                };
                NodeProcess.ErrorDataReceived += (s, e) =>
                {
                    if (e.Data != null)
                    {
                        Log("[NODE:ERR] " + e.Data);
                    }
                };

                NodeProcess.Start();
                NodeProcess.BeginOutputReadLine();
                NodeProcess.BeginErrorReadLine();

                Log("Launched Node.js process with PID: " + NodeProcess.Id);
                try
                {
                    File.WriteAllText(PidFilePath, NodeProcess.Id.ToString());
                }
                catch {}

                // Wait for backend to be fully listening and responding (up to 35 seconds)
                Log("Waiting for backend health check at " + HealthCheckUrl + " ...");
                bool serverReady = false;
                for (int i = 0; i < 175; i++)
                {
                    Thread.Sleep(200);

                    if (NodeProcess.HasExited)
                    {
                        string tailLog = GetLogTail(LogFilePath, 25);
                        string errMsg = string.Format(
                            "MediaFlow backend service stopped unexpectedly (Exit code: {0}).\n\nRecent log output:\n{1}\n\nFull log file:\n{2}",
                            NodeProcess.ExitCode,
                            tailLog,
                            LogFilePath
                        );
                        Log("[ERROR] Node exited unexpectedly with code " + NodeProcess.ExitCode);
                        MessageBox.Show(errMsg, "MediaFlow Startup Failure", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        return;
                    }

                    if (IsServerResponding())
                    {
                        serverReady = true;
                        Log(string.Format("Health check succeeded after ~{0}ms! Server is active on port {1}", (i + 1) * 200, Port));
                        break;
                    }
                }

                if (!serverReady)
                {
                    string tailLog = GetLogTail(LogFilePath, 25);
                    string errMsg = string.Format(
                        "MediaFlow backend did not respond within 35 seconds.\n\nRecent log output:\n{0}\n\nFull log file:\n{1}",
                        tailLog,
                        LogFilePath
                    );
                    Log("[TIMEOUT] Backend health check timed out after 35 seconds.");
                    MessageBox.Show(errMsg, "MediaFlow Startup Timeout", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                // Server is ready! Open browser
                Log("Opening default browser to " + AppUrl);
                OpenBrowser(AppUrl);

                // Run system tray application context
                Log("Starting message loop with MediaFlowAppContext...");
                Application.Run(new MediaFlowAppContext());
                Log("Application.Run returned!");
            }
            catch (Exception ex)
            {
                Log("[FATAL UNHANDLED] " + ex.ToString());
                MessageBox.Show("Fatal error launching MediaFlow:\n" + ex.Message, "MediaFlow Launch Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        public static void Log(string message)
        {
            try
            {
                string line = string.Format("[{0}] {1}", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"), message);
                Console.WriteLine(line);
                if (LogWriter != null)
                {
                    LogWriter.WriteLine(line);
                    LogWriter.Flush();
                }
            }
            catch {}
        }

        public static bool IsServerResponding()
        {
            try
            {
                using (var tcp = new System.Net.Sockets.TcpClient())
                {
                    var ar = tcp.BeginConnect("127.0.0.1", int.Parse(Port), null, null);
                    if (!ar.AsyncWaitHandle.WaitOne(300))
                    {
                        return false;
                    }
                    tcp.EndConnect(ar);
                }

                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(HealthCheckUrl);
                req.Proxy = null;
                req.Timeout = 1000;
                req.ReadWriteTimeout = 1000;
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                {
                    return resp.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        public static void OpenBrowser(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not open default web browser:\n" + ex.Message + "\n\nYou can manually visit: " + url, "MediaFlow");
            }
        }

        public static void StopAllMediaFlowInstances(bool quiet)
        {
            int stopped = 0;
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string pidFile = Path.Combine(localAppData, "MediaFlow", "mediaflow.pid");

            if (File.Exists(pidFile))
            {
                try
                {
                    string pidStr = File.ReadAllText(pidFile).Trim();
                    int pid;
                    if (int.TryParse(pidStr, out pid))
                    {
                        Process p = Process.GetProcessById(pid);
                        if (p != null && !p.HasExited)
                        {
                            p.Kill();
                            stopped++;
                        }
                    }
                    File.Delete(pidFile);
                }
                catch {}
            }

            // Also terminate any lingering process listening on port 3001
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c for /f \"tokens=5\" %a in ('netstat -aon ^| find \":3001\" ^| find \"LISTENING\"') do taskkill /F /PID %a",
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process p = Process.Start(psi);
                p.WaitForExit(3000);
            }
            catch {}

            if (!quiet)
            {
                MessageBox.Show("MediaFlow background services have been stopped.", "MediaFlow", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        public static string GetLogTail(string filePath, int lines)
        {
            if (!File.Exists(filePath)) return "(Log file does not exist)";
            try
            {
                string[] allLines = File.ReadAllLines(filePath);
                if (allLines.Length <= lines) return string.Join("\n", allLines);
                string[] tail = new string[lines];
                Array.Copy(allLines, allLines.Length - lines, tail, 0, lines);
                return string.Join("\n", tail);
            }
            catch (Exception ex)
            {
                return "(Error reading log: " + ex.Message + ")";
            }
        }
    }

    public class MediaFlowAppContext : ApplicationContext
    {
        private NotifyIcon _trayIcon;

        public MediaFlowAppContext()
        {
            try
            {
                Program.Log("Creating NotifyIcon...");
                _trayIcon = new NotifyIcon();
                _trayIcon.Text = "MediaFlow - Video Downloader (Running)";

                string iconPath = Path.Combine(Program.AppBaseDir, "assets", "app.ico");
                if (File.Exists(iconPath))
                {
                    try { _trayIcon.Icon = new Icon(iconPath); } catch {}
                }
                if (_trayIcon.Icon == null)
                {
                    _trayIcon.Icon = SystemIcons.Application;
                }

                ContextMenuStrip menu = new ContextMenuStrip();
                ToolStripMenuItem openItem = new ToolStripMenuItem("Open MediaFlow", null, (s, e) => Program.OpenBrowser(Program.AppUrl));
                openItem.Font = new Font(openItem.Font, FontStyle.Bold);
                menu.Items.Add(openItem);

                menu.Items.Add(new ToolStripSeparator());

                menu.Items.Add("View Logs", null, (s, e) =>
                {
                    if (File.Exists(Program.LogFilePath))
                    {
                        try { Process.Start("notepad.exe", "\"" + Program.LogFilePath + "\""); } catch {}
                    }
                    else
                    {
                        MessageBox.Show("No log file found yet.", "MediaFlow");
                    }
                });

                menu.Items.Add("Exit MediaFlow", null, (s, e) =>
                {
                    Program.Log("User clicked Exit MediaFlow from tray menu.");
                    ExitThread();
                });

                _trayIcon.ContextMenuStrip = menu;
                _trayIcon.DoubleClick += (s, e) => Program.OpenBrowser(Program.AppUrl);
                _trayIcon.Visible = true;
                Program.Log("TrayIcon displayed successfully.");

                AppDomain.CurrentDomain.ProcessExit += (s, e) => Cleanup("ProcessExit event");
            }
            catch (Exception ex)
            {
                Program.Log("[TRAY EXCEPTION] " + ex.ToString());
            }
        }

        protected override void ExitThreadCore()
        {
            Cleanup("ExitThreadCore");
            base.ExitThreadCore();
        }

        private void Cleanup(string reason)
        {
            Program.Log("Cleanup called! Reason: " + reason);
            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
                _trayIcon = null;
            }

            if (Program.NodeProcess != null && !Program.NodeProcess.HasExited)
            {
                try
                {
                    Program.NodeProcess.Kill();
                    Program.Log("Terminated Node.js backend process.");
                }
                catch {}
            }

            try
            {
                if (File.Exists(Program.PidFilePath))
                {
                    File.Delete(Program.PidFilePath);
                }
            }
            catch {}

            Program.Log("MediaFlow tray app exited cleanly.");
            if (Program.LogWriter != null)
            {
                try
                {
                    Program.LogWriter.Flush();
                    Program.LogWriter.Close();
                }
                catch {}
                Program.LogWriter = null;
            }
        }
    }
}
