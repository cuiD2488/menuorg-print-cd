# 🔧 技术实现细节文档

> 餐厅订单打印系统的深度技术实现说明

---

## 📋 目录

- [核心算法实现](#核心算法实现)
- [打印预览系统](#打印预览系统)
- [中文编码处理](#中文编码处理)
- [性能优化策略](#性能优化策略)
- [错误处理机制](#错误处理机制)
- [扩展开发指南](#扩展开发指南)

---

## 🧮 核心算法实现

### 1. 智能文本换行算法

#### 核心特点
- **智能断点检测**: 优先在括号、空格、标点处断行
- **精确宽度计算**: 中文字符2位，英文字符1位
- **递归长文本处理**: 支持嵌套的超长文本

#### 实现代码
```rust
fn smart_wrap_text_for_width(text: &str, width: usize) -> String {
    let mut result = String::new();
    let mut current_line = String::new();
    let mut current_width = 0;
    let mut chars = text.chars().peekable();

    while let Some(ch) = chars.next() {
        let char_width = if ch.is_ascii() { 1 } else { 2 };

        // 智能断行逻辑
        if current_width + char_width > width {
            if !current_line.is_empty() {
                result.push_str(&current_line);
                result.push('\n');
                current_line.clear();
                current_width = 0;
            }
        }

        current_line.push(ch);
        current_width += char_width;

        // 智能断行点检测
        if matches!(ch, ')' | '）' | ' ' | ',' | '，') {
            if let Some(&next_ch) = chars.peek() {
                let next_width = if next_ch.is_ascii() { 1 } else { 2 };
                if current_width + next_width > width {
                    result.push_str(&current_line);
                    result.push('\n');
                    current_line.clear();
                    current_width = 0;
                }
            }
        }
    }

    if !current_line.is_empty() {
        result.push_str(&current_line);
    }

    result
}
```

### 2. 布局优化改进

#### 最新布局特点（2025-01-18）
- ✅ **简化头部**: 移除餐厅名称和装饰线
- ✅ **突出订单**: 订单号和流水号居中显示
- ✅ **智能地址**: 外送显示地址，自取不显示
- ✅ **时间简化**: 只显示时间，不显示日期

#### 关键改进
```rust
// 时间格式优化
order_date: "06:30 PM".to_string(),     // 之前: "01/15/2025, 06:30 PM"
pickup_time: "07:15 PM".to_string(),    // 之前: "01/15/2025, 07:15 PM"

// 取餐方式智能显示
delivery_type: "delivery".to_string(),   // 新增字段

// 菜品描述和备注自动换行
format_description_with_wrap(&item.dishes_description, char_width, "  ");
format_remark_with_wrap(&item.remark, char_width, "  Note: ");
```

### 3. 中英文混合显示宽度计算

#### 核心函数: `display_width`

```rust
fn display_width(text: &str) -> usize {
    text.chars().map(|c| {
        if c.is_ascii() {
            1  // ASCII字符宽度为1
        } else {
            2  // 中文字符宽度为2
        }
    }).sum()
}
```

**应用场景**:
- 文本居中对齐
- 表格列宽计算
- 换行位置判断

### 4. 自适应表格布局算法

#### 核心函数: `format_item_table_row`

```rust
fn format_item_table_row(name: &str, qty: i32, _unit_price: f64, total_price: f64, width: usize) -> String {
    let name_width = (width * 65 / 100).max(18);  // 菜名占65%宽度
    let qty_width = 4;    // 数量固定4字符
    let total_width = width.saturating_sub(name_width + qty_width + 3);

    // 超长菜名处理
    if display_width(name) > name_width {
        let wrapped_lines = smart_wrap_text_for_width(name, name_width);
        let lines: Vec<&str> = wrapped_lines.lines().collect();
        
        let mut result = String::new();
        
        // 第一行显示完整信息
        if !lines.is_empty() {
            result.push_str(&format!("{:<name_width$} {:>qty_width$} {:>total_width$}\n",
                pad_for_width(lines[0], name_width),
                qty,
                format!("{:.2}", total_price),
                name_width = name_width,
                qty_width = qty_width,
                total_width = total_width
            ));
        }
        
        // 后续行只显示菜名
        for line in lines.iter().skip(1) {
            result.push_str(&format!("{:<name_width$}\n",
                pad_for_width(line, name_width),
                name_width = name_width
            ));
        }
        
        result
    } else {
        format!("{:<name_width$} {:>qty_width$} {:>total_width$}\n",
            pad_for_width(name, name_width),
            qty,
            format!("{:.2}", total_price),
            name_width = name_width,
            qty_width = qty_width,
            total_width = total_width
        )
    }
}
```

---

## 🔍 打印预览系统

### 1. Unicode 边框渲染

#### 边框字符定义
```
┌─┐  顶部边框   ├─┤  中间分割
│    竖直边框   ┬┴   T型连接  
└─┘  底部边框   ┼    十字交叉
```

#### 预览生成流程
1. **生成打印内容** → ESC/POS 命令 + 文本
2. **清理控制符** → 移除打印机控制命令
3. **Unicode 边框** → 添加可视化边框
4. **统计信息** → 生成打印统计数据

### 2. ESC/POS 命令处理

#### 控制命令清理
```rust
fn clean_escpos_for_display(content: &str) -> String {
    let escpos_patterns = [
        r"\x1B@",          // 初始化
        r"\x1B\x45[\x00\x01]", // 加粗
        r"\x1D\x21[\x00-\xFF]", // 字体大小
        r"\x1D\x56\x00",   // 切纸
        r"\x1C&.*",        // 编码设置
    ];
    
    let mut cleaned = content.to_string();
    for pattern in &escpos_patterns {
        cleaned = regex::Regex::new(pattern)
            .unwrap()
            .replace_all(&cleaned, "")
            .to_string();
    }
    cleaned
}
```

### 3. 预览统计生成

```rust
fn generate_preview_statistics(order: &OrderData, content: &str, width: i32, font_size: i32) -> String {
    let clean_content = clean_escpos_for_display(content);
    let line_count = clean_content.lines().count();
    let byte_count = content.as_bytes().len();
    let char_count = clean_content.chars().count();
    let item_count = order.dishes_array.len();
    
    format!("📊 打印统计信息:\n\
             ├─ 纸张宽度: {}mm ({} 字符)\n\
             ├─ 字体大小: {} ({})\n\
             ├─ 总行数: {} 行\n\
             ├─ 字节数: {} bytes\n\
             ├─ 字符数: {} 个\n\
             ├─ 餐厅名称: {}\n\
             ├─ 订单ID: {}\n\
             ├─ 菜品数量: {} 项\n\
             └─ 订单总额: ${}\n",
        width,
        if width == 80 { 48 } else { 32 },
        font_size,
        match font_size {
            0 => "小号",
            1 => "中号", 
            2 => "大号",
            _ => "默认"
        },
        line_count,
        byte_count,
        char_count,
        order.rd_name,
        order.order_id,
        item_count,
        order.total
    )
}
```

---

## 🌏 中文编码处理

### 1. 字符类型智能检测

#### 检测算法
```rust
pub enum CharacterType {
    NONE,           // 无中文字符
    SYMBOLS_ONLY,   // 仅中文符号
    SIMPLIFIED,     // 简体中文
    TRADITIONAL,    // 繁体中文
    MIXED,          // 混合文本
}

fn analyze_text(text: &str) -> ChineseCharacterAnalysis {
    // 字符统计
    let mut simplified_count = 0;
    let mut traditional_count = 0;
    let mut symbol_count = 0;
    
    // 特征字符识别
    for ch in text.chars() {
        if SIMPLIFIED_CHARS.contains(&ch) { simplified_count += 1; }
        else if TRADITIONAL_CHARS.contains(&ch) { traditional_count += 1; }
        else if CHINESE_SYMBOLS.contains(&ch) { symbol_count += 1; }
    }
    
    // 智能分类逻辑
    let character_type = classify_by_counts(
        simplified_count, 
        traditional_count, 
        symbol_count
    );
    
    ChineseCharacterAnalysis {
        character_type,
        confidence: calculate_confidence(simplified_count, traditional_count, symbol_count, text.len()),
        // ...
    }
}
```

### 2. 编码兼容性评分

#### 评分算法
```rust
fn calculate_encoding_score(
    encoding: &str,
    printer_type: &str,
    character_type: &str,
    test_success: bool
) -> f64 {
    let mut score = if test_success { 0.7 } else { 0.0 };
    
    // 编码特性加分
    score += match encoding {
        "UTF8" => 0.20,      // 通用性好
        "GBK" | "GB18030" => 0.25,  // 中文优化
        "BIG5" => 0.20,      // 繁体专用
        "GB2312" => 0.15,    // 基础支持
        _ => 0.10,
    };
    
    // 打印机适配加分
    if printer_type.contains("thermal") {
        score += match encoding {
            "GBK" | "GB18030" => 0.05,  // 热敏打印机适配
            "UTF8" => -0.02,            // 兼容性略差
            _ => 0.0,
        };
    }
    
    // 字符匹配加分
    score += match (character_type, encoding) {
        ("SIMPLIFIED", "GBK") => 0.03,
        ("TRADITIONAL", "BIG5") => 0.03,
        ("MIXED", "UTF8") => 0.02,
        _ => 0.0,
    };
    
    score.min(1.0)
}
```

---

## ⚡ 性能优化策略

### 1. 内存管理优化

#### 高效字符串构建
```rust
// 预分配容量，避免多次重分配
fn build_content_efficiently(sections: &[&str]) -> String {
    let total_capacity: usize = sections.iter().map(|s| s.len()).sum::<usize>() + 1024;
    let mut content = String::with_capacity(total_capacity);
    
    for section in sections {
        content.push_str(section);
    }
    
    content
}

// 栈上缓冲区，避免堆分配
fn format_line_on_stack(template: &str, args: &[&str]) -> String {
    let mut buffer = [0u8; 512];
    let mut cursor = 0;
    
    // 高效格式化到栈缓冲区
    for (i, &arg) in args.iter().enumerate() {
        if let Some(pos) = template.find(&format!("{{{}}}", i)) {
            // 直接写入缓冲区，避免中间分配
            let arg_bytes = arg.as_bytes();
            buffer[cursor..cursor + arg_bytes.len()].copy_from_slice(arg_bytes);
            cursor += arg_bytes.len();
        }
    }
    
    String::from_utf8_lossy(&buffer[..cursor]).to_string()
}
```

### 2. 并发处理设计

#### 异步打印队列
```rust
use tokio::sync::mpsc;

struct PrintJobQueue {
    tx: mpsc::UnboundedSender<PrintJob>,
    rx: mpsc::UnboundedReceiver<PrintJob>,
}

impl PrintJobQueue {
    async fn process_jobs(&mut self) {
        while let Some(job) = self.rx.recv().await {
            // 并发处理，不阻塞队列
            tokio::spawn(async move {
                if let Err(e) = execute_print_job(job).await {
                    log::error!("打印任务失败: {}", e);
                }
            });
        }
    }
}

// 智能负载均衡
async fn distribute_print_jobs(jobs: Vec<PrintJob>) -> Result<(), String> {
    let worker_count = num_cpus::get().min(4); // 最多4个并发
    let (tx, mut rx) = mpsc::channel(100);
    
    // 启动工作线程
    for _ in 0..worker_count {
        let mut worker_rx = rx.clone();
        tokio::spawn(async move {
            while let Some(job) = worker_rx.recv().await {
                process_single_job(job).await;
            }
        });
    }
    
    // 分发任务
    for job in jobs {
        tx.send(job).await.map_err(|e| format!("队列满: {}", e))?;
    }
    
    Ok(())
}
```

### 3. I/O 优化

#### 批量写入优化
```rust
fn optimized_printer_write(handle: HANDLE, content: &str) -> Result<(), String> {
    const CHUNK_SIZE: usize = 4096;
    let content_bytes = content.as_bytes();
    
    for chunk in content_bytes.chunks(CHUNK_SIZE) {
        let mut bytes_written: DWORD = 0;
        
        unsafe {
            let success = WritePrinter(
                handle,
                chunk.as_ptr() as *mut _,
                chunk.len() as DWORD,
                &mut bytes_written,
            );
            
            if success == 0 {
                return Err(format!("写入失败: {}", GetLastError()));
            }
        }
        
        // 小延迟避免打印机缓冲区溢出
        if chunk.len() == CHUNK_SIZE {
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
    }
    
    Ok(())
}
```

---

## 🛡️ 错误处理机制

### 1. 分层错误设计

#### 错误类型体系
```rust
#[derive(Debug, thiserror::Error)]
pub enum PrintSystemError {
    #[error("打印机 '{name}' 未找到")]
    PrinterNotFound { name: String },
    
    #[error("访问被拒绝，错误代码: {code}")]
    AccessDenied { code: u32 },
    
    #[error("编码错误: {message}")]
    EncodingError { message: String },
    
    #[error("系统错误: {source}")]
    SystemError { #[from] source: std::io::Error },
    
    #[error("网络错误: {source}")]
    NetworkError { #[from] source: reqwest::Error },
}
```

### 2. 智能重试机制

#### 指数退避重试
```rust
async fn retry_with_exponential_backoff<F, T, E>(
    mut operation: F,
    max_attempts: usize,
    base_delay: Duration,
) -> Result<T, E>
where
    F: FnMut() -> futures::future::BoxFuture<'static, Result<T, E>>,
    E: std::fmt::Debug,
{
    let mut delay = base_delay;
    
    for attempt in 1..=max_attempts {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(error) => {
                if attempt == max_attempts {
                    log::error!("最终尝试失败: {:?}", error);
                    return Err(error);
                }
                
                log::warn!("尝试 {}/{} 失败: {:?}, {}ms后重试", 
                          attempt, max_attempts, error, delay.as_millis());
                
                tokio::time::sleep(delay).await;
                delay = std::cmp::min(delay * 2, Duration::from_secs(60));
            }
        }
    }
    
    unreachable!()
}
```

### 3. 降级和回退策略

#### 多层回退机制
```rust
async fn robust_print_with_fallback(
    printer_name: &str,
    content: &str,
) -> Result<PrintResult, PrintSystemError> {
    // 策略1: Rust 高性能引擎
    if let Ok(result) = rust_print_engine(printer_name, content).await {
        return Ok(result.with_method("Rust Engine"));
    }
    
    // 策略2: 增强版 Windows API
    #[cfg(target_os = "windows")]
    if let Ok(result) = enhanced_windows_print(printer_name, content).await {
        return Ok(result.with_method("Enhanced API"));
    }
    
    // 策略3: 命令行打印
    if let Ok(result) = command_line_print(printer_name, content).await {
        return Ok(result.with_method("Command Line"));
    }
    
    // 策略4: 文件输出（调试模式）
    #[cfg(debug_assertions)]
    if let Ok(result) = file_output_print(printer_name, content).await {
        return Ok(result.with_method("File Output"));
    }
    
    Err(PrintSystemError::SystemError { 
        source: std::io::Error::new(
            std::io::ErrorKind::Other, 
            "所有打印策略都失败"
        ) 
    })
}
```

---

## 🔧 扩展开发指南

### 1. 添加新的打印机类型

#### 1.1 定义打印机特征
```rust
trait PrinterCapabilities {
    fn supports_chinese(&self) -> bool;
    fn max_width(&self) -> i32;
    fn supported_encodings(&self) -> Vec<&'static str>;
    fn requires_special_commands(&self) -> bool;
}

struct ThermalPrinter {
    model: String,
    width: i32,
}

impl PrinterCapabilities for ThermalPrinter {
    fn supports_chinese(&self) -> bool { true }
    fn max_width(&self) -> i32 { self.width }
    fn supported_encodings(&self) -> Vec<&'static str> {
        vec!["GBK", "UTF8", "GB18030"]
    }
    fn requires_special_commands(&self) -> bool { true }
}
```

#### 1.2 添加检测逻辑
```rust
fn classify_printer_extended(name: &str) -> Box<dyn PrinterCapabilities> {
    let name_lower = name.to_lowercase();
    
    if name_lower.contains("epson") {
        Box::new(EpsonPrinter::new(name))
    } else if name_lower.contains("xprinter") {
        Box::new(XPrinterDevice::new(name))
    } else if name_lower.contains("citizen") {
        Box::new(CitizenPrinter::new(name))
    } else {
        Box::new(GenericPrinter::new(name))
    }
}
```

### 2. 扩展编码支持

#### 2.1 添加新编码
```rust
#[derive(Debug, Clone)]
enum ExtendedEncoding {
    UTF8,
    GBK,
    GB18030,
    BIG5,
    GB2312,
    ShiftJIS,    // 新增: 日文支持
    EUCKR,       // 新增: 韩文支持
    ISO88591,    // 新增: 西欧语言
}

impl ExtendedEncoding {
    fn to_escpos_command(&self) -> &'static str {
        match self {
            ExtendedEncoding::UTF8 => "\x1C&\x1C\x43\x01",
            ExtendedEncoding::GBK => "\x1C&\x1C\x2E\x00",
            ExtendedEncoding::ShiftJIS => "\x1C&\x1C\x2E\x02",
            ExtendedEncoding::EUCKR => "\x1C&\x1C\x2E\x03",
            // ...
        }
    }
}
```

### 3. 添加新的预览模式

#### 3.1 ASCII 艺术预览
```rust
fn render_ascii_preview(content: &str, width: usize) -> String {
    let mut result = String::new();
    
    // ASCII 边框风格
    result.push('+');
    result.push_str(&"-".repeat(width - 2));
    result.push('+');
    result.push('\n');
    
    for line in content.lines() {
        result.push('|');
        result.push_str(&pad_for_width(line, width - 2));
        result.push('|');
        result.push('\n');
    }
    
    result.push('+');
    result.push_str(&"-".repeat(width - 2));
    result.push('+');
    
    result
}
```

#### 3.2 HTML 预览生成
```rust
fn generate_html_preview(order: &OrderData, width: i32) -> String {
    let content = generate_print_content(order, width, 0).unwrap();
    let clean_content = clean_escpos_for_display(&content);
    
    format!(r#"
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>打印预览</title>
    <style>
        .receipt {{
            font-family: 'Courier New', monospace;
            font-size: 12px;
            white-space: pre-wrap;
            border: 1px solid #000;
            padding: 10px;
            max-width: {}ch;
            background: white;
        }}
    </style>
</head>
<body>
    <div class="receipt">{}</div>
</body>
</html>
"#, if width == 80 { 48 } else { 32 }, html_escape(&clean_content))
}
```

### 4. 性能监控集成

#### 4.1 指标收集
```rust
#[derive(Debug)]
struct PrintMetrics {
    total_prints: u64,
    successful_prints: u64,
    failed_prints: u64,
    average_print_time: f64,
    encoding_usage: HashMap<String, u64>,
    printer_usage: HashMap<String, u64>,
}

impl PrintMetrics {
    fn record_print(&mut self, 
                   printer: &str, 
                   encoding: &str, 
                   duration: Duration, 
                   success: bool) {
        self.total_prints += 1;
        
        if success {
            self.successful_prints += 1;
        } else {
            self.failed_prints += 1;
        }
        
        // 更新平均时间
        let duration_ms = duration.as_millis() as f64;
        self.average_print_time = 
            (self.average_print_time * (self.total_prints - 1) as f64 + duration_ms) 
            / self.total_prints as f64;
        
        // 记录使用统计
        *self.encoding_usage.entry(encoding.to_string()).or_insert(0) += 1;
        *self.printer_usage.entry(printer.to_string()).or_insert(0) += 1;
    }
    
    fn generate_report(&self) -> String {
        format!(r#"
📊 打印系统性能报告
━━━━━━━━━━━━━━━━━━━━
📈 总体统计:
  └─ 总打印次数: {}
  └─ 成功次数: {} ({:.1}%)
  └─ 失败次数: {} ({:.1}%)
  └─ 平均耗时: {:.1}ms

🖨️ 打印机使用排行:
{}

🔤 编码使用统计:
{}
"#,
            self.total_prints,
            self.successful_prints,
            self.successful_prints as f64 / self.total_prints as f64 * 100.0,
            self.failed_prints,
            self.failed_prints as f64 / self.total_prints as f64 * 100.0,
            self.average_print_time,
            self.format_usage_ranking(&self.printer_usage),
            self.format_usage_ranking(&self.encoding_usage)
        )
    }
}
```

---

## 🎯 总结

本技术文档详细介绍了餐厅订单打印系统的核心算法、性能优化策略和扩展开发方法。通过这些技术实现，系统能够：

✅ **高效处理** 中英文混合内容的智能排版  
✅ **精确预览** 打印效果，提供所见即所得的体验  
✅ **智能编码** 自动选择最佳编码方案  
✅ **稳定运行** 多层错误处理和恢复机制  
✅ **灵活扩展** 模块化设计便于功能扩展  

通过持续的性能优化和功能完善，该系统为餐饮行业提供了一个可靠、高效的打印解决方案。

---

**📧 技术支持**: [tech-support@example.com]  
**🐛 Bug 报告**: [GitHub Issues](https://github.com/your-repo/win7-print/issues)  
**💡 功能建议**: [GitHub Discussions](https://github.com/your-repo/win7-print/discussions) 