# 程序已运行提示对话框功能

## 🎯 功能概述

当用户尝试启动已经在运行的MenuorgPrint应用时，系统会智能显示一个友好的对话框，提示用户程序状态并提供相应的操作选项。这个功能极大地改善了用户体验，避免了用户困惑和重复启动的问题。

## ✨ 核心特性

### 1. **智能单实例管理**
- 🔍 自动检测是否已有实例在运行
- 🚫 防止重复启动造成资源浪费
- 🎮 提供直观的用户交互界面

### 2. **丰富的用户选择**
- **切换到已运行程序** - 恢复并聚焦主窗口
- **关闭提示** - 继续使用后台运行的程序
- **显示详细信息** - 查看完整的运行状态

### 3. **详细的状态信息**
- 📊 实时显示程序运行时长
- 💾 内存使用情况
- 🖥️ 窗口和托盘状态
- 🔧 系统和应用版本信息

### 4. **灵活的配置选项**
- ⚙️ 通过托盘菜单一键开启/关闭
- 🔇 禁用后智能静默处理
- 💾 配置自动保存和持久化

## 🔧 技术实现

### 核心文件修改

#### 1. **main.js** - 主进程逻辑
```javascript
// 增强的单实例检查
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 检查配置是否启用对话框
  if (getShowAlreadyRunningDialog()) {
    showAlreadyRunningDialog(); // 显示对话框
  } else {
    app.quit(); // 静默退出
  }
}
```

#### 2. **对话框功能**
```javascript
async function showAlreadyRunningDialog() {
  // 获取当前运行状态
  const runningInfo = getCurrentRunningInfo();
  
  // 显示多选项对话框
  const response = await dialog.showMessageBox({
    type: 'info',
    title: 'MenuorgPrint 已在运行',
    buttons: ['切换到已运行程序', '关闭提示', '显示详细信息'],
    // ... 详细配置
  });
}
```

#### 3. **托盘菜单集成**
```javascript
function createTrayMenu() {
  return Menu.buildFromTemplate([
    // ... 其他菜单项
    {
      label: '💬 程序已运行提示',
      type: 'checkbox',
      checked: getShowAlreadyRunningDialog(),
      click: (menuItem) => {
        setShowAlreadyRunningDialog(menuItem.checked);
      }
    }
  ]);
}
```

### 辅助功能函数

#### 1. **状态信息收集**
```javascript
function getCurrentRunningInfo() {
  return {
    startTime: '启动时间',
    uptime: '运行时长',
    windowStatus: '窗口状态',
    trayStatus: '托盘状态',
    processId: '进程ID',
    memoryUsage: '内存使用'
  };
}
```

#### 2. **配置管理**
```javascript
// 获取配置
function getShowAlreadyRunningDialog() {
  const config = getConfig();
  return config.showAlreadyRunningDialog !== false; // 默认启用
}

// 保存配置
function setShowAlreadyRunningDialog(enabled) {
  const config = getConfig();
  config.showAlreadyRunningDialog = enabled;
  saveConfig(config);
}
```

## 🎨 用户界面设计

### 主对话框
```
┌─────────────────────────────────────────┐
│  [图标] MenuorgPrint 已在运行           │
├─────────────────────────────────────────┤
│                                         │
│  检测到 MenuorgPrint 已经在后台运行。   │
│                                         │
│  当前状态：                             │
│  • 启动时间：2024-01-20 09:30:25        │
│  • 运行时长：2小时15分钟                │
│  • 窗口状态：隐藏                       │
│  • 托盘状态：运行中                     │
│                                         │
│  您可以选择：                           │
│  • 切换到已运行的程序并显示窗口         │
│  • 关闭此提示，继续使用后台运行的程序   │
│                                         │
│  提示：程序在系统托盘中运行，请检查     │
│  任务栏右下角的图标。                   │
│                                         │
├─────────────────────────────────────────┤
│  [切换到已运行程序] [关闭提示] [详细信息] │
└─────────────────────────────────────────┘
```

### 详细信息对话框
```
┌─────────────────────────────────────────┐
│  MenuorgPrint 详细运行信息              │
├─────────────────────────────────────────┤
│                                         │
│  === 应用运行状态 ===                   │
│  • 进程ID: 12345                        │
│  • 启动时间: 2024-01-20 09:30:25        │
│  • 运行时长: 2小时15分钟                │
│  • 内存使用: 45MB                       │
│  • 窗口状态: 隐藏                       │
│  • 托盘状态: 运行中                     │
│                                         │
│  === 应用配置 ===                       │
│  • 应用版本: 1.0.0                      │
│  • 开机自启: 已启用                     │
│  • 打包模式: 生产环境                   │
│                                         │
│  === 系统信息 ===                       │
│  • 操作系统: win32 (x64)                │
│  • Node.js: v18.17.0                    │
│  • Electron: 25.3.1                     │
│                                         │
│  === 操作建议 ===                       │
│  • 如果程序无响应，可以通过任务管理器   │
│    结束进程                             │
│  • 程序通常在系统托盘中运行，点击托盘   │
│    图标可以显示窗口                     │
│  • 如果需要完全退出，请右键托盘图标     │
│    选择"退出"                           │
│                                         │
├─────────────────────────────────────────┤
│        [确定]    [复制到剪贴板]          │
└─────────────────────────────────────────┘
```

## 🚀 使用场景

### 场景1：开机自启动后重复启动
```
用户场景：
1. 电脑开机，程序自动在后台启动
2. 用户忘记程序已启动，点击桌面图标
3. 系统显示友好提示对话框
4. 用户选择"切换到已运行程序"
5. 主窗口恢复到前台，用户继续工作

优势：
- 避免用户困惑
- 提供清晰的状态信息
- 一键恢复工作环境
```

### 场景2：程序在托盘运行时重复启动
```
用户场景：
1. 程序正在托盘中运行
2. 用户重复启动程序
3. 系统显示状态信息和选择选项
4. 用户了解程序运行状态
5. 选择适当的操作继续使用

优势：
- 提供详细的运行信息
- 用户了解程序实际状态
- 减少技术支持需求
```

### 场景3：高级用户需要详细信息
```
用户场景：
1. 高级用户重复启动程序
2. 点击"显示详细信息"
3. 查看完整的系统和应用状态
4. 复制信息用于故障排除
5. 正确处理程序状态

优势：
- 满足高级用户需求
- 便于故障诊断
- 提高技术支持效率
```

## 📋 配置选项

### 默认配置
```json
{
  "showAlreadyRunningDialog": true,
  "showAlreadyRunningDialogLastUpdate": "2024-01-20T09:30:25.000Z"
}
```

### 通过托盘菜单配置
- **位置**: 右键托盘图标 → "💬 程序已运行提示"
- **状态**: 复选框显示当前启用/禁用状态
- **效果**: 立即生效，无需重启
- **持久化**: 自动保存到配置文件

### 行为差异

#### 启用状态 (默认)
```
重复启动 → 显示对话框 → 用户选择操作
```

#### 禁用状态
```
重复启动 → 直接恢复窗口 → 显示简短通知
```

## 🔍 错误处理和回退机制

### 对话框显示失败
```javascript
try {
  await showAlreadyRunningDialog();
} catch (error) {
  // 回退方案：显示系统通知
  new Notification({
    title: 'MenuorgPrint 已在运行',
    body: '程序已在后台运行，请检查系统托盘。'
  });
}
```

### 图标文件缺失
```javascript
function getAppIconPath() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  if (fs.existsSync(iconPath)) {
    return iconPath;
  }
  // 回退到PNG格式或返回null
  return null;
}
```

### 配置文件损坏
```javascript
function getShowAlreadyRunningDialog() {
  try {
    const config = getConfig();
    return config.showAlreadyRunningDialog !== false;
  } catch (error) {
    return true; // 默认启用
  }
}
```

## 📊 性能优化

### 1. **延迟加载**
- 对话框组件按需创建
- 避免启动时的性能损失

### 2. **内存管理**
- 临时窗口自动销毁
- 避免内存泄漏

### 3. **响应速度**
- 配置缓存减少文件读取
- 异步操作避免阻塞

## 🧪 测试覆盖

### 功能测试
- [x] 基础对话框显示
- [x] 用户选择响应
- [x] 详细信息展示
- [x] 配置开关功能

### 兼容性测试
- [x] Windows 7/8/10/11
- [x] 不同屏幕分辨率
- [x] 开发和生产环境

### 边界测试
- [x] 连续快速启动
- [x] 窗口各种状态
- [x] 配置文件异常

### 性能测试
- [x] 启动速度影响
- [x] 内存使用情况
- [x] 响应时间测试

## 🎉 用户收益

### 1. **体验提升**
- 🎯 清晰的状态提示
- 🚀 快速的操作响应
- 💡 智能的行为预测

### 2. **问题减少**
- ❓ 减少用户困惑
- 📞 降低技术支持需求
- 🐛 避免重复启动问题

### 3. **专业感提升**
- 🏆 专业的软件体验
- 📊 详细的状态信息
- ⚙️ 灵活的配置选项

## 📚 相关文档

- [测试指南](test-already-running-dialog.md) - 详细的测试步骤和验证方法
- [CLODOP_ENHANCED_GUIDE.md](CLODOP_ENHANCED_GUIDE.md) - 增强CLodop管理器指南
- [BUILD-INSTALLER.md](BUILD-INSTALLER.md) - 安装程序构建指南

## 🔮 未来扩展

### 可能的改进方向
1. **多语言支持** - 支持英文等其他语言
2. **主题定制** - 支持暗色主题
3. **快捷键操作** - 添加键盘快捷键
4. **自定义消息** - 允许用户自定义提示内容
5. **远程管理** - 支持远程查看和控制

### 技术优化
1. **更快的检测** - 优化单实例检测速度
2. **更好的动画** - 添加窗口切换动画
3. **更智能的判断** - 基于用户行为的智能提示

通过这个功能，MenuorgPrint提供了更加专业和用户友好的应用体验！ 