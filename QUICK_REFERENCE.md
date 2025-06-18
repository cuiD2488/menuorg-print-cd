# 🚀 快速参考卡片

> 餐厅订单打印系统常用命令和功能速查

---

## 📋 常用命令

### 基础操作
```bash
# 列出所有打印机
cargo run -- list-printers

# 测试打印机
cargo run -- test-printer "打印机名称"

# 打印订单
cargo run -- print-order "打印机名称" --order-data '{...}'
```

### 预览功能 ⭐
```bash
# 80mm 纸张预览
cargo run -- preview-order --width 80 --font-size 0

# 58mm 纸张预览
cargo run -- preview-order --width 58 --font-size 1

# 大字体预览
cargo run -- preview-order --width 80 --font-size 2
```

### 中文编码测试
```bash
# 测试单个编码
cargo run -- test-encoding --printer "XPrinter" --encoding "GBK"

# 测试所有编码
cargo run -- test-all-encodings --printer "XPrinter"

# 批量测试所有打印机
cargo run -- batch-test-encodings
```

### 交互模式
```bash
# 启动交互式界面
cargo run -- interactive

# 调试模式
cargo run -- debug-mode
```

---

## 🎯 核心功能速览

### ✅ 完整功能列表

| 功能 | 状态 | 命令 |
|------|------|------|
| 打印机管理 | ✅ | `list-printers` |
| 订单打印 | ✅ | `print-order` |
| **打印预览** | ⭐ | `preview-order` |
| 中文支持 | ✅ | `test-encoding` |
| 智能换行 | ✅ | 自动处理 |
| 编码测试 | ✅ | `test-all-encodings` |
| 性能监控 | ✅ | `benchmark` |

### 🎨 布局特性（v2.0.0）

- ✅ **简化头部**: 无冗余餐厅信息
- ✅ **突出订单**: 居中显示订单号
- ✅ **智能时间**: 只显示时间 "06:30 PM"
- ✅ **取餐方式**: 自取/外送自动判断
- ✅ **智能换行**: 菜名、描述、备注自动换行
- ✅ **Unicode预览**: 精美边框显示

---

## 📊 数据格式

### 订单数据结构
```json
{
  "order_id": "23410121749595834",
  "serial_num": "#042",
  "rd_name": "老王川菜馆 (LIAO WANG SICHUAN RESTAURANT)",
  "recipient_name": "张三 (Zhang San)",
  "recipient_address": "123 Main Street, Suite 2B\nBeijing, China 100001",
  "recipient_phone": "(555) 123-4567",
  "order_date": "06:30 PM",      // 新格式：只显示时间
  "pickup_time": "07:15 PM",     // 新格式：只显示时间
  "payment_method": "Pay at store",
  "delivery_type": "delivery",   // 新增："pickup" 或 "delivery"
  "dishes_array": [
    {
      "dishes_name": "麻婆豆腐 (Mapo Tofu)",
      "dishes_description": "+ 嫩豆腐配麻辣汤汁 (Soft tofu with spicy sauce)",
      "amount": 1,
      "price": "18.99",
      "remark": "不要太辣 (Not too spicy)"
    }
  ],
  "subtotal": "78.95",
  "discount": "-5.00",
  "tax_rate": "8.3",
  "tax_fee": "6.89",
  "delivery_fee": "3.99",
  "service_rate": "3.5",
  "service_fee": "2.76",
  "tip": "7.50",
  "total": "94.09"
}
```

### 菜品结构
```json
{
  "dishes_name": "蒜蓉西兰花炒牛肉丝配黑胡椒汁 (Garlic Broccoli...)",
  "dishes_description": "+ 新鲜西兰花配嫩牛肉丝和蒜蓉 (Fresh broccoli...)",
  "amount": 1,
  "price": "28.99",
  "remark": "牛肉要嫩一点，西兰花不要太软 (Beef should be tender...)"
}
```

---

## ⚡ 性能参数

### 纸张规格
- **80mm**: 48字符宽度，推荐用于详细订单
- **58mm**: 32字符宽度，适合简单订单

### 字体大小
- **0 (小号)**: 标准大小，信息密度高
- **1 (中号)**: 增强可读性
- **2 (大号)**: 老年友好，醒目显示

### 编码支持
- **UTF8**: 通用编码，兼容性最好
- **GBK**: 简体中文优化
- **GB18030**: 完整中文支持
- **BIG5**: 繁体中文专用

---

## 🔧 故障排查

### 常见问题快速解决

#### 打印机找不到
```bash
# 检查打印机状态
cargo run -- list-printers
# 重新检测
cargo run -- refresh-printers
```

#### 中文显示乱码
```bash
# 测试编码兼容性
cargo run -- test-encoding --printer "打印机名称" --encoding "GBK"
# 使用推荐编码
cargo run -- test-all-encodings --printer "打印机名称"
```

#### 布局显示错误
```bash
# 检查预览效果
cargo run -- preview-order --width 80 --font-size 0
# 调整字体大小
cargo run -- preview-order --width 80 --font-size 1
```

#### 性能问题
```bash
# 性能测试
cargo run -- benchmark
# 检查系统状态
cargo run -- system-status
```

### 错误代码对照表

| 错误码 | 描述 | 解决方案 |
|--------|------|----------|
| 1801 | 访问被拒绝 | 以管理员身份运行 |
| 1804 | 驱动程序无效 | 重新安装打印机驱动 |
| 2 | 打印机不存在 | 检查打印机名称 |
| 5 | 权限不足 | 提升程序权限 |

---

## 📈 版本功能对比

| 功能 | v1.0.0 | v1.5.0 | **v2.0.0** |
|------|--------|--------|------------|
| 基础打印 | ✅ | ✅ | ✅ |
| 中文编码 | ⚠️ | ✅ | ✅ |
| 智能换行 | ❌ | ✅ | ✅ |
| **打印预览** | ❌ | ❌ | **⭐ 新增** |
| **布局优化** | ❌ | ❌ | **⭐ 新增** |
| **时间简化** | ❌ | ❌ | **⭐ 新增** |
| **取餐方式** | ❌ | ❌ | **⭐ 新增** |

---

## 🎯 最佳实践

### 💡 使用建议

1. **预览先行**: 打印前先用 `preview-order` 检查效果
2. **编码测试**: 新打印机先用 `test-all-encodings` 测试
3. **合适纸张**: 菜品多用80mm，简单订单用58mm
4. **字体选择**: 老年客户用大字体，一般用小字体

### 🔄 工作流程

```
1. 添加打印机 → list-printers
2. 测试编码   → test-all-encodings
3. 预览订单   → preview-order
4. 确认无误   → print-order
5. 性能监控   → benchmark
```

### ⚙️ 配置推荐

```json
{
  "default_width": 80,
  "default_font_size": 0,
  "preferred_encoding": "GBK",
  "auto_preview": true,
  "backup_encoding": "UTF8"
}
```

---

## 📞 获取帮助

### 📚 文档资源
- **完整指南**: `COMPLETE_PROJECT_GUIDE.md`
- **技术详情**: `TECHNICAL_DETAILS.md`
- **更新日志**: `CHANGELOG.md`
- **快速参考**: `QUICK_REFERENCE.md` (本文档)

### 🆘 技术支持
- **问题反馈**: [GitHub Issues](https://github.com/your-repo/win7-print/issues)
- **功能建议**: [GitHub Discussions](https://github.com/your-repo/win7-print/discussions)
- **技术交流**: [Discord 群组](https://discord.gg/your-server)

### 📧 联系方式
- **技术支持**: tech-support@example.com
- **商务合作**: business@example.com
- **反馈建议**: feedback@example.com

---

**🎉 现在您已掌握所有核心功能，可以开始高效使用餐厅订单打印系统了！**

> 💡 **小贴士**: 经常使用 `preview-order` 命令可以大大减少打印错误和纸张浪费！

---

**⭐ 如果这个项目对您有帮助，请在 GitHub 给我们一个星标！** 