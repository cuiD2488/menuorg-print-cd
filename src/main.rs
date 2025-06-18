use std::io::{self, Write};
use serde::{Deserialize, Serialize};
use clap::{Parser, Subcommand};

#[cfg(windows)]
use winapi::um::winspool::{
    OpenPrinterW, ClosePrinter, StartDocPrinterW, EndDocPrinter,
    StartPagePrinter, EndPagePrinter, WritePrinter, DOC_INFO_1W,
};
#[cfg(windows)]
use winapi::um::errhandlingapi::GetLastError;
#[cfg(windows)]
use winapi::shared::minwindef::DWORD;
#[cfg(windows)]
use winapi::shared::ntdef::HANDLE;
#[cfg(windows)]
use std::ffi::OsStr;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
use std::ptr;

#[derive(Parser)]
#[command(name = "printer-engine")]
#[command(about = "🦀 MenuorgPrint - 高性能打印引擎")]
#[command(version = "1.0.0")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// 获取打印机列表
    ListPrinters,
    /// 打印订单
    PrintOrder {
        /// 打印机名称
        #[arg(short, long)]
        printer: String,
        /// 订单数据 JSON
        #[arg(short, long)]
        order: String,
        /// 纸张宽度 (58 或 80)
        #[arg(short, long, default_value = "80")]
        width: i32,
        /// 字体大小 (0-2)
        #[arg(short, long, default_value = "0")]
        font_size: i32,
    },
    /// 测试打印
    TestPrint {
        /// 打印机名称
        #[arg(short, long)]
        printer: String,
        /// 纸张宽度 (58 或 80)
        #[arg(short, long, default_value = "80")]
        width: i32,
        /// 字体大小 (0-2)
        #[arg(short, long, default_value = "0")]
        font_size: i32,
    },
    /// 预览订单排版
    PreviewOrder {
        /// 纸张宽度 (58 或 80)
        #[arg(short, long, default_value = "80")]
        width: i32,
        /// 字体大小 (0-2)
        #[arg(short, long, default_value = "0")]
        font_size: i32,
        /// 使用自定义订单数据 JSON
        #[arg(short, long)]
        order: Option<String>,
    },
    /// 交互式模式
    Interactive,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PrintResult {
    pub success: bool,
    pub message: String,
    pub error_code: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct OrderData {
    pub order_id: String,
    pub serial_num: String,
    pub rd_name: String,
    pub recipient_name: String,
    pub recipient_address: String,
    pub recipient_phone: String,
    pub order_date: String,
    pub pickup_time: String,
    pub payment_method: String,
    pub delivery_type: String,
    pub dishes_array: Vec<DishItem>,
    // 费用明细
    pub subtotal: String,
    pub discount: String,
    pub tax_rate: String,
    pub tax_fee: String,
    pub delivery_fee: String,
    pub service_rate: String,
    pub service_fee: String,
    pub tip: String,
    pub total: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DishItem {
    pub dishes_name: String,
    pub dishes_description: String, // 英文描述
    pub amount: i32,
    pub price: String,
    pub remark: String,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();

    let cli = Cli::parse();

    match cli.command {
        Some(command) => {
            match command {
                Commands::ListPrinters => {
                    let printers = get_system_printers()?;
                    let json_output = serde_json::to_string(&printers)?;
                    println!("{}", json_output);
                }
                Commands::PrintOrder { printer, order, width, font_size } => {
                    let order_data: OrderData = serde_json::from_str(&order)?;
                    let result = print_order_internal(&printer, &order_data, width, font_size);

                    let print_result = match result {
                        Ok(_) => PrintResult {
                            success: true,
                            message: "打印成功".to_string(),
                            error_code: None,
                        },
                        Err(e) => PrintResult {
                            success: false,
                            message: e,
                            error_code: Some(unsafe { GetLastError() }),
                        },
                    };

                    let json_output = serde_json::to_string(&print_result)?;
                    println!("{}", json_output);
                }
                Commands::TestPrint { printer, width, font_size } => {
                    let test_content = generate_test_content(width, font_size);
                    let result = print_raw_content(&printer, &test_content);

                    let print_result = match result {
                        Ok(_) => PrintResult {
                            success: true,
                            message: "测试打印成功".to_string(),
                            error_code: None,
                        },
                        Err(e) => PrintResult {
                            success: false,
                            message: e,
                            error_code: Some(unsafe { GetLastError() }),
                        },
                    };

                    let json_output = serde_json::to_string(&print_result)?;
                    println!("{}", json_output);
                }
                Commands::PreviewOrder { width, font_size, order } => {
                    let order_data = match order {
                        Some(json_str) => {
                            match serde_json::from_str::<OrderData>(&json_str) {
                                Ok(data) => data,
                                Err(e) => {
                                    let print_result = PrintResult {
                                        success: false,
                                        message: format!("JSON解析失败: {}", e),
                                        error_code: None,
                                    };
                                    let json_output = serde_json::to_string(&print_result)?;
                                    println!("{}", json_output);
                                    return Ok(());
                                }
                            }
                        }
                        None => create_sample_order_data()
                    };

                    let result = preview_order_layout(&order_data, width, font_size);

                    let print_result = match result {
                        Ok(_) => PrintResult {
                            success: true,
                            message: "预览成功".to_string(),
                            error_code: None,
                        },
                        Err(e) => PrintResult {
                            success: false,
                            message: e,
                            error_code: None,
                        },
                    };

                    let json_output = serde_json::to_string(&print_result)?;
                    println!("{}", json_output);
                }
                Commands::Interactive => {
                    interactive_mode()?;
                }
            }
        }
        None => {
            // 没有命令参数时，显示欢迎信息和简单菜单
            show_welcome_and_menu()?;
        }
    }

    Ok(())
}

fn show_welcome_and_menu() -> Result<(), Box<dyn std::error::Error>> {
    println!("🦀 MenuorgPrint - 高性能打印引擎 v1.0.0");
    println!("========================================");
    println!();
    println!("欢迎使用 Rust 打印引擎！");
    println!();
    println!("📋 可用命令:");
    println!("  1. list-printers  - 获取系统打印机列表");
    println!("  2. test-print     - 测试打印功能");
    println!("  3. preview-order  - 预览订单排版");
    println!("  4. interactive    - 进入交互式模式");
    println!();
    println!("💡 使用示例:");
    println!("  printer-engine.exe list-printers");
    println!("  printer-engine.exe preview-order");
    println!("  printer-engine.exe interactive");
    println!("  printer-engine.exe --help");
    println!();
    println!("🔧 当前状态:");

    // 显示打印机数量
    match get_system_printers() {
        Ok(printers) => {
            println!("  ✅ 检测到 {} 台打印机", printers.len());
            if !printers.is_empty() {
                println!("  📍 可用打印机:");
                for (i, printer) in printers.iter().take(3).enumerate() {
                    println!("     {}. {}", i + 1, printer);
                }
                if printers.len() > 3 {
                    println!("     ... 还有 {} 台", printers.len() - 3);
                }
            }
        }
        Err(_) => {
            println!("  ⚠️ 获取打印机失败");
        }
    }

    println!();
    println!("按任意键退出...");

    // 等待用户输入，避免闪退
    let mut input = String::new();
    std::io::stdin().read_line(&mut input)?;

    Ok(())
}

fn interactive_mode() -> Result<(), Box<dyn std::error::Error>> {
    println!("🚀 进入交互式模式...");
    println!();

    loop {
        println!("请选择操作:");
        println!("  1. 获取打印机列表");
        println!("  2. 测试打印");
        println!("  3. 预览订单排版");
        println!("  4. 退出");
        print!("请输入选择 (1-4): ");
        io::stdout().flush()?;

        let mut input = String::new();
        match std::io::stdin().read_line(&mut input) {
            Ok(0) => {
                // EOF reached, exit gracefully
                println!("\n👋 检测到输入结束，退出程序");
                break;
            }
            Ok(_) => {
                let choice = input.trim();

                // 添加调试信息
                if choice.is_empty() {
                    println!("❌ 输入为空，请重新选择\n");
                    continue;
                }

                match choice {
                    "1" => {
                        println!("\n📋 获取打印机列表...");
                        match get_system_printers() {
                            Ok(printers) => {
                                if printers.is_empty() {
                                    println!("⚠️ 未找到任何打印机");
                                } else {
                                    println!("✅ 发现 {} 台打印机:", printers.len());
                                    for (i, printer) in printers.iter().enumerate() {
                                        println!("  {}. {}", i + 1, printer);
                                    }
                                }
                            }
                            Err(e) => {
                                println!("❌ 获取打印机失败: {}", e);
                            }
                        }
                        println!();
                    }
                    "2" => {
                        println!("\n🧪 测试打印...");
                        match get_system_printers() {
                            Ok(printers) => {
                                if printers.is_empty() {
                                    println!("⚠️ 未找到任何打印机");
                                } else {
                                    println!("请选择打印机:");
                                    for (i, printer) in printers.iter().enumerate() {
                                        println!("  {}. {}", i + 1, printer);
                                    }
                                    print!("请输入编号: ");
                                    io::stdout().flush()?;

                                    let mut input = String::new();
                                    match std::io::stdin().read_line(&mut input) {
                                        Ok(_) => {
                                            if let Ok(index) = input.trim().parse::<usize>() {
                                                if index > 0 && index <= printers.len() {
                                                    let printer = &printers[index - 1];
                                                    println!("🖨️ 向 '{}' 发送测试打印...", printer);

                                                    let test_content = generate_test_content(80, 0);
                                                    match print_raw_content(printer, &test_content) {
                                                        Ok(_) => println!("✅ 测试打印发送成功！"),
                                                        Err(e) => println!("❌ 测试打印失败: {}", e),
                                                    }
                                                } else {
                                                    println!("❌ 无效的选择");
                                                }
                                            } else {
                                                println!("❌ 请输入有效数字");
                                            }
                                        }
                                        Err(e) => {
                                            println!("❌ 读取输入失败: {}", e);
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                println!("❌ 获取打印机失败: {}", e);
                            }
                        }
                        println!();
                    }
                    "3" => {
                        println!("\n🖨️ 预览订单排版...");
                        print!("请输入纸张宽度 (58 或 80, 默认80): ");
                        io::stdout().flush()?;

                        let mut width_input = String::new();
                        match std::io::stdin().read_line(&mut width_input) {
                            Ok(_) => {
                                let width = if width_input.trim().is_empty() {
                                    80
                                } else {
                                    width_input.trim().parse::<i32>().unwrap_or(80)
                                };

                                if width == 58 || width == 80 {
                                    print!("请输入字体大小 (0=小号, 1=中号, 2=大号, 默认0): ");
                                    io::stdout().flush()?;

                                    let mut font_size_input = String::new();
                                    match std::io::stdin().read_line(&mut font_size_input) {
                                        Ok(_) => {
                                            let font_size = if font_size_input.trim().is_empty() {
                                                0
                                            } else {
                                                font_size_input.trim().parse::<i32>().unwrap_or(0)
                                            };

                                            if font_size >= 0 && font_size <= 2 {
                                                println!("使用示例订单数据进行预览...");
                                                let order_data = create_sample_order_data();

                                                match preview_order_layout(&order_data, width, font_size) {
                                                    Ok(_) => println!("✅ 预览完成！"),
                                                    Err(e) => println!("❌ 预览失败: {}", e),
                                                }
                                            } else {
                                                println!("❌ 字体大小必须在0-2之间");
                                            }
                                        }
                                        Err(e) => {
                                            println!("❌ 读取输入失败: {}", e);
                                        }
                                    }
                                } else {
                                    println!("❌ 纸张宽度必须是58或80");
                                }
                            }
                            Err(e) => {
                                println!("❌ 读取输入失败: {}", e);
                            }
                        }
                        println!();
                    }
                    "4" => {
                        println!("👋 再见！");
                        break;
                    }
                    _ => {
                        println!("❌ 无效选择 '{}'，请输入 1-4\n", choice);
                    }
                }
            }
            Err(e) => {
                println!("❌ 读取输入失败: {}", e);
                break;
            }
        }
    }

    Ok(())
}

fn get_system_printers() -> Result<Vec<String>, Box<dyn std::error::Error>> {
    #[cfg(windows)]
    {
        use std::process::Command;

        let output = Command::new("wmic")
            .args(&["printer", "get", "name", "/format:csv"])
            .output()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut printers = Vec::new();

        for line in stdout.lines().skip(1) {
            if line.trim().is_empty() || line.starts_with("Node") {
                continue;
            }
            let fields: Vec<&str> = line.split(',').collect();
            if fields.len() >= 2 {
                let name = fields[1].trim();
                if !name.is_empty() && name != "Name" {
                    printers.push(name.to_string());
                }
            }
        }

        Ok(printers)
    }

    #[cfg(not(windows))]
    {
        Ok(vec!["Default Printer".to_string()])
    }
}

fn print_order_internal(printer_name: &str, order_data: &OrderData, width: i32, font_size: i32) -> Result<(), String> {
    let content = generate_print_content(order_data, width, font_size)?;
    print_raw_content(printer_name, &content)
}

fn generate_print_content(order: &OrderData, width: i32, font_size: i32) -> Result<String, String> {
    let mut content = String::new();

    // ESC/POS 初始化命令
    content.push_str("\x1B@"); // ESC @ - 初始化打印机

    // 设置字体大小
    match font_size {
        0 => content.push_str("\x1D\x21\x00"), // 正常大小 (1x1)
        1 => content.push_str("\x1D\x21\x10"), // 宽度1x，高度2x
        2 => content.push_str("\x1D\x21\x11"), // 宽度2x，高度2x
        _ => content.push_str("\x1D\x21\x00"), // 默认为正常大小
    }

    // 设置行间距
    content.push_str("\x1B\x33\x20"); // 设置行间距

    let char_width = if width == 80 { 48 } else { 32 }; // 字符宽度

    // ============= 订单基本信息 =============
    content.push_str(&center_text_mixed(&format!("Order #: {}", order.order_id), char_width));
    content.push_str("\n");
    content.push_str(&center_text_mixed(&format!("Serial: {}", order.serial_num), char_width));
    content.push_str("\n\n");

    // 基本信息表格
    content.push_str(&format_table_row("Order Date:", &order.order_date, char_width));
    content.push_str(&format_table_row("Pickup Time:", &order.pickup_time, char_width));
    content.push_str(&format_table_row("Payment:", &order.payment_method, char_width));
    content.push_str(&format_table_row("Customer:", &prepare_mixed_content(&order.recipient_name), char_width));
    content.push_str(&format_table_row("Phone:", &order.recipient_phone, char_width));

    // 取餐方式
    let delivery_info = if order.delivery_type.to_lowercase() == "delivery" {
        "Delivery"
    } else {
        "Pickup"
    };
    content.push_str(&format_table_row("Type:", delivery_info, char_width));

    // 如果是外送，显示地址
    if order.delivery_type.to_lowercase() == "delivery" && !order.recipient_address.is_empty() {
        content.push_str(&format_table_row("Address:", &prepare_mixed_content(&order.recipient_address), char_width));
    }

    content.push_str("\n");
    content.push_str(&"-".repeat(char_width));
    content.push_str("\n");

    // ============= 商品明细（直接开始，无标题） =============
    // 表格标题
    let header = format_table_header("Item Name", "Qty", "Total", "", char_width);
    content.push_str(&header);
    content.push_str(&"-".repeat(char_width));
    content.push_str("\n");

    for item in &order.dishes_array {
        let price: f64 = item.price.parse().unwrap_or(0.0);

        // 商品行 - 中文菜名
        content.push_str(&format_item_table_row(
            &prepare_mixed_content(&item.dishes_name),
            item.amount,
            price,
            price,
            char_width
        ));

        // 英文描述 - 应用智能换行
        if !item.dishes_description.is_empty() {
            content.push_str(&format_description_with_wrap(&item.dishes_description, char_width, "  "));
        }

        // 特殊要求 - 应用智能换行
        if !item.remark.is_empty() {
            content.push_str(&format_remark_with_wrap(&item.remark, char_width, "  Note: "));
        }

        // 增加商品间的行距
        content.push_str("\n");
    }

    content.push_str("\n");
    content.push_str(&"-".repeat(char_width));
    content.push_str("\n");

    // ============= PAYMENT SUMMARY =============
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&center_text_mixed("PAYMENT SUMMARY", char_width));
    content.push_str("\x1B\x45\x00"); // 关闭加粗
    content.push_str("\n");
    content.push_str(&"-".repeat(char_width));
    content.push_str("\n");

    // 费用明细
    let subtotal: f64 = order.subtotal.parse().unwrap_or(0.0);
    let discount: f64 = order.discount.parse().unwrap_or(0.0);
    let tax_fee: f64 = order.tax_fee.parse().unwrap_or(0.0);
    let tax_rate: f64 = order.tax_rate.parse().unwrap_or(0.0);
    let delivery_fee: f64 = order.delivery_fee.parse().unwrap_or(0.0);
    let service_fee: f64 = order.service_fee.parse().unwrap_or(0.0);
    let service_rate: f64 = order.service_rate.parse().unwrap_or(0.0);
    let tip: f64 = order.tip.parse().unwrap_or(0.0);
    let total: f64 = order.total.parse().unwrap_or(0.0);

    // 小计
    content.push_str(&format_fee_line("Subtotal", subtotal, char_width));

    // 折扣
    if discount > 0.0 {
        content.push_str(&format_fee_line("Discount", -discount, char_width));
    }

    // 税费
    if tax_fee > 0.0 {
        let tax_label = if tax_rate > 0.0 {
            format!("Tax ({:.1}%)", tax_rate)
        } else {
            "Tax".to_string()
        };
        content.push_str(&format_fee_line(&tax_label, tax_fee, char_width));
    }

    // 配送费
    if delivery_fee > 0.0 {
        content.push_str(&format_fee_line("Delivery Fee", delivery_fee, char_width));
    }

    // 服务费
    if service_fee > 0.0 {
        let service_label = if service_rate > 0.0 {
            format!("Service Fee ({:.1}%)", service_rate)
        } else {
            "Service Fee".to_string()
        };
        content.push_str(&format_fee_line(&service_label, service_fee, char_width));
    }

    // 小费
    if tip > 0.0 {
        content.push_str(&format_fee_line("Tip", tip, char_width));
    }

    content.push_str("\n");
    content.push_str(&"=".repeat(char_width));
    content.push_str("\n");

    // 总计 (加粗显示)
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&format_fee_line("TOTAL", total, char_width));
    content.push_str("\x1B\x45\x00"); // 关闭加粗


    content.push_str("\n\n\n\n"); // 空行，为切纸预留空间

    // 单次自动切纸命令
    content.push_str("\x1D\x56\x00"); // GS V 0 - 全切

    Ok(content)
}

fn generate_test_content(width: i32, font_size: i32) -> String {
    let char_width = if width == 80 { 48 } else { 32 };
    let mut content = String::new();

    // ESC/POS 初始化
    content.push_str("\x1B@");

    match font_size {
        0 => content.push_str("\x1D\x21\x00"),
        1 => content.push_str("\x1D\x21\x10"),
        2 => content.push_str("\x1D\x21\x11"),
        _ => content.push_str("\x1D\x21\x00"),
    }

    content.push_str("=".repeat(char_width as usize).as_str());
    content.push_str("\n");
    content.push_str(&center_text("TEST PRINT", char_width as usize));
    content.push_str("\n");
    content.push_str("=".repeat(char_width as usize).as_str());
    content.push_str("\n\n");

    content.push_str("Chinese Test: 中文测试打印\n");
    content.push_str("English Test: ABC123\n");
    content.push_str("Mixed Test: 混合文本 Mixed Text\n");
    content.push_str("Special Chars: ￥€$@#%&*\n");
    content.push_str(&format!("Width: {}mm\n", width));
    content.push_str(&format!("Font Size: {} ({})\n", font_size,
        match font_size {
            0 => "小号/Small",
            1 => "中号/Medium",
            2 => "大号/Large",
            _ => "默认/Default"
        }));
    content.push_str("\n");
    content.push_str(&center_text_mixed("测试完成 Test Complete", char_width));
    content.push_str("\n\n\n");

    // 切纸
    content.push_str("\x1D\x56\x00");

    content
}

fn center_text(text: &str, width: usize) -> String {
    let text_width = text.chars().count();
    if text_width >= width {
        text.to_string()
    } else {
        let padding = (width - text_width) / 2;
        format!("{}{}\n", " ".repeat(padding), text)
    }
}

#[cfg(windows)]
fn print_raw_content(printer_name: &str, content: &str) -> Result<(), String> {
    let wide_printer_name: Vec<u16> = OsStr::new(printer_name)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let wide_document_name: Vec<u16> = OsStr::new("Order Print")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut printer_handle: HANDLE = ptr::null_mut();

        // 打开打印机
        let open_result = OpenPrinterW(
            wide_printer_name.as_ptr() as *mut u16,
            &mut printer_handle,
            ptr::null_mut(),
        );

        if open_result == 0 {
            let error_code = GetLastError();
            return Err(format!("Failed to open printer: Error {}", error_code));
        }

        // RAW 数据类型
        let wide_datatype: Vec<u16> = OsStr::new("RAW")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let mut doc_info = DOC_INFO_1W {
            pDocName: wide_document_name.as_ptr() as *mut u16,
            pOutputFile: ptr::null_mut(),
            pDatatype: wide_datatype.as_ptr() as *mut u16,
        };

        // 开始文档
        let doc_id = StartDocPrinterW(printer_handle, 1, &mut doc_info as *mut _ as *mut _);
        if doc_id == 0 {
            ClosePrinter(printer_handle);
            let error_code = GetLastError();
            return Err(format!("Failed to start document: Error {}", error_code));
        }

        // 开始页面
        let page_result = StartPagePrinter(printer_handle);
        if page_result == 0 {
            EndDocPrinter(printer_handle);
            ClosePrinter(printer_handle);
            let error_code = GetLastError();
            return Err(format!("Failed to start page: Error {}", error_code));
        }

        // 写入内容
        let content_bytes = content.as_bytes();
        let mut bytes_written: DWORD = 0;

        let write_result = WritePrinter(
            printer_handle,
            content_bytes.as_ptr() as *mut _,
            content_bytes.len() as DWORD,
            &mut bytes_written,
        );

        if write_result == 0 {
            EndPagePrinter(printer_handle);
            EndDocPrinter(printer_handle);
            ClosePrinter(printer_handle);
            let error_code = GetLastError();
            return Err(format!("Failed to write to printer: Error {}", error_code));
        }

        // 清理
        EndPagePrinter(printer_handle);
        EndDocPrinter(printer_handle);
        ClosePrinter(printer_handle);

        Ok(())
    }
}

#[cfg(not(windows))]
fn print_raw_content(printer_name: &str, content: &str) -> Result<(), String> {
    println!("模拟打印到 {}: {}", printer_name, content);
    Ok(())
}

// =============== 辅助函数 ===============

// 计算中英文混合文本的显示宽度
fn display_width(text: &str) -> usize {
    text.chars().map(|c| {
        if c.is_ascii() {
            1
        } else {
            2  // 中文字符占2个显示位置
        }
    }).sum()
}

// 中英文混合文本居中
fn center_text_mixed(text: &str, width: usize) -> String {
    let text_width = display_width(text);
    if text_width >= width {
        text.to_string()
    } else {
        let padding = (width - text_width) / 2;
        format!("{}{}", " ".repeat(padding), text)
    }
}

// 简化的内容处理函数 - 直接传输原始字符串
fn prepare_mixed_content(text: &str) -> String {
    // 只移除控制字符，保留所有可打印字符和换行
    text.chars()
        .filter(|c| !c.is_control() || matches!(*c, '\n' | '\r' | '\t'))
        .collect()
}

// 表格行格式化 (左对齐标签，右对齐数值)
fn format_table_row(label: &str, value: &str, width: usize) -> String {
    let label_width = display_width(label);
    let value_width = display_width(value);

    if label_width + value_width + 2 > width {
        // 如果一行放不下，换行显示
        format!("{}\n  {}\n", label, value)
    } else {
        let spaces = width - label_width - value_width;
        format!("{}{}{}\n", label, " ".repeat(spaces), value)
    }
}

// 商品表格标题
fn format_table_header(name: &str, qty: &str, _price: &str, total: &str, width: usize) -> String {
    // 简化表格：只显示菜名、数量、总价
    let name_width = (width * 70 / 100).max(20);  // 菜名占70%宽度
    let qty_width = 4;    // 数量宽度
    let total_width = width.saturating_sub(name_width + qty_width + 2); // 总价宽度

    format!("{:<name_width$} {:>qty_width$} {:>total_width$}\n",
        truncate_for_width(name, name_width),
        truncate_for_width(qty, qty_width),
        truncate_for_width(total, total_width),
        name_width = name_width,
        qty_width = qty_width,
        total_width = total_width
    )
}

// 商品表格行
fn format_item_table_row(name: &str, qty: i32, _unit_price: f64, total_price: f64, width: usize) -> String {
    // 简化表格：只显示菜名、数量、总价
    let name_width = (width * 65 / 100).max(18);  // 菜名占65%宽度，最小18字符
    let qty_width = 4;    // 数量宽度
    let total_width = width.saturating_sub(name_width + qty_width + 3); // 总价宽度，留3个字符空隙

    let qty_str = format!("{}", qty);
    let total_str = if total_price == 0.0 { "+0.00".to_string() } else { format!("{:.2}", total_price) };

    // 如果商品名太长，需要换行处理
    if display_width(name) > name_width {
        let mut result = String::new();

        // 智能换行：优先在括号或空格处断行
        let wrapped_lines = smart_wrap_text_for_width(name, name_width);
        let lines: Vec<&str> = wrapped_lines.lines().collect();

        // 第一行显示菜名开头和价格信息
        if !lines.is_empty() {
            let first_line = pad_for_width(lines[0], name_width);
            result.push_str(&format!("{} {:>qty_width$} {:>total_width$}\n",
                first_line,
                qty_str,
                total_str,
                qty_width = qty_width,
                total_width = total_width
            ));
        }

        // 后续行只显示菜名的剩余部分，添加适当缩进
        for line in lines.iter().skip(1) {
            let padded_line = pad_for_width(line, name_width);
            result.push_str(&format!("{}\n", padded_line));
        }

        result
    } else {
        // 菜名长度适中，单行显示
        let padded_name = pad_for_width(name, name_width);
        format!("{} {:>qty_width$} {:>total_width$}\n",
            padded_name,
            qty_str,
            total_str,
            qty_width = qty_width,
            total_width = total_width
        )
    }
}

// 智能换行：优先在合适的位置断行（如括号、空格）
fn smart_wrap_text_for_width(text: &str, width: usize) -> String {
    let mut result = String::new();
    let mut current_line = String::new();
    let mut current_width = 0;
    let mut chars = text.chars().peekable();

    while let Some(ch) = chars.next() {
        let char_width = if ch.is_ascii() { 1 } else { 2 };

        // 如果加上这个字符会超过宽度限制，先处理换行
        if current_width + char_width > width {
            // 如果当前行不为空，输出当前行并开始新行
            if !current_line.is_empty() {
                result.push_str(&current_line);
                result.push('\n');
                current_line.clear();
                current_width = 0;
            }

            // 如果单个字符本身超过宽度，直接输出
            if char_width > width {
                result.push(ch);
                result.push('\n');
                continue;
            }
        }

        // 添加字符到当前行
        current_line.push(ch);
        current_width += char_width;

        // 智能断行：寻找合适的断行点
        if current_width >= width * 70 / 100 {  // 当行长度超过70%时开始寻找断点
            // 在这些字符后面是好的断行点
            if matches!(ch, ')' | '）' | ' ' | ',' | '，' | '.' | '。') {
                // 检查剩余空间，如果不够可能的下一个词，就换行
                if current_width + 6 >= width {  // 为下一个可能的词留空间
                    result.push_str(&current_line);
                    result.push('\n');
                    current_line.clear();
                    current_width = 0;
                }
            }
            // 如果下一个字符是开括号，在当前位置换行
            else if let Some(&next_ch) = chars.peek() {
                if matches!(next_ch, '(' | '（') && current_width + 4 >= width {
                    result.push_str(&current_line);
                    result.push('\n');
                    current_line.clear();
                    current_width = 0;
                }
            }
        }

        // 强制换行：如果到达宽度限制
        if current_width >= width {
            result.push_str(&current_line);
            result.push('\n');
            current_line.clear();
            current_width = 0;
        }
    }

    // 添加最后一行
    if !current_line.is_empty() {
        result.push_str(&current_line);
    }

    result
}

// 费用行格式化 (右下角对齐)
fn format_fee_line(label: &str, amount: f64, width: usize) -> String {
    let amount_str = if amount < 0.0 {
        format!("-${:.2}", -amount)
    } else {
        format!("${:.2}", amount)
    };

    let label_width = display_width(label);
    let amount_width = display_width(&amount_str);

    if label_width + amount_width + 2 > width {
        format!("{}\n{}{}\n",
            label,
            " ".repeat(width.saturating_sub(amount_width)),
            amount_str
        )
    } else {
        let spaces = width - label_width - amount_width;
        format!("{}{}{}\n", label, " ".repeat(spaces), amount_str)
    }
}

// 按显示宽度截断文本
fn truncate_for_width(text: &str, max_width: usize) -> String {
    let mut result = String::new();
    let mut current_width = 0;

    for ch in text.chars() {
        let char_width = if ch.is_ascii() { 1 } else { 2 };
        if current_width + char_width > max_width {
            if current_width + 2 <= max_width {
                result.push_str("..");
            }
            break;
        }
        result.push(ch);
        current_width += char_width;
    }

    result
}

// 按显示宽度填充文本
fn pad_for_width(text: &str, target_width: usize) -> String {
    let text_width = display_width(text);
    if text_width >= target_width {
        text.to_string()
    } else {
        format!("{}{}", text, " ".repeat(target_width - text_width))
    }
}

// 创建示例订单数据
fn create_sample_order_data() -> OrderData {
    OrderData {
        order_id: "23410121749595834".to_string(),
        serial_num: "#042".to_string(),
        rd_name: "老王川菜馆 (LIAO WANG SICHUAN RESTAURANT)".to_string(),
        recipient_name: "张三 (Zhang San)".to_string(),
        recipient_address: "123 Main Street, Suite 2B\nBeijing, China 100001".to_string(),
        recipient_phone: "(555) 123-4567".to_string(),
        order_date: "06:30 PM".to_string(),
        pickup_time: "07:15 PM".to_string(),
        payment_method: "Pay at store".to_string(),
        delivery_type: "delivery".to_string(),
        dishes_array: vec![
            DishItem {
                dishes_name: "麻婆豆腐 (Mapo Tofu)".to_string(),
                dishes_description: "+ 嫩豆腐配麻辣汤汁 (Soft tofu with spicy sauce)".to_string(),
                amount: 1,
                price: "18.99".to_string(),
                remark: "不要太辣 (Not too spicy)".to_string(),
            },
            DishItem {
                dishes_name: "宫保鸡丁 (Kung Pao Chicken)".to_string(),
                dishes_description: "+ 鸡肉丁配花生米和花椒 (Diced chicken with peanuts and Sichuan pepper)".to_string(),
                amount: 2,
                price: "23.98".to_string(),
                remark: "多放花生米 (Extra peanuts)".to_string(),
            },
            DishItem {
                dishes_name: "白米饭 (Steamed Rice)".to_string(),
                dishes_description: "+ 香喷喷的白米饭 (Fragrant steamed white rice)".to_string(),
                amount: 1,
                price: "6.99".to_string(),
                remark: "".to_string(),
            },
            DishItem {
                dishes_name: "蒜蓉西兰花炒牛肉丝配黑胡椒汁 (Garlic Broccoli Stir-fried with Beef Strips in Black Pepper Sauce)".to_string(),
                dishes_description: "+ 新鲜西兰花配嫩牛肉丝和蒜蓉 (Fresh broccoli with tender beef strips and garlic)".to_string(),
                amount: 1,
                price: "28.99".to_string(),
                remark: "牛肉要嫩一点，西兰花不要太软 (Beef should be tender, broccoli not too soft)".to_string(),
            },
        ],
        // 费用明细
        subtotal: "78.95".to_string(),
        discount: "5.00".to_string(),
        tax_rate: "8.3".to_string(),
        tax_fee: "6.89".to_string(),
        delivery_fee: "3.99".to_string(),
        service_rate: "3.5".to_string(),
        service_fee: "2.76".to_string(),
        tip: "7.50".to_string(),
        total: "94.09".to_string(),
    }
}

// 预览订单排版
fn preview_order_layout(order_data: &OrderData, width: i32, font_size: i32) -> Result<(), String> {
    println!("\n{}", "=".repeat(80));
    println!("🖨️ 订单排版预览 ({}mm 纸张, 字体大小: {})", width, font_size);
    println!("{}", "=".repeat(80));

    // 生成打印内容
    let content = generate_print_content(order_data, width, font_size)?;

    // 清理ESC/POS控制字符以便在控制台显示
    let display_content = clean_escpos_for_display(&content);

    // 显示纸张边框
    let char_width = if width == 80 { 48 } else { 32 };
    println!("┌{}┐", "─".repeat(char_width + 2));

    // 显示内容，每行加上边框
    for line in display_content.lines() {
        let padded_line = format!("{:<width$}", line, width = char_width);
        println!("│ {} │", padded_line);
    }

    println!("└{}┘", "─".repeat(char_width + 2));

    // 显示统计信息
    println!("\n📊 排版统计:");
    println!("  - 纸张宽度: {}mm ({}字符)", width, char_width);
    println!("  - 字体大小: {} ({})", font_size, match font_size {
        0 => "小号",
        1 => "中号",
        2 => "大号",
        _ => "默认"
    });
    println!("  - 内容总行数: {}", display_content.lines().count());
    println!("  - 原始字节数: {}", content.len());
    println!("  - 餐厅名称: {}", order_data.rd_name);
    println!("  - 订单号: {}", order_data.order_id);
    println!("  - 商品数量: {}", order_data.dishes_array.len());
    println!("  - 订单总额: ${}", order_data.total);

    Ok(())
}

// 清理ESC/POS控制字符，保留可读内容
fn clean_escpos_for_display(content: &str) -> String {
    let mut result = String::new();
    let mut chars = content.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '\x1B' => {
                // ESC命令，跳过下一个字符
                chars.next();
            }
            '\x1D' => {
                // GS命令，跳过下一个字符
                chars.next();
            }
            '\x1C' => {
                // FS命令，跳过下一个字符
                chars.next();
            }
            '\n' | '\r' => {
                result.push('\n');
            }
            _ if ch.is_control() => {
                // 跳过其他控制字符
            }
            _ => {
                result.push(ch);
            }
        }
    }

    result
}

// 应用智能换行处理菜品描述（带前缀）
fn format_description_with_wrap(description: &str, width: usize, prefix: &str) -> String {
    let prefix_width = display_width(prefix);
    let content_width = width.saturating_sub(prefix_width);

    // 对描述应用智能换行
    let wrapped_content = smart_wrap_text_for_width(description, content_width);
    let lines: Vec<&str> = wrapped_content.lines().collect();

    let mut result = String::new();

    for (i, line) in lines.iter().enumerate() {
        if i == 0 {
            // 第一行：添加前缀
            result.push_str(prefix);
            result.push_str(line);
            result.push('\n');
        } else {
            // 后续行：添加缩进对齐
            result.push_str(&" ".repeat(prefix_width));
            result.push_str(line);
            result.push('\n');
        }
    }

    result
}

// 应用智能换行处理备注（带Note:前缀）
fn format_remark_with_wrap(remark: &str, width: usize, prefix: &str) -> String {
    let prefix_width = display_width(prefix);
    let content_width = width.saturating_sub(prefix_width);

    // 对备注应用智能换行
    let wrapped_content = smart_wrap_text_for_width(remark, content_width);
    let lines: Vec<&str> = wrapped_content.lines().collect();

    let mut result = String::new();

    for (i, line) in lines.iter().enumerate() {
        if i == 0 {
            // 第一行：添加Note:前缀
            result.push_str(prefix);
            result.push_str(line);
            result.push('\n');
        } else {
            // 后续行：添加缩进对齐
            result.push_str(&" ".repeat(prefix_width));
            result.push_str(line);
            result.push('\n');
        }
    }

    result
}