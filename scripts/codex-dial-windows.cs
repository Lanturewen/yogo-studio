using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;
using System.Web.Script.Serialization;

class CodexDial {
 const int WH_KEYBOARD_LL=13,WM_KEYDOWN=0x0100,WM_SYSKEYDOWN=0x0104,VK_OEM_MINUS=0xBD,VK_OEM_PLUS=0xBB;
 static readonly JavaScriptSerializer json=new JavaScriptSerializer();static IntPtr hook=IntPtr.Zero;static HookProc callback=OnKey;
 delegate IntPtr HookProc(int code,IntPtr message,IntPtr data);
 [StructLayout(LayoutKind.Sequential)] struct KeyData { public uint vkCode,scanCode,flags,time;public UIntPtr extraInfo; }
 [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type;public InputUnion data; }
 [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public KEYBDINPUT keyboard; [FieldOffset(0)] public MOUSEINPUT mouse; }
 // INPUT must include the largest union member (40 bytes on x64), even for keyboard events.
 [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx,dy;public uint mouseData,flags,time;public UIntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk,scan;public uint flags,time;public UIntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd;public uint message;public UIntPtr wParam;public IntPtr lParam;public uint time;public int x,y; }
 [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id,HookProc proc,IntPtr module,uint thread);
 [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr value);
 [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr value,int code,IntPtr message,IntPtr data);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")] static extern int GetMessage(out MSG msg,IntPtr hwnd,uint min,uint max);
 [DllImport("user32.dll")] static extern uint SendInput(uint count,INPUT[] inputs,int size);
 static void Emit(string type,string detail){Console.WriteLine(json.Serialize(new {protocol=1,type=type,detail=detail}));Console.Out.Flush();}
 static bool IsCodex(IntPtr hwnd){uint pid;GetWindowThreadProcessId(hwnd,out pid);try{var n=Process.GetProcessById((int)pid).ProcessName;return n.Equals("ChatGPT",StringComparison.OrdinalIgnoreCase)||n.Equals("Codex",StringComparison.OrdinalIgnoreCase);}catch{return false;}}
	 static INPUT KeyInput(ushort vk,uint flags=0){return new INPUT{type=1,data=new InputUnion{keyboard=new KEYBDINPUT{vk=vk,flags=flags}}};}
	 static void Shortcut(ushort vk){var input=new[]{KeyInput(0x11),KeyInput(0x12),KeyInput(0x10),KeyInput(vk),KeyInput(vk,2),KeyInput(0x10,2),KeyInput(0x12,2),KeyInput(0x11,2)};SendInput((uint)input.Length,input,Marshal.SizeOf(typeof(INPUT)));}
	 static bool FocusComposer(IntPtr hwnd){try{var focused=AutomationElement.FocusedElement;object valuePattern;if(focused!=null&&focused.Current.ControlType==ControlType.Edit&&focused.TryGetCurrentPattern(ValuePattern.Pattern,out valuePattern)&&((ValuePattern)valuePattern).Current.IsReadOnly)return false;var root=AutomationElement.FromHandle(hwnd);var edits=root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Edit));AutomationElement best=null;double bestY=-1;foreach(AutomationElement e in edits){var r=e.Current.BoundingRectangle;if(!r.IsEmpty&&r.Width>=200&&r.Height>0&&r.Top>=bestY){best=e;bestY=r.Top;}}if(best==null)return false;best.SetFocus();return true;}catch{return false;}}
 static IntPtr OnKey(int code,IntPtr message,IntPtr data){if(code>=0&&(message==(IntPtr)WM_KEYDOWN||message==(IntPtr)WM_SYSKEYDOWN)){
	  var k=(KeyData)Marshal.PtrToStructure(data,typeof(KeyData));if((k.vkCode==VK_OEM_MINUS||k.vkCode==VK_OEM_PLUS)&&GetAsyncKeyState(0x10)>=0&&GetAsyncKeyState(0x11)>=0&&GetAsyncKeyState(0x12)>=0){IntPtr hwnd=GetForegroundWindow();if(IsCodex(hwnd)){bool increase=k.vkCode==VK_OEM_PLUS,focused=FocusComposer(hwnd);if(focused)Thread.Sleep(15);Shortcut((ushort)(increase?VK_OEM_PLUS:VK_OEM_MINUS));Emit("adjust",increase?"提高":"降低");return (IntPtr)1;}}
	  }return CallNextHookEx(hook,code,message,data);}
	 [STAThread] static int Main(){Console.OutputEncoding=new System.Text.UTF8Encoding(false);hook=SetWindowsHookEx(WH_KEYBOARD_LL,callback,IntPtr.Zero,0);if(hook==IntPtr.Zero){Emit("error","无法监听波轮按键");return 3;}Emit("ready","- / = → Codex 原生命令");MSG msg;while(GetMessage(out msg,IntPtr.Zero,0,0)>0){}UnhookWindowsHookEx(hook);return 0;}
}
