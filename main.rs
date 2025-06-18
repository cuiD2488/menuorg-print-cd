// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{State, Window};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use futures_util::{StreamExt, SinkExt};
use log::{info, debug, warn, error};
use std::fs;
use std::path::PathBuf;
use encoding_rs::{Encoding, UTF_8, GBK, GB18030, BIG5, EUC_JP, SHIFT_JIS};
use regex::Regex;
use std::collections::HashMap;

#[cfg(target_os = "windows")]
use winapi::um::winspool::{EnumPrintersW, PRINTER_INFO_2W, PRINTER_ENUM_LOCAL, PRINTER_ENUM_CONNECTIONS, OpenPrinterW, ClosePrinter, StartDocPrinterW, StartPagePrinter, EndPagePrinter, EndDocPrinter, WritePrinter, DOC_INFO_1W};
#[cfg(target_os = "windows")]
use winapi::um::errhandlingapi::GetLastError;
#[cfg(target_os = "windows")]
use std::ffi::OsString;
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStringExt;
#[cfg(target_os = "windows")]
use winapi::shared::minwindef::DWORD;
#[cfg(target_os = "windows")]
use winapi::um::winnt::HANDLE;
#[cfg(target_os = "windows")]
use std::ptr;

// 初始化日志系统
fn init_logger() -> Result<PathBuf, Box<dyn std::error::Error>> {
    // 获取应用数据目录
    let app_data_dir = if cfg!(windows) {
        std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string())
    } else {
        std::env::var("HOME").unwrap_or_else(|_| ".".to_string())
    };

    let log_dir = PathBuf::from(app_data_dir).join("OrderPrintClient").join("logs");

    // 创建日志目录
    fs::create_dir_all(&log_dir)?;

    // 日志文件路径，包含日期
    let log_file = log_dir.join(format!("print_client_{}.log", chrono::Local::now().format("%Y%m%d")));

    // 配置日志
    fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "{}[{}][{}] {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
                record.target(),
                record.level(),
                message
            ))
        })
        .level(log::LevelFilter::Debug)
        .chain(std::io::stdout()) // 同时输出到控制台
        .chain(fern::log_file(&log_file)?) // 输出到文件
        .apply()?;

    info!("🚀 订单打印客户端启动");
    info!("📝 日志文件位置: {}", log_file.display());

    Ok(log_file)
}

// 获取日志文件路径
fn get_log_file_path() -> PathBuf {
    let app_data_dir = if cfg!(windows) {
        std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string())
    } else {
        std::env::var("HOME").unwrap_or_else(|_| ".".to_string())
    };

    let log_dir = PathBuf::from(app_data_dir).join("OrderPrintClient").join("logs");
    log_dir.join(format!("print_client_{}.log", chrono::Local::now().format("%Y%m%d")))
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
    login_method: String,
    login_type: String,
    terminal: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct LoginResponse {
    success: bool,
    token: Option<String>,
    message: String,
    user_id: Option<String>,
    username: Option<String>,
    rd_id: Option<i32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ApiResponse<T> {
    status_code: i32,
    message: String,
    data: Option<T>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct LoginData {
    token: String,
    username: String,
    user_id: String,
    role_id: i32,
    rd_id: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct OrderData {
    order_id: String,
    rd_id: i32,
    user_id: String,
    order_status: i32,
    paystyle: i32,
    delivery_style: i32,
    delivery_type: i32,
    #[serde(default)]
    doordash_id: String,
    recipient_name: String,
    #[serde(default)]
    recipient_address: String,
    recipient_phone: String,
    #[serde(default)]
    recipient_distance: String,
    rd_name: String,
    rd_address: String,
    rd_phone: String,
    dishes_count: i32,
    #[serde(default)]
    dishes_id_list: String,
    dishes_array: Vec<DishItem>,
    #[serde(default)]
    discount_total: String,
    #[serde(default)]
    exemption: String,
    sub_total: String,
    #[serde(default)]
    user_commission: String,
    #[serde(default)]
    tax_rate: String,
    tax_fee: String,
    #[serde(default)]
    delivery_fee: String,
    #[serde(default)]
    convenience_rate: String,
    #[serde(default)]
    convenience_fee: String,
    #[serde(default)]
    retail_delivery_fee: String,
    #[serde(default)]
    tip_fee: String,
    total: String,
    #[serde(default)]
    cloud_print: i32,
    #[serde(default)]
    order_notes: String,
    #[serde(default)]
    serial_num: i32,
    #[serde(default)]
    order_pdf_url: String,
    #[serde(default)]
    user_email: String,
    create_time: String,
    delivery_time: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct DishItem {
    dishes_id: i64,  // 改为i64以支持大的ID值
    dishes_name: String,
    amount: i32,
    price: String,
    unit_price: String,
    #[serde(default)]
    remark: String,
    #[serde(default)]
    dishes_describe: String,
    #[serde(default)]
    dishes_series_id: i32,
    #[serde(default)]
    image_url: String,
    #[serde(default)]
    dishes_specs_id: serde_json::Value,  // 改为灵活的JSON值以支持复杂结构
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct PrinterConfig {
    name: String,
    width: i32, // 58 or 80
    is_default: bool,
    is_enabled: bool, // 是否启用用于订单打印
    font_size: i32, // 字体大小：0=小(默认), 1=中, 2=大
    // 新增编码相关配置
    #[serde(default)]
    supports_chinese: bool, // 是否支持中文
    #[serde(default = "default_encoding")]
    preferred_encoding: String, // 首选编码
    #[serde(default)]
    fallback_encodings: Vec<String>, // 备用编码列表
    #[serde(default)]
    printer_brand: String, // 打印机品牌
}

// 默认编码函数
fn default_encoding() -> String {
    "AUTO".to_string()
}

// 热敏打印机编码策略
#[derive(Clone, Debug)]
enum ThermalPrinterEncoding {
    Auto,        // 自动检测
    UTF8,        // UTF-8 (通用)
    GBK,         // GBK (简体中文)
    GB18030,     // GB18030 (最新中文标准)
    BIG5,        // Big5 (繁体中文)
    GB2312,      // GB2312 (早期简体中文)
    ASCII,       // 纯ASCII
}

// 中文字符类型检测结果
#[derive(Clone, Debug, Serialize)]
struct ChineseTextAnalysis {
    has_chinese: bool,
    has_simplified: bool,
    has_traditional: bool,
    has_symbols: bool,
    confidence: f64,
    character_counts: HashMap<String, i32>,
    recommended_encoding: String,
}

// 编码测试结果
#[derive(Clone, Debug, Serialize)]
struct EncodingTestResult {
    encoding_name: String,
    success: bool,
    compatibility_score: f64,
    test_content: String,
    error_message: Option<String>,
}

// 打印机编码能力信息
#[derive(Clone, Debug, Serialize)]
struct PrinterEncodingCapability {
    printer_name: String,
    brand: String,
    supports_chinese: bool,
    tested_encodings: Vec<EncodingTestResult>,
    recommended_encoding: String,
    fallback_encodings: Vec<String>,
    overall_compatibility: f64,
}

// 应用状态管理
#[derive(Default)]
struct AppState {
    is_connected: Arc<Mutex<bool>>,
    user_token: Arc<Mutex<Option<String>>>,
    user_id: Arc<Mutex<Option<String>>>,
    printers: Arc<Mutex<Vec<PrinterConfig>>>,
    global_font_size: Arc<Mutex<i32>>, // 全局字体大小设置: 0=小, 1=中, 2=大
}

// 登录命令
#[tauri::command]
async fn login(
    login_data: LoginRequest,
    state: State<'_, AppState>,
    window: Window,
) -> Result<LoginResponse, String> {
    let client = reqwest::Client::new();

    let login_url = "https://api.menuorg.com/app/v1/login";

    // 前端已经进行了MD5加密，直接使用接收到的密码
    let response = client
        .post(login_url)
        .json(&serde_json::json!({
            "username": login_data.username,
            "password": login_data.password, // 直接使用前端MD5加密后的密码
            "login_method": "password",
            "login_type": "platform",
            "terminal": 1
        }))
        .send()
        .await
        .map_err(|e| format!("登录请求失败: {}", e))?;
        println!("密码: {}", login_data.password);
    if response.status().is_success() {
        // 先获取原始响应文本进行调试
        let response_text = response.text().await
            .map_err(|e| format!("读取响应文本失败: {}", e))?;

        println!("API 响应原始数据: {}", response_text);

        // 尝试解析为通用JSON
        let json_value: serde_json::Value = serde_json::from_str(&response_text)
            .map_err(|e| format!("解析JSON失败: {}", e))?;

        println!("解析后的JSON: {:#}", json_value);

        // 先检查status_code，只有成功时才尝试解析LoginData
        if json_value["status_code"].as_i64() == Some(200) {
            // 只有成功时才尝试解析为包含LoginData的结构
            let api_response: ApiResponse<LoginData> = serde_json::from_str(&response_text)
                .map_err(|e| format!("解析登录响应失败: {}. 原始响应: {}", e, response_text))?;

            if let Some(data) = api_response.data {
                *state.user_token.lock().unwrap() = Some(data.token.clone());
                *state.user_id.lock().unwrap() = Some(data.user_id.clone());

                // 登录成功后自动连接WebSocket
                let ws_url = format!("wss://message.menuorg.com/app/v1/web_socket/7/{}", data.user_id);
                let is_connected = state.is_connected.clone();
                let printers = state.printers.clone();
                tokio::spawn(connect_websocket(ws_url, data.user_id.clone(), is_connected, printers, window));

                Ok(LoginResponse {
                    success: true,
                    token: Some(data.token),
                    message: "登录成功".to_string(),
                    user_id: Some(data.user_id),
                    username: Some(data.username),
                    rd_id: Some(data.rd_id),
                })
            } else {
                Ok(LoginResponse {
                    success: false,
                    token: None,
                    message: "登录失败：服务器返回数据为空".to_string(),
                    user_id: None,
                    username: None,
                    rd_id: None,
                })
            }
        } else {
            // 登录失败，直接返回错误信息
            let status_code = json_value["status_code"].as_i64().unwrap_or(0);
            let message = json_value["message"].as_str().unwrap_or("未知错误").to_string();

            Ok(LoginResponse {
                success: false,
                token: None,
                message: format!("登录失败 ({}): {}", status_code, message),
                user_id: None,
                username: None,
                rd_id: None,
            })
        }
    } else {
        Ok(LoginResponse {
            success: false,
            token: None,
            message: "登录失败：服务器错误".to_string(),
            user_id: None,
            username: None,
            rd_id: None,
        })
    }
}

// 从消息中提取订单ID的辅助函数
fn extract_order_id_from_message(text: &str) -> Option<String> {
    // 尝试多种模式匹配订单ID
    let patterns = [
        "\"order_id\":",
        "order_id:",
        "订单ID:",
        "Order:",
        "order:",
    ];

    for pattern in &patterns {
        if let Some(start_pos) = text.find(pattern) {
            let after_pattern = &text[start_pos + pattern.len()..];

            // 查找引号或冒号后的值
            let chars = after_pattern.chars().skip_while(|c| c.is_whitespace() || *c == ':' || *c == '"' || *c == '\'');
            let order_id: String = chars.take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '-').collect();

            if !order_id.is_empty() && order_id.len() > 3 {
                return Some(order_id);
            }
        }
    }

    None
}

// WebSocket连接
async fn connect_websocket(
    ws_url: String,
    _user_id: String,
    is_connected: Arc<Mutex<bool>>,
    printers: Arc<Mutex<Vec<PrinterConfig>>>,
    window: Window
) {
    let mut retry_count = 0;
    let max_retries = 999; // 几乎无限重连
    let mut retry_delay = 5; // 开始5秒重连间隔

    loop {
        println!("WebSocket连接URL: {} (尝试第 {} 次)", ws_url, retry_count + 1);

        match connect_async(&ws_url).await {
            Ok((ws_stream, _)) => {
                println!("WebSocket连接成功");
                *is_connected.lock().unwrap() = true;
                retry_count = 0; // 重置重试计数
                retry_delay = 5; // 重置重连间隔

                // 通知前端连接状态
                let _ = window.emit("websocket-status", "connected");

                let (write, mut read) = ws_stream.split();

                // 使用tokio的Mutex来支持异步操作
                let write_clone = Arc::new(tokio::sync::Mutex::new(write));
                let heartbeat_write = write_clone.clone();
                let heartbeat_task = tokio::spawn(async move {
                    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
                    loop {
                        interval.tick().await;
                        let mut writer = heartbeat_write.lock().await;
                        if writer.send(Message::Ping(vec![])).await.is_err() {
                            println!("❌ 心跳发送失败，连接可能已断开");
                            break;
                        }
                        println!("💓 发送心跳包");
                        drop(writer); // 显式释放锁
                    }
                });

                // 监听消息
                while let Some(message) = read.next().await {
                    match message {
                        Ok(Message::Text(text)) => {
                            println!("收到WebSocket消息: {}", text);

                            // 尝试解析为新订单通知消息
                            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&text) {
                                println!("解析WebSocket消息成功: {}", serde_json::to_string_pretty(&msg).unwrap_or_else(|_| "无法格式化".to_string()));

                                if msg["type"] == "order" {
                                    if let Some(order_id) = msg["data"]["order_id"].as_str() {
                                        println!("🔔 收到新订单通知，订单ID: {}", order_id);

                                        // 发送订单ID给前端处理
                                        let event_data = serde_json::json!({
                                            "order_id": order_id
                                        });
                                        println!("📤 准备发送事件到前端: {}", event_data);

                                        match window.emit("new-order-notification", &event_data) {
                                            Ok(_) => {
                                                println!("✅ 成功发送新订单通知到前端");
                                            }
                                            Err(e) => {
                                                println!("❌ 发送新订单通知失败: {}", e);
                                            }
                                        }
                                    } else {
                                        println!("❌ 新订单消息格式错误: 缺少order_id");
                                        println!("消息内容: {}", text);
                                    }
                                } else if msg["type"] == "new_order" || msg.get("order_id").is_some() {
                                    // 处理其他格式的新订单消息
                                    if let Some(order_id) = msg.get("order_id").and_then(|v| v.as_str()) {
                                        println!("🔔 收到新订单通知 (格式2)，订单ID: {}", order_id);
                                        let _ = window.emit("new-order-notification", serde_json::json!({
                                            "order_id": order_id
                                        }));
                                        println!("✅ 已发送新订单通知到前端");
                                    } else {
                                        println!("❌ 无法从消息中提取订单ID");
                                        println!("消息内容: {}", text);
                                    }
                                } else {
                                    // 尝试解析为完整订单数据（兼容旧格式）
                                    if let Ok(order) = serde_json::from_str::<OrderData>(&text) {
                                        println!("🔔 收到完整订单数据，订单ID: {}", order.order_id);
                                        // 直接打印订单
                                        let _ = print_order(order.clone(), printers.clone(), window.clone()).await;
                                        let _ = window.emit("new-order", &order);
                                        println!("✅ 已处理完整订单数据");
                                    } else {
                                        println!("⚠️ 无法解析WebSocket消息为已知格式");
                                        println!("消息类型: {:?}", msg.get("type"));
                                        println!("消息内容: {}", text);

                                        // 尝试作为通用订单通知处理
                                        if let Some(order_id) = extract_order_id_from_message(&text) {
                                            println!("🔍 从消息中提取到订单ID: {}", order_id);
                                            let _ = window.emit("new-order-notification", serde_json::json!({
                                                "order_id": order_id
                                            }));
                                        }
                                    }
                                }
                            } else {
                                println!("❌ 无法解析WebSocket消息JSON: {}", text);

                                // 尝试从纯文本中提取订单ID
                                if let Some(order_id) = extract_order_id_from_message(&text) {
                                    println!("🔍 从纯文本消息中提取到订单ID: {}", order_id);
                                    let _ = window.emit("new-order-notification", serde_json::json!({
                                        "order_id": order_id
                                    }));
                                } else {
                                let _ = window.emit("order-error", format!("无法解析WebSocket消息: {}", text));
                                }
                            }
                        }
                        Ok(Message::Close(_)) => {
                            println!("WebSocket连接被服务器关闭");
                            *is_connected.lock().unwrap() = false;
                            let _ = window.emit("websocket-status", "disconnected");
                            break;
                        }
                        Ok(Message::Ping(payload)) => {
                            println!("💓 收到Ping，发送Pong响应");
                            let mut writer = write_clone.lock().await;
                            let _ = writer.send(Message::Pong(payload)).await;
                            drop(writer); // 显式释放锁
                        }
                        Ok(Message::Pong(_)) => {
                            println!("💓 收到Pong响应");
                        }
                        Err(e) => {
                            println!("WebSocket错误: {}", e);
                            *is_connected.lock().unwrap() = false;
                            let _ = window.emit("websocket-status", "error");
                            break;
                        }
                        _ => {}
                    }
                }

                // 取消心跳任务
                heartbeat_task.abort();

                // 连接断开，准备重连
                println!("WebSocket连接断开，准备重连...");
                *is_connected.lock().unwrap() = false;
                let _ = window.emit("websocket-status", "disconnected");
            }
            Err(e) => {
                println!("WebSocket连接失败: {}", e);
                *is_connected.lock().unwrap() = false;
                let _ = window.emit("websocket-status", "failed");
            }
        }

        // 重连逻辑
        retry_count += 1;
        if retry_count >= max_retries {
            println!("WebSocket重连次数已达上限 ({}), 停止重连", max_retries);
            let _ = window.emit("websocket-status", "failed");
            break;
        }

        println!("等待 {} 秒后重连...", retry_delay);
        tokio::time::sleep(tokio::time::Duration::from_secs(retry_delay)).await;
        retry_delay = std::cmp::min(retry_delay * 2, 60); // 指数退避，最大60秒
    }
}

// 打印订单
async fn print_order(order: OrderData, printers_arc: Arc<Mutex<Vec<PrinterConfig>>>, window: Window) -> Result<(), String> {
    let printers = printers_arc.lock().unwrap().clone();

    // 过滤出启用的打印机
    let enabled_printers: Vec<PrinterConfig> = printers.into_iter()
        .filter(|p| p.is_enabled)
        .collect();

    if enabled_printers.is_empty() {
        let _ = window.emit("print-error", "No enabled printers");
        return Err("No enabled printers".to_string());
    }

    let mut print_success_count = 0;
    let mut print_errors = Vec::new();

    for printer in enabled_printers {
        match generate_print_content_with_encoding(&order, printer.width, printer.font_size, Some(&printer)) {
            Ok(content) => {
                // 使用智能编码转换
                let encoded_bytes = smart_encode_for_printer(&content, &printer);

                // 调用实际的打印机API
                match print_to_printer_bytes(&printer.name, &encoded_bytes).await {
                    Ok(_) => {
                        println!("Successfully printed to {} (width: {}mm)", printer.name, printer.width);
                        print_success_count += 1;

                        // 通知前端单个打印机打印成功
                        let _ = window.emit("printer-print-success", serde_json::json!({
                            "printer": printer.name,
                            "order_id": order.order_id
                        }));
                    }
                    Err(e) => {
                        println!("标准打印失败: {}, 尝试增强版打印...", e);

                        // 尝试增强版打印
                        #[cfg(target_os = "windows")]
                        match print_to_printer_enhanced_bytes(&printer.name, &encoded_bytes).await {
                            Ok(_) => {
                                println!("增强版打印成功: {} (width: {}mm)", printer.name, printer.width);
                print_success_count += 1;

                // 通知前端单个打印机打印成功
                let _ = window.emit("printer-print-success", serde_json::json!({
                    "printer": printer.name,
                    "order_id": order.order_id
                }));
                            }
                            Err(enhanced_error) => {
                                let error_msg = format!("Failed to print to {} (both standard and enhanced): {} | {}",
                                                       printer.name, e, enhanced_error);
                                println!("{}", error_msg);
                                print_errors.push(error_msg.clone());
                                let _ = window.emit("printer-print-error", serde_json::json!({
                                    "printer": printer.name,
                                    "error": error_msg
                                }));
                            }
                        }

                        #[cfg(not(target_os = "windows"))]
                        {
                            let error_msg = format!("Failed to print to {}: {}", printer.name, e);
                            println!("{}", error_msg);
                            print_errors.push(error_msg.clone());
                            let _ = window.emit("printer-print-error", serde_json::json!({
                                "printer": printer.name,
                                "error": error_msg
                            }));
                        }
                    }
                }
            }
            Err(e) => {
                print_errors.push(format!("{}: {}", printer.name, e));
                let _ = window.emit("printer-print-error", serde_json::json!({
                    "printer": printer.name,
                    "error": e
                }));
            }
        }
    }

    // 通知前端总体打印结果
    if print_success_count > 0 {
        let _ = window.emit("print-success", serde_json::json!({
            "success_count": print_success_count,
            "order_id": order.order_id
        }));
    }

    if !print_errors.is_empty() {
        let _ = window.emit("print-error", print_errors.join("; "));
    }

    Ok(())
}

// ==================== 智能编码检测和转换系统 ====================

// 分析中文文本特征
fn analyze_chinese_text(text: &str) -> ChineseTextAnalysis {
    let mut simplified_count = 0;
    let mut traditional_count = 0;
    let mut symbol_count = 0;
    let mut ascii_count = 0;
    let mut other_count = 0;

    // 常见简体字
    let simplified_chars = [
        '你', '我', '他', '们', '的', '是', '在', '有', '和', '对', '就', '会', '说', '要', '来', '到',
        '这', '那', '可', '以', '了', '不', '个', '人', '订', '单', '打', '印', '餐', '厅', '菜', '品',
        '地', '址', '电', '话', '号', '码', '时', '间', '总', '计', '小', '计', '费', '用', '配', '送'
    ];

    // 常见繁体字
    let traditional_chars = [
        '您', '們', '個', '來', '這', '那', '會', '說', '對', '時', '間', '點', '錢', '訂', '單',
        '測', '試', '餐', '廳', '電', '話', '總', '計', '費', '用', '配', '送', '點', '選', '擇'
    ];

    // 中文符号
    let chinese_symbols = [
        '￥', '＄', '€', '【', '】', '《', '》', '（', '）', '「', '」', '、', '。', '，', '；',
        '：', '？', '！', '※', '～', '·', '…', '"', '"', ''', '''
    ];

    for ch in text.chars() {
        if ch.is_ascii() {
            ascii_count += 1;
        } else if simplified_chars.contains(&ch) {
            simplified_count += 1;
        } else if traditional_chars.contains(&ch) {
            traditional_count += 1;
        } else if chinese_symbols.contains(&ch) {
            symbol_count += 1;
        } else if is_cjk_character(ch) {
            // 其他中日韩字符
            other_count += 1;
        }
    }

    let total_chars = text.chars().count() as i32;
    let chinese_chars = simplified_count + traditional_count + other_count;
    let has_chinese = chinese_chars > 0;
    let has_simplified = simplified_count > 0;
    let has_traditional = traditional_count > 0;
    let has_symbols = symbol_count > 0;

    // 计算置信度
    let confidence = if total_chars > 0 {
        (chinese_chars + symbol_count) as f64 / total_chars as f64
    } else {
        0.0
    };

    // 推荐编码
    let recommended_encoding = if !has_chinese && !has_symbols {
        "ASCII".to_string()
    } else if simplified_count > traditional_count * 2 {
        "GBK".to_string()  // 简体中文优先使用GBK
    } else if traditional_count > simplified_count {
        "BIG5".to_string()  // 繁体中文使用Big5
    } else if has_chinese || has_symbols {
        "UTF8".to_string()  // 混合内容使用UTF-8
    } else {
        "UTF8".to_string()  // 默认UTF-8
    };

    let mut character_counts = HashMap::new();
    character_counts.insert("simplified".to_string(), simplified_count);
    character_counts.insert("traditional".to_string(), traditional_count);
    character_counts.insert("symbols".to_string(), symbol_count);
    character_counts.insert("ascii".to_string(), ascii_count);
    character_counts.insert("other".to_string(), other_count);

    ChineseTextAnalysis {
        has_chinese,
        has_simplified,
        has_traditional,
        has_symbols,
        confidence,
        character_counts,
        recommended_encoding,
    }
}

// 检查是否为CJK字符
fn is_cjk_character(ch: char) -> bool {
    let code = ch as u32;
    (code >= 0x4E00 && code <= 0x9FFF) ||  // CJK统一汉字
    (code >= 0x3400 && code <= 0x4DBF) ||  // CJK扩展A
    (code >= 0x3000 && code <= 0x303F) ||  // CJK符号和标点
    (code >= 0xFF00 && code <= 0xFFEF)     // 全角ASCII
}

// 智能编码转换 - 根据打印机类型和文本内容选择最佳编码
fn smart_encode_for_printer(text: &str, printer_config: &PrinterConfig) -> Vec<u8> {
    info!("🔍 [ENCODING] 开始智能编码转换");
    info!("🔍 [ENCODING] 打印机: {}", printer_config.name);
    info!("🔍 [ENCODING] 品牌: {}", printer_config.printer_brand);
    info!("🔍 [ENCODING] 首选编码: {}", printer_config.preferred_encoding);

    // 分析文本特征
    let analysis = analyze_chinese_text(text);
    info!("✅ [ENCODING] 文本分析完成: 中文={}, 简体={}, 繁体={}, 符号={}, 置信度={:.2}",
          analysis.has_chinese, analysis.has_simplified, analysis.has_traditional,
          analysis.has_symbols, analysis.confidence);

    // 确定目标编码
    let target_encoding = determine_optimal_encoding(&analysis, printer_config);
    info!("🎯 [ENCODING] 选择编码: {}", target_encoding);

    // 执行编码转换
    match convert_text_to_encoding(text, &target_encoding) {
        Ok(bytes) => {
            info!("✅ [ENCODING] 编码转换成功: {} -> {} 字节", text.chars().count(), bytes.len());
            bytes
        }
        Err(e) => {
            warn!("⚠️ [ENCODING] 编码转换失败: {}, 使用UTF-8备用方案", e);
            text.as_bytes().to_vec()
        }
    }
}

// 确定最优编码策略
fn determine_optimal_encoding(analysis: &ChineseTextAnalysis, printer_config: &PrinterConfig) -> String {
    // 如果用户明确指定了编码且不是AUTO，就使用用户指定的
    if printer_config.preferred_encoding != "AUTO" && !printer_config.preferred_encoding.is_empty() {
        return printer_config.preferred_encoding.clone();
    }

    // 根据打印机品牌和文本特征智能选择
    let brand = printer_config.printer_brand.to_lowercase();

    if !analysis.has_chinese && !analysis.has_symbols {
        // 纯英文，使用ASCII
        return "ASCII".to_string();
    }

    // 根据打印机品牌优化编码选择
    match brand.as_str() {
        brand if brand.contains("xprinter") || brand.contains("gprinter") => {
            // 中国品牌热敏打印机，优先使用国标编码
            if analysis.has_simplified {
                "GBK".to_string()
            } else if analysis.has_traditional {
                "BIG5".to_string()
            } else {
                "GBK".to_string()  // 默认GBK，兼容性好
            }
        }
        brand if brand.contains("epson") || brand.contains("citizen") => {
            // 日系品牌，UTF-8兼容性通常较好
            "UTF8".to_string()
        }
        brand if brand.contains("star") || brand.contains("bixolon") => {
            // 韩系品牌，UTF-8兼容性好
            "UTF8".to_string()
        }
        _ => {
            // 其他品牌或未知品牌，根据文本内容选择
            if analysis.has_simplified && analysis.simplified_count > analysis.traditional_count {
                "GBK".to_string()
            } else if analysis.has_traditional {
                "BIG5".to_string()
            } else {
                "UTF8".to_string()  // 默认UTF-8
            }
        }
    }
}

// 执行编码转换
fn convert_text_to_encoding(text: &str, encoding: &str) -> Result<Vec<u8>, String> {
    match encoding.to_uppercase().as_str() {
        "ASCII" => {
            // ASCII编码：只保留ASCII字符，非ASCII字符用?替代
            let ascii_text: String = text.chars().map(|c| {
                if c.is_ascii() { c } else { '?' }
            }).collect();
            Ok(ascii_text.as_bytes().to_vec())
        }
        "UTF8" | "UTF-8" => {
            // UTF-8编码（默认）
            Ok(text.as_bytes().to_vec())
        }
        "GBK" => {
            // GBK编码
            let (encoded, _, had_errors) = GBK.encode(text);
            if had_errors {
                warn!("⚠️ [ENCODING] GBK编码有错误，可能存在不兼容字符");
            }
            Ok(encoded.into_owned())
        }
        "GB18030" => {
            // GB18030编码
            let (encoded, _, had_errors) = GB18030.encode(text);
            if had_errors {
                warn!("⚠️ [ENCODING] GB18030编码有错误，可能存在不兼容字符");
            }
            Ok(encoded.into_owned())
        }
        "BIG5" => {
            // Big5编码
            let (encoded, _, had_errors) = BIG5.encode(text);
            if had_errors {
                warn!("⚠️ [ENCODING] Big5编码有错误，可能存在不兼容字符");
            }
            Ok(encoded.into_owned())
        }
        _ => {
            // 不支持的编码，回退到UTF-8
            warn!("⚠️ [ENCODING] 不支持的编码 {}，回退到UTF-8", encoding);
            Ok(text.as_bytes().to_vec())
        }
    }
}

// 改进的内容处理函数 - 支持智能编码
fn prepare_mixed_content(text: &str) -> String {
    // 基本清理：移除控制字符，保留可打印字符和必要的格式字符
    text.chars()
        .filter(|c| !c.is_control() || matches!(*c, '\n' | '\r' | '\t'))
        .collect()
}

// 检测打印机品牌
fn detect_printer_brand(printer_name: &str) -> String {
    let name = printer_name.to_lowercase();

    if name.contains("xprinter") {
        "XPrinter".to_string()
    } else if name.contains("gprinter") {
        "GPrinter".to_string()
    } else if name.contains("epson") {
        "Epson".to_string()
    } else if name.contains("citizen") {
        "Citizen".to_string()
    } else if name.contains("star") {
        "Star".to_string()
    } else if name.contains("bixolon") {
        "Bixolon".to_string()
    } else if name.contains("zebra") {
        "Zebra".to_string()
    } else if name.contains("hp") {
        "HP".to_string()
    } else if name.contains("canon") {
        "Canon".to_string()
    } else if name.contains("thermal") || name.contains("receipt") || name.contains("pos") {
        "Generic Thermal".to_string()
    } else {
        "Unknown".to_string()
    }
}

// 生成带编码优化的ESC/POS内容
fn generate_optimized_escpos_content(base_content: &str, encoding: &str) -> String {
    let mut content = String::new();

    // ESC/POS初始化
    content.push_str("\x1B@"); // ESC @ - 初始化打印机

    // 根据编码类型添加相应的字符集设置命令
    match encoding.to_uppercase().as_str() {
        "GBK" | "GB18030" => {
            // 设置中文字符集 - GBK/GB18030
            content.push_str("\x1C&");     // FS &
            content.push_str("\x1C\x43\x00"); // FS C 0 - 选择字符代码表
        }
        "BIG5" => {
            // 设置繁体中文字符集 - Big5
            content.push_str("\x1C&");     // FS &
            content.push_str("\x1C\x43\x01"); // FS C 1 - 选择字符代码表
        }
        "UTF8" | "UTF-8" => {
            // UTF-8模式设置
            content.push_str("\x1C&");     // FS &
            content.push_str("\x1C\x43\x08"); // FS C 8 - UTF-8代码表
        }
        _ => {
            // 默认设置
            content.push_str("\x1C&");     // FS &
        }
    }

    // 添加基础内容
    content.push_str(base_content);

    content
}

fn generate_print_content(order: &OrderData, width: i32, font_size: i32) -> Result<String, String> {
    generate_print_content_with_encoding(order, width, font_size, None)
}

// 支持指定编码的打印内容生成函数
fn generate_print_content_with_encoding(order: &OrderData, width: i32, font_size: i32, printer_config: Option<&PrinterConfig>) -> Result<String, String> {
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

    // 如果有打印机配置，则添加编码特定的ESC/POS命令
    if let Some(config) = printer_config {
        let encoding = determine_optimal_encoding(
            &analyze_chinese_text(&format!("{} {} {}", order.rd_name, order.recipient_name,
                order.dishes_array.iter().map(|d| &d.dishes_name).collect::<Vec<_>>().join(" "))),
            config
        );

        info!("🎯 [PRINT] 为打印机 {} 使用编码: {}", config.name, encoding);

        // 添加编码特定的ESC/POS命令
        match encoding.as_str() {
            "GBK" | "GB18030" => {
                content.push_str("\x1C&");         // FS &
                content.push_str("\x1C\x43\x00");  // FS C 0 - GBK代码表
            }
            "BIG5" => {
                content.push_str("\x1C&");         // FS &
                content.push_str("\x1C\x43\x01");  // FS C 1 - Big5代码表
            }
            "UTF8" => {
                content.push_str("\x1C&");         // FS &
                content.push_str("\x1C\x43\x08");  // FS C 8 - UTF-8代码表
            }
            _ => {
                content.push_str("\x1C&");         // FS & - 默认设置
            }
        }
    }

    // 设置行间距
    content.push_str("\x1B\x33\x20"); // 设置行间距

    let char_width = if width == 80 { 48 } else { 32 }; // 字符宽度

    // ============= 订单头部 =============
    content.push_str(&"=".repeat(char_width));
    content.push_str("\n");

    // 餐厅名称 (居中，加粗)
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&center_text_mixed(&order.rd_name.to_uppercase(), char_width));
    content.push_str("\x1B\x45\x00"); // 关闭加粗
    content.push_str("\n");

    // 订单类型 (居中，加粗)
    let order_type = if order.delivery_style == 1 { "DELIVERY ORDER" } else { "PICKUP ORDER" };
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&center_text_mixed(order_type, char_width));
    content.push_str("\x1B\x45\x00"); // 关闭加粗
    content.push_str("\n");

    content.push_str(&"=".repeat(char_width));
    content.push_str("\n\n");

    // ============= Basic Information =============
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&center_text_mixed("BASIC INFORMATION", char_width));
    content.push_str("\x1B\x45\x00"); // 关闭加粗
    content.push_str("\n");
    content.push_str(&"-".repeat(char_width));
    content.push_str("\n");

    // 订单ID和序列号
    content.push_str(&format_table_row("Order ID:", &order.order_id, char_width));

    let serial = if order.serial_num > 0 {
        format!("#{:03}", order.serial_num)
    } else {
        format!("#{}", get_order_serial(order))
    };
    content.push_str(&format_table_row("Serial:", &serial, char_width));

    // 餐厅和时间信息
    content.push_str(&format_table_row("Restaurant:", &prepare_mixed_content(&order.rd_name), char_width));
    content.push_str(&format_table_row("Order Date:", &format_order_time(&order.create_time), char_width));

    if !order.delivery_time.is_empty() {
        let time_label = if order.delivery_style == 1 { "Delivery Time:" } else { "Pickup Time:" };
        content.push_str(&format_table_row(time_label, &format_delivery_time(&order.delivery_time), char_width));
    }

    // 订单状态
    let status_text = match order.order_status {
        0 => "Pending",
        1 => "Confirmed",
        2 => "In Progress",
        3 => "Ready",
        4 => "Completed",
        5 => "Cancelled",
        _ => "Unknown",
    };
    content.push_str(&format_table_row("Status:", status_text, char_width));

    // 订单类型
    let delivery_type_text = if order.delivery_style == 1 { "Delivery" } else { "Pickup" };
    content.push_str(&format_table_row("Type:", delivery_type_text, char_width));

    content.push_str("\n");
    content.push_str(&"-".repeat(char_width));
    content.push_str("\n");

    // ============= Customer Information =============
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&center_text_mixed("CUSTOMER INFORMATION", char_width));
    content.push_str("\x1B\x45\x00"); // 关闭加粗
    content.push_str("\n");
    content.push_str(&"-".repeat(char_width));
    content.push_str("\n");

    content.push_str(&format_table_row("Name:", &prepare_mixed_content(&order.recipient_name), char_width));

    if !order.recipient_phone.is_empty() {
        content.push_str(&format_table_row("Phone:", &order.recipient_phone, char_width));
    }

    if !order.recipient_address.is_empty() {
        content.push_str(&format_table_row("Address:", &prepare_mixed_content(&order.recipient_address), char_width));
    }

    if !order.user_email.is_empty() {
        content.push_str(&format_table_row("Email:", &order.user_email, char_width));
    }

    if !order.recipient_distance.is_empty() {
        content.push_str(&format_table_row("Distance:", &order.recipient_distance, char_width));
    }

    content.push_str("\n");
    content.push_str(&"-".repeat(char_width));
    content.push_str("\n");

    // ============= Item Details =============
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&center_text_mixed("ITEM DETAILS", char_width));
    content.push_str("\x1B\x45\x00"); // 关闭加粗
    content.push_str("\n");
    content.push_str(&"-".repeat(char_width));
    content.push_str("\n");

    // 表格标题 - 简化版本
    let header = format_table_header("Item Name", "Qty", "", "Price", char_width);
    content.push_str(&header);
    content.push_str(&"-".repeat(char_width));
    content.push_str("\n");

    for item in &order.dishes_array {
        let price: f64 = item.price.parse().unwrap_or(0.0);
        let unit_price: f64 = item.unit_price.parse().unwrap_or(0.0);

        // 商品行 (使用混合编码处理菜名)
        content.push_str(&format_item_table_row(
            &prepare_mixed_content(&item.dishes_name),
            item.amount,
            unit_price,
            price,
            char_width
        ));

        // 附加项目 (如米饭等) - 只显示名称，不显示价格和数量
        if !item.dishes_describe.is_empty() {
            content.push_str(&format!("  + {}\n", prepare_mixed_content(&item.dishes_describe)));
        }

        // 特殊要求 (使用混合编码)
        if !item.remark.is_empty() {
            content.push_str(&format!("  Notes: {}\n", prepare_mixed_content(&item.remark)));
        }

        // 增加商品间的行距
        content.push_str("\n");
    }

    content.push_str("\n");
    content.push_str(&"-".repeat(char_width));
    content.push_str("\n");

    // ============= Payment Details =============
    let sub_total: f64 = order.sub_total.parse().unwrap_or(0.0);
    let discount_total: f64 = order.discount_total.parse().unwrap_or(0.0);
    let exemption: f64 = order.exemption.parse().unwrap_or(0.0);
    let tax_fee: f64 = order.tax_fee.parse().unwrap_or(0.0);
    let tax_rate: f64 = order.tax_rate.parse().unwrap_or(0.0);
    let delivery_fee: f64 = order.delivery_fee.parse().unwrap_or(0.0);
    let convenience_fee: f64 = order.convenience_fee.parse().unwrap_or(0.0);
    let retail_delivery_fee: f64 = order.retail_delivery_fee.parse().unwrap_or(0.0);
    let tip_fee: f64 = order.tip_fee.parse().unwrap_or(0.0);
    let total: f64 = order.total.parse().unwrap_or(0.0);

    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&center_text_mixed("PAYMENT DETAILS", char_width));
    content.push_str("\x1B\x45\x00"); // 关闭加粗
    content.push_str("\n");
    content.push_str(&"-".repeat(char_width));
    content.push_str("\n");

    // 小计
    content.push_str(&format_fee_line("Subtotal:", sub_total, char_width));

    // 折扣
    if discount_total > 0.0 {
        content.push_str(&format_fee_line("Discount:", -discount_total, char_width));
    }

    // 免费金额
    if exemption > 0.0 {
        content.push_str(&format_fee_line("Exemption:", -exemption, char_width));
    }

    // 配送费
    if delivery_fee > 0.0 {
        content.push_str(&format_fee_line("Delivery Fee:", delivery_fee, char_width));
    }

    // 零售配送费
    if retail_delivery_fee > 0.0 {
        content.push_str(&format_fee_line("Retail Del. Fee:", retail_delivery_fee, char_width));
    }

    // 便民费
    if convenience_fee > 0.0 {
        let conv_rate: f64 = order.convenience_rate.parse().unwrap_or(0.0);
        let conv_label = if conv_rate > 0.0 {
            format!("Service Fee ({:.1}%):", conv_rate * 100.0)
        } else {
            "Service Fee:".to_string()
        };
        content.push_str(&format_fee_line(&conv_label, convenience_fee, char_width));
    }

    // 小费
    if tip_fee > 0.0 {
        content.push_str(&format_fee_line("Tip:", tip_fee, char_width));
    }

    // 税费
    if tax_fee > 0.0 {
        let tax_label = if tax_rate > 0.0 {
            format!("Tax ({:.1}%):", tax_rate * 100.0)
        } else {
            "Tax:".to_string()
        };
        content.push_str(&format_fee_line(&tax_label, tax_fee, char_width));
    }

    content.push_str("\n");
    content.push_str(&"-".repeat(char_width));
    content.push_str("\n");

    // 总计 (加粗显示)
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&format_fee_line("TOTAL:", total, char_width));
    content.push_str("\x1B\x45\x00"); // 关闭加粗

    // 支付方式
    content.push_str("\n");
    content.push_str(&format_table_row("Payment Method:", get_payment_method_text(order.paystyle), char_width));

    content.push_str("\n");
    content.push_str(&"=".repeat(char_width));
    content.push_str("\n");

    // ============= Order Notes =============
    if !order.order_notes.is_empty() {
        content.push_str("\x1B\x45\x01"); // 加粗
        content.push_str(&center_text_mixed("ORDER NOTES", char_width));
        content.push_str("\x1B\x45\x00"); // 关闭加粗
        content.push_str("\n");
        content.push_str(&"-".repeat(char_width));
        content.push_str("\n");
        content.push_str(&prepare_mixed_content(&order.order_notes));
        content.push_str("\n\n");
        content.push_str(&"=".repeat(char_width));
        content.push_str("\n");
    }

    // ============= Footer =============
    content.push_str("\n");
    content.push_str(&center_text_mixed("Thank you for your order!", char_width));
    content.push_str("\n");
    content.push_str(&center_text_mixed(&format!("Order Time: {}", format_simple_time(&order.create_time)), char_width));
    content.push_str("\n\n\n\n"); // 空行，为切纸预留空间

    // 单次自动切纸命令 - 避免重复切纸
    content.push_str("\x1D\x56\x00"); // GS V 0 - 全切 (最通用的切纸命令)

    Ok(content)
}

    // ============= 订单信息表格 =============
    // 订单号 (居中显示)
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&center_text_mixed(&format!("Order #: {}", order.order_id), char_width));
    content.push_str("\x1B\x45\x00"); // 关闭加粗
    content.push_str("\n");

    // 流水号 (居中显示)
    let serial = if order.serial_num > 0 {
        format!("#{:03}", order.serial_num)
    } else {
        format!("#{}", get_order_serial(order))
    };
    content.push_str(&center_text_mixed(&format!("Serial: {}", serial), char_width));
    content.push_str("\n\n");

    // 基本信息表格 (左对齐标签，右对齐数值)
    content.push_str(&format_table_row("Order Date:", &format_order_time(&order.create_time), char_width));

    if order.delivery_style == 1 {  // 外送
        content.push_str(&format_table_row("Delivery Time:", &format_delivery_time(&order.delivery_time), char_width));
        if !order.recipient_distance.is_empty() && order.recipient_distance != "0.00" {
            content.push_str(&format_table_row("Distance:", &format!("{} miles", order.recipient_distance), char_width));
        }
    } else {  // 自取
        content.push_str(&format_table_row("Pickup Time:", &format_delivery_time(&order.delivery_time), char_width));
    }

    content.push_str(&format_table_row("Payment:", get_payment_method_text(order.paystyle), char_width));
    content.push_str(&format_table_row("Customer:", &prepare_mixed_content(&order.recipient_name), char_width));
    content.push_str(&format_table_row("Phone:", &order.recipient_phone, char_width));

    // 地址 (如果是外送)
    if !order.recipient_address.is_empty() && order.delivery_style == 1 {
        content.push_str(&format_table_row("Address:", &prepare_mixed_content(&order.recipient_address), char_width));
    }

    if !order.user_email.is_empty() {
        content.push_str(&format_table_row("Email:", &order.user_email, char_width));
    }

    content.push_str("\n");
    content.push_str("-".repeat(char_width).as_str());
    content.push_str("\n");

    // ============= 商品明细表格 =============
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&center_text_mixed("ITEM DETAILS", char_width));
    content.push_str("\x1B\x45\x00"); // 关闭加粗
    content.push_str("\n");
    content.push_str("-".repeat(char_width).as_str());
    content.push_str("\n");

    // 表格标题 - 简化版本
    let header = format_table_header("Item Name", "Qty", "", "Price", char_width);
    content.push_str(&header);
    content.push_str("-".repeat(char_width).as_str());
    content.push_str("\n");

    for item in &order.dishes_array {
        let price: f64 = item.price.parse().unwrap_or(0.0);
        let unit_price: f64 = item.unit_price.parse().unwrap_or(0.0);

        // 商品行 (使用混合编码处理菜名)
        content.push_str(&format_item_table_row(
            &prepare_mixed_content(&item.dishes_name),
            item.amount,
            unit_price,
            price,
            char_width
        ));

        // 附加项目 (如米饭等) - 只显示名称，不显示价格和数量
        if !item.dishes_describe.is_empty() {
            content.push_str(&format!("  + {}\n", prepare_mixed_content(&item.dishes_describe)));
        }

        // 特殊要求 (使用混合编码)
        if !item.remark.is_empty() {
            content.push_str(&format!("  Note: {}\n", prepare_mixed_content(&item.remark)));
        }

        // 增加商品间的行距
        content.push_str("\n");
    }

    // ============= 费用明细 (右下角，每行一个数据，右对齐) =============
    let sub_total: f64 = order.sub_total.parse().unwrap_or(0.0);
    let discount_total: f64 = order.discount_total.parse().unwrap_or(0.0);
    let exemption: f64 = order.exemption.parse().unwrap_or(0.0);
    let tax_fee: f64 = order.tax_fee.parse().unwrap_or(0.0);
    let tax_rate: f64 = order.tax_rate.parse().unwrap_or(0.0);
    let delivery_fee: f64 = order.delivery_fee.parse().unwrap_or(0.0);
    let convenience_fee: f64 = order.convenience_fee.parse().unwrap_or(0.0);
    let retail_delivery_fee: f64 = order.retail_delivery_fee.parse().unwrap_or(0.0);
    let tip_fee: f64 = order.tip_fee.parse().unwrap_or(0.0);
    let total: f64 = order.total.parse().unwrap_or(0.0);

    content.push_str("-".repeat(char_width).as_str());
    content.push_str("\n");
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&center_text_mixed("PAYMENT SUMMARY", char_width));
    content.push_str("\x1B\x45\x00"); // 关闭加粗
    content.push_str("\n");
    content.push_str("-".repeat(char_width).as_str());
    content.push_str("\n");

    // 小计
    content.push_str(&format_fee_line("Subtotal", sub_total, char_width));

    // 折扣
    if discount_total > 0.0 {
        content.push_str(&format_fee_line("Discount", -discount_total, char_width));
    }

    // 免费金额
    if exemption > 0.0 {
        content.push_str(&format_fee_line("Exemption", -exemption, char_width));
    }

    // 税费
    if tax_fee > 0.0 {
        let tax_label = if tax_rate > 0.0 {
            format!("Tax ({:.1}%)", tax_rate * 100.0)
        } else {
            "Tax".to_string()
        };
        content.push_str(&format_fee_line(&tax_label, tax_fee, char_width));
    }

    // 配送费
    if delivery_fee > 0.0 {
        content.push_str(&format_fee_line("Delivery Fee", delivery_fee, char_width));
    }

    // 零售配送费
    if retail_delivery_fee > 0.0 {
        content.push_str(&format_fee_line("Retail Del. Fee", retail_delivery_fee, char_width));
    }

    // 便民费
    if convenience_fee > 0.0 {
        let conv_rate: f64 = order.convenience_rate.parse().unwrap_or(0.0);
        let conv_label = if conv_rate > 0.0 {
            format!("Service Fee ({:.1}%)", conv_rate * 100.0)
        } else {
            "Service Fee".to_string()
        };
        content.push_str(&format_fee_line(&conv_label, convenience_fee, char_width));
    }

    // 小费
    if tip_fee > 0.0 {
        content.push_str(&format_fee_line("Tip", tip_fee, char_width));
    }

    content.push_str("\n");
    content.push_str("=".repeat(char_width).as_str());
    content.push_str("\n");

    // 总计 (加粗显示)
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&format_fee_line("TOTAL", total, char_width));
    content.push_str("\x1B\x45\x00"); // 关闭加粗

    content.push_str("=".repeat(char_width).as_str());
    content.push_str("\n");

    // 底部信息 (使用混合编码)
    if !order.order_notes.is_empty() {
        content.push_str("\nNotes:\n");
        content.push_str(&prepare_mixed_content(&order.order_notes));
        content.push_str("\n");
    }

    content.push_str("\n");
    content.push_str(&center_text_mixed("Thank you for your order!", char_width));
    content.push_str("\n");
    content.push_str(&center_text_mixed(&format!("Order Time: {}", format_simple_time(&order.create_time)), char_width));
    content.push_str("\n\n\n\n"); // 空行，为切纸预留空间

    // 单次自动切纸命令 - 避免重复切纸
    content.push_str("\x1D\x56\x00"); // GS V 0 - 全切 (最通用的切纸命令)

    Ok(content)
}

// Helper function to get order type
fn get_order_type_text(order: &OrderData) -> &str {
    match order.delivery_style {
        1 => "DELIVERY",
        _ => "PICKUP",
    }
}

// Helper function to get payment method text
fn get_payment_method_text(paystyle: i32) -> &'static str {
    match paystyle {
        0 => "Cash on Delivery",
        1 => "Online Payment",
        2 => "Credit Card",
        _ => "Unknown Payment",
    }
}

// Helper function to get order serial number
fn get_order_serial(order: &OrderData) -> String {
    // Use the last 6 digits of order_id or a simple counter
    let id_str = &order.order_id;
    if id_str.len() >= 6 {
        id_str[id_str.len()-6..].to_string()
    } else {
        id_str.to_string()
    }
}

// Helper function to format order time
fn format_order_time(time_str: &str) -> String {
    if let Ok(parsed) = chrono::NaiveDateTime::parse_from_str(time_str, "%Y-%m-%d %H:%M:%S") {
        parsed.format("%m/%d/%Y %I:%M %p").to_string()
    } else {
        time_str.to_string()
    }
}

// Helper function to format delivery time
fn format_delivery_time(time_str: &str) -> String {
    if let Ok(parsed) = chrono::NaiveDateTime::parse_from_str(time_str, "%Y-%m-%d %H:%M:%S") {
        parsed.format("%m/%d/%Y %I:%M %p").to_string()
    } else {
        time_str.to_string()
    }
}

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

// 格式化对齐的文本行 (左右对齐)
fn format_aligned(label: &str, value: &str, width: usize) -> String {
    let label_width = display_width(label);
    let value_width = display_width(value);

    if label_width + value_width + 1 >= width {
        // 如果总长度超过限制，换行显示
        format!("{}\n{}\n", label, value)
    } else {
        let spaces = width - label_width - value_width;
        format!("{}{}{}\n", label, " ".repeat(spaces), value)
    }
}

// 格式化价格行 (右对齐金额)
fn format_price_line(label: &str, amount: f64, width: usize) -> String {
    let label_width = display_width(label);
    let amount_str = if amount < 0.0 {
        format!("-${:.2}", -amount)
    } else {
        format!("${:.2}", amount)
    };
    let amount_width = display_width(&amount_str);

    if label_width + amount_width + 1 >= width {
        format!("{} {}\n", label, amount_str)
    } else {
        let spaces = width - label_width - amount_width;
        format!("{}{}{}\n", label, " ".repeat(spaces), amount_str)
    }
}

// 自动换行文本
fn wrap_text(text: &str, width: usize) -> String {
    let mut result = String::new();
    let mut current_line = String::new();
    let mut current_width = 0;

    for word in text.split_whitespace() {
        let word_width = display_width(word);

        if current_width + word_width + 1 > width && !current_line.is_empty() {
            result.push_str(&current_line);
            result.push('\n');
            current_line = word.to_string();
            current_width = word_width;
        } else {
            if !current_line.is_empty() {
                current_line.push(' ');
                current_width += 1;
            }
            current_line.push_str(word);
            current_width += word_width;
        }
    }

    if !current_line.is_empty() {
        result.push_str(&current_line);
        result.push('\n');
    }

    result
}

// 带缩进的自动换行文本
fn wrap_text_with_indent(text: &str, width: usize, indent: &str) -> String {
    let indent_width = display_width(indent);
    let content_width = width.saturating_sub(indent_width);

    let wrapped = wrap_text(text, content_width);
    let mut result = String::new();
    let mut is_first_line = true;

    for line in wrapped.lines() {
        if is_first_line {
            result.push_str(line);
            is_first_line = false;
        } else {
            result.push('\n');
            result.push_str(indent);
            result.push_str(line);
        }
    }

    result
}

// 格式化带标签的长文本
fn format_text_with_label(label: &str, text: &str, width: usize) -> String {
    let label_width = display_width(label);
    let text_width = display_width(text);

    if label_width + text_width + 1 <= width {
        // 能在一行显示
        format!("{} {}\n", label, text)
    } else {
        // 需要换行
        let indent = " ".repeat(label_width + 1);
        let content_width = width.saturating_sub(label_width + 1);
        let wrapped = wrap_text(text, content_width);

        let mut result = format!("{} ", label);
        let mut is_first_line = true;

        for line in wrapped.lines() {
            if is_first_line {
                result.push_str(line);
                result.push('\n');
                is_first_line = false;
            } else {
                result.push_str(&indent);
                result.push_str(line);
                result.push('\n');
            }
        }

        result
    }
}

// 格式化商品名称和价格行
fn format_item_name_price(name: &str, price: f64, width: usize) -> String {
    let price_str = if price == 0.0 {
        "+$0.00".to_string()
    } else {
        format!("${:.2}", price)
    };

    let name_width = display_width(name);
    let price_width = display_width(&price_str);

    if name_width + price_width + 1 > width {
        // 如果一行放不下，商品名称单独一行，价格另起一行右对齐
        format!("{}\n{}{}\n",
            name,
            " ".repeat(width.saturating_sub(price_width)),
            price_str
        )
    } else {
        // 一行内左右对齐
        let spaces = width - name_width - price_width;
        format!("{}{}{}\n", name, " ".repeat(spaces), price_str)
    }
}

// 简化的时间格式
fn format_simple_time(time_str: &str) -> String {
    if let Ok(parsed) = chrono::NaiveDateTime::parse_from_str(time_str, "%Y-%m-%d %H:%M:%S") {
        // 检查是否是未来时间
        let now = chrono::Local::now().naive_local();
        if parsed > now {
            format!("Future order {}", parsed.format("%H:%M"))
        } else {
            parsed.format("%m/%d %H:%M").to_string()
        }
    } else {
        time_str.to_string()
    }
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

// 商品表格行 - 简化版本
fn format_item_table_row(name: &str, qty: i32, _unit_price: f64, total_price: f64, width: usize) -> String {
    // 简化表格：只显示菜名、数量、总价
    let name_width = (width * 70 / 100).max(20);  // 菜名占70%宽度
    let qty_width = 4;    // 数量宽度
    let total_width = width.saturating_sub(name_width + qty_width + 2); // 总价宽度

    let qty_str = format!("{}", qty);
    let total_str = if total_price == 0.0 { "+0.00".to_string() } else { format!("{:.2}", total_price) };

    // 如果商品名太长，需要换行处理
    if display_width(name) > name_width {
        let mut result = String::new();

        // 将长菜名分行显示
        let wrapped_lines = wrap_text_for_width(name, name_width);
        let lines: Vec<&str> = wrapped_lines.lines().collect();

        // 第一行显示菜名开头和价格信息
        if !lines.is_empty() {
            result.push_str(&format!("{:<name_width$} {:>qty_width$} {:>total_width$}\n",
                truncate_for_width(lines[0], name_width),
                qty_str,
                total_str,
                name_width = name_width,
                qty_width = qty_width,
                total_width = total_width
            ));
        }

        // 后续行只显示菜名的剩余部分
        for line in lines.iter().skip(1) {
            result.push_str(&format!("{:<name_width$}\n",
                truncate_for_width(line, name_width),
                name_width = name_width
            ));
        }

        result
    } else {
        // 菜名长度适中，单行显示
        format!("{:<name_width$} {:>qty_width$} {:>total_width$}\n",
            pad_for_width(name, name_width),
            qty_str,
            total_str,
            name_width = name_width,
            qty_width = qty_width,
            total_width = total_width
        )
    }
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

// 按显示宽度换行文本
fn wrap_text_for_width(text: &str, width: usize) -> String {
    let mut result = String::new();
    let mut current_line = String::new();
    let mut current_width = 0;

    for ch in text.chars() {
        let char_width = if ch.is_ascii() { 1 } else { 2 };

        if current_width + char_width > width {
            result.push_str(&current_line);
            result.push('\n');
            current_line = ch.to_string();
            current_width = char_width;
        } else {
            current_line.push(ch);
            current_width += char_width;
        }
    }

    if !current_line.is_empty() {
        result.push_str(&current_line);
    }

    result
}

// 原有的英文版本函数 (保留兼容性)
fn center_text(text: &str, width: usize) -> String {
    let text_len = text.chars().count();
    if text_len >= width {
        text.to_string()
    } else {
        let padding = (width - text_len) / 2;
        format!("{}{}", " ".repeat(padding), text)
    }
}

fn truncate_string(s: &str, max_len: usize) -> String {
    if s.chars().count() <= max_len {
        format!("{:<width$}", s, width = max_len)
    } else {
        let truncated: String = s.chars().take(max_len - 2).collect();
        format!("{}..", truncated)
    }
}

// Windows系统打印机枚举函数
#[cfg(target_os = "windows")]
fn get_system_printers() -> Result<Vec<PrinterConfig>, String> {
    use std::ptr;

    println!("🔍 [SYSTEM] 开始枚举Windows系统打印机...");

    unsafe {
        let mut bytes_needed = 0;
        let mut printer_count = 0;

        println!("🔍 [SYSTEM] 第一次调用EnumPrintersW获取缓冲区大小...");
        // 第一次调用获取需要的缓冲区大小
        EnumPrintersW(
            PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS,
            ptr::null_mut(),
            2, // PRINTER_INFO_2W
            ptr::null_mut(),
            0,
            &mut bytes_needed,
            &mut printer_count,
        );

        println!("🔍 [SYSTEM] 需要缓冲区大小: {} 字节", bytes_needed);

        if bytes_needed == 0 {
            println!("⚠️ [SYSTEM] 缓冲区大小为0，可能没有打印机");
            return Ok(Vec::new());
        }

        // 分配缓冲区
        let mut buffer = vec![0u8; bytes_needed as usize];
        println!("🔍 [SYSTEM] 已分配 {} 字节缓冲区", buffer.len());

        println!("🔍 [SYSTEM] 第二次调用EnumPrintersW获取打印机信息...");
        // 第二次调用获取打印机信息
        let success = EnumPrintersW(
            PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS,
            ptr::null_mut(),
            2, // PRINTER_INFO_2W
            buffer.as_mut_ptr(),
            bytes_needed,
            &mut bytes_needed,
            &mut printer_count,
        );

        if success == 0 {
            let error_code = GetLastError();
            println!("❌ [SYSTEM] EnumPrintersW失败，错误代码: {}", error_code);
            return Err(format!("EnumPrintersW failed with error: {}", error_code));
        }

        println!("✅ [SYSTEM] 成功获取打印机信息，数量: {}", printer_count);

        let mut printers = Vec::new();
        let printer_info_ptr = buffer.as_ptr() as *const PRINTER_INFO_2W;

        for i in 0..printer_count {
            println!("🔍 [SYSTEM] 处理打印机 {} / {}", i + 1, printer_count);
            let printer_info = &*printer_info_ptr.add(i as usize);

            // 转换打印机名称
            let name_ptr = printer_info.pPrinterName;
            if !name_ptr.is_null() {
                let name_slice = std::slice::from_raw_parts(
                    name_ptr,
                    (0..).take_while(|&i| *name_ptr.add(i) != 0).count(),
                );
                let name = OsString::from_wide(name_slice).to_string_lossy().to_string();

                println!("🔍 [SYSTEM] 打印机名称: {}", name);

                // 判断打印机类型、宽度和编码配置
                let (width, is_thermal, supports_chinese, preferred_encoding, fallback_encodings) = classify_printer(&name);
                let printer_brand = detect_printer_brand(&name);

                println!("🔍 [SYSTEM] 分类结果: 宽度={}mm, 热敏打印机={}, 中文支持={}, 品牌={}, 首选编码={}",
                         width, is_thermal, supports_chinese, printer_brand, preferred_encoding);

                // 检查是否为默认打印机
                let is_default = (printer_info.Attributes & 0x00000004) != 0; // PRINTER_ATTRIBUTE_DEFAULT
                println!("🔍 [SYSTEM] 是否为默认打印机: {}", is_default);

                printers.push(PrinterConfig {
                    name: name.clone(),
                    width,
                    is_default,
                    is_enabled: false, // 默认禁用，用户需要手动选择
                    font_size: 0, // 默认小号字体
                    supports_chinese,
                    preferred_encoding,
                    fallback_encodings,
                    printer_brand,
                });

                println!("✅ [SYSTEM] 打印机 {} 添加完成", name);
            } else {
                println!("⚠️ [SYSTEM] 打印机 {} 名称指针为空，跳过", i + 1);
            }
        }

        println!("🎉 [SYSTEM] 打印机枚举完成，共找到 {} 台有效打印机", printers.len());
        Ok(printers)
    }
}

// 非Windows系统的占位实现
#[cfg(not(target_os = "windows"))]
fn get_system_printers() -> Result<Vec<PrinterConfig>, String> {
    // 对于非Windows系统，返回空列表或实现其他系统的打印机枚举
    Ok(Vec::new())
}

// 根据打印机名称分类判断宽度和编码配置
fn classify_printer(name: &str) -> (i32, bool, bool, String, Vec<String>) {
    let name_lower = name.to_lowercase();

    // 检测品牌
    let brand = detect_printer_brand(name);

    // 确定是否支持中文
    let supports_chinese = name_lower.contains("xprinter") ||
                          name_lower.contains("gprinter") ||
                          name_lower.contains("epson") ||
                          name_lower.contains("citizen") ||
                          name_lower.contains("star") ||
                          name_lower.contains("bixolon") ||
                          name_lower.contains("thermal") ||
                          name_lower.contains("receipt") ||
                          name_lower.contains("pos");

    // 根据品牌确定首选编码和备用编码
    let (preferred_encoding, fallback_encodings) = match brand.to_lowercase().as_str() {
        brand if brand.contains("xprinter") || brand.contains("gprinter") => {
            // 中国品牌，优先GBK
            ("GBK".to_string(), vec!["GBK".to_string(), "GB18030".to_string(), "UTF8".to_string()])
        }
        brand if brand.contains("epson") => {
            // Epson通常UTF-8支持较好
            ("UTF8".to_string(), vec!["UTF8".to_string(), "GBK".to_string(), "BIG5".to_string()])
        }
        brand if brand.contains("citizen") || brand.contains("star") => {
            // 日系品牌
            ("UTF8".to_string(), vec!["UTF8".to_string(), "GBK".to_string()])
        }
        brand if brand.contains("bixolon") => {
            // 韩系品牌
            ("UTF8".to_string(), vec!["UTF8".to_string(), "GBK".to_string()])
        }
        _ => {
            // 通用热敏打印机或未知品牌
            if supports_chinese {
                ("AUTO".to_string(), vec!["GBK".to_string(), "UTF8".to_string(), "GB18030".to_string()])
            } else {
                ("UTF8".to_string(), vec!["UTF8".to_string(), "ASCII".to_string()])
            }
        }
    };

    // 检查是否为热敏打印机和宽度
    let (width, is_thermal) = if name_lower.contains("58") || name_lower.contains("58mm") {
        (58, true)
    } else if name_lower.contains("80") || name_lower.contains("80mm") {
        (80, true)
    } else if name_lower.contains("thermal") || name_lower.contains("receipt") || name_lower.contains("pos") {
        // 热敏打印机但未明确宽度，默认80mm
        (80, true)
    } else {
        // 其他类型打印机，默认80mm宽度
        (80, false)
    };

    (width, is_thermal, supports_chinese, preferred_encoding, fallback_encodings)
}

// 获取打印机列表
#[tauri::command]
async fn get_printers(state: State<'_, AppState>) -> Result<Vec<PrinterConfig>, String> {
    println!("🔍 [PRINTER] 开始扫描系统打印机...");

    // 获取系统真实打印机
    let system_printers = get_system_printers()?;

    println!("🔍 [PRINTER] 系统扫描完成，发现 {} 台打印机", system_printers.len());

    // 如果没有检测到打印机，返回提示
    if system_printers.is_empty() {
        println!("⚠️ [PRINTER] 警告：未检测到任何打印机");
        return Err("未检测到任何打印机。请确保打印机已正确安装并连接。".to_string());
    }

    // 如果状态中有现有配置，保持用户的启用状态
    let current_printers = state.printers.lock().unwrap().clone();
    let mut updated_printers = system_printers;

    if !current_printers.is_empty() {
        println!("🔍 [PRINTER] 合并现有配置，保持用户启用状态...");
        // 合并配置，保持用户的启用状态
        for printer in &mut updated_printers {
            if let Some(existing) = current_printers.iter().find(|p| p.name == printer.name) {
                printer.is_enabled = existing.is_enabled;
                printer.font_size = existing.font_size; // 保持字体大小设置
                println!("🔍 [PRINTER] 保持打印机 {} 的启用状态: {}, 字体大小: {}", printer.name, printer.is_enabled, printer.font_size);
            }
        }
    }

    // 更新状态
    *state.printers.lock().unwrap() = updated_printers.clone();

    println!("✅ [PRINTER] 打印机配置更新完成");
    println!("📊 [PRINTER] 检测到 {} 台打印机详情:", updated_printers.len());
    for (i, printer) in updated_printers.iter().enumerate() {
        println!("   {}. 打印机: {} ({}mm, 默认: {}, 启用: {})",
                 i + 1, printer.name, printer.width, printer.is_default, printer.is_enabled);
    }

    Ok(updated_printers)
}

// 设置打印机配置
#[tauri::command]
async fn set_printer_config(
    printers: Vec<PrinterConfig>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    *state.printers.lock().unwrap() = printers;
    Ok(())
}

// 获取连接状态
#[tauri::command]
async fn get_connection_status(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(*state.is_connected.lock().unwrap())
}

// 测试打印
#[tauri::command]
async fn test_print(printer_name: String, state: State<'_, AppState>) -> Result<(), String> {
    info!("🧪 [TEST] 开始测试打印");
    info!("🧪 [TEST] 目标打印机: {}", printer_name);

    let printer_config = {
    let printers = state.printers.lock().unwrap();
        info!("🧪 [TEST] 当前配置的打印机数量: {}", printers.len());

        for (i, p) in printers.iter().enumerate() {
            debug!("🧪 [TEST] 打印机 {}: {} (宽度: {}mm, 启用: {})",
                     i + 1, p.name, p.width, p.is_enabled);
        }

        printers.iter().find(|p| p.name == printer_name).cloned()
    };

    if let Some(printer) = printer_config {
        info!("✅ [TEST] 找到目标打印机: {} (宽度: {}mm, 品牌: {}, 中文支持: {})",
              printer.name, printer.width, printer.printer_brand, printer.supports_chinese);

        info!("🧪 [TEST] 生成包含中文的测试订单数据...");
        let test_order = OrderData {
            order_id: "23410121749595834".to_string(),
            rd_id: 341,
            user_id: "6305000000012".to_string(),
            order_status: 1,
            paystyle: 0,  // 线下付款测试
            delivery_style: 0,  // 自取测试
            delivery_type: 0,
            doordash_id: "".to_string(),
            recipient_name: "张三 (Zhang San)".to_string(),
            recipient_address: "北京市朝阳区望京街道 123号 2B室 (123 Wangjing St, Apt 2B, Beijing)".to_string(),
            recipient_phone: "(555) 123-4567".to_string(),
            recipient_distance: "2.5".to_string(),
            rd_name: "老王川菜馆 (Lao Wang Sichuan Restaurant)".to_string(),
            rd_address: "456 Broadway Avenue, New York, NY 10012".to_string(),
            rd_phone: "(555) 987-6543".to_string(),
            dishes_count: 3,
            dishes_id_list: "[341120650,341120651,341120652]".to_string(),
            dishes_array: vec![
                DishItem {
                    dishes_id: 341120650,  // 这个值在i32范围内，保持不变
                    dishes_name: "麻婆豆腐 (Mapo Tofu)".to_string(),
                    amount: 1,
                    price: "18.99".to_string(),
                    unit_price: "18.99".to_string(),
                    remark: "不要太辣 (Not too spicy)".to_string(),
                    dishes_describe: "嫩豆腐配麻辣汤汁 (Soft tofu with spicy sauce)".to_string(),
                    dishes_series_id: 10771,
                    image_url: "https://www.menuorg.com/image/webp/dishes_photo/1746236681_13.png".to_string(),
                    dishes_specs_id: serde_json::Value::Null,
                },
                DishItem {
                    dishes_id: 341120651,  // 这个值在i32范围内，保持不变
                    dishes_name: "宫保鸡丁 (Kung Pao Chicken)".to_string(),
                    amount: 2,
                    price: "23.98".to_string(),
                    unit_price: "11.99".to_string(),
                    remark: "多放花生米 (Extra peanuts)".to_string(),
                    dishes_describe: "鸡肉丁配花生米和青椒 (Diced chicken with peanuts and peppers)".to_string(),
                    dishes_series_id: 10772,
                    image_url: "".to_string(),
                    dishes_specs_id: serde_json::Value::Null,
                },
                DishItem {
                    dishes_id: 341120652,  // 这个值在i32范围内，保持不变
                    dishes_name: "白米饭 (Steamed Rice)".to_string(),
                    amount: 1,
                    price: "6.99".to_string(),
                    unit_price: "6.99".to_string(),
                    remark: "".to_string(),
                    dishes_describe: "香喷喷的白米饭 (Fragrant steamed white rice)".to_string(),
                    dishes_series_id: 10773,
                    image_url: "".to_string(),
                    dishes_specs_id: serde_json::Value::Null,
                },
            ],
            discount_total: "5.00".to_string(),
            exemption: "0.00".to_string(),
            sub_total: "49.96".to_string(),
            user_commission: "1.25".to_string(),
            tax_rate: "0.0825".to_string(),
            tax_fee: "4.37".to_string(),
            delivery_fee: "3.99".to_string(),
            convenience_rate: "0.035".to_string(),
            convenience_fee: "1.75".to_string(),
            retail_delivery_fee: "0.00".to_string(),
            tip_fee: "7.50".to_string(),
            total: "65.82".to_string(),
            cloud_print: 0,
            order_notes: "请按门铃两次。如无人应答请放在门口。(Please ring doorbell twice. Leave at front door if no answer.)".to_string(),
            serial_num: 42,
            order_pdf_url: "https://www.menuorg.com/order_pdf/order_23410121749595834.pdf".to_string(),
            user_email: "john.smith@email.com".to_string(),
            create_time: "2025-01-15 18:30:00".to_string(),
            delivery_time: "2025-01-15 19:15:00".to_string(),
        };

        println!("✅ [TEST] 测试订单数据生成完成");
        println!("🧪 [TEST] 正在生成打印内容...");

        let content = generate_print_content_with_encoding(&test_order, printer.width, printer.font_size, Some(&printer))?;
        
        // 使用智能编码转换
        let encoded_bytes = smart_encode_for_printer(&content, &printer);

        println!("✅ [TEST] 打印内容生成完成，字符长度: {}, 编码后字节: {}", content.len(), encoded_bytes.len());
        println!("🧪 [TEST] 打印内容预览 (前100字符):");
        println!("{}", &content[..std::cmp::min(100, content.len())]);
        println!("🧪 [TEST] 开始调用打印机API...");

        // 实际调用打印机
        match print_to_printer_bytes(&printer.name, &encoded_bytes).await {
            Ok(_) => {
                println!("🎉 [TEST] 测试打印成功完成! 打印机: {}", printer.name);
        Ok(())
            }
            Err(e) => {
                println!("❌ [TEST] 标准打印失败: {}, 尝试增强版打印...", e);

                // 尝试增强版打印
                #[cfg(target_os = "windows")]
                match print_to_printer_enhanced_bytes(&printer.name, &encoded_bytes).await {
                    Ok(_) => {
                        println!("🎉 [TEST] 增强版测试打印成功! 打印机: {}", printer.name);
                        Ok(())
                    }
                    Err(enhanced_error) => {
                        println!("❌ [TEST] 增强版打印也失败! 打印机: {}, 错误: {} | {}",
                                printer.name, e, enhanced_error);
                        Err(format!("Test print failed (both standard and enhanced): {} | {}", e, enhanced_error))
                    }
                }

                #[cfg(not(target_os = "windows"))]
                {
                    println!("❌ [TEST] 测试打印失败! 打印机: {}, 错误: {}", printer.name, e);
                    Err(format!("Test print failed: {}", e))
                }
            }
        }
    } else {
        let printers = state.printers.lock().unwrap();
        println!("❌ [TEST] 未找到指定的打印机: {}", printer_name);
        println!("🧪 [TEST] 可用的打印机列表:");
        for (i, p) in printers.iter().enumerate() {
            println!("   {}. {}", i + 1, p.name);
        }
        Err("Printer not found".to_string())
    }
}

// Toggle printer enable status test
#[tauri::command]
async fn toggle_printer(printer_name: String, enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    println!("🔧 [TOGGLE] 切换打印机状态: {} -> {}", printer_name, if enabled { "启用" } else { "禁用" });

    let mut printers = state.printers.lock().unwrap();

    if let Some(printer) = printers.iter_mut().find(|p| p.name == printer_name) {
        printer.is_enabled = enabled;
        println!("✅ [TOGGLE] 打印机 {} 已{}", printer.name, if enabled { "启用用于订单打印" } else { "禁用" });

        // 输出当前所有打印机状态
        println!("📊 [TOGGLE] 当前打印机状态:");
        for (i, p) in printers.iter().enumerate() {
            println!("   {}. {} - {}", i + 1, p.name, if p.is_enabled { "✅启用" } else { "❌禁用" });
        }

        Ok(())
    } else {
        println!("❌ [TOGGLE] 未找到打印机: {}", printer_name);
        Err("Printer not found".to_string())
    }
}

// 手动打印订单
#[tauri::command]
async fn manual_print_order(
    order_data: OrderData,
    state: State<'_, AppState>,
    window: Window,
) -> Result<String, String> {
    let printers_arc = state.printers.clone();

    println!("手动打印订单: {}", order_data.order_id);

    // 调用打印函数
    match print_order(order_data.clone(), printers_arc, window).await {
        Ok(_) => Ok(format!("订单 {} 打印成功", order_data.order_id)),
        Err(e) => Err(format!("打印失败: {}", e)),
    }
}

// 生成打印预览内容
#[tauri::command]
async fn get_print_preview(order_data: OrderData, state: State<'_, AppState>) -> Result<String, String> {
    let printers = state.printers.lock().unwrap();
    let global_font_size = *state.global_font_size.lock().unwrap();

    // 获取第一个启用的打印机的宽度，如果没有则使用80mm
    let width = printers.iter()
        .find(|p| p.is_enabled)
        .map(|p| p.width)
        .unwrap_or(80);

    // 生成打印内容 - 使用全局字体大小设置
    generate_print_content(&order_data, width, global_font_size)
}

// 获取单个订单详情
#[tauri::command]
async fn get_order_detail(
    user_id: String,
    order_id: String,
    token: String,
) -> Result<OrderData, String> {
    println!("🔍 [API] 开始获取订单详情");
    println!("🔍 [API] 用户ID: {}", user_id);
    println!("🔍 [API] 订单ID: {}", order_id);
    println!("🔍 [API] Token: {}", if token.is_empty() { "空" } else { "已设置" });

    let client = reqwest::Client::new();
    let url = format!(
        "https://api.menuorg.com/app/v1/order/get_by_id?user_id={}&id={}",
        user_id, order_id
    );

    println!("📡 [API] 请求订单详情URL: {}", url);
    println!("🔑 [API] 使用token: {}", token);

    let response = client
        .get(&url)
        .header("authorization", &token)
        .send()
        .await
        .map_err(|e| {
            println!("❌ [API] 请求订单详情失败: {}", e);
            format!("请求订单详情失败: {}", e)
        })?;

    println!("📡 [API] 响应状态码: {}", response.status());

    if response.status().is_success() {
        let response_text = response.text().await
            .map_err(|e| {
                println!("❌ [API] 读取订单响应失败: {}", e);
                format!("读取订单响应失败: {}", e)
            })?;

        println!("📄 [API] 订单详情API响应: {}", response_text);

        let json_value: serde_json::Value = serde_json::from_str(&response_text)
            .map_err(|e| {
                println!("❌ [API] 解析订单JSON失败: {}", e);
                format!("解析订单JSON失败: {}", e)
            })?;

        let status_code = json_value["status_code"].as_i64().unwrap_or(0);
        println!("📊 [API] API状态码: {}", status_code);

        if status_code == 200 {
            if json_value["data"].is_object() {
                println!("✅ [API] 订单数据存在，开始解析...");
                let order: OrderData = serde_json::from_value(json_value["data"].clone())
                    .map_err(|e| {
                        println!("❌ [API] 解析订单数据失败: {}", e);
                        println!("❌ [API] 原始数据: {}", json_value["data"]);
                        format!("解析订单数据失败: {}", e)
                    })?;
                println!("✅ [API] 订单解析成功: {}", order.order_id);
                Ok(order)
            } else {
                println!("❌ [API] 订单数据为空或格式错误");
                println!("❌ [API] data字段内容: {}", json_value["data"]);
                Err("订单数据为空".to_string())
            }
        } else {
            let message = json_value["message"].as_str().unwrap_or("未知错误");
            println!("❌ [API] 获取订单详情失败: {} - {}", status_code, message);
            Err(format!("获取订单详情失败 ({}): {}", status_code, message))
        }
    } else {
        println!("❌ [API] HTTP请求失败，状态码: {}", response.status());
        Err(format!("订单详情API请求失败: {}", response.status()))
    }
}

// 获取订单列表
#[tauri::command]
async fn get_order_list(
    user_id: String,
    rd_id: i32,
    token: String,
    page: i32,
    per_page: i32,
) -> Result<Vec<OrderData>, String> {
    println!("🔍 [ORDER_LIST] 开始获取订单列表");
    println!("🔍 [ORDER_LIST] 用户ID: {}", user_id);
    println!("🔍 [ORDER_LIST] 餐厅ID: {}", rd_id);
    println!("🔍 [ORDER_LIST] 页码: {}", page);
    println!("🔍 [ORDER_LIST] 每页数量: {}", per_page);
    println!("🔍 [ORDER_LIST] Token: {}", if token.is_empty() { "空" } else { "已设置" });

    let client = reqwest::Client::new();
    let url = format!(
        "https://api.menuorg.com/app/v1/order/get_by_rd_two?user_id={}&rd_id={}&page={}&per_page={}",
        user_id, rd_id, page, per_page
    );

    println!("📡 [ORDER_LIST] 请求URL: {}", url);
    println!("🔑 [ORDER_LIST] 请求头 Authorization: {}", token);

    let response = client
        .get(&url)
        .header("authorization", &token)
        .send()
        .await
        .map_err(|e| {
            println!("❌ [ORDER_LIST] HTTP请求失败: {}", e);
            format!("请求订单列表失败: {}", e)
        })?;

    println!("📡 [ORDER_LIST] HTTP响应状态码: {}", response.status());

    if response.status().is_success() {
        let response_text = response.text().await
            .map_err(|e| {
                println!("❌ [ORDER_LIST] 读取响应内容失败: {}", e);
                format!("读取订单响应失败: {}", e)
            })?;

        println!("📄 [ORDER_LIST] API响应内容: {}", response_text);

        let json_value: serde_json::Value = serde_json::from_str(&response_text)
            .map_err(|e| {
                println!("❌ [ORDER_LIST] 解析JSON失败: {}", e);
                format!("解析订单JSON失败: {}", e)
            })?;

        let status_code = json_value["status_code"].as_i64().unwrap_or(0);
        println!("📊 [ORDER_LIST] API状态码: {}", status_code);

        if let Some(message) = json_value["message"].as_str() {
            println!("📝 [ORDER_LIST] API消息: {}", message);
        }

        if status_code == 200 {
            // API返回的数据结构中，订单列表在data.items中
            if let Some(data) = json_value["data"].as_object() {
                println!("✅ [ORDER_LIST] data字段存在，类型: object");
                println!("🔍 [ORDER_LIST] data字段内容: {}", serde_json::to_string_pretty(data).unwrap_or_else(|_| "无法格式化".to_string()));

                if let Some(items) = data["items"].as_array() {
                    println!("✅ [ORDER_LIST] items字段存在，数量: {}", items.len());
                let mut orders = Vec::new();
                    for (index, item) in items.iter().enumerate() {
                        println!("🔍 [ORDER_LIST] 解析订单 {}/{}", index + 1, items.len());
                        match serde_json::from_value::<OrderData>(item.clone()) {
                            Ok(order) => {
                                println!("✅ [ORDER_LIST] 订单解析成功: {}", order.order_id);
                        orders.push(order);
                    }
                            Err(e) => {
                                println!("❌ [ORDER_LIST] 订单解析失败 {}: {}", index + 1, e);
                                println!("❌ [ORDER_LIST] 原始订单数据: {}", serde_json::to_string_pretty(item).unwrap_or_else(|_| "无法格式化".to_string()));
                            }
                        }
                    }
                    println!("✅ [ORDER_LIST] 成功解析 {} 个订单", orders.len());

                    // 添加订单详细信息用于调试
                    for (i, order) in orders.iter().enumerate() {
                        println!("📋 [ORDER_LIST] 订单 {}: ID={}, 客户={}, 状态={}, 总额=${}",
                                i + 1, order.order_id, order.recipient_name, order.order_status, order.total);
                    }

                Ok(orders)
            } else {
                    println!("⚠️ [ORDER_LIST] items字段不存在或不是数组");
                    println!("🔍 [ORDER_LIST] data字段所有键: {:?}", data.keys().collect::<Vec<_>>());
                Ok(Vec::new()) // 返回空列表
            }
        } else {
                println!("⚠️ [ORDER_LIST] data字段不存在或不是对象");
                println!("🔍 [ORDER_LIST] data字段类型: {:?}", json_value["data"]);
                Ok(Vec::new()) // 返回空列表
            }
        } else {
            let message = json_value["message"].as_str().unwrap_or("未知错误");
            println!("❌ [ORDER_LIST] API返回错误状态码: {} - {}", status_code, message);
            Err(format!("获取订单失败 ({}): {}", status_code, message))
        }
    } else {
        println!("❌ [ORDER_LIST] HTTP请求失败，状态码: {}", response.status());
        Err(format!("订单API请求失败: {}", response.status()))
    }
}

// Windows打印机调用函数（同步版本）
#[cfg(target_os = "windows")]
fn print_to_printer_sync(printer_name: &str, content: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    info!("🖨️ [DEBUG] 开始打印到打印机: {}", printer_name);
    debug!("🖨️ [DEBUG] 打印内容长度: {} 字符", content.len());

    let wide_printer_name: Vec<u16> = OsStr::new(printer_name).encode_wide().chain(std::iter::once(0)).collect();
    let wide_document_name: Vec<u16> = OsStr::new("Order Print").encode_wide().chain(std::iter::once(0)).collect();

    debug!("🖨️ [DEBUG] 转换打印机名称为宽字符: 成功");

    unsafe {
        let mut printer_handle: HANDLE = ptr::null_mut();

        debug!("🖨️ [DEBUG] 正在打开打印机...");
        // 打开打印机
        let open_result = OpenPrinterW(
            wide_printer_name.as_ptr() as *mut u16,
            &mut printer_handle,
            ptr::null_mut(),
        );

        if open_result == 0 {
            let error_code = GetLastError();
            error!("❌ [ERROR] 打开打印机失败: {}, 错误代码: {}", printer_name, error_code);
            return Err(format!("Failed to open printer {}: Error {}", printer_name, error_code));
        }

        debug!("✅ [DEBUG] 打印机打开成功, 句柄: {:?}", printer_handle);

        // 为热敏打印机指定正确的数据类型
        let wide_datatype: Vec<u16> = OsStr::new("RAW").encode_wide().chain(std::iter::once(0)).collect();

        // 创建文档信息
        let mut doc_info = DOC_INFO_1W {
            pDocName: wide_document_name.as_ptr() as *mut u16,
            pOutputFile: ptr::null_mut(),
            pDatatype: wide_datatype.as_ptr() as *mut u16,
        };

        println!("🖨️ [DEBUG] 正在开始打印文档...");
        // 开始文档
        let doc_id = StartDocPrinterW(printer_handle, 1, &mut doc_info as *mut _ as *mut _);
        if doc_id == 0 {
            let error_code = GetLastError();
            println!("❌ [ERROR] 开始文档失败, 错误代码: {}", error_code);
            ClosePrinter(printer_handle);
            return Err(format!("Failed to start document: Error {}", error_code));
        }

        println!("✅ [DEBUG] 文档开始成功, 文档ID: {}", doc_id);

        println!("🖨️ [DEBUG] 正在开始打印页面...");
        // 开始页面
        let page_result = StartPagePrinter(printer_handle);
        if page_result == 0 {
            let error_code = GetLastError();
            println!("❌ [ERROR] 开始页面失败, 错误代码: {}", error_code);
            EndDocPrinter(printer_handle);
            ClosePrinter(printer_handle);
            return Err(format!("Failed to start page: Error {}", error_code));
        }

        println!("✅ [DEBUG] 页面开始成功");

        // 写入打印内容
        let content_bytes = content.as_bytes();
        let mut bytes_written: DWORD = 0;

        println!("🖨️ [DEBUG] 正在写入打印数据... ({} 字节)", content_bytes.len());

        let write_result = WritePrinter(
            printer_handle,
            content_bytes.as_ptr() as *mut _,
            content_bytes.len() as DWORD,
            &mut bytes_written,
        );

        if write_result == 0 {
            let error_code = GetLastError();
            println!("❌ [ERROR] 写入打印机失败, 错误代码: {}", error_code);
            EndPagePrinter(printer_handle);
            EndDocPrinter(printer_handle);
            ClosePrinter(printer_handle);
            return Err(format!("Failed to write to printer: Error {}", error_code));
        }

        println!("✅ [DEBUG] 写入成功, 已写入字节数: {} / {}", bytes_written, content_bytes.len());

        println!("🖨️ [DEBUG] 正在结束页面...");
        // 结束页面
        let end_page_result = EndPagePrinter(printer_handle);
        if end_page_result == 0 {
            let error_code = GetLastError();
            println!("❌ [ERROR] 结束页面失败, 错误代码: {}", error_code);
            EndDocPrinter(printer_handle);
            ClosePrinter(printer_handle);
            return Err(format!("Failed to end page: Error {}", error_code));
        }

        println!("✅ [DEBUG] 页面结束成功");

        println!("🖨️ [DEBUG] 正在结束文档...");
        // 结束文档
        let end_doc_result = EndDocPrinter(printer_handle);
        if end_doc_result == 0 {
            let error_code = GetLastError();
            println!("❌ [ERROR] 结束文档失败, 错误代码: {}", error_code);
            ClosePrinter(printer_handle);
            return Err(format!("Failed to end document: Error {}", error_code));
        }

        println!("✅ [DEBUG] 文档结束成功");

        println!("🖨️ [DEBUG] 正在关闭打印机句柄...");
        // 关闭打印机句柄
        ClosePrinter(printer_handle);

        println!("🎉 [SUCCESS] 打印完成! 打印机: {}", printer_name);

        Ok(())
    }
}

// 异步包装器
#[cfg(target_os = "windows")]
async fn print_to_printer(printer_name: &str, content: &str) -> Result<(), String> {
    let printer_name = printer_name.to_string();
    let content = content.to_string();

    tokio::task::spawn_blocking(move || {
        print_to_printer_sync(&printer_name, &content)
    }).await.map_err(|e| format!("Task execution failed: {}", e))?
}

// 支持字节数组的同步打印函数
#[cfg(target_os = "windows")]
fn print_to_printer_bytes_sync(printer_name: &str, content_bytes: &[u8]) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    info!("🖨️ [BYTES] 开始字节模式打印到打印机: {}", printer_name);
    debug!("🖨️ [BYTES] 打印内容长度: {} 字节", content_bytes.len());

    let wide_printer_name: Vec<u16> = OsStr::new(printer_name).encode_wide().chain(std::iter::once(0)).collect();
    let wide_document_name: Vec<u16> = OsStr::new("Order Print (Chinese)").encode_wide().chain(std::iter::once(0)).collect();

    debug!("🖨️ [BYTES] 转换打印机名称为宽字符: 成功");

    unsafe {
        let mut printer_handle: HANDLE = ptr::null_mut();

        debug!("🖨️ [BYTES] 正在打开打印机...");
        let open_result = OpenPrinterW(
            wide_printer_name.as_ptr() as *mut u16,
            &mut printer_handle,
            ptr::null_mut(),
        );

        if open_result == 0 {
            let error_code = GetLastError();
            error!("❌ [BYTES] 打开打印机失败: {}, 错误代码: {}", printer_name, error_code);
            return Err(format!("Failed to open printer {}: Error {}", printer_name, error_code));
        }

        debug!("✅ [BYTES] 打印机打开成功, 句柄: {:?}", printer_handle);

        let wide_datatype: Vec<u16> = OsStr::new("RAW").encode_wide().chain(std::iter::once(0)).collect();

        let mut doc_info = DOC_INFO_1W {
            pDocName: wide_document_name.as_ptr() as *mut u16,
            pOutputFile: ptr::null_mut(),
            pDatatype: wide_datatype.as_ptr() as *mut u16,
        };

        println!("🖨️ [BYTES] 正在开始打印文档...");
        let doc_id = StartDocPrinterW(printer_handle, 1, &mut doc_info as *mut _ as *mut _);
        if doc_id == 0 {
            let error_code = GetLastError();
            println!("❌ [BYTES] 开始文档失败, 错误代码: {}", error_code);
            ClosePrinter(printer_handle);
            return Err(format!("Failed to start document: Error {}", error_code));
        }

        println!("✅ [BYTES] 文档开始成功, 文档ID: {}", doc_id);

        println!("🖨️ [BYTES] 正在开始打印页面...");
        let page_result = StartPagePrinter(printer_handle);
        if page_result == 0 {
            let error_code = GetLastError();
            println!("❌ [BYTES] 开始页面失败, 错误代码: {}", error_code);
            EndDocPrinter(printer_handle);
            ClosePrinter(printer_handle);
            return Err(format!("Failed to start page: Error {}", error_code));
        }

        println!("✅ [BYTES] 页面开始成功");

        let mut bytes_written: DWORD = 0;

        println!("🖨️ [BYTES] 正在写入打印数据... ({} 字节)", content_bytes.len());

        let write_result = WritePrinter(
            printer_handle,
            content_bytes.as_ptr() as *mut _,
            content_bytes.len() as DWORD,
            &mut bytes_written,
        );

        if write_result == 0 {
            let error_code = GetLastError();
            println!("❌ [BYTES] 写入打印机失败, 错误代码: {}", error_code);
            EndPagePrinter(printer_handle);
            EndDocPrinter(printer_handle);
            ClosePrinter(printer_handle);
            return Err(format!("Failed to write to printer: Error {}", error_code));
        }

        println!("✅ [BYTES] 写入成功, 已写入字节数: {} / {}", bytes_written, content_bytes.len());

        println!("🖨️ [BYTES] 正在结束页面...");
        let end_page_result = EndPagePrinter(printer_handle);
        if end_page_result == 0 {
            let error_code = GetLastError();
            println!("❌ [BYTES] 结束页面失败, 错误代码: {}", error_code);
            EndDocPrinter(printer_handle);
            ClosePrinter(printer_handle);
            return Err(format!("Failed to end page: Error {}", error_code));
        }

        println!("✅ [BYTES] 页面结束成功");

        println!("🖨️ [BYTES] 正在结束文档...");
        let end_doc_result = EndDocPrinter(printer_handle);
        if end_doc_result == 0 {
            let error_code = GetLastError();
            println!("❌ [BYTES] 结束文档失败, 错误代码: {}", error_code);
            ClosePrinter(printer_handle);
            return Err(format!("Failed to end document: Error {}", error_code));
        }

        println!("✅ [BYTES] 文档结束成功");

        println!("🖨️ [BYTES] 正在关闭打印机句柄...");
        ClosePrinter(printer_handle);

        println!("🎉 [BYTES] 字节模式打印完成! 打印机: {}", printer_name);

        Ok(())
    }
}

// 字节数组异步包装器
#[cfg(target_os = "windows")]
async fn print_to_printer_bytes(printer_name: &str, content_bytes: &[u8]) -> Result<(), String> {
    let printer_name = printer_name.to_string();
    let content_bytes = content_bytes.to_vec();

    tokio::task::spawn_blocking(move || {
        print_to_printer_bytes_sync(&printer_name, &content_bytes)
    }).await.map_err(|e| format!("Task execution failed: {}", e))?
}

// 非Windows系统的占位实现
#[cfg(not(target_os = "windows"))]
async fn print_to_printer(printer_name: &str, content: &str) -> Result<(), String> {
    println!("Printing to {} (Linux/macOS simulation):\n{}", printer_name, content);
    Ok(())
}

// 非Windows系统的字节数组占位实现
#[cfg(not(target_os = "windows"))]
async fn print_to_printer_bytes(printer_name: &str, content_bytes: &[u8]) -> Result<(), String> {
    println!("Printing {} bytes to {} (Linux/macOS simulation)", content_bytes.len(), printer_name);
    // 尝试将字节转换为UTF-8字符串用于显示
    match std::str::from_utf8(content_bytes) {
        Ok(content) => println!("Content preview:\n{}", &content[..std::cmp::min(200, content.len())]),
        Err(_) => println!("Binary content, {} bytes", content_bytes.len()),
    }
    Ok(())
}

// 非Windows系统的增强版字节数组占位实现
#[cfg(not(target_os = "windows"))]
async fn print_to_printer_enhanced_bytes(printer_name: &str, content_bytes: &[u8]) -> Result<(), String> {
    println!("Enhanced printing {} bytes to {} (Linux/macOS simulation)", content_bytes.len(), printer_name);
    Ok(())
}

// 增强版打印功能，包含更多调试信息和错误处理
#[cfg(target_os = "windows")]
fn print_to_printer_enhanced_sync(printer_name: &str, content: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    info!("🖨️ [ENHANCED] 开始增强版打印到打印机: {}", printer_name);
    debug!("🖨️ [ENHANCED] 打印内容长度: {} 字符", content.len());

    let wide_printer_name: Vec<u16> = OsStr::new(printer_name).encode_wide().chain(std::iter::once(0)).collect();
    let wide_document_name: Vec<u16> = OsStr::new("Order Print").encode_wide().chain(std::iter::once(0)).collect();

    unsafe {
        let mut printer_handle: HANDLE = ptr::null_mut();

        info!("🖨️ [ENHANCED] 正在打开打印机...");
        let open_result = OpenPrinterW(
            wide_printer_name.as_ptr() as *mut u16,
            &mut printer_handle,
            ptr::null_mut(),
        );

        if open_result == 0 {
            let error_code = GetLastError();
            error!("❌ [ENHANCED] 打开打印机失败: {}, 错误代码: {}", printer_name, error_code);

            // 尝试使用命令行打印作为备选方案
            warn!("🔄 [ENHANCED] 尝试使用命令行打印作为备选方案...");
            return print_via_command_sync(printer_name, content);
        }

        info!("✅ [ENHANCED] 打印机打开成功, 句柄: {:?}", printer_handle);

        // 尝试多种数据类型
        let datatypes = ["RAW", "TEXT", ""];
        let mut last_error = String::new();

        for (i, datatype_str) in datatypes.iter().enumerate() {
            info!("🔄 [ENHANCED] 尝试数据类型 {}/{}: '{}'", i + 1, datatypes.len(), datatype_str);

            let wide_datatype: Vec<u16> = if datatype_str.is_empty() {
                vec![0]  // 空字符串
            } else {
                OsStr::new(datatype_str).encode_wide().chain(std::iter::once(0)).collect()
            };

            let mut doc_info = DOC_INFO_1W {
                pDocName: wide_document_name.as_ptr() as *mut u16,
                pOutputFile: ptr::null_mut(),
                pDatatype: if datatype_str.is_empty() { ptr::null_mut() } else { wide_datatype.as_ptr() as *mut u16 },
            };

            let doc_id = StartDocPrinterW(printer_handle, 1, &mut doc_info as *mut _ as *mut _);
            if doc_id == 0 {
                let error_code = GetLastError();
                last_error = format!("数据类型 '{}' 开始文档失败，错误代码: {}", datatype_str, error_code);
                warn!("⚠️ [ENHANCED] {}", last_error);
                continue;
            }

            info!("✅ [ENHANCED] 文档开始成功, 数据类型: '{}', 文档ID: {}", datatype_str, doc_id);

            let page_result = StartPagePrinter(printer_handle);
            if page_result == 0 {
                let error_code = GetLastError();
                warn!("⚠️ [ENHANCED] 开始页面失败，错误代码: {}，尝试直接写入...", error_code);
                // 有些打印机不需要StartPagePrinter，继续尝试写入
            } else {
                info!("✅ [ENHANCED] 页面开始成功");
            }

            // 准备打印内容 - 针对中文优化
            let content_to_print = if *datatype_str == "RAW" {
                // 对于RAW模式，只添加基础初始化，内容已经包含了编码设置
                content.to_string()
            } else {
                // 对于TEXT模式，保持原始内容
                content.to_string()
            };

            // 确保中文字符正确编码为UTF-8字节
            let content_bytes = content_to_print.as_bytes();
            let mut bytes_written: DWORD = 0;

            info!("🖨️ [ENHANCED] 正在写入打印数据... ({} 字节, {} UTF-8字符)", content_bytes.len(), content_to_print.chars().count());

            let write_result = WritePrinter(
                printer_handle,
                content_bytes.as_ptr() as *mut _,
                content_bytes.len() as DWORD,
                &mut bytes_written,
            );

            if write_result == 0 {
                let error_code = GetLastError();
                last_error = format!("写入打印机失败，错误代码: {}", error_code);
                warn!("⚠️ [ENHANCED] {}", last_error);

                if page_result != 0 {
                    EndPagePrinter(printer_handle);
                }
                EndDocPrinter(printer_handle);
                continue;
            }

            info!("✅ [ENHANCED] 写入成功, 已写入字节数: {} / {}", bytes_written, content_bytes.len());

            if page_result != 0 {
                let end_page_result = EndPagePrinter(printer_handle);
                if end_page_result == 0 {
                    let error_code = GetLastError();
                    warn!("⚠️ [ENHANCED] 结束页面失败, 错误代码: {}", error_code);
                } else {
                    info!("✅ [ENHANCED] 页面结束成功");
                }
            }

            let end_doc_result = EndDocPrinter(printer_handle);
            if end_doc_result == 0 {
                let error_code = GetLastError();
                warn!("⚠️ [ENHANCED] 结束文档失败, 错误代码: {}", error_code);
            } else {
                info!("✅ [ENHANCED] 文档结束成功");
            }

            ClosePrinter(printer_handle);
            info!("🎉 [ENHANCED] 打印完成! 打印机: {}, 数据类型: {}", printer_name, datatype_str);
            return Ok(());
        }

        // 所有数据类型都失败，关闭打印机并返回错误
        ClosePrinter(printer_handle);
        Err(format!("所有打印方式都失败了。最后错误: {}", last_error))
    }
}

// 异步包装器
#[cfg(target_os = "windows")]
async fn print_to_printer_enhanced(printer_name: &str, content: &str) -> Result<(), String> {
    let printer_name = printer_name.to_string();
    let content = content.to_string();

    tokio::task::spawn_blocking(move || {
        print_to_printer_enhanced_sync(&printer_name, &content)
    }).await.map_err(|e| format!("Task execution failed: {}", e))?
}

// 增强版字节数组异步包装器
#[cfg(target_os = "windows")]
async fn print_to_printer_enhanced_bytes(printer_name: &str, content_bytes: &[u8]) -> Result<(), String> {
    let printer_name = printer_name.to_string();
    let content_bytes = content_bytes.to_vec();

    tokio::task::spawn_blocking(move || {
        print_to_printer_enhanced_bytes_sync(&printer_name, &content_bytes)
    }).await.map_err(|e| format!("Task execution failed: {}", e))?
}

// 增强版字节数组同步打印函数
#[cfg(target_os = "windows")]
fn print_to_printer_enhanced_bytes_sync(printer_name: &str, content_bytes: &[u8]) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    info!("🖨️ [ENHANCED_BYTES] 开始增强版字节模式打印到打印机: {}", printer_name);
    debug!("🖨️ [ENHANCED_BYTES] 打印内容长度: {} 字节", content_bytes.len());

    let wide_printer_name: Vec<u16> = OsStr::new(printer_name).encode_wide().chain(std::iter::once(0)).collect();
    let wide_document_name: Vec<u16> = OsStr::new("Order Print (Enhanced Chinese)").encode_wide().chain(std::iter::once(0)).collect();

    unsafe {
        let mut printer_handle: HANDLE = ptr::null_mut();

        info!("🖨️ [ENHANCED_BYTES] 正在打开打印机...");
        let open_result = OpenPrinterW(
            wide_printer_name.as_ptr() as *mut u16,
            &mut printer_handle,
            ptr::null_mut(),
        );

        if open_result == 0 {
            let error_code = GetLastError();
            error!("❌ [ENHANCED_BYTES] 打开打印机失败: {}, 错误代码: {}", printer_name, error_code);
            return Err(format!("Failed to open printer {}: Error {}", printer_name, error_code));
        }

        info!("✅ [ENHANCED_BYTES] 打印机打开成功, 句柄: {:?}", printer_handle);

        // 尝试多种数据类型
        let datatypes = ["RAW", "TEXT", ""];
        let mut last_error = String::new();

        for (i, datatype_str) in datatypes.iter().enumerate() {
            info!("🔄 [ENHANCED_BYTES] 尝试数据类型 {}/{}: '{}'", i + 1, datatypes.len(), datatype_str);

            let wide_datatype: Vec<u16> = if datatype_str.is_empty() {
                vec![0]
            } else {
                OsStr::new(datatype_str).encode_wide().chain(std::iter::once(0)).collect()
            };

            let mut doc_info = DOC_INFO_1W {
                pDocName: wide_document_name.as_ptr() as *mut u16,
                pOutputFile: ptr::null_mut(),
                pDatatype: if datatype_str.is_empty() { ptr::null_mut() } else { wide_datatype.as_ptr() as *mut u16 },
            };

            let doc_id = StartDocPrinterW(printer_handle, 1, &mut doc_info as *mut _ as *mut _);
            if doc_id == 0 {
                let error_code = GetLastError();
                last_error = format!("数据类型 '{}' 开始文档失败，错误代码: {}", datatype_str, error_code);
                warn!("⚠️ [ENHANCED_BYTES] {}", last_error);
                continue;
            }

            info!("✅ [ENHANCED_BYTES] 文档开始成功, 数据类型: '{}', 文档ID: {}", datatype_str, doc_id);

            let page_result = StartPagePrinter(printer_handle);
            if page_result == 0 {
                let error_code = GetLastError();
                warn!("⚠️ [ENHANCED_BYTES] 开始页面失败，错误代码: {}，尝试直接写入...", error_code);
            } else {
                info!("✅ [ENHANCED_BYTES] 页面开始成功");
            }

            let mut bytes_written: DWORD = 0;

            info!("🖨️ [ENHANCED_BYTES] 正在写入打印数据... ({} 字节)", content_bytes.len());

            let write_result = WritePrinter(
                printer_handle,
                content_bytes.as_ptr() as *mut _,
                content_bytes.len() as DWORD,
                &mut bytes_written,
            );

            if write_result == 0 {
                let error_code = GetLastError();
                last_error = format!("写入打印机失败，错误代码: {}", error_code);
                warn!("⚠️ [ENHANCED_BYTES] {}", last_error);

                if page_result != 0 {
                    EndPagePrinter(printer_handle);
                }
                EndDocPrinter(printer_handle);
                continue;
            }

            info!("✅ [ENHANCED_BYTES] 写入成功, 已写入字节数: {} / {}", bytes_written, content_bytes.len());

            if page_result != 0 {
                let end_page_result = EndPagePrinter(printer_handle);
                if end_page_result == 0 {
                    let error_code = GetLastError();
                    warn!("⚠️ [ENHANCED_BYTES] 结束页面失败, 错误代码: {}", error_code);
                } else {
                    info!("✅ [ENHANCED_BYTES] 页面结束成功");
                }
            }

            let end_doc_result = EndDocPrinter(printer_handle);
            if end_doc_result == 0 {
                let error_code = GetLastError();
                warn!("⚠️ [ENHANCED_BYTES] 结束文档失败, 错误代码: {}", error_code);
            } else {
                info!("✅ [ENHANCED_BYTES] 文档结束成功");
            }

            ClosePrinter(printer_handle);
            info!("🎉 [ENHANCED_BYTES] 增强版字节模式打印完成! 打印机: {}, 数据类型: {}", printer_name, datatype_str);
            return Ok(());
        }

        ClosePrinter(printer_handle);
        Err(format!("所有打印方式都失败了。最后错误: {}", last_error))
    }
}

// 同步版本的命令行打印（用于线程安全）
#[allow(dead_code)]
fn print_via_command_sync(printer_name: &str, content: &str) -> Result<(), String> {
    info!("🖨️ [COMMAND] 开始命令行打印");

    // 创建临时文件
    let temp_file = std::env::temp_dir().join("tauri_print_temp.txt");

    // 写入内容到临时文件
    std::fs::write(&temp_file, content.as_bytes())
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    info!("🖨️ [COMMAND] 临时文件创建成功: {}", temp_file.display());

    // 使用命令行打印
    let output = std::process::Command::new("cmd")
        .args(&["/C", &format!("type \"{}\" | print /D:\"{}\"", temp_file.display(), printer_name)])
        .output()
        .map_err(|e| format!("Failed to execute print command: {}", e))?;

    // 删除临时文件
    let _ = std::fs::remove_file(&temp_file);

    if output.status.success() {
        info!("✅ [COMMAND] 命令行打印成功");
        Ok(())
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        error!("❌ [COMMAND] 命令行打印失败: {}", error_msg);
        Err(format!("Print command failed: {}", error_msg))
    }
}

// 异步版本的命令行打印（备选方案）
#[allow(dead_code)]
async fn print_via_command(printer_name: &str, content: &str) -> Result<(), String> {
    let printer_name = printer_name.to_string();
    let content = content.to_string();

    tokio::task::spawn_blocking(move || {
        print_via_command_sync(&printer_name, &content)
    }).await.map_err(|e| format!("Task execution failed: {}", e))?
}

// 调试打印机连接和功能
#[tauri::command]
async fn debug_printer(printer_name: String) -> Result<String, String> {
    info!("🔧 [DEBUG] 开始调试打印机: {}", printer_name);

    let mut debug_info = Vec::new();
    debug_info.push(format!("🔧 调试打印机: {}", printer_name));

    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let wide_printer_name: Vec<u16> = OsStr::new(&printer_name).encode_wide().chain(std::iter::once(0)).collect();

        unsafe {
            let mut printer_handle: HANDLE = ptr::null_mut();

            // 测试打开打印机
            let open_result = OpenPrinterW(
                wide_printer_name.as_ptr() as *mut u16,
                &mut printer_handle,
                ptr::null_mut(),
            );

            if open_result == 0 {
                let error_code = GetLastError();
                debug_info.push(format!("❌ 无法打开打印机，错误代码: {}", error_code));
                debug_info.push("💡 建议检查：".to_string());
                debug_info.push("   - 打印机是否正确安装".to_string());
                debug_info.push("   - 打印机是否在线".to_string());
                debug_info.push("   - 打印机名称是否正确".to_string());
                debug_info.push("   - 打印机驱动是否正常".to_string());
                return Ok(debug_info.join("\n"));
            }

            debug_info.push("✅ 打印机打开成功".to_string());
            debug_info.push(format!("   句柄: {:?}", printer_handle));

            // 测试不同的数据类型
            let datatypes = ["RAW", "TEXT", ""];
            for datatype_str in &datatypes {
                debug_info.push(format!("\n🔄 测试数据类型: '{}'", datatype_str));

                let wide_datatype: Vec<u16> = if datatype_str.is_empty() {
                    vec![0]
                } else {
                    OsStr::new(datatype_str).encode_wide().chain(std::iter::once(0)).collect()
                };

                let wide_document_name: Vec<u16> = OsStr::new("Debug Test").encode_wide().chain(std::iter::once(0)).collect();

                let mut doc_info = DOC_INFO_1W {
                    pDocName: wide_document_name.as_ptr() as *mut u16,
                    pOutputFile: ptr::null_mut(),
                    pDatatype: if datatype_str.is_empty() { ptr::null_mut() } else { wide_datatype.as_ptr() as *mut u16 },
                };

                let doc_id = StartDocPrinterW(printer_handle, 1, &mut doc_info as *mut _ as *mut _);
                if doc_id == 0 {
                    let error_code = GetLastError();
                    debug_info.push(format!("   ❌ 开始文档失败，错误代码: {}", error_code));
                } else {
                    debug_info.push(format!("   ✅ 开始文档成功，文档ID: {}", doc_id));

                    // 测试页面操作
                    let page_result = StartPagePrinter(printer_handle);
                    if page_result == 0 {
                        let error_code = GetLastError();
                        debug_info.push(format!("   ⚠️ 开始页面失败，错误代码: {} (某些打印机不需要此步骤)", error_code));
                    } else {
                        debug_info.push("   ✅ 开始页面成功".to_string());
                        EndPagePrinter(printer_handle);
                    }

                    EndDocPrinter(printer_handle);
                    debug_info.push("   ✅ 文档已结束".to_string());
                }
            }

            ClosePrinter(printer_handle);
            debug_info.push("\n✅ 打印机调试完成".to_string());
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        debug_info.push("ℹ️ 非Windows系统，跳过Windows API调试".to_string());
    }

    Ok(debug_info.join("\n"))
}

// 获取日志文件内容
#[tauri::command]
async fn get_log_content(lines: Option<usize>) -> Result<String, String> {
    let log_file = get_log_file_path();

    info!("📖 [LOG] 请求读取日志文件: {}", log_file.display());

    if !log_file.exists() {
        warn!("⚠️ [LOG] 日志文件不存在: {}", log_file.display());
        return Ok("日志文件不存在".to_string());
    }

    match std::fs::read_to_string(&log_file) {
        Ok(content) => {
            let line_count = content.lines().count();
            info!("📖 [LOG] 成功读取日志文件，总行数: {}", line_count);

            // 如果指定了行数，返回最后n行
            if let Some(n) = lines {
                let lines: Vec<&str> = content.lines().collect();
                let start = if lines.len() > n { lines.len() - n } else { 0 };
                let result = lines[start..].join("\n");
                info!("📖 [LOG] 返回最后 {} 行日志", lines.len() - start);
                Ok(result)
            } else {
                Ok(content)
            }
        }
        Err(e) => {
            error!("❌ [LOG] 读取日志文件失败: {}", e);
            Err(format!("读取日志文件失败: {}", e))
        }
    }
}

// 获取日志文件路径信息


#[tauri::command]
async fn get_log_info() -> Result<serde_json::Value, String> {
    let log_file = get_log_file_path();
    let log_dir = log_file.parent().unwrap_or_else(|| std::path::Path::new("."));

    info!("ℹ️ [LOG] 获取日志信息");

    let mut info = serde_json::json!({
        "log_file": log_file.to_string_lossy(),
        "log_dir": log_dir.to_string_lossy(),
        "exists": log_file.exists()
    });

    // 如果文件存在，获取文件大小和修改时间
    if log_file.exists() {
        if let Ok(metadata) = std::fs::metadata(&log_file) {
            info["size"] = metadata.len().into();
            if let Ok(modified) = metadata.modified() {
                if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                    info["modified"] = duration.as_secs().into();
                }
            }
        }
    }

    Ok(info)
}

// 清空日志文件
#[tauri::command]
async fn clear_logs() -> Result<String, String> {
    let log_file = get_log_file_path();

    info!("🗑️ [LOG] 请求清空日志文件");

    match std::fs::write(&log_file, "") {
        Ok(_) => {
            info!("✅ [LOG] 日志文件已清空");
            Ok("日志文件已清空".to_string())
        }
        Err(e) => {
            error!("❌ [LOG] 清空日志文件失败: {}", e);
            Err(format!("清空日志文件失败: {}", e))
        }
    }
}

// 打开日志文件夹
#[tauri::command]
async fn open_log_folder() -> Result<String, String> {
    let log_file = get_log_file_path();
    let log_dir = log_file.parent().unwrap_or_else(|| std::path::Path::new("."));

    info!("📂 [LOG] 请求打开日志文件夹: {}", log_dir.display());

    #[cfg(target_os = "windows")]
    {
        match std::process::Command::new("explorer")
            .arg(log_dir)
            .spawn()
        {
            Ok(_) => {
                info!("✅ [LOG] 成功打开日志文件夹");
                Ok("已打开日志文件夹".to_string())
            }
            Err(e) => {
                error!("❌ [LOG] 打开日志文件夹失败: {}", e);
                Err(format!("打开文件夹失败: {}", e))
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Linux/macOS
        let cmd = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
        match std::process::Command::new(cmd)
            .arg(log_dir)
            .spawn()
        {
            Ok(_) => Ok("已打开日志文件夹".to_string()),
            Err(e) => Err(format!("打开文件夹失败: {}", e))
        }
    }
}

// 测试前端调用的简单命令
#[tauri::command]
async fn test_frontend_call(message: String) -> Result<String, String> {
    println!("🧪 [FRONTEND_TEST] 收到前端调用: {}", message);
    Ok(format!("后端成功接收到: {}", message))
}

// 获取全局字体大小设置
#[tauri::command]
async fn get_global_font_size(state: State<'_, AppState>) -> Result<i32, String> {
    Ok(*state.global_font_size.lock().unwrap())
}

// 设置全局字体大小
#[tauri::command]
async fn set_global_font_size(font_size: i32, state: State<'_, AppState>) -> Result<(), String> {
    if font_size < 0 || font_size > 2 {
        return Err("字体大小必须在0-2之间 (0=小, 1=中, 2=大)".to_string());
    }

    *state.global_font_size.lock().unwrap() = font_size;

    // 同时更新所有打印机的字体大小
    let mut printers = state.printers.lock().unwrap();
    for printer in printers.iter_mut() {
        printer.font_size = font_size;
    }

    info!("🎯 [FONT] 全局字体大小已设置为: {} ({})", font_size,
          match font_size {
              0 => "小",
              1 => "中",
              2 => "大",
              _ => "未知"
          });

    Ok(())
}

// 新增：中文编码相关的数据结构
#[derive(Clone, Debug, Serialize, Deserialize)]
struct EncodingTestResult {
    encoding: String,
    score: f64,
    success: bool,
    error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct PrinterEncodingInfo {
    name: String,
    supports_chinese: bool,
    recommended_encoding: String,
    fallback_encodings: Vec<String>,
    command_level: i32,
    test_results: Option<Vec<EncodingTestResult>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct EncodingCompatibilityReport {
    printer_name: String,
    overall_score: f64,
    encoding_scores: std::collections::HashMap<String, EncodingScoreInfo>,
    grade: String,
    recommendations: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct EncodingScoreInfo {
    average_score: f64,
    test_count: i32,
    grade: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ChineseCharacterAnalysis {
    character_type: String,  // "NONE", "SYMBOLS_ONLY", "SIMPLIFIED", "TRADITIONAL", "MIXED"
    simplified_count: i32,
    traditional_count: i32,
    symbol_count: i32,
    total_chars: i32,
    confidence: f64,
}

// 新增：检测文本的中文字符类型
#[tauri::command]
async fn detect_chinese_character_type(text: String) -> Result<ChineseCharacterAnalysis, String> {
    info!("🔍 [ENCODING] 开始分析中文字符类型");
    info!("🔍 [ENCODING] 文本长度: {} 字符", text.chars().count());

    let mut simplified_count = 0;
    let mut traditional_count = 0;
    let mut symbol_count = 0;
    let total_chars = text.chars().count() as i32;

    // 简体中文常用字符范围
    let simplified_chars = [
        '你', '我', '他', '们', '的', '是', '在', '有', '和', '对', '就', '会', '说', '要', '来', '到', '这', '那', '可', '以',
        '了', '不', '个', '人', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '年', '月', '日', '时', '分', '秒',
        '元', '块', '钱', '订', '单', '打', '印', '测', '试', '餐', '厅', '菜', '品', '地', '址', '电', '话', '号', '码'
    ];

    // 繁体中文常用字符
    let traditional_chars = [
        '您', '們', '個', '來', '這', '那', '會', '說', '對', '時', '間', '點', '錢', '訂', '單', '測', '試', '餐', '廳', '電', '話'
    ];

    // 中文符号
    let chinese_symbols = [
        '￥', '＄', '€', '【', '】', '《', '》', '（', '）', '「', '」', '、', '。', '，', '；', '：', '？', '！', '※'
    ];

    for ch in text.chars() {
        if simplified_chars.contains(&ch) {
            simplified_count += 1;
        } else if traditional_chars.contains(&ch) {
            traditional_count += 1;
        } else if chinese_symbols.contains(&ch) {
            symbol_count += 1;
        }
    }

    // 判断字符类型
    let character_type = if simplified_count == 0 && traditional_count == 0 && symbol_count == 0 {
        "NONE"
    } else if simplified_count == 0 && traditional_count == 0 && symbol_count > 0 {
        "SYMBOLS_ONLY"
    } else if simplified_count > traditional_count * 2 {
        "SIMPLIFIED"
    } else if traditional_count > simplified_count * 2 {
        "TRADITIONAL"
    } else {
        "MIXED"
    };

    // 计算置信度
    let chinese_chars = simplified_count + traditional_count + symbol_count;
    let confidence = if total_chars > 0 {
        chinese_chars as f64 / total_chars as f64
    } else {
        0.0
    };

    let analysis = ChineseCharacterAnalysis {
        character_type: character_type.to_string(),
        simplified_count,
        traditional_count,
        symbol_count,
        total_chars,
        confidence,
    };

    info!("✅ [ENCODING] 字符分析完成: {:?}", analysis);
    Ok(analysis)
}

// 新增：获取打印机的编码支持信息
#[tauri::command]
async fn get_printer_encoding_info(printer_name: String) -> Result<PrinterEncodingInfo, String> {
    info!("🔍 [ENCODING] 获取打印机编码信息: {}", printer_name);

    let name_lower = printer_name.to_lowercase();

    // 根据打印机型号推断编码支持
    let (supports_chinese, recommended_encoding, fallback_encodings, command_level) =
        if name_lower.contains("epson") {
            (true, "UTF8".to_string(), vec!["UTF8".to_string(), "GBK".to_string(), "BIG5".to_string()], 2)
        } else if name_lower.contains("xprinter") || name_lower.contains("gprinter") {
            (true, "GBK".to_string(), vec!["GBK".to_string(), "GB18030".to_string(), "UTF8".to_string()], 2)
        } else if name_lower.contains("thermal") || name_lower.contains("receipt") || name_lower.contains("pos") {
            (true, "GBK".to_string(), vec!["GBK".to_string(), "UTF8".to_string(), "GB2312".to_string()], 1)
        } else {
            (false, "UTF8".to_string(), vec!["UTF8".to_string()], 0)
        };

    let encoding_info = PrinterEncodingInfo {
        name: printer_name.clone(),
        supports_chinese,
        recommended_encoding,
        fallback_encodings,
        command_level,
        test_results: None,
    };

    info!("✅ [ENCODING] 编码信息: {:?}", encoding_info);
    Ok(encoding_info)
}

// 新增：测试打印机的编码兼容性
#[tauri::command]
async fn test_printer_encoding_compatibility(
    printer_name: String,
    test_text: String,
    encoding: String,
) -> Result<EncodingTestResult, String> {
    info!("🧪 [ENCODING] 测试打印机编码兼容性");
    info!("🧪 [ENCODING] 打印机: {}", printer_name);
    info!("🧪 [ENCODING] 编码: {}", encoding);
    info!("🧪 [ENCODING] 测试文本长度: {} 字符", test_text.chars().count());

    // 生成带编码优化的打印内容
    let optimized_content = match encoding.as_str() {
        "UTF8" => {
            format!("\x1B@\x1C&\x1C\x43\x01{}\n\n测试编码: UTF-8\n测试文本:\n{}\n\n\x1D\x56\x00",
                    "\x1B\x45\x01UTF-8 编码测试\x1B\x45\x00", test_text)
        }
        "GBK" | "GB18030" => {
            format!("\x1B@\x1C&\x1C\x43\x01{}\n\n测试编码: {}\n测试文本:\n{}\n\n\x1D\x56\x00",
                    "\x1B\x45\x01GBK 编码测试\x1B\x45\x00", encoding, test_text)
        }
        "BIG5" => {
            format!("\x1B@\x1C&\x1C\x43\x01{}\n\n测试编码: Big5\n测试文本:\n{}\n\n\x1D\x56\x00",
                    "\x1B\x45\x01Big5 编码测试\x1B\x45\x00", test_text)
        }
        _ => {
            format!("\x1B@{}\n\n测试编码: {}\n测试文本:\n{}\n\n\x1D\x56\x00",
                    "\x1B\x45\x01编码测试\x1B\x45\x00", encoding, test_text)
        }
    };

    // 尝试打印测试
    let result = match print_to_printer(&printer_name, &optimized_content).await {
        Ok(_) => {
            info!("✅ [ENCODING] 编码测试成功: {} - {}", printer_name, encoding);

            // 根据编码类型计算分数
            let score = match encoding.as_str() {
                "UTF8" => 0.95,  // UTF8通常兼容性最好
                "GBK" | "GB18030" => 0.90,  // GBK系列适合中文
                "BIG5" => 0.85,  // Big5适合繁体中文
                "GB2312" => 0.80,  // 较老的编码
                _ => 0.70,
            };

            // 根据打印机类型调整分数
            let name_lower = printer_name.to_lowercase();
            let adjusted_score = if name_lower.contains("thermal") || name_lower.contains("receipt") {
                // 热敏打印机
                match encoding.as_str() {
                    "GBK" | "GB18030" => score + 0.05,  // 热敏打印机更适合GBK
                    "UTF8" => score - 0.05,
                    _ => score,
                }
            } else {
                score
            };

            EncodingTestResult {
                encoding: encoding.clone(),
                score: adjusted_score,
                success: true,
                error: None,
            }
        }
        Err(e) => {
            warn!("⚠️ [ENCODING] 编码测试失败: {} - {} - {}", printer_name, encoding, e);

            // 尝试增强版打印
            #[cfg(target_os = "windows")]
            match print_to_printer_enhanced(&printer_name, &optimized_content).await {
                Ok(_) => {
                    info!("✅ [ENCODING] 增强版编码测试成功: {} - {}", printer_name, encoding);
                    EncodingTestResult {
                        encoding: encoding.clone(),
                        score: 0.75,  // 增强版成功给予较低分数
                        success: true,
                        error: None,
                    }
                }
                Err(enhanced_error) => {
                    error!("❌ [ENCODING] 增强版编码测试也失败: {} - {} - {}", printer_name, encoding, enhanced_error);
                    EncodingTestResult {
                        encoding: encoding.clone(),
                        score: 0.0,
                        success: false,
                        error: Some(format!("打印失败: {} | 增强版: {}", e, enhanced_error)),
                    }
                }
            }

            #[cfg(not(target_os = "windows"))]
            {
                EncodingTestResult {
                    encoding: encoding.clone(),
                    score: 0.0,
                    success: false,
                    error: Some(e),
                }
            }
        }
    };

    info!("📊 [ENCODING] 测试结果: {:?}", result);
    Ok(result)
}

// 新增：批量测试所有编码
#[tauri::command]
async fn test_all_encodings_for_printer(
    printer_name: String,
    test_text: String,
) -> Result<Vec<EncodingTestResult>, String> {
    info!("🧪 [ENCODING] 开始批量编码测试: {}", printer_name);

    let encodings = vec!["UTF8", "GBK", "GB18030", "BIG5", "GB2312"];
    let mut results = Vec::new();

    for encoding in encodings {
        info!("🔄 [ENCODING] 测试编码: {}", encoding);

        // 添加延迟避免打印队列堵塞
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        match test_printer_encoding_compatibility(
            printer_name.clone(),
            test_text.clone(),
            encoding.to_string(),
        ).await {
            Ok(result) => {
                results.push(result);
            }
            Err(e) => {
                warn!("⚠️ [ENCODING] 编码 {} 测试失败: {}", encoding, e);
                results.push(EncodingTestResult {
                    encoding: encoding.to_string(),
                    score: 0.0,
                    success: false,
                    error: Some(e),
                });
            }
        }
    }

    info!("✅ [ENCODING] 批量测试完成，共测试 {} 种编码", results.len());
    Ok(results)
}

// 新增：生成编码兼容性报告
#[tauri::command]
async fn generate_encoding_compatibility_report(
    printer_name: String,
    test_results: Vec<EncodingTestResult>,
) -> Result<EncodingCompatibilityReport, String> {
    info!("📊 [ENCODING] 生成兼容性报告: {}", printer_name);

    let mut encoding_scores = std::collections::HashMap::new();
    let mut total_score = 0.0;
    let mut valid_tests = 0;

    for result in &test_results {
        if result.success {
            total_score += result.score;
            valid_tests += 1;
        }

        let grade = if result.score >= 0.9 {
            "优秀"
        } else if result.score >= 0.8 {
            "良好"
        } else if result.score >= 0.7 {
            "一般"
        } else if result.score >= 0.5 {
            "较差"
        } else {
            "失败"
        };

        encoding_scores.insert(
            result.encoding.clone(),
            EncodingScoreInfo {
                average_score: result.score,
                test_count: 1,
                grade: grade.to_string(),
            },
        );
    }

    let overall_score = if valid_tests > 0 {
        total_score / valid_tests as f64
    } else {
        0.0
    };

    let overall_grade = if overall_score >= 0.9 {
        "优秀"
    } else if overall_score >= 0.8 {
        "良好"
    } else if overall_score >= 0.7 {
        "一般"
    } else if overall_score >= 0.5 {
        "较差"
    } else {
        "失败"
    };

    // 生成建议
    let mut recommendations = Vec::new();

    let best_encoding = test_results
        .iter()
        .filter(|r| r.success)
        .max_by(|a, b| a.score.partial_cmp(&b.score).unwrap_or(std::cmp::Ordering::Equal));

    if let Some(best) = best_encoding {
        recommendations.push(format!("推荐使用 {} 编码（评分: {:.1}%）", best.encoding, best.score * 100.0));
    }

    if overall_score < 0.8 {
        recommendations.push("建议检查打印机驱动程序是否支持中文字符集".to_string());
    }

    if test_results.iter().any(|r| !r.success) {
        recommendations.push("部分编码测试失败，建议使用评分最高的编码".to_string());
    }

    let report = EncodingCompatibilityReport {
        printer_name: printer_name.clone(),
        overall_score,
        encoding_scores,
        grade: overall_grade.to_string(),
        recommendations,
    };

    info!("✅ [ENCODING] 兼容性报告生成完成: 总分 {:.1}%, 等级 {}", overall_score * 100.0, overall_grade);
    Ok(report)
}

// 新增：使用指定编码打印订单
#[tauri::command]
async fn print_order_with_encoding(
    printer_name: String,
    order_data: OrderData,
    encoding: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    info!("🖨️ [ENCODING] 使用指定编码打印订单");
    info!("🖨️ [ENCODING] 打印机: {}", printer_name);
    info!("🖨️ [ENCODING] 编码: {}", encoding);
    info!("🖨️ [ENCODING] 订单ID: {}", order_data.order_id);

    // 获取打印机配置
    let printer_config = {
        let printers = state.printers.lock().unwrap();
        printers.iter().find(|p| p.name == printer_name).cloned()
    };

    let printer = printer_config.ok_or_else(|| format!("打印机 {} 未找到", printer_name))?;

    // 生成基础打印内容
    let base_content = generate_print_content(&order_data, printer.width, printer.font_size)?;

    // 根据编码优化打印内容
    let optimized_content = match encoding.as_str() {
        "UTF8" => {
            format!("\x1B@\x1C&\x1C\x43\x01{}", base_content)
        }
        "GBK" | "GB18030" => {
            format!("\x1B@\x1C&\x1C\x2E\x00{}", base_content) // GBK编码设置
        }
        "BIG5" => {
            format!("\x1B@\x1C&\x1C\x2E\x01{}", base_content) // Big5编码设置
        }
        _ => base_content, // 默认处理
    };

    // 执行打印
    match print_to_printer(&printer_name, &optimized_content).await {
        Ok(_) => {
            info!("✅ [ENCODING] 编码打印成功: {} - {}", printer_name, encoding);
            Ok(format!("订单 {} 使用 {} 编码打印成功", order_data.order_id, encoding))
        }
        Err(e) => {
            warn!("⚠️ [ENCODING] 编码打印失败，尝试增强版: {}", e);

            #[cfg(target_os = "windows")]
            match print_to_printer_enhanced(&printer_name, &optimized_content).await {
                Ok(_) => {
                    info!("✅ [ENCODING] 增强版编码打印成功: {} - {}", printer_name, encoding);
                    Ok(format!("订单 {} 使用 {} 编码打印成功（增强版）", order_data.order_id, encoding))
                }
                Err(enhanced_error) => {
                    error!("❌ [ENCODING] 增强版编码打印失败: {}", enhanced_error);
                    Err(format!("编码打印失败: {} | 增强版: {}", e, enhanced_error))
                }
            }

            #[cfg(not(target_os = "windows"))]
            Err(format!("编码打印失败: {}", e))
        }
    }
}

// 新增：智能选择最佳编码
#[tauri::command]
async fn select_optimal_encoding(
    text: String,
    printer_name: String,
) -> Result<String, String> {
    info!("🤖 [ENCODING] 智能选择最佳编码");
    info!("🤖 [ENCODING] 打印机: {}", printer_name);

    // 分析文本字符类型
    let analysis = detect_chinese_character_type(text.clone()).await?;

    // 获取打印机编码信息
    let printer_info = get_printer_encoding_info(printer_name.clone()).await?;

    // 根据字符类型和打印机特性选择编码
    let optimal_encoding = match analysis.character_type.as_str() {
        "NONE" => "UTF8".to_string(), // 无中文字符，使用UTF8
        "SYMBOLS_ONLY" => "UTF8".to_string(), // 仅符号，UTF8兼容性好
        "SIMPLIFIED" => {
            // 简体中文，根据打印机类型选择
            if printer_info.supports_chinese {
                printer_info.recommended_encoding
            } else {
                "UTF8".to_string()
            }
        }
        "TRADITIONAL" => {
            // 繁体中文，优先Big5
            if printer_info.fallback_encodings.contains(&"BIG5".to_string()) {
                "BIG5".to_string()
            } else if printer_info.supports_chinese {
                "UTF8".to_string()
            } else {
                "UTF8".to_string()
            }
        }
        "MIXED" => {
            // 混合文本，使用通用性好的编码
            if printer_info.supports_chinese {
                "UTF8".to_string()
            } else {
                "UTF8".to_string()
            }
        }
        _ => "UTF8".to_string(), // 默认UTF8
    };

    info!("✅ [ENCODING] 智能选择结果: {} (字符类型: {}, 置信度: {:.1}%)",
          optimal_encoding, analysis.character_type, analysis.confidence * 100.0);

    Ok(optimal_encoding)
}

// ==================== 新增的智能编码Tauri命令 ====================

// 分析文本编码特征
#[tauri::command]
async fn analyze_text_encoding(text: String) -> Result<ChineseTextAnalysis, String> {
    info!("📝 [ANALYZE] 开始分析文本编码特征");
    info!("📝 [ANALYZE] 文本长度: {} 字符", text.chars().count());
    
    let analysis = analyze_chinese_text(&text);
    
    info!("✅ [ANALYZE] 分析完成: 中文={}, 简体={}, 繁体={}, 符号={}, 推荐编码={}",
          analysis.has_chinese, analysis.has_simplified, analysis.has_traditional, 
          analysis.has_symbols, analysis.recommended_encoding);
    
    Ok(analysis)
}

// 测试打印机中文支持能力
#[tauri::command]
async fn test_printer_chinese_support(
    printer_name: String,
    state: State<'_, AppState>
) -> Result<PrinterEncodingCapability, String> {
    info!("🧪 [CHINESE_TEST] 开始测试打印机中文支持: {}", printer_name);
    
    // 获取打印机配置
    let printer_config = {
        let printers = state.printers.lock().unwrap();
        printers.iter().find(|p| p.name == printer_name).cloned()
    };
    
    let printer = printer_config.ok_or_else(|| format!("打印机 {} 未找到", printer_name))?;
    
    // 测试文本集合
    let test_texts = vec![
        ("简体中文", "你好，这是简体中文测试：订单#12345，总计￥99.50"),
        ("繁体中文", "您好，這是繁體中文測試：訂單#12345，總計￥99.50"), 
        ("混合文本", "Hello你好！Order订单#12345，Total总计$99.50"),
        ("中文符号", "【重要】订单确认※请注意：￥＄€…"),
        ("菜品名称", "宫保鸡丁、麻婆豆腐、白米饭、可乐"),
        ("地址信息", "北京市朝阳区望京街道123号2B室"),
    ];
    
    let mut tested_encodings = Vec::new();
    let encodings_to_test = &printer.fallback_encodings;
    
    for encoding in encodings_to_test {
        info!("🔄 [CHINESE_TEST] 测试编码: {}", encoding);
        
        let mut total_score = 0.0;
        let mut test_count = 0;
        let mut error_messages = Vec::new();
        
        for (test_name, test_text) in &test_texts {
            match test_single_encoding(&printer, test_text, encoding).await {
                Ok(score) => {
                    total_score += score;
                    test_count += 1;
                    info!("✅ [CHINESE_TEST] {} - {} 编码测试成功，得分: {:.2}", test_name, encoding, score);
                }
                Err(e) => {
                    error_messages.push(format!("{}: {}", test_name, e));
                    warn!("❌ [CHINESE_TEST] {} - {} 编码测试失败: {}", test_name, encoding, e);
                }
            }
        }
        
        let average_score = if test_count > 0 { total_score / test_count as f64 } else { 0.0 };
        let success = test_count > 0;
        
        tested_encodings.push(EncodingTestResult {
            encoding_name: encoding.clone(),
            success,
            compatibility_score: average_score,
            test_content: format!("测试了 {} 种文本类型", test_texts.len()),
            error_message: if error_messages.is_empty() { None } else { Some(error_messages.join("; ")) },
        });
    }
    
    // 计算总体兼容性
    let successful_tests: Vec<_> = tested_encodings.iter().filter(|t| t.success).collect();
    let overall_compatibility = if !successful_tests.is_empty() {
        successful_tests.iter().map(|t| t.compatibility_score).sum::<f64>() / successful_tests.len() as f64
    } else {
        0.0
    };
    
    // 选择最佳编码
    let recommended_encoding = successful_tests
        .iter()
        .max_by(|a, b| a.compatibility_score.partial_cmp(&b.compatibility_score).unwrap_or(std::cmp::Ordering::Equal))
        .map(|t| t.encoding_name.clone())
        .unwrap_or_else(|| "UTF8".to_string());
    
    let capability = PrinterEncodingCapability {
        printer_name: printer.name.clone(),
        brand: printer.printer_brand.clone(),
        supports_chinese: printer.supports_chinese,
        tested_encodings,
        recommended_encoding,
        fallback_encodings: printer.fallback_encodings.clone(),
        overall_compatibility,
    };
    
    info!("🎉 [CHINESE_TEST] 测试完成: {} 总体兼容性 {:.1}%, 推荐编码 {}", 
          printer_name, overall_compatibility * 100.0, capability.recommended_encoding);
    
    Ok(capability)
}

// 单个编码测试辅助函数
async fn test_single_encoding(printer: &PrinterConfig, test_text: &str, encoding: &str) -> Result<f64, String> {
    // 模拟编码转换测试
    match convert_text_to_encoding(test_text, encoding) {
        Ok(bytes) => {
            // 基于编码结果计算得分
            let original_len = test_text.len();
            let encoded_len = bytes.len();
            
            // 计算编码效率得分
            let efficiency_score = if encoded_len > 0 && original_len > 0 {
                1.0 - (encoded_len as f64 / (original_len as f64 * 3.0)).min(1.0) // UTF-8最多3倍
            } else {
                0.0
            };
            
            // 基于编码类型和打印机品牌调整得分
            let brand_bonus = match (encoding, printer.printer_brand.to_lowercase().as_str()) {
                ("GBK" | "GB18030", brand) if brand.contains("xprinter") || brand.contains("gprinter") => 0.2,
                ("UTF8", brand) if brand.contains("epson") || brand.contains("citizen") => 0.15,
                ("BIG5", _) if test_text.contains("您") || test_text.contains("這") => 0.1,
                _ => 0.0,
            };
            
            let final_score = (0.7 + efficiency_score * 0.3 + brand_bonus).min(1.0);
            Ok(final_score)
        }
        Err(e) => Err(format!("编码转换失败: {}", e)),
    }
}

// 获取打印机编码能力信息
#[tauri::command]
async fn get_printer_encoding_capability(
    printer_name: String,
    state: State<'_, AppState>
) -> Result<PrinterEncodingCapability, String> {
    info!("📊 [CAPABILITY] 获取打印机编码能力: {}", printer_name);
    
    let printer_config = {
        let printers = state.printers.lock().unwrap();
        printers.iter().find(|p| p.name == printer_name).cloned()
    };
    
    let printer = printer_config.ok_or_else(|| format!("打印机 {} 未找到", printer_name))?;
    
    // 基于已知信息估算编码能力
    let mut estimated_encodings = Vec::new();
    
    for encoding in &printer.fallback_encodings {
        let score = estimate_encoding_compatibility(encoding, &printer.printer_brand);
        estimated_encodings.push(EncodingTestResult {
            encoding_name: encoding.clone(),
            success: score > 0.5,
            compatibility_score: score,
            test_content: "基于品牌和编码类型的估算".to_string(),
            error_message: None,
        });
    }
    
    let overall_compatibility = if !estimated_encodings.is_empty() {
        estimated_encodings.iter().map(|e| e.compatibility_score).sum::<f64>() / estimated_encodings.len() as f64
    } else {
        0.5 // 默认中等兼容性
    };
    
    let capability = PrinterEncodingCapability {
        printer_name: printer.name.clone(),
        brand: printer.printer_brand.clone(),
        supports_chinese: printer.supports_chinese,
        tested_encodings: estimated_encodings,
        recommended_encoding: printer.preferred_encoding.clone(),
        fallback_encodings: printer.fallback_encodings.clone(),
        overall_compatibility,
    };
    
    info!("✅ [CAPABILITY] 编码能力评估完成: {} 兼容性 {:.1}%", printer_name, overall_compatibility * 100.0);
    
    Ok(capability)
}

// 估算编码兼容性得分
fn estimate_encoding_compatibility(encoding: &str, brand: &str) -> f64 {
    let brand_lower = brand.to_lowercase();
    
    match encoding.to_uppercase().as_str() {
        "UTF8" | "UTF-8" => {
            if brand_lower.contains("epson") || brand_lower.contains("citizen") || brand_lower.contains("star") {
                0.9 // 日系品牌UTF-8兼容性好
            } else {
                0.8 // 其他品牌UTF-8普遍兼容
            }
        }
        "GBK" => {
            if brand_lower.contains("xprinter") || brand_lower.contains("gprinter") {
                0.95 // 中国品牌GBK兼容性最好
            } else if brand_lower.contains("thermal") || brand_lower.contains("pos") {
                0.85 // 通用热敏打印机GBK兼容性好
            } else {
                0.7 // 其他品牌GBK兼容性一般
            }
        }
        "GB18030" => {
            if brand_lower.contains("xprinter") || brand_lower.contains("gprinter") {
                0.9 // 中国品牌GB18030兼容性好
            } else {
                0.6 // 其他品牌支持有限
            }
        }
        "BIG5" => {
            if brand_lower.contains("epson") {
                0.8 // Epson对Big5支持较好
            } else {
                0.6 // 其他品牌支持一般
            }
        }
        "ASCII" => 0.95, // ASCII几乎所有打印机都支持
        _ => 0.5, // 未知编码默认中等兼容性
    }
}

// 设置打印机编码偏好
#[tauri::command]
async fn set_printer_encoding_preference(
    printer_name: String,
    preferred_encoding: String,
    fallback_encodings: Option<Vec<String>>,
    state: State<'_, AppState>
) -> Result<(), String> {
    info!("⚙️ [PREF] 设置打印机编码偏好: {} -> {}", printer_name, preferred_encoding);
    
    let mut printers = state.printers.lock().unwrap();
    
    if let Some(printer) = printers.iter_mut().find(|p| p.name == printer_name) {
        printer.preferred_encoding = preferred_encoding.clone();
        
        if let Some(fallbacks) = fallback_encodings {
            printer.fallback_encodings = fallbacks;
        }
        
        info!("✅ [PREF] 编码偏好设置成功: {} 首选={}, 备用={:?}", 
              printer_name, preferred_encoding, printer.fallback_encodings);
        
        Ok(())
    } else {
        Err(format!("打印机 {} 未找到", printer_name))
    }
}

fn main() {
    // 初始化日志系统
    if let Err(e) = init_logger() {
        eprintln!("❌ 初始化日志系统失败: {}", e);
        // 即使日志初始化失败也继续运行程序
    }

    info!("🚀 开始启动 Tauri 应用程序");

    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            login,
            get_printers,
            set_printer_config,
            get_connection_status,
            test_print,
            toggle_printer,
            get_order_list,
            get_order_detail,
            manual_print_order,
            get_print_preview,
            get_log_content,
            get_log_info,
            clear_logs,
            open_log_folder,
            debug_printer,
            test_frontend_call,
            get_global_font_size,
            set_global_font_size,
            // 新增的中文编码相关命令
            detect_chinese_character_type,
            get_printer_encoding_info,
            test_printer_encoding_compatibility,
            test_all_encodings_for_printer,
            generate_encoding_compatibility_report,
            print_order_with_encoding,
            select_optimal_encoding,
            // 新增的智能编码命令
            analyze_text_encoding,
            test_printer_chinese_support,
            get_printer_encoding_capability,
            set_printer_encoding_preference
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}