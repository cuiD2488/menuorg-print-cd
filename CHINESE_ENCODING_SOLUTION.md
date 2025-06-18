# 🔤 热敏打印机中文编码解决方案

## 概述

本解决方案专门针对热敏小票打印机中文乱码问题，通过智能编码检测、自适应转换和品牌优化策略，实现对多种热敏打印机的中文兼容性支持。

## 🚀 核心特性

### 1. 智能编码检测
- **自动识别文本类型**：区分简体中文、繁体中文、混合文本和符号
- **品牌适配**：根据打印机品牌自动选择最佳编码
- **置信度评估**：提供编码选择的可靠性评分

### 2. 多编码支持
| 编码类型 | 适用场景 | 兼容性 |
|---------|---------|--------|
| **GBK** | 简体中文，中国品牌打印机 | 95% |
| **GB18030** | 最新中文标准，全字符集 | 90% |
| **UTF-8** | 国际标准，混合语言 | 85% |
| **Big5** | 繁体中文，港台地区 | 80% |
| **ASCII** | 纯英文数字 | 99% |

### 3. 品牌优化策略
- **XPrinter/GPrinter**：优先使用 GBK 编码
- **Epson/Citizen**：优先使用 UTF-8 编码
- **Star/Bixolon**：优先使用 UTF-8 编码
- **通用热敏**：自动检测最佳编码

## 📋 快速开始

### 1. 基本使用

```rust
// 1. 获取打印机列表（包含编码信息）
let printers = get_printers().await?;

// 2. 分析文本编码特征
let analysis = analyze_text_encoding("你好，订单#12345").await?;
println!("推荐编码: {}", analysis.recommended_encoding);

// 3. 测试打印机中文支持
let capability = test_printer_chinese_support("XP-80C", state).await?;
println!("兼容性: {:.1}%", capability.overall_compatibility * 100.0);

// 4. 打印订单（自动选择最佳编码）
print_order(order_data, printers, window).await?;
```

### 2. 前端 JavaScript 集成

```javascript
// 分析文本编码
const analysis = await window.__TAURI__.invoke('analyze_text_encoding', {
    text: '宫保鸡丁、麻婆豆腐、白米饭'
});

console.log('中文检测:', analysis.has_chinese);
console.log('推荐编码:', analysis.recommended_encoding);

// 测试打印机中文支持
const capability = await window.__TAURI__.invoke('test_printer_chinese_support', {
    printerName: 'XP-80C'
});

console.log('品牌:', capability.brand);
console.log('总体兼容性:', capability.overall_compatibility);

// 设置编码偏好
await window.__TAURI__.invoke('set_printer_encoding_preference', {
    printerName: 'XP-80C',
    preferredEncoding: 'GBK',
    fallbackEncodings: ['GBK', 'UTF8', 'GB18030']
});
```

## 🔧 编码配置

### 1. 自动配置
系统会根据打印机品牌自动配置最佳编码设置：

```rust
PrinterConfig {
    name: "XP-80C",
    supports_chinese: true,
    preferred_encoding: "GBK",           // 首选编码
    fallback_encodings: vec![            // 备用编码列表
        "GBK".to_string(),
        "GB18030".to_string(),
        "UTF8".to_string()
    ],
    printer_brand: "XPrinter",
}
```

### 2. 手动配置
```rust
// 设置特定打印机的编码偏好
set_printer_encoding_preference(
    "My Printer".to_string(),
    "GBK".to_string(),                   // 首选编码
    Some(vec![                           // 备用编码
        "GBK".to_string(),
        "UTF8".to_string()
    ]),
    state
).await?;
```

## 🧪 编码测试

### 1. 完整兼容性测试
```rust
let capability = test_printer_chinese_support("XP-80C", state).await?;

// 查看测试结果
for test_result in &capability.tested_encodings {
    println!("编码: {} - 兼容性: {:.1}% - 状态: {}", 
             test_result.encoding_name,
             test_result.compatibility_score * 100.0,
             if test_result.success { "✅" } else { "❌" });
}
```

### 2. 快速编码评估
```rust
let capability = get_printer_encoding_capability("XP-80C", state).await?;
println!("推荐编码: {}", capability.recommended_encoding);
println!("备用编码: {:?}", capability.fallback_encodings);
```

## 📊 编码分析详解

### 1. 中文文本特征分析
```rust
#[derive(Serialize)]
struct ChineseTextAnalysis {
    has_chinese: bool,           // 是否包含中文
    has_simplified: bool,        // 是否包含简体字
    has_traditional: bool,       // 是否包含繁体字
    has_symbols: bool,           // 是否包含中文符号
    confidence: f64,             // 检测置信度 (0.0-1.0)
    character_counts: HashMap<String, i32>,  // 各类字符统计
    recommended_encoding: String, // 推荐编码
}
```

### 2. 编码兼容性评分
- **95-100%**：完美兼容，无需调整
- **85-94%**：兼容性良好，偶有小问题
- **70-84%**：基本兼容，可能需要调整
- **50-69%**：兼容性有限，建议更换设备
- **<50%**：不建议使用

## 🛠️ 故障排除

### 常见问题

#### 1. 中文显示为乱码
**症状**：打印出来的中文字符显示为问号或方块

**解决方案**：
```rust
// 1. 检查打印机是否支持中文
let capability = get_printer_encoding_capability("打印机名称", state).await?;
if !capability.supports_chinese {
    println!("⚠️ 打印机不支持中文，请更换设备");
}

// 2. 测试不同编码
let test_result = test_printer_chinese_support("打印机名称", state).await?;
println!("最佳编码: {}", test_result.recommended_encoding);

// 3. 手动设置编码
set_printer_encoding_preference(
    "打印机名称".to_string(),
    "GBK".to_string(),  // 尝试 GBK 编码
    None,
    state
).await?;
```

#### 2. 编码转换失败
**症状**：系统报告编码转换错误

**解决方案**：
```rust
// 分析问题文本
let analysis = analyze_text_encoding("问题文本").await?;
println!("文本分析: {:?}", analysis);

// 使用备用编码
let fallback_encodings = vec!["UTF8", "GBK", "ASCII"];
for encoding in fallback_encodings {
    match convert_text_to_encoding("问题文本", encoding) {
        Ok(bytes) => {
            println!("✅ {} 编码成功: {} 字节", encoding, bytes.len());
            break;
        }
        Err(e) => println!("❌ {} 编码失败: {}", encoding, e),
    }
}
```

#### 3. 打印机检测失败
**症状**：系统无法检测到打印机或报告打印机不支持中文

**解决方案**：
```rust
// 1. 检查系统打印机
let printers = get_system_printers()?;
for printer in printers {
    println!("发现打印机: {} (品牌: {})", printer.name, printer.printer_brand);
}

// 2. 手动配置打印机
let mut printer_config = PrinterConfig {
    name: "手动配置打印机".to_string(),
    supports_chinese: true,
    preferred_encoding: "GBK".to_string(),
    fallback_encodings: vec!["GBK".to_string(), "UTF8".to_string()],
    printer_brand: "Generic".to_string(),
    // ... 其他配置
};
```

## 📈 性能优化

### 1. 编码缓存
系统会缓存编码转换结果，提升打印性能：

```rust
// 智能编码选择（带缓存）
let encoding = determine_optimal_encoding(&analysis, printer_config);
let cached_bytes = smart_encode_for_printer(&content, printer_config);
```

### 2. 批量处理
对于大量订单，建议使用批量编码：

```rust
// 批量编码转换
let orders: Vec<OrderData> = get_pending_orders();
for order in orders {
    let content = generate_print_content_with_encoding(&order, 80, 0, Some(&printer))?;
    let encoded_bytes = smart_encode_for_printer(&content, &printer);
    print_queue.push((printer.name.clone(), encoded_bytes));
}
```

## 🔄 版本更新

### v2.1.0 - 智能编码系统
- ✅ 新增智能编码检测
- ✅ 支持多种中文编码 (GBK, UTF-8, Big5, GB18030)
- ✅ 品牌优化编码策略
- ✅ 编码兼容性测试
- ✅ 字节级打印支持

### 即将推出
- 🔄 编码性能监控
- 🔄 云端编码优化
- 🔄 更多打印机品牌支持

## 📞 技术支持

如果遇到编码问题，请提供以下信息：

1. **打印机型号和品牌**
2. **问题文本示例**
3. **编码测试结果**：
```bash
# 获取编码诊断信息
let analysis = analyze_text_encoding("问题文本").await?;
let capability = test_printer_chinese_support("打印机名称", state).await?;
```

通过这个完整的编码解决方案，您可以解决几乎所有热敏打印机的中文乱码问题，并获得最佳的打印效果。 