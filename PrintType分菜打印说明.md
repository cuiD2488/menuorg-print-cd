# PrintType 分菜打印功能说明

## 🍽️ 功能概述

PrintType 分菜打印功能允许根据菜品的 `printer_type` 字段将订单分配到不同的打印机，实现厨房分工打印。

## 🔧 核心原理

### 1. printer_type 字段
- 每个菜品可以设置 `printer_type` 字段（数字类型）
- `printer_type = 0` 或未设置：归入完整订单
- `printer_type > 0`：分配到对应编号的打印机

### 2. 打印机编号
- 每台打印机可以设置编号（1-99）
- 编号对应菜品的 `printer_type` 值
- 没有编号的打印机打印完整订单

### 3. 分菜逻辑
```
菜品 printer_type = 1 → 编号为 1 的打印机
菜品 printer_type = 2 → 编号为 2 的打印机
菜品 printer_type = 0 → 没有编号的打印机（完整订单）
```

## 📝 使用步骤

### 1. 设置打印机编号
```javascript
// 设置打印机编号
printerManager.setPrinterNumber('热菜打印机', 1);
printerManager.setPrinterNumber('凉菜打印机', 2);
printerManager.setPrinterNumber('汤品打印机', 3);
// 收银打印机不设置编号，打印完整订单
```

### 2. 启用分菜模式
```javascript
// 启用分菜打印
printerManager.setSeparatePrintingMode(true);
```

### 3. 菜品数据格式
```javascript
const order = {
  order_id: '12345',
  // ... 其他订单信息
  dishes_array: [
    {
      dishes_name: '宫保鸡丁',
      price: '18.50',
      amount: '1',
      printer_type: '1' // 分配给1号打印机（热菜）
    },
    {
      dishes_name: '凉拌黄瓜',
      price: '8.00',
      amount: '1',
      printer_type: '2' // 分配给2号打印机（凉菜）
    },
    {
      dishes_name: '米饭',
      price: '3.00',
      amount: '2',
      printer_type: '0' // 完整订单（主食）
    }
  ]
};
```

### 4. 执行打印
```javascript
// 执行分菜打印
const result = await printerManager.printOrder(order);
console.log(result);
```

## 🎯 实际应用场景

### 餐厅厨房分工
- **热菜台**：printer_type = 1，处理炒菜、煎炸等
- **凉菜台**：printer_type = 2，处理凉拌菜、沙拉等
- **汤品台**：printer_type = 3，处理汤类、粥类等
- **收银台**：无编号，打印完整订单用于核对

### 配置示例
```javascript
// 打印机配置
printerManager.setPrinterNumber('厨房热菜打印机', 1);
printerManager.setPrinterNumber('厨房凉菜打印机', 2);
printerManager.setPrinterNumber('厨房汤品打印机', 3);
// 收银打印机不设置编号

// 启用分菜模式
printerManager.setSeparatePrintingMode(true);

// 菜品配置
const dishes = [
  { dishes_name: '红烧肉', printer_type: '1' },      // → 热菜台
  { dishes_name: '拍黄瓜', printer_type: '2' },      // → 凉菜台
  { dishes_name: '紫菜蛋花汤', printer_type: '3' },  // → 汤品台
  { dishes_name: '米饭', printer_type: '0' }         // → 收银台（完整订单）
];
```

## 🔍 API 接口

### 打印机编号管理
```javascript
// 设置打印机编号
printerManager.setPrinterNumber(printerName, number);

// 获取打印机编号
const number = printerManager.getPrinterNumber(printerName);
```

### 分菜模式控制
```javascript
// 启用/禁用分菜模式
printerManager.setSeparatePrintingMode(enabled);
```

### 配置管理
```javascript
// 获取当前配置
const config = printerManager.getPrintTypeConfig();

// 重置所有配置
printerManager.resetPrintTypeConfig();
```

## 📊 打印结果

分菜打印完成后会返回详细的结果信息：

```javascript
{
  成功数量: 3,
  失败数量: 0,
  错误列表: [],
  打印引擎: 'C-Lodop (分菜打印)',
  分菜模式: true,
  打印详情: [
    {
      printer: '热菜打印机',
      success: true,
      type: 'partial',
      dishCount: 2,
      printer_type: 1
    },
    {
      printer: '凉菜打印机',
      success: true,
      type: 'partial',
      dishCount: 1,
      printer_type: 2
    },
    {
      printer: '收银打印机',
      success: true,
      type: 'full',
      dishCount: 5,
      printer_type: null
    }
  ]
}
```

## 📋 小票格式

### 分菜小票（部分订单）
```
#12345 - Type 1

Order Date: 12/25, 02:30 PM
Pickup Time: 12/25, 03:00 PM
Payment: Card
Customer: 张三
Phone: 13800138000
Type: Pickup

============================
Item                 Qty Price
----------------------------
宫保鸡丁              1  $18.50
  微辣，不要花生

麻婆豆腐              1  $16.00
  中辣

============================
部分小计                $34.50

PrintType 1 - 2个菜品
```

### 完整订单小票
```
#12345

Order Date: 12/25, 02:30 PM
Pickup Time: 12/25, 03:00 PM
Payment: Card
Customer: 张三
Phone: 13800138000
Type: Pickup

============================
Item                 Qty Price
----------------------------
宫保鸡丁              1  $18.50
  微辣，不要花生

麻婆豆腐              1  $16.00
  中辣

凉拌黄瓜              1   $8.00
  多放蒜

银耳莲子汤            2  $12.00
  温热

米饭                  2   $3.00

============================
Subtotal                $45.50
Tax                      $3.64
Tip                      $5.00
TOTAL                   $54.14
```

## 🚀 测试方法

1. 打开 `test-printtype.html` 测试页面
2. 点击"初始化打印机"
3. 设置打印机编号
4. 启用分菜模式
5. 调整菜品的 printer_type 值
6. 点击"测试分菜打印"

## ⚠️ 注意事项

1. **向后兼容**：如果不启用分菜模式，所有打印机都打印完整订单
2. **兜底机制**：如果找不到对应编号的打印机，菜品会归入完整订单
3. **数据格式**：printer_type 字段应为字符串格式的数字
4. **编号范围**：打印机编号建议使用 1-99 范围内的数字
5. **配置持久化**：当前配置在页面刷新后会丢失，实际使用时需要持久化存储

## 🔧 故障排除

### 常见问题

1. **分菜不生效**
   - 检查是否启用了分菜模式
   - 确认打印机编号设置正确
   - 验证菜品的 printer_type 字段值

2. **打印机找不到**
   - 确认打印机已选中
   - 检查打印机编号是否匹配
   - 查看控制台日志信息

3. **部分菜品未打印**
   - 检查对应编号的打印机是否在线
   - 确认打印机是否被选中
   - 查看错误列表信息

### 调试方法
```javascript
// 查看当前配置
const config = printerManager.getPrintTypeConfig();
console.log('当前配置:', config);

// 查看打印机状态
const status = printerManager.getEngineStatus();
console.log('打印机状态:', status);

// 查看调试信息
const debug = printerManager.getDebugInfo();
console.log('调试信息:', debug);
```