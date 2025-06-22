# MenuorgPrint - CLodop打印方案

## 📋 项目简介

MenuorgPrint 是一个基于 Electron + CLodop 的餐厅订单打印系统，专为热敏打印机设计，支持多种纸张宽度和分菜打印功能。

## ✨ 主要特性

- 🖨️ **CLodop打印引擎** - 使用成熟的CLodop打印方案，稳定可靠
- 📄 **多种纸张支持** - 支持58mm、80mm等热敏纸张
- 🍽️ **分菜打印功能** - 支持按菜品类型分别打印到不同打印机
- 📱 **现代化界面** - 基于Electron的桌面应用
- ⚡ **高性能** - 精简架构，启动快速，运行流畅

## 🏗️ 技术架构

- **前端**: HTML + CSS + JavaScript
- **桌面框架**: Electron 22.3.27
- **打印引擎**: CLodop (C-Lodop)
- **通信协议**: WebSocket
- **构建工具**: electron-builder

## 📁 项目结构

```
├── main.js                 # Electron主进程
├── preload.js             # 预加载脚本
├── package.json           # 项目配置
├── renderer/              # 渲染进程文件
│   ├── index.html        # 主界面
│   ├── js/               # JavaScript文件
│   └── css/              # 样式文件
├── src/                   # 核心代码
│   └── printer-lodop.js  # CLodop打印管理器
├── CLodop/               # CLodop相关文件
└── dist/                 # 构建输出目录
```

## 🚀 快速开始

### 环境要求

- Node.js 16+
- Windows 7/10/11
- 已安装CLodop打印服务

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建应用

```bash
npm run build
```

## 🖨️ 打印机配置

1. 确保已安装CLodop打印服务
2. 连接热敏打印机到系统
3. 在应用中刷新打印机列表
4. 选择要使用的打印机
5. 进行测试打印确认功能正常

## 🍽️ 分菜打印配置

1. 启用分菜打印模式
2. 为每台打印机设置编号
3. 在订单数据中为菜品指定打印机编号
4. 系统将自动按编号分发打印任务

## 📦 项目优化

本项目已进行以下优化：

- ✅ 移除了Rust依赖，减少构建复杂度
- ✅ 删除了混合打印引擎，专注CLodop方案
- ✅ 清理了冗余代码和测试文件
- ✅ 简化了构建配置和依赖关系
- ✅ 优化了启动性能和运行效率

## 🔧 维护说明

- 定期更新CLodop版本以获得最新功能
- 保持Electron版本更新以获得安全修复
- 定期清理日志文件和缓存数据

## 📄 许可证

MIT License

---

**注意**: 使用前请确保已正确安装CLodop打印服务，并且打印机驱动程序已正确配置。