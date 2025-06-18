# 🖨️ 打印机故障排除指南

## 问题现象：程序运行正常，但打印机没有任何反应

根据您的描述"程序运行起来一切日志都是正常的，但是当我点击打印或测试打印，打印机都没有任何反应"，我们创建了诊断工具来帮您排查问题。

## 🔍 使用诊断工具

### 1. 检查打印机列表
```bash
.\target\release\printer-engine.exe list-printers
```

### 2. 诊断特定打印机
```bash
.\target\release\printer-engine.exe diagnose-printer --printer "打印机名称"
```

### 3. 检查打印队列
```bash
.\target\release\printer-engine.exe check-queue --printer "打印机名称"
```

### 4. 交互式诊断
```bash
.\target\release\printer-engine.exe interactive
```

## 🚨 常见问题及解决方案

### 问题类型1：程序显示成功但没有打印输出

**症状**:
- ✅ 诊断显示所有测试都成功
- ✅ 打印机能正常打开
- ✅ 数据发送成功
- ❌ 但是没有任何纸张输出

**可能原因及解决方案**:

#### A. 打印队列卡住
```powershell
# 检查队列状态
Get-PrintJob -PrinterName "XP-80C"

# 清空队列
Get-PrintJob -PrinterName "XP-80C" | Remove-PrintJob

# 重启打印假脱机服务
net stop spooler
net start spooler
```

#### B. 热敏打印机特殊设置
```bash
# 对于热敏打印机，可能需要检查:
1. 纸张是否正确安装（热敏面朝上）
2. 打印机是否设置为热敏模式
3. 是否需要特定的切纸命令
```

#### C. 打印机驱动问题
```powershell
# 方法1: 重新安装驱动
1. 控制面板 -> 设备和打印机
2. 右键打印机 -> 删除设备
3. 重新添加打印机

# 方法2: 使用通用驱动
1. 添加打印机时选择"通用/文本模式"
2. 或选择"Generic Text Only"驱动
```

#### D. 权限问题
```bash
# 以管理员身份运行程序
右键程序 -> 以管理员身份运行
```

### 问题类型2：无法打开打印机

**错误代码及解决方案**:

- **错误代码 5**: 访问被拒绝
  ```bash
  解决方案: 以管理员身份运行程序
  ```

- **错误代码 1801**: 打印机名称无效
  ```bash
  解决方案: 检查打印机名称是否正确，注意中文字符
  ```

- **错误代码 1812**: 打印机驱动不兼容
  ```bash
  解决方案: 更新或重新安装打印机驱动
  ```

### 问题类型3：中文乱码或不显示

**解决方案**:
```bash
# 使用中文编码优化功能
.\target\release\printer-engine.exe test-print --printer "打印机名称" --width 80

# 如果还是乱码，尝试不同编码
1. GBK编码（推荐热敏打印机）
2. UTF-8编码（推荐办公打印机）
3. GB18030编码（最全字符集）
```

## 🔧 手动排查步骤

### 1. 基础检查
- [ ] 打印机电源是否开启
- [ ] USB/网络连接是否正常
- [ ] 打印机是否有纸
- [ ] 打印机盖子是否关闭
- [ ] 打印机状态是否显示"就绪"

### 2. 系统测试
```bash
# 方法1: Windows系统测试页
1. 控制面板 -> 设备和打印机
2. 右键打印机 -> 打印机属性
3. 打印测试页

# 方法2: 记事本测试
1. 记事本输入简单文字
2. 文件 -> 打印 -> 选择目标打印机
```

### 3. 高级排查
```powershell
# 检查打印假脱机服务
sc query spooler

# 检查打印队列文件
dir C:\Windows\System32\spool\PRINTERS\

# 检查事件日志
eventvwr.msc -> Windows日志 -> 系统
```

## 🎯 针对热敏打印机的特殊解决方案

### XP-80C等热敏打印机特殊设置

1. **切换到ESC/POS模式**
   ```bash
   确保打印机设置为ESC/POS命令模式，而不是Windows图形模式
   ```

2. **纸张设置**
   ```bash
   - 纸张类型: 热敏纸
   - 纸张宽度: 80mm 或 58mm
   - 切纸模式: 自动切纸
   ```

3. **驱动选择优先级**
   ```bash
   1. 厂商提供的ESC/POS驱动（首选）
   2. Generic Text Only驱动
   3. Windows默认打印机驱动（最后选择）
   ```

4. **测试ESC/POS命令**
   ```bash
   # 手动发送测试命令
   echo -e "\x1B@Test\x0A\x1D\x56\x00" > PRN
   ```

## 🆘 终极解决方案

如果上述方法都无效，尝试以下终极解决方案：

### 1. 完全重置打印系统
```powershell
# 停止打印服务
net stop spooler

# 清理打印队列文件
del /q /s C:\Windows\System32\spool\PRINTERS\*

# 清理注册表（谨慎操作）
# 注意：需要管理员权限，建议备份注册表
reg delete "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Print\Printers" /f

# 重启打印服务
net start spooler

# 重新添加打印机
```

### 2. 使用原始端口打印
```bash
# 直接发送到USB端口（适用于USB打印机）
echo "Test Print" > \\.\USB001

# 或者发送到LPT端口
echo "Test Print" > LPT1
```

### 3. 第三方打印工具验证
```bash
# 使用系统自带的print命令
print /d:打印机名称 测试文件.txt

# 或使用PowerShell
Get-Content 测试文件.txt | Out-Printer -Name "打印机名称"
```

## 📞 获取更多帮助

如果问题仍然存在，请提供以下信息：

1. 诊断工具的完整输出
2. 打印机型号和驱动版本
3. Windows版本和位数
4. 错误日志或错误代码
5. 是否曾经能够正常打印

## 🔄 版本更新

- v1.0.0: 基础诊断功能
- v1.1.0: 添加队列检查和清理功能
- v1.2.0: 增强热敏打印机支持

---

**记住**: 90%的打印问题都是由权限、驱动或队列问题引起的。按照本指南逐步排查，大部分问题都能解决！ 🎉