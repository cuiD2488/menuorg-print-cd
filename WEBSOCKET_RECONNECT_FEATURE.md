# WebSocket重连后自动打印错过订单功能

## 功能概述

当WebSocket连接断开后重新连接时，系统会自动检查在断开期间错过的订单，并自动打印这些订单，确保不会遗漏任何订单。

## 核心特性

### 1. 已打印订单记录
- 使用 `Set` 数据结构记录所有已打印的订单ID
- 数据持久化存储在 `localStorage` 中，应用重启后仍然有效
- 自动清理机制：当记录超过100个时，保留最近的50个

### 2. WebSocket重连检测
- 自动检测WebSocket是否为重连（非首次连接）
- 记录每次连接的时间戳
- 记录最后检查订单的时间

### 3. 错过订单检查
- 重连后自动调用API获取最近20个订单
- 筛选出在断开期间创建的新订单
- 排除已打印的订单，避免重复打印
- 只处理待处理(0)或已确认(1)状态的订单

### 4. 自动打印流程
- 按订单创建时间排序，最早的订单先打印
- 使用与手动打印完全相同的逻辑
- 每个订单打印间隔1秒，避免打印过快
- 显示处理进度和结果通知

## 技术实现

### 关键方法

1. **`checkMissedOrdersAfterReconnect()`** - 检查错过的订单
2. **`filterMissedOrders(orders)`** - 筛选错过的订单
3. **`executeAutoPrint(order)`** - 执行自动打印（防重复）
4. **`savePrintedOrdersRecord()`** - 保存已打印记录
5. **`loadPrintedOrdersRecord()`** - 加载已打印记录

### 数据结构

```javascript
// 已打印订单ID集合
this.printedOrderIds = new Set(['order_123', 'order_456', ...]);

// 时间戳记录
this.lastWebSocketConnectTime = new Date();
this.lastOrderCheckTime = new Date();
```

### 存储格式

```javascript
// localStorage中的数据
localStorage.setItem('printedOrderIds', JSON.stringify([
  'order_123', 'order_456', 'order_789'
]));
```

## 使用场景

1. **网络不稳定** - 网络波动导致WebSocket断开重连
2. **服务器维护** - 服务器重启后客户端重连
3. **应用重启** - 应用程序重启后重新连接
4. **长时间离线** - 长时间断网后重新连接

## 安全机制

### 防重复打印
- 所有打印操作（手动+自动）都会记录订单ID
- 每次打印前检查是否已打印过
- 跨会话保持记录（localStorage持久化）

### 时间窗口控制
- 只检查最近时间窗口内的订单
- 首次连接时默认检查最近5分钟的订单
- 重连时检查上次检查时间之后的订单

### 订单状态过滤
- 只处理有效状态的订单（待处理、已确认）
- 忽略已完成、已取消等状态的订单

## 测试功能

提供了完整的测试工具集：

```javascript
// 检查自动打印条件
testWebSocketAutoPrint.checkConditions()

// 测试重连后检查错过订单
testWebSocketAutoPrint.testMissedOrders()

// 模拟WebSocket重连
testWebSocketAutoPrint.simulateReconnect()

// 检查已打印订单记录
testWebSocketAutoPrint.checkPrintedRecords()

// 清空已打印订单记录
testWebSocketAutoPrint.clearPrintedRecords()
```

## 日志输出

系统提供详细的日志输出，便于调试：

```
[APP] WebSocket重连成功，检查错过的订单...
[APP] 获取到 15 个最近订单
[APP] 发现 3 个错过的订单: ['order_123', 'order_456', 'order_789']
[APP] 处理错过的订单: order_123
[APP] 订单 order_123 已记录为已打印
[APP] 错过订单处理完成
```

## 配置选项

- 自动打印必须启用 (`autoPrint` 复选框)
- 必须选择至少一台打印机
- 用户必须已登录
- WebSocket必须连接成功

## 注意事项

1. 该功能依赖于API的订单列表接口
2. 需要确保订单的创建时间字段准确
3. 建议定期清理已打印记录，避免存储过多数据
4. 网络环境不稳定时可能需要调整检查间隔