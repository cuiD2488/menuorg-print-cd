# 双引擎打印系统使用指南

本文档介绍如何使用双引擎打印系统，支持普通模式和C-Lodop兼容模式。

## 🎯 功能概述

### 两种构建模式

1. **普通模式** (`npm run build`)
   - 使用原生Electron打印API
   - 适用于Windows 10/11等现代系统
   - 更好的性能和稳定性

2. **C-Lodop兼容模式** (`npm run build:lodop`)
   - 使用C-Lodop打印控件
   - 专为Windows 7及老旧系统设计
   - 需要用户安装C-Lodop控件

## 🚀 快速开始

### 构建普通版本
```bash
npm run build
```

### 构建C-Lodop兼容版本
```bash
npm run build:lodop
```

### 开发模式
```bash
# 普通开发模式
npm run dev

# C-Lodop开发模式
npm run dev:lodop
```

## 📁 文件结构

```
menuorg-print-cd/
├── build-config.js              # 构建配置生成器
├── src/
│   └── printer-lodop.js         # C-Lodop打印机管理器
├── renderer/
│   ├── js/
│   │   └── printer-manager.js   # 智能打印机管理器
│   ├── LodopFuncs.js            # C-Lodop函数库
│   └── build-config.json        # 运行时构建配置
├── test-lodop.html              # C-Lodop测试页面
└── test-dual-engine.js          # 双引擎系统测试
```

## 🔧 工作原理

### 构建时配置
1. 运行构建命令时，`build-config.js`根据环境变量生成配置
2. 配置文件`build-config.json`被写入`renderer`目录
3. 应用启动时读取此配置决定使用哪种打印引擎

### 运行时引擎选择
```javascript
// 智能引擎选择逻辑
if (buildConfig.useLodop) {
  // 尝试初始化C-Lodop
  if (C-Lodop可用) {
    使用C-Lodop引擎
  } else {
    回退到原生引擎 + 显示安装提示
  }
} else {
  使用原生Electron引擎
}
```

## 📋 使用场景

### 场景1: 现代Windows系统
- **推荐**: 使用普通模式 (`npm run build`)
- **优势**: 性能更好，无需额外安装
- **支持**: Windows 10/11, 现代浏览器

### 场景2: Windows 7 或老旧系统
- **推荐**: 使用C-Lodop模式 (`npm run build:lodop`)
- **要求**: 用户需安装C-Lodop控件
- **优势**: 兼容性更好，支持老系统

### 场景3: 混合环境部署
- 可以同时提供两个版本的安装包
- 用户根据系统情况选择合适版本

## 🛠️ 开发指南

### 添加新的打印功能
1. 在`src/printer-lodop.js`中添加C-Lodop实现
2. 在原有打印模块中添加原生实现
3. 在`renderer/js/printer-manager.js`中添加统一接口

### 测试不同模式
```bash
# 测试普通模式
npm run dev

# 测试C-Lodop模式
npm run dev:lodop

# 运行系统测试
node test-dual-engine.js
```

### C-Lodop测试页面
打开 `test-lodop.html` 可以：
- 检查C-Lodop安装状态
- 测试打印机连接
- 验证打印功能

## 🔍 故障排除

### C-Lodop模式问题

#### 问题: C-Lodop不可用
**症状**: 应用显示"C-Lodop未安装"
**解决**:
1. 访问 http://www.lodop.net/download.html
2. 下载并安装C-Lodop控件
3. 重启应用程序

#### 问题: 打印机无法识别
**症状**: C-Lodop模式下打印机列表为空
**解决**:
1. 检查打印机驱动是否正确安装
2. 确认打印机在系统中可见
3. 重启C-Lodop服务

#### 问题: 打印失败
**症状**: 发送打印命令但无输出
**解决**:
1. 使用测试页面验证C-Lodop功能
2. 检查打印机状态和纸张
3. 查看控制台错误日志

### 普通模式问题

#### 问题: 打印机列表为空
**解决**:
1. 检查Electron版本兼容性
2. 确认系统打印服务正常
3. 重新启动应用

## 📊 性能对比

| 特性 | 普通模式 | C-Lodop模式 |
|------|----------|-------------|
| 系统兼容性 | Windows 10+ | Windows 7+ |
| 安装要求 | 无 | 需安装C-Lodop |
| 打印性能 | 高 | 中等 |
| 内存占用 | 低 | 中等 |
| 稳定性 | 高 | 高 |
| 维护成本 | 低 | 中等 |

## 🔄 版本管理

### 构建标识
每个构建版本都包含构建信息：
```json
{
  "buildMode": "lodop",
  "useLodop": true,
  "buildTime": "2025-01-21T12:00:00.000Z",
  "version": "1.0.0"
}
```

### 版本检查
应用启动时会显示当前使用的引擎：
```
[PrinterManager] 使用 C-Lodop 打印引擎
[PrinterManager] 构建模式: lodop
```

## 📝 最佳实践

1. **开发阶段**: 使用 `npm run dev:lodop` 测试C-Lodop功能
2. **测试阶段**: 在不同系统上测试两种模式
3. **部署阶段**: 根据目标用户系统选择合适版本
4. **维护阶段**: 定期更新C-Lodop控件版本

## 🎉 总结

双引擎打印系统提供了灵活的部署选择：
- ✅ 支持现代和传统Windows系统
- ✅ 自动引擎选择和回退机制
- ✅ 统一的API接口
- ✅ 完整的测试和调试工具

根据您的部署环境选择合适的构建模式，确保最佳的用户体验！