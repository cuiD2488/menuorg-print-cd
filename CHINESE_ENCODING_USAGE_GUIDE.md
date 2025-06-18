# 🔤 中文编码快速使用指南

## 🚀 立即开始

### 1. 快速测试
```bash
# 编译项目
cargo build --release

# 测试打印机中文支持
cargo run -- test-print "你的打印机名称"

# 预览中文订单
cargo run -- preview-order --width 80
```

### 2. 前端集成
```javascript
// 分析文本编码特征
const analysis = await window.__TAURI__.invoke('analyze_text_encoding', {
    text: '宫保鸡丁、麻婆豆腐、白米饭、可乐'
});

console.log('推荐编码:', analysis.recommended_encoding);
console.log('中文检测:', analysis.has_chinese);
```

## 💡 解决乱码问题

### 步骤1: 检测问题
```javascript
// 测试打印机中文支持
const result = await window.__TAURI__.invoke('test_printer_chinese_support', {
    printerName: 'XP-80C'  // 替换为你的打印机名称
});

console.log('兼容性评分:', result.overall_compatibility);
console.log('推荐编码:', result.recommended_encoding);
```

### 步骤2: 设置编码
```javascript
// 设置最佳编码
await window.__TAURI__.invoke('set_printer_encoding_preference', {
    printerName: 'XP-80C',
    preferredEncoding: 'GBK',  // 对于中国品牌打印机推荐GBK
    fallbackEncodings: ['GBK', 'UTF8', 'GB18030']
});
```

### 步骤3: 测试打印
```javascript
// 打印测试订单
await window.__TAURI__.invoke('test_print', {
    printerName: 'XP-80C'
});
```

## 📋 常见打印机编码推荐

| 打印机品牌 | 推荐编码 | 备用编码 | 兼容性 |
|-----------|---------|----------|--------|
| **XPrinter** | GBK | GB18030, UTF8 | 95% |
| **GPrinter** | GBK | GB18030, UTF8 | 95% |
| **Epson** | UTF8 | GBK, ASCII | 90% |
| **Citizen** | UTF8 | GBK, ASCII | 90% |
| **Star** | UTF8 | GBK, ASCII | 88% |
| **通用热敏** | GBK | UTF8, GB18030 | 85% |

## 🔧 故障排除

### 问题1: 中文显示为 ???
**原因**: 打印机不支持当前编码  
**解决**: 
```javascript
// 尝试GBK编码
await window.__TAURI__.invoke('set_printer_encoding_preference', {
    printerName: '打印机名称',
    preferredEncoding: 'GBK'
});
```

### 问题2: 部分字符乱码
**原因**: 编码不完整  
**解决**:
```javascript
// 使用GB18030完整编码
await window.__TAURI__.invoke('set_printer_encoding_preference', {
    printerName: '打印机名称',
    preferredEncoding: 'GB18030'
});
```

### 问题3: 打印机检测失败
**原因**: 驱动程序问题  
**解决**:
1. 重新安装打印机驱动
2. 检查打印机连接
3. 在Windows设置中设为默认打印机

## 📊 编码兼容性说明

### GBK (推荐)
- ✅ 支持99%的简体中文
- ✅ 中国品牌打印机完美兼容
- ✅ 文件大小较小
- ❌ 不支持部分特殊符号

### UTF-8 (国际标准)
- ✅ 支持所有Unicode字符
- ✅ 国际品牌打印机兼容好
- ✅ 混合语言支持
- ❌ 文件大小较大

### GB18030 (完整)
- ✅ 支持所有中文字符
- ✅ 国家标准编码
- ✅ 向下兼容GBK
- ❌ 部分老设备不支持

## 🎯 最佳实践

### 1. 自动检测
```javascript
// 让系统自动选择最佳编码
const analysis = await window.__TAURI__.invoke('analyze_text_encoding', {
    text: order.items.map(item => item.name).join(' ')
});

// 应用推荐编码
await window.__TAURI__.invoke('set_printer_encoding_preference', {
    printerName: printerName,
    preferredEncoding: analysis.recommended_encoding
});
```

### 2. 批量设置
```javascript
// 为所有打印机设置统一编码策略
const printers = await window.__TAURI__.invoke('get_printers');

for (const printer of printers) {
    if (printer.supports_chinese) {
        await window.__TAURI__.invoke('set_printer_encoding_preference', {
            printerName: printer.name,
            preferredEncoding: printer.brand.includes('XPrinter') ? 'GBK' : 'UTF8'
        });
    }
}
```

### 3. 错误处理
```javascript
try {
    await window.__TAURI__.invoke('print_order', orderData);
} catch (error) {
    if (error.includes('encoding')) {
        // 编码错误，尝试备用编码
        await window.__TAURI__.invoke('set_printer_encoding_preference', {
            printerName: printerName,
            preferredEncoding: 'UTF8'
        });
        
        // 重试打印
        await window.__TAURI__.invoke('print_order', orderData);
    }
}
```

## 🔍 测试命令

```bash
# 查看可用打印机
cargo run -- list-printers

# 测试特定打印机
cargo run -- test-print "XP-80C"

# 分析文本编码
cargo run -- analyze-text "你好世界！订单#12345"

# 生成兼容性报告
cargo run -- encoding-report

# 预览打印效果
cargo run -- preview-order --width 80 --font-size 0
```

## 📞 获取帮助

如果遇到问题，请提供以下信息：

1. **打印机型号**: 例如 "XP-80C"
2. **问题文本**: 例如 "宫保鸡丁"
3. **错误信息**: 完整的错误日志
4. **编码测试结果**:
```javascript
const result = await window.__TAURI__.invoke('test_printer_chinese_support', {
    printerName: '你的打印机名称'
});
console.log(JSON.stringify(result, null, 2));
```

通过这个指南，您应该能够快速解决热敏打印机的中文乱码问题！ 🎉 