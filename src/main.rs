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
    pub rd_name: String,
    pub recipient_name: String,
    pub recipient_address: String,
    pub dishes_array: Vec<DishItem>,
    pub total: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DishItem {
    pub dishes_name: String,
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
    println!("  3. interactive    - 进入交互式模式");
    println!();
    println!("💡 使用示例:");
    println!("  printer-engine.exe list-printers");
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
        println!("  3. 退出");
        print!("请输入选择 (1-3): ");
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
                        println!("👋 再见！");
                        break;
                    }
                    _ => {
                        println!("❌ 无效选择 '{}'，请输入 1-3\n", choice);
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
    let char_width = if width == 80 { 48 } else { 32 };
    let mut content = String::new();

    // ESC/POS 初始化命令
    content.push_str("\x1B@"); // 初始化打印机
    content.push_str("\x1C\x26"); // 启用汉字模式
    content.push_str("\x1C\x43\x01"); // 选择汉字字符模式

    // 设置字体大小
    match font_size {
        0 => content.push_str("\x1D\x21\x00"), // 小号
        1 => content.push_str("\x1D\x21\x10"), // 中号
        2 => content.push_str("\x1D\x21\x11"), // 大号
        _ => content.push_str("\x1D\x21\x00"), // 默认
    }

    // 头部信息
    content.push_str("=".repeat(char_width as usize).as_str());
    content.push_str("\n");
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&center_text(&order.rd_name, char_width as usize));
    content.push_str("\x1B\x45\x00"); // 关闭加粗
    content.push_str("\n");
    content.push_str("=".repeat(char_width as usize).as_str());
    content.push_str("\n\n");

    // 订单信息
    content.push_str(&format!("Order #: {}\n", order.order_id));
    content.push_str(&format!("Customer: {}\n", order.recipient_name));
    if !order.recipient_address.is_empty() {
        content.push_str(&format!("Address: {}\n", order.recipient_address));
    }
    content.push_str("\n");

    // 商品列表
    content.push_str("-".repeat(char_width as usize).as_str());
    content.push_str("\nITEMS:\n");
    content.push_str("-".repeat(char_width as usize).as_str());
    content.push_str("\n");

    for dish in &order.dishes_array {
        content.push_str(&format!("{} x{}\n", dish.dishes_name, dish.amount));
        if !dish.remark.is_empty() {
            content.push_str(&format!("  Note: {}\n", dish.remark));
        }
        content.push_str(&format!("  ${}\n\n", dish.price));
    }

    // 总计
    content.push_str("-".repeat(char_width as usize).as_str());
    content.push_str("\n");
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&format!("TOTAL: ${}\n", order.total));
    content.push_str("\x1B\x45\x00"); // 关闭加粗
    content.push_str("=".repeat(char_width as usize).as_str());
    content.push_str("\n\n");

    // 切纸命令
    content.push_str("\x1D\x56\x00");

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
    content.push_str(&format!("Width: {}mm\n", width));
    content.push_str(&format!("Font Size: {}\n", font_size));
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