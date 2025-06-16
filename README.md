# 餐厅订单打印系统

基于 Electron + Node.js 开发的餐厅订单打印系统，兼容 Windows 7+ 系统。

## 功能特点

- 🔐 用户登录认证
- 🖨️ 多打印机支持
- 📋 实时订单接收 (WebSocket)
- 🔄 自动打印新订单
- 📱 桌面通知提醒
- ⚙️ 配置持久化存储
- 🎨 现代化界面设计

## 技术栈

- **前端框架**: Electron
- **后端**: Node.js
- **UI**: HTML5 + CSS3 + JavaScript
- **存储**: electron-store
- **打印**: Windows 系统打印API
- **通信**: WebSocket + REST API

## 安装依赖

```bash
npm install
```

## 开发运行

```bash
npm run dev
```

## 打包构建

```bash
npm run build
```

## 项目结构

```
win7-print/
├── package.json          # 项目配置
├── main.js              # Electron 主进程
├── preload.js           # 预加载脚本
├── renderer/            # 渲染进程文件
│   ├── index.html       # 主界面
│   ├── css/
│   │   └── style.css    # 样式文件
│   └── js/
│       ├── app.js       # 主应用逻辑
│       ├── api.js       # API接口调用
│       ├── websocket.js # WebSocket连接
│       └── printer.js   # 打印机管理
└── src/
    └── printer.js       # Node.js打印机模块
```

## API 接口

### 登录接口
- **URL**: `https://api.menuorg.com/app/v1/login`
- **方法**: POST
- **参数**: username, password

### 订单详情接口
- **URL**: `https://api.menuorg.com/app/v1/order/get_by_id`
- **方法**: GET
- **参数**: order_id

### WebSocket地址
- **URL**: `wss://message.menuorg.com/app/v1/web_socket/7{user_id}`

## 使用说明

1. **启动应用**: 运行程序后显示登录界面
2. **用户登录**: 输入用户名和密码进行登录
3. **配置打印机**: 在打印机设置中选择要使用的打印机
4. **测试打印**: 点击"测试打印"验证打印机是否正常工作
5. **接收订单**: 登录成功后自动连接WebSocket接收新订单
6. **打印订单**: 可以手动打印订单，或开启自动打印功能

## 兼容性

- **操作系统**: Windows 7 及以上版本
- **架构**: 支持 32位 和 64位
- **打印机**: 支持系统已安装的所有打印机

## 开发说明

### 主要组件

1. **OrderPrintApp**: 主应用类，负责整体逻辑控制
2. **PrinterManager**: 打印机管理类，处理打印相关操作
3. **WebSocketClient**: WebSocket客户端，处理实时通信
4. **API**: REST API调用封装

### 配置文件

应用配置自动保存在用户目录下的配置文件中，包括：
- 选中的打印机列表
- 自动打印设置
- 其他用户偏好设置

## 构建发布

构建Windows安装包：

```bash
npm run build
```

生成的安装包位于 `dist/` 目录下。

## 注意事项

1. 确保系统已正确安装所需的打印机驱动
2. 首次运行可能需要系统管理员权限
3. 网络连接异常时会自动重连WebSocket
4. 打印失败时会显示错误提示

## 开发者

餐厅订单打印系统 v1.0.0