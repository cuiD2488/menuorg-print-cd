# 🎫 热敏小票打印系统完整指南

## 📋 项目概述

这是一个基于Electron的餐厅订单打印系统，经过完整的优化升级，从简单的左对齐格式进化为专业的热敏小票排版系统。

### 🏗️ 系统架构

```
menuorg-print-cd/
├── main.js                    # Electron主进程
├── preload.js                 # 预加载脚本
├── renderer/                  # 渲染进程文件
├── src/
│   ├── printer-lodop.js       # 🎫 核心打印引擎（专业排版）
│   └── main.rs               # Rust打印引擎
├── test-professional-layout.html    # 专业排版测试
├── test-left-align-format.html     # 排版进化对比测试
└── CLodop/                   # C-Lodop打印组件
```

## 🚀 功能进化历程

### 第一阶段：边距问题修复
**问题**：用户报告"边距的设置没有生效"
- ❌ 字符宽度不一致（34 vs 36字符）
- ❌ 边距计算错误
- ❌ 预览与打印不同步

**解决方案**：
- ✅ 统一字符宽度为34字符
- ✅ 修复边距计算（左右边距各0.5mm）
- ✅ 同步预览功能的边距设置

### 第二阶段：左对齐格式需求
**需求**：菜单部分和费用部分左对齐，标签后间隔4个字符
- ✅ 菜品格式：`菜名    数量    价格`（4个空格间隔）
- ✅ 费用格式：`标签    金额`（4个空格间隔）
- ✅ 规格信息缩进2个空格

### 第三阶段：专业排版系统
**灵感来源**：基于两张真实热敏小票图片分析
- 🏪 Great Wall - Doylestown, PA
- 🏪 NEW CHINA

**专业特性**：
- ✅ 餐厅名称居中显示，大写格式
- ✅ 订单类型（DELIVERY/PICKUP）居中突出
- ✅ 表格式订单信息布局，数值右对齐
- ✅ 带表头的菜品明细表格
- ✅ 长菜名自动换行并保持对齐
- ✅ 所有价格右对齐显示
- ✅ 清晰的区域划分设计
- ✅ 预付费标识支持

## 🎯 核心功能特性

### 1. 自适应宽度支持
```javascript
// 智能宽度计算
if (paperWidth >= 80) {
  totalWidth = 34;      // 80mm热敏纸
} else if (paperWidth >= 58) {
  totalWidth = 24;      // 58mm热敏纸
} else if (paperWidth >= 48) {
  totalWidth = 20;      // 48mm热敏纸
} else {
  totalWidth = Math.max(Math.floor(paperWidth * 0.35), 16);
}
```

### 2. 专业排版布局

#### 头部区域
```
==================================
        GREAT WALL RESTAURANT
             DELIVERY
==================================

          Order #: ORD-2024-001
             Serial: #042
```

#### 订单信息表格
```
Order Date:                12/15/24 2:30 PM
Delivery Time:             12/15/24 3:00 PM
Payment:                              Card
Customer:                     John Smith
Phone:                      (555) 123-4567
```

#### 菜品明细表格
```
----------------------------------
           ORDER ITEMS
----------------------------------
Item Name                Qty  Total
----------------------------------
General Tso's Chicken      1  $14.50
  Served w. White Rice
Pineapple Fried Rice -     1  $12.00
Shrimp
----------------------------------
```

#### 费用汇总
```
----------------------------------
        PAYMENT SUMMARY
----------------------------------
Subtotal:                   $26.50
Tax (8.5%):                  $2.25
Delivery Fee:                $3.99
Tip:                         $4.00
----------------------------------
TOTAL:                      $36.74
==================================
```

### 3. 智能文本处理

#### 中英文混合支持
```javascript
// 计算显示宽度（中文字符算2个宽度）
displayWidth(text) {
  let width = 0;
  for (const char of text) {
    width += char.charCodeAt(0) > 127 ? 2 : 1;
  }
  return width;
}
```

#### 自动换行对齐
```javascript
// 长菜名自动换行，保持表格对齐
const dishLines = this.wrapText(dishName, nameWidth);
const dishLinesArray = dishLines.split('\n');

// 第一行：菜名 + 数量 + 价格
const firstLine = this.padText(dishLinesArray[0] || '', nameWidth, 'left');
const qtyPart = this.padText(qtyStr, qtyWidth, 'center');
const pricePart = this.padText(priceStr, priceWidth, 'right');
content += firstLine + qtyPart + pricePart + '\n';

// 后续行：只显示菜名续行
for (let i = 1; i < dishLinesArray.length; i++) {
  if (dishLinesArray[i].trim()) {
    const continueLine = this.padText(dishLinesArray[i], nameWidth, 'left');
    content += continueLine + ' '.repeat(qtyWidth + priceWidth) + '\n';
  }
}
```

## 🛠️ 辅助函数库

### 文本对齐函数
```javascript
centerText(text, width)           // 居中对齐
formatTableRow(label, value, width) // 表格行（左标签，右数值）
padText(text, width, align)       // 文本填充（左/右/居中）
```

### 文本处理函数
```javascript
displayWidth(text)                // 计算显示宽度
truncateText(text, maxWidth)      // 文本截断
wrapText(text, width)            // 文本自动换行
```

### 格式化函数
```javascript
formatDateTime(dateTimeStr)       // 日期时间格式化
```

## 📱 测试系统

### 1. 专业排版测试 (`test-professional-layout.html`)
- 🎯 多宽度对比测试（80mm vs 58mm）
- 🏪 餐厅样式测试（Pizza Palace、北京烤鸭店、Burger Junction）
- 📱 复杂订单测试（长菜名、长地址、多种费用）
- 🖨️ 实际打印测试

### 2. 排版进化对比测试 (`test-left-align-format.html`)
- 📊 功能对比表（9项功能对比）
- 🔄 排版进化演示（旧版 vs 新版）
- 🎫 多宽度自适应测试
- 🏪 真实餐厅样式测试

## 🎨 视觉设计特点

### 专业商业外观
- **居中标题**：餐厅名称大写居中，突出品牌
- **清晰分区**：使用不同样式的分隔线区分内容区域
- **表格对齐**：所有数据使用专业表格布局
- **价格右对齐**：符合商业小票标准格式

### 响应式设计
- **自适应宽度**：支持80mm、58mm、48mm等多种热敏纸
- **智能换行**：长文本自动换行并保持对齐
- **动态调整**：根据纸张宽度自动调整列宽和字体大小

## 🔧 技术实现

### 打印引擎集成
```javascript
class LodopPrinterManager {
  async printOrder(order) {
    // 生成专业排版内容
    const printContent = this.generateOrderPrintContent(order);

    // 并行打印到所有选中打印机
    const printPromises = selectedPrinters.map(async (printerName) => {
      await this.printToLodop(printerName, printContent, order);
    });

    return await Promise.all(printPromises);
  }
}
```

### 边距精确控制
```javascript
// 精确边距设置
const leftMarginMm = 0.5;    // 左边距0.5mm
const rightMarginMm = 0.5;   // 右边距0.5mm
const availableWidthMm = paperWidth - leftMarginMm - rightMarginMm;

// C-Lodop打印设置
this.LODOP.ADD_PRINT_TEXT(
  `${yPosMm}mm`,              // 顶部位置
  `${leftMarginMm}mm`,        // 左边距
  `${finalTextWidthMm}mm`,    // 文本宽度
  `${lineHeightMm}mm`,        // 行高
  line                        // 文本内容
);
```

## 📈 性能优化

### 高度计算优化
```javascript
// 精确计算纸张高度，减少底部空白
const lines = content.split('\n');
const nonEmptyLines = lines.filter(line => line.trim()).length;
const emptyLines = lines.length - nonEmptyLines;

// 精确计算：非空行4mm + 空行2mm + 上下边距6mm
const estimatedHeight = Math.max(
  nonEmptyLines * 4 + emptyLines * 2 + 6,
  80
);
```

### 字体大小自适应
```javascript
// 根据纸张宽度设置字体大小
const baseFontSize = paperWidth === 58 ? 11 : 12;
const titleFontSize = baseFontSize + 2;  // 标题字体
const itemFontSize = baseFontSize + 1;   // 菜品字体
const normalFontSize = baseFontSize;     // 普通字体
```

## 🎯 使用场景

### 适用的餐厅类型
- 🍕 快餐店（Pizza Palace）
- 🥡 中餐厅（北京烤鸭店、Great Wall、NEW CHINA）
- 🍔 西餐厅（Burger Junction）
- 🍜 各类外卖餐厅

### 支持的订单类型
- 📦 外卖订单（DELIVERY）
- 🏃 自取订单（PICKUP）
- 💳 预付费订单（Prepaid标识）
- 💵 现金订单

### 支持的打印机
- 🖨️ 80mm热敏打印机（主流）
- 🖨️ 58mm热敏打印机（紧凑型）
- 🖨️ 48mm热敏打印机（便携式）
- 🖨️ 其他尺寸热敏打印机

## 🚀 部署和使用

### 快速开始
1. **打开测试页面**
   ```bash
   start test-professional-layout.html
   ```

2. **测试不同宽度**
   - 点击"生成80mm预览"
   - 点击"生成58mm预览"

3. **测试复杂订单**
   - 点击"测试复杂订单"
   - 查看长菜名、多费用处理

4. **实际打印测试**
   - 确保C-Lodop已安装
   - 连接热敏打印机
   - 点击"测试实际打印"

### 集成到现有系统
```javascript
// 初始化打印管理器
const lodopManager = new LodopPrinterManager();
await lodopManager.init();

// 打印订单
const result = await lodopManager.printOrder(orderData);
console.log(`打印结果: 成功${result.成功数量}, 失败${result.失败数量}`);
```

## 🎉 项目成果

### 从简单到专业的完整进化
- ✅ **边距问题** → 精确边距控制
- ✅ **左对齐需求** → 专业表格布局
- ✅ **基础功能** → 商业级排版系统

### 真实商业应用
- ✅ 基于真实小票样式设计
- ✅ 符合商业打印标准
- ✅ 支持多语言和多币种
- ✅ 完整的错误处理和调试

### 可扩展性
- ✅ 模块化设计，易于维护
- ✅ 辅助函数可复用
- ✅ 支持自定义样式
- ✅ 完整的测试系统

## 📞 技术支持

### 测试文件
- `test-professional-layout.html` - 专业排版功能测试
- `test-left-align-format.html` - 排版进化对比测试

### 核心文件
- `src/printer-lodop.js` - 核心打印引擎
- `renderer/LodopFuncs.js` - C-Lodop集成

### 文档
- `THERMAL_RECEIPT_SYSTEM_COMPLETE.md` - 完整系统指南
- `LODOP_LAYOUT_OPTIMIZATION.md` - 排版优化记录

---

🎫 **热敏小票打印系统** - 从简单到专业的完整进化，为餐厅提供商业级打印解决方案。