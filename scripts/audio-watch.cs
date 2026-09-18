// Read-only Windows Core Audio observer. No audio client, recorder, files or network.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator {}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDevices {
    [PreserveSig] int EnumAudioEndpoints(int flow, uint mask, out IDeviceList list);
    [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
}
[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDeviceList {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int Item(uint index, out IDevice device);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDevice {
    [PreserveSig] int Activate(ref Guid iid, uint context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object value);
    [PreserveSig] int OpenPropertyStore(uint access, out IntPtr store);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetState(out uint state);
}
[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISessionManager {
    [PreserveSig] int GetAudioSessionControl(IntPtr guid, uint flags, out IntPtr control);
    [PreserveSig] int GetSimpleAudioVolume(IntPtr guid, uint flags, out IntPtr volume);
    [PreserveSig] int GetSessionEnumerator(out ISessions sessions);
}
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISessions {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session);
}
[ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISession {
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string value);
    [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string value, IntPtr context);
    [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string value);
    [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string value, IntPtr context);
    [PreserveSig] int GetGroupingParam(out Guid value);
    [PreserveSig] int SetGroupingParam(ref Guid value, IntPtr context);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr notification);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr notification);
    [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string value);
    [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string value);
    [PreserveSig] int GetProcessId(out uint pid);
}
[ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMeter {
    [PreserveSig] int GetPeakValue(out float peak);
}

class AudioWatch {
    static volatile bool quit;
    static readonly HashSet<string> names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    static readonly JavaScriptSerializer json = new JavaScriptSerializer();
    static void Check(int hr) { Marshal.ThrowExceptionForHR(hr); }
    static void Release(object value) { if (value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value); }
    static float? Peak(object value) {
        try { IMeter meter = value as IMeter; float peak; if (meter != null && meter.GetPeakValue(out peak) >= 0 && !float.IsNaN(peak)) return Math.Max(0, Math.Min(1, peak)); }
        catch (COMException) {} return null;
    }
    static object Poll() {
        var rows = new List<object>(); var errors = new List<string>();
        object enumerator = null; IDeviceList devices = null; uint count = 0;
        try {
            enumerator = new DeviceEnumerator();
            Check(((IDevices)enumerator).EnumAudioEndpoints(1, 1, out devices)); // eCapture, DEVICE_STATE_ACTIVE
            Check(devices.GetCount(out count));
            for (uint i = 0; i < count; i++) {
                IDevice device = null; object manager = null; ISessions sessions = null; object endpointMeter = null;
                try {
                    Check(devices.Item(i, out device));
                    Guid managerId = typeof(ISessionManager).GUID;
                    Check(device.Activate(ref managerId, 23, IntPtr.Zero, out manager));
                    Check(((ISessionManager)manager).GetSessionEnumerator(out sessions));
                    int n; Check(sessions.GetCount(out n));
                    for (int j = 0; j < n; j++) {
                        object raw = null;
                        try {
                            Check(sessions.GetSession(j, out raw)); ISession session = (ISession)raw;
                            int state; uint pid; Check(session.GetState(out state));
                            int pidResult = session.GetProcessId(out pid);
                            // Multi-process sessions cannot safely identify a single recording application.
                            if (pidResult != 0 || pid == 0) continue;
                            string processName, executablePath = "";
                            using (Process process = Process.GetProcessById((int)pid)) {
                                processName = process.ProcessName + ".exe";
                                if (!names.Contains(processName)) continue;
                                try { executablePath = process.MainModule.FileName; } catch { }
                            }
                            float? level = null; string levelKind = "unavailable";
                            if (state == 1) {
                                level = Peak(raw); if (level.HasValue) levelKind = "session";
                                if (!level.HasValue) {
                                    if (endpointMeter == null) {
                                        Guid meterId = typeof(IMeter).GUID;
                                        device.Activate(ref meterId, 23, IntPtr.Zero, out endpointMeter);
                                    }
                                    level = Peak(endpointMeter); if (level.HasValue) levelKind = "endpoint";
                                }
                            }
                            rows.Add(new { pid = pid, processName = processName, executablePath = executablePath,
                                active = state == 1, level = level, levelKind = levelKind });
                        } catch (ArgumentException) { } catch (COMException) { }
                        finally { Release(raw); }
                    }
                } catch (Exception e) { errors.Add(e.GetType().Name + ":" + e.HResult.ToString("X8")); }
                finally { Release(endpointMeter); Release(sessions); Release(manager); Release(device); }
            }
        } finally { Release(devices); Release(enumerator); }
        return new { protocol = 1, devices = count, sessions = rows, errors = errors };
    }
    [MTAThread]
    static int Main(string[] args) {
        bool once = false;
        for (int i = 0; i < args.Length; i++) {
            if (args[i] == "--once") once = true;
            else if (args[i] == "--process" && i + 1 < args.Length) names.Add(args[++i]);
            else return 2;
        }
        if (names.Count == 0) return 2;
        if (!once) { var input = new Thread(() => { try { while (Console.ReadLine() != null) {} } catch {} quit = true; }); input.IsBackground = true; input.Start(); }
        do {
            try { Console.WriteLine(json.Serialize(Poll())); Console.Out.Flush(); }
            catch (Exception e) { Console.WriteLine(json.Serialize(new { protocol = 1, error = e.GetType().Name + ":" + e.HResult.ToString("X8"), sessions = new object[0] })); }
            if (once) break; Thread.Sleep(150);
        } while (!quit);
        return 0;
    }
}
