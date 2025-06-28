; 🚀 MenuorgPrint 安装程序自定义脚本
; 添加开机自动运行选项

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

; 变量定义
Var AutoStartCheckbox
Var AutoStartState

; 自定义页面：高级选项
Page custom AdvancedOptionsPage AdvancedOptionsPageLeave

; 高级选项页面函数
Function AdvancedOptionsPage
  !insertmacro MUI_HEADER_TEXT "高级选项" "选择额外的安装选项"

  nsDialogs::Create 1018
  Pop $0

  ; 创建标题
  ${NSD_CreateLabel} 0 10 100% 20u "请选择您需要的额外功能："
  Pop $0

  ; 创建开机自动运行复选框
  ${NSD_CreateCheckbox} 10 40 100% 15u "开机自动启动 MenuorgPrint（推荐餐厅使用）"
  Pop $AutoStartCheckbox

  ; 默认选中
  ${NSD_Check} $AutoStartCheckbox

  ; 创建说明文字
  ${NSD_CreateLabel} 25 60 90% 40u "启用此选项后，系统启动时 MenuorgPrint 将自动在后台运行，确保及时处理新订单。适合需要24小时营业的餐厅。"
  Pop $0

  ; 创建分隔线
  ${NSD_CreateHLine} 0 110 100% 8u ""
  Pop $0

  ; 创建提示信息
  ${NSD_CreateLabel} 0 125 100% 30u "注意：您也可以在安装完成后通过应用程序的设置界面修改这些选项。"
  Pop $0

  nsDialogs::Show
FunctionEnd

; 高级选项页面离开时的处理
Function AdvancedOptionsPageLeave
  ${NSD_GetState} $AutoStartCheckbox $AutoStartState
FunctionEnd

; 安装完成后的处理
Function .onInstSuccess
  ; 如果用户选择了开机自动运行
  ${If} $AutoStartState == ${BST_CHECKED}
    DetailPrint "正在配置开机自动启动..."

    ; 写入注册表以启用开机自动运行
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MenuorgPrint" '"$INSTDIR\MenuorgPrint.exe" --auto-start'

    ; 创建配置文件标记已启用
    FileOpen $0 "$INSTDIR\auto-start-enabled.flag" w
    FileWrite $0 "1"
    FileClose $0

    DetailPrint "开机自动启动已配置完成"
  ${Else}
    DetailPrint "跳过开机自动启动配置"
  ${EndIf}

  ; 显示安装完成信息
  MessageBox MB_ICONINFORMATION|MB_OK "MenuorgPrint 安装完成！$\r$\n$\r$\n安装位置：$INSTDIR$\r$\n$\r$\n提示：$\r$\n• 首次使用前请确保已安装 C-Lodop 打印控件$\r$\n• 可通过托盘图标管理应用程序$\r$\n• 更多设置请打开应用主界面进行配置"
FunctionEnd

; 卸载时清理开机自动运行
Function un.onInit
  ; 删除开机自动运行注册表项
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MenuorgPrint"

  ; 删除配置标记文件
  Delete "$INSTDIR\auto-start-enabled.flag"
FunctionEnd

; 自定义卸载确认
Function un.onUninstSuccess
  MessageBox MB_ICONINFORMATION|MB_OK "MenuorgPrint 已成功卸载。$\r$\n$\r$\n已清理：$\r$\n• 开机自动启动设置$\r$\n• 程序文件$\r$\n$\r$\n用户配置文件保留在：$\r$\n%APPDATA%\restaurant-order-printer\"
FunctionEnd