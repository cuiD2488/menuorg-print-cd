# 🚀 MenuorgPrint 安装程序构建指南

## 概述

MenuorgPrint 支持生成 Windows 安装程序，安装程序包含开机自动运行选项，用户可以在安装时选择是否启用。

## 功能特点

### 安装程序功能
- **自定义安装目录**：用户可选择安装位置
- **开机自动运行选项**：安装时可选择启用
- **桌面快捷方式**：自动创建桌面图标
- **开始菜单快捷方式**：添加到开始菜单
- **完整卸载**：卸载时清理所有相关设置

### 开机自动运行机制
1. **安装时设置**：通过 NSIS 脚本在注册表中添加启动项
2. **应用内同步**：首次启动时自动同步安装程序的设置
3. **用户控制**：用户可在应用内随时修改开机自动运行设置

## 构建步骤

### 1. 准备环境

确保已安装以下依赖：
```bash
# 使用 cnpm 安装构建依赖
cnpm install
```

### 2. 准备资源文件

在 `assets/` 目录下准备以下文件：
- `icon.ico` - 应用图标（必需）
- `installer-header.bmp` - 安装程序头部图片（可选，推荐 150x57 像素）
- `installer-sidebar.bmp` - 安装程序侧边栏图片（可选，推荐 164x314 像素）

### 3. 构建安装程序

```bash
# 构建 Windows 安装程序
npm run build:win

# 或者构建所有平台（如果需要）
npm run build
```

### 4. 输出位置

构建完成后，安装程序将生成在：
```
dist/
├── MenuorgPrint Setup 1.0.0.exe  # Windows 安装程序
└── win-unpacked/                  # 免安装版本
    └── MenuorgPrint.exe
```

## 安装程序特性

### 高级选项页面

安装程序包含自定义页面，用户可以选择：

- ✅ **开机自动启动 MenuorgPrint（推荐餐厅使用）**
  - 启用后系统启动时自动在后台运行
  - 适合需要24小时营业的餐厅
  - 确保及时处理新订单

### 安装后配置

1. **自动配置**：如果用户在安装时选择了开机自动运行，将自动：
   - 写入 Windows 注册表启动项
   - 创建配置标记文件
   - 在应用首次启动时同步设置

2. **用户提示**：首次启动时会显示友好提示，告知用户开机自动运行已启用

3. **灵活控制**：用户可随时在应用设置中修改开机自动运行选项

## 开发者说明

### 安装脚本结构

```
installer/
└── installer-script.nsh    # NSIS 自定义安装脚本
```

### 关键配置

**package.json 中的构建配置：**
- `nsis.include` - 引用自定义安装脚本
- `nsis.oneClick: false` - 允许用户自定义安装
- `nsis.runAfterFinish: true` - 安装完成后运行应用

**main.js 中的处理逻辑：**
- `initAutoStart()` - 检测并同步安装程序设置
- 自动处理 `auto-start-enabled.flag` 标记文件

## 测试建议

### 安装测试
1. 在干净的 Windows 系统上测试安装
2. 验证开机自动运行选项是否正常工作
3. 测试卸载是否完全清理设置

### 功能测试
1. 安装时选择启用开机自动运行
2. 重启系统验证应用是否自动启动
3. 在应用内修改开机自动运行设置
4. 验证托盘菜单中的开机自动运行状态

## 故障排除

### 常见问题

**1. 开机自动运行不生效**
- 检查注册表：`HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`
- 确认应用路径正确
- 验证 `--auto-start` 参数

**2. 安装程序构建失败**
- 确保 `assets/icon.ico` 文件存在
- 检查 NSIS 脚本语法
- 验证 electron-builder 配置

**3. 卸载后残留**
- 检查注册表项是否正确删除
- 验证配置文件清理

## 技术细节

### 开机自动运行实现原理

1. **注册表方式**：
   ```reg
   [HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run]
   "MenuorgPrint"="\"C:\\Path\\To\\MenuorgPrint.exe\" --auto-start"
   ```

2. **Electron API**：
   ```javascript
   app.setLoginItemSettings({
     openAtLogin: true,
     openAsHidden: true,
     args: ['--auto-start']
   });
   ```

3. **同步机制**：
   - 安装程序 → 注册表 → 标记文件
   - 应用启动 → 检测标记 → 同步配置 → 删除标记

这种设计确保了安装程序设置和应用内设置的完全同步，为用户提供了一致的体验。