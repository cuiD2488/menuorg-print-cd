// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use std::ptr;
use std::path::PathBuf;
use std::fs;
use std::ffi::{OsString, OsStr};
#[cfg(target_os = "windows")]
use std::os::windows::ffi::{OsStringExt, OsStrExt};
use tauri::{State, Window, Manager, SystemTray, SystemTrayMenu, SystemTrayMenuItem, CustomMenuItem, SystemTrayEvent, AppHandle};
use serde::{Deserialize, Serialize};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use futures_util::{SinkExt, StreamExt};
use log::{info, warn, error, debug};
use chrono::Local;
use encoding_rs;
use fern;

#[cfg(target_os = "windows")]
use winapi::um::winspool::{EnumPrintersW, PRINTER_INFO_2W, PRINTER_ENUM_LOCAL, PRINTER_ENUM_CONNECTIONS, OpenPrinterW, ClosePrinter, StartDocPrinterW, StartPagePrinter, EndPagePrinter, EndDocPrinter, WritePrinter, DOC_INFO_1W};
#[cfg(target_os = "windows")]
use winapi::um::errhandlingapi::GetLastError;
#[cfg(target_os = "windows")]
use winapi::um::winuser::{MessageBoxW, MB_OK, MB_ICONERROR};
#[cfg(target_os = "windows")]
use winapi::shared::minwindef::DWORD;
#[cfg(target_os = "windows")]
use winapi::um::winnt::HANDLE;
#[cfg(target_os = "windows")]
use winapi::um::sysinfoapi::GetVersionExW;
#[cfg(target_os = "windows")]
use winapi::um::winnt::OSVERSIONINFOW;

// Windows 7 兼容性检查函数
#[cfg(target_os = "windows")]
fn check_windows_version() -> Result<(u32, u32), String> {
    use std::mem;

    unsafe {
        let mut version_info: OSVERSIONINFOW = mem::zeroed();
        version_info.dwOSVersionInfoSize = mem::size_of::<OSVERSIONINFOW>() as u32;

        if GetVersionExW(&mut version_info) != 0 {
            Ok((version_info.dwMajorVersion, version_info.dwMinorVersion))
        } else {
            // 如果GetVersionExW失败，尝试从环境变量获取版本信息
            warn!("GetVersionExW失败，尝试从环境变量获取版本信息");

            // 在Windows 10+系统中，GetVersionExW可能返回错误的版本信息
            // 我们假设是现代Windows系统并继续运行
            Ok((10, 0)) // 默认假设为Windows 10
        }
    }
}

// Windows 7 兼容性初始化
#[cfg(target_os = "windows")]
fn init_windows7_compatibility() -> Result<(), String> {
    match check_windows_version() {
        Ok((major, minor)) => {
            info!("检测到Windows版本: {}.{}", major, minor);

            // Windows 7 是版本 6.1
            if major == 6 && minor == 1 {
                info!("✅ 检测到Windows 7系统，启用兼容性模式");

                // 设置Windows 7特定的兼容性选项
                std::env::set_var("TAURI_WEBVIEW2_DISABLE_NAVIGATION_SOUNDS", "1");
                std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-web-security --disable-features=VizDisplayCompositor");

                return Ok(());
            }
            // Windows 8 是版本 6.2, Windows 8.1 是版本 6.3
            else if major == 6 && (minor == 2 || minor == 3) {
                info!("✅ 检测到Windows 8/8.1系统，启用兼容性模式");
                return Ok(());
            }
            // Windows 10 是版本 10.0，但在某些情况下可能显示为 6.2 或其他值
            else if major >= 6 {
                info!("✅ 检测到Windows现代版本 ({}.{})，使用标准模式", major, minor);
                return Ok(());
            }
            // 低于Windows 7的版本
            else if major < 6 {
                let error_msg = format!("❌ 不支持的Windows版本: {}.{}\n本程序需要Windows 7或更高版本", major, minor);
                error!("{}", error_msg);

                // 显示错误对话框
                unsafe {
                    use std::ffi::OsStr;
                    use std::os::windows::ffi::OsStrExt;

                    let wide_title: Vec<u16> = OsStr::new("系统兼容性错误").encode_wide().chain(std::iter::once(0)).collect();
                    let wide_message: Vec<u16> = OsStr::new(&error_msg).encode_wide().chain(std::iter::once(0)).collect();

                    MessageBoxW(
                        ptr::null_mut(),
                        wide_message.as_ptr(),
                        wide_title.as_ptr(),
                        MB_OK | MB_ICONERROR
                    );
                }

                return Err(error_msg);
            }

            Ok(())
        }
        Err(e) => {
            warn!("⚠️ 无法检测Windows版本，继续运行: {}", e);
            info!("✅ 假设为兼容的Windows版本，继续启动");
            Ok(())
        }
    }
}

// 非Windows系统的占位实现
#[cfg(not(target_os = "windows"))]
fn init_windows7_compatibility() -> Result<(), String> {
    Ok(())
}

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
    encoding_mode: String, // 编码模式：auto, legacy, userve_v320n, standard
}

// 应用状态管理
#[derive(Default)]
struct AppState {
    is_connected: Arc<Mutex<bool>>,
    user_token: Arc<Mutex<Option<String>>>,
    user_id: Arc<Mutex<Option<String>>>,
    printers: Arc<Mutex<Vec<PrinterConfig>>>,
    global_font_size: Arc<Mutex<i32>>, // 全局字体大小设置: 0=小, 1=中, 2=大
    custom_encoding: Arc<Mutex<Option<String>>>, // 用户自定义编码
    encoding_override: Arc<Mutex<bool>>, // 是否启用编码覆盖
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
                                        // 直接打印订单 - 使用默认状态，不依赖 AppState
                                        let default_state = Arc::new(AppState {
                                            is_connected: Arc::new(Mutex::new(false)),
                                            user_token: Arc::new(Mutex::new(None)),
                                            user_id: Arc::new(Mutex::new(None)),
                                            printers: printers.clone(),
                                            global_font_size: Arc::new(Mutex::new(0)),
                                            custom_encoding: Arc::new(Mutex::new(None)),
                                            encoding_override: Arc::new(Mutex::new(false)),
                                        });
                                        let _ = print_order(order.clone(), printers.clone(), window.clone(), default_state).await;
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
async fn print_order(order: OrderData, printers_arc: Arc<Mutex<Vec<PrinterConfig>>>, window: Window, state: Arc<AppState>) -> Result<(), String> {
    println!("🖨️ [PRINT] 开始打印订单: {}", order.order_id);

    // 检查编码覆盖设置
    let custom_encoding = state.custom_encoding.lock().unwrap().clone();
    let encoding_override = *state.encoding_override.lock().unwrap();

    println!("🔧 [ENCODING] 自定义编码: {:?}", custom_encoding);
    println!("🔧 [ENCODING] 编码覆盖启用: {}", encoding_override);

    let printers = printers_arc.lock().unwrap().clone();
    let enabled_printers: Vec<_> = printers.iter().filter(|p| p.is_enabled).collect();

    if enabled_printers.is_empty() {
        println!("❌ [PRINT] 没有启用的打印机");
        return Err("No enabled printers found".to_string());
    }

    let global_font_size = *state.global_font_size.lock().unwrap();
    println!("🔤 [PRINT] 全局字体大小: {}", global_font_size);

    for printer in enabled_printers {
        println!("🖨️ [PRINT] 正在为打印机 {} 生成内容", printer.name);

        // 确定最终使用的编码模式
        let effective_encoding = if encoding_override && custom_encoding.is_some() {
            let custom_enc = custom_encoding.as_ref().unwrap();
            println!("🔧 [ENCODING] 使用自定义编码覆盖: {}", custom_enc);
            custom_enc.clone()
        } else {
            println!("🔧 [ENCODING] 使用打印机默认编码: {}", printer.encoding_mode);
            printer.encoding_mode.clone()
        };

        println!("🎯 [ENCODING] 最终编码模式: {}", effective_encoding);

        // 根据是否有编码覆盖选择不同的内容生成函数
        let content = if encoding_override && custom_encoding.is_some() {
            println!("📝 [PRINT] 使用编码覆盖生成内容");
            generate_print_content_with_encoding(&order, printer.width, global_font_size, &effective_encoding)?
        } else {
            println!("📝 [PRINT] 使用标准方式生成内容");
            generate_print_content(&order, printer.width, global_font_size)?
        };

        println!("📄 [PRINT] 内容生成完成，大小: {} 字节", content.len());

        match print_to_printer(&printer.name, &content).await {
            Ok(_) => {
                println!("✅ [PRINT] 打印机 {} 打印成功", printer.name);

                // 发送成功通知到前端
                let _ = window.emit("print-success", serde_json::json!({
                    "order_id": order.order_id,
                    "printer": printer.name,
                    "encoding": effective_encoding
                }));
            }
            Err(e) => {
                println!("❌ [PRINT] 打印机 {} 打印失败: {}", printer.name, e);

                // 发送失败通知到前端
                let _ = window.emit("print-error", serde_json::json!({
                    "order_id": order.order_id,
                    "printer": printer.name,
                    "error": e,
                    "encoding": effective_encoding
                }));
            }
        }
    }

    println!("🏁 [PRINT] 订单 {} 打印流程完成", order.order_id);
    Ok(())
}

// ============= 兼容性编码系统 =============

// 传统编码模式 - 保持原有逻辑不变，确保已正常工作的打印机不受影响
fn encode_chinese_text_legacy(text: &str) -> Vec<u8> {
    // 原有的简单编码逻辑，保持向后兼容
    let (encoded_bytes, _, _) = encoding_rs::GBK.encode(text);
    encoded_bytes.into_owned()
}

// uServe V320N 专用编码模式 - 针对显示中文为日文的问题
fn encode_chinese_text_userve_v320n(text: &str) -> Vec<u8> {
    // 针对uServe V320N等中国热敏打印机的专门编码策略

    // 检查文本是否包含中文字符
    let has_chinese = text.chars().any(|c| {
        let code = c as u32;
        (code >= 0x4E00 && code <= 0x9FFF) ||  // CJK统一汉字
        (code >= 0x3400 && code <= 0x4DBF) ||  // CJK扩展A
        (code >= 0x3000 && code <= 0x303F) ||  // CJK符号和标点
        (code >= 0xFF00 && code <= 0xFFEF)     // 全角ASCII
    });

    if !has_chinese {
        // 纯英文，直接返回ASCII字节
        return text.as_bytes().to_vec();
    }

    // 包含中文字符，使用多重编码策略

    // 策略1: 优先使用GB18030编码 (最全面的中文编码，向下兼容GBK和GB2312)
    let (gb18030_bytes, _, had_errors) = encoding_rs::GB18030.encode(text);
    if !had_errors {
        return gb18030_bytes.into_owned();
    }

    // 策略2: 尝试GBK编码 (大多数中国热敏打印机的标准编码)
    let (gbk_bytes, _, had_errors) = encoding_rs::GBK.encode(text);
    if !had_errors {
        return gbk_bytes.into_owned();
    }

    // 策略3: 字符级别的精确编码处理
    let mut result = Vec::new();
    for ch in text.chars() {
        if ch.is_ascii() {
            result.push(ch as u8);
        } else {
            // 尝试多种编码方式编码单个字符
            let single_char = ch.to_string();

            // 首先尝试GB18030
            let (char_bytes, _, had_error) = encoding_rs::GB18030.encode(&single_char);
            if !had_error {
                result.extend_from_slice(&char_bytes);
                continue;
            }

            // 然后尝试GBK
            let (char_bytes, _, had_error) = encoding_rs::GBK.encode(&single_char);
            if !had_error {
                result.extend_from_slice(&char_bytes);
                continue;
            }

            // 最后尝试UTF-8转换为可打印字符
            let utf8_bytes = single_char.as_bytes();
            if utf8_bytes.len() <= 4 {  // 合理的UTF-8字符长度
                result.extend_from_slice(utf8_bytes);
            } else {
                // 无法编码的字符，使用问号替代
                result.push(b'?');
            }
        }
    }

    result
}

// 标准ESC/POS编码模式 - 适用于大多数标准热敏打印机
fn encode_chinese_text_standard(text: &str) -> Vec<u8> {
    // 使用标准的GBK编码，适用于大多数支持中文的热敏打印机
    let (encoded_bytes, _, _) = encoding_rs::GBK.encode(text);
    encoded_bytes.into_owned()
}

// 自动检测编码模式 - 根据文本内容自动选择最佳编码
fn encode_chinese_text_auto(text: &str) -> Vec<u8> {
    // 检测文本中是否包含中文字符
    let has_chinese = text.chars().any(|c| {
        let code = c as u32;
        (code >= 0x4E00 && code <= 0x9FFF) ||  // CJK统一汉字
        (code >= 0x3400 && code <= 0x4DBF) ||  // CJK扩展A
        (code >= 0x3000 && code <= 0x303F) ||  // CJK符号和标点
        (code >= 0xFF00 && code <= 0xFFEF)     // 全角ASCII
    });

    if has_chinese {
        // 包含中文，使用GBK编码
        let (encoded_bytes, _, _) = encoding_rs::GBK.encode(text);
    encoded_bytes.into_owned()
    } else {
        // 纯英文，直接使用ASCII
        text.as_bytes().to_vec()
    }
}

// 主编码函数 - 根据编码模式选择合适的编码策略
fn encode_chinese_text_with_mode(text: &str, encoding_mode: &str) -> Vec<u8> {
    match encoding_mode {
        "legacy" => encode_chinese_text_legacy(text),
        "userve_v320n" => encode_chinese_text_userve_v320n(text),
        "standard" => encode_chinese_text_standard(text),
        "auto" => encode_chinese_text_auto(text),
        "gbk" => encode_chinese_text_gbk(text),
        "gb2312" => encode_chinese_text_gb2312(text),
        "gb18030" => encode_chinese_text_gb18030(text),
        "utf8" => encode_chinese_text_utf8(text),
        "big5" => encode_chinese_text_big5(text),
        "cp936" => encode_chinese_text_cp936(text),
        "iso8859-1" => encode_chinese_text_iso8859_1(text),

        // US Common Encodings
        "ascii" => encode_text_ascii(text),
        "cp437" => encode_text_cp437(text),
        "cp850" => encode_text_cp850(text),
        "cp1252" => encode_text_cp1252(text),
        "iso8859-2" => encode_text_iso8859_2(text),
        "iso8859-3" => encode_text_iso8859_3(text),
        "iso8859-4" => encode_text_iso8859_4(text),
        "iso8859-5" => encode_text_iso8859_5(text),
        "iso8859-6" => encode_text_iso8859_6(text),
        "iso8859-7" => encode_text_iso8859_7(text),
        "iso8859-8" => encode_text_iso8859_8(text),
        "iso8859-9" => encode_text_iso8859_9(text),
        "iso8859-10" => encode_text_iso8859_10(text),
        "iso8859-11" => encode_text_iso8859_11(text),
        "iso8859-13" => encode_text_iso8859_13(text),
        "iso8859-14" => encode_text_iso8859_14(text),
        "iso8859-15" => encode_text_iso8859_15(text),
        "iso8859-16" => encode_text_iso8859_16(text),

        // European/US Extended
        "cp1250" => encode_text_cp1250(text),
        "cp1251" => encode_text_cp1251(text),
        "cp1253" => encode_text_cp1253(text),
        "cp1254" => encode_text_cp1254(text),
        "cp1255" => encode_text_cp1255(text),
        "cp1256" => encode_text_cp1256(text),
        "cp1257" => encode_text_cp1257(text),
        "cp1258" => encode_text_cp1258(text),

        // US Printer Specific
        "cp866" => encode_text_cp866(text),
        "cp852" => encode_text_cp852(text),
        "cp860" => encode_text_cp860(text),
        "cp861" => encode_text_cp861(text),
        "cp862" => encode_text_cp862(text),
        "cp863" => encode_text_cp863(text),
        "cp864" => encode_text_cp864(text),
        "cp865" => encode_text_cp865(text),
        "cp869" => encode_text_cp869(text),

        // UTF Variants
        "utf16" => encode_text_utf16(text),
        "utf16le" => encode_text_utf16le(text),
        "utf16be" => encode_text_utf16be(text),
        "utf32" => encode_text_utf32(text),

        // Mac/Apple
        "macintosh" => encode_text_macintosh(text),
        "maclatin2" => encode_text_maclatin2(text),
        "maccyrillic" => encode_text_maccyrillic(text),

        // Japanese
        "shift_jis" => encode_text_shift_jis(text),
        "euc-jp" => encode_text_euc_jp(text),
        "iso2022jp" => encode_text_iso2022jp(text),

        // Korean
        "euc-kr" => encode_text_euc_kr(text),
        "cp949" => encode_text_cp949(text),

        // Other Common
        "koi8-r" => encode_text_koi8_r(text),
        "koi8-u" => encode_text_koi8_u(text),
        "tis-620" => encode_text_tis620(text),

        _ => encode_chinese_text_auto(text), // 默认使用auto
    }
}

// 新增编码函数
fn encode_chinese_text_gbk(text: &str) -> Vec<u8> {
    // 直接使用GBK编码
    match encoding_rs::GBK.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ GBK编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_chinese_text_gb2312(text: &str) -> Vec<u8> {
    // GB2312是GBK的子集，使用GBK编码但限制字符集
    match encoding_rs::GBK.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ GB2312编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_chinese_text_gb18030(text: &str) -> Vec<u8> {
    // GB18030编码
    match encoding_rs::GB18030.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ GB18030编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_chinese_text_utf8(text: &str) -> Vec<u8> {
    // UTF-8编码
    text.as_bytes().to_vec()
}

fn encode_chinese_text_big5(text: &str) -> Vec<u8> {
    // Big5编码（繁体中文）
    match encoding_rs::BIG5.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ Big5编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_chinese_text_cp936(text: &str) -> Vec<u8> {
    // CP936编码（Windows中文代码页）
    match encoding_rs::GBK.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP936编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_chinese_text_iso8859_1(text: &str) -> Vec<u8> {
    // ISO-8859-1编码（Latin-1）
    match encoding_rs::WINDOWS_1252.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-1编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

// ============= 原有编码函数保持兼容 =============

fn encode_chinese_text(text: &str) -> Vec<u8> {
    // 原有的简单编码逻辑，保持向后兼容
    let (encoded_bytes, _, _) = encoding_rs::GBK.encode(text);
    encoded_bytes.into_owned()
}

fn generate_print_content(order: &OrderData, width: i32, font_size: i32) -> Result<Vec<u8>, String> {
    // 根据纸张宽度设置字符数 (考虑中文字符占2个位置)
    let char_width = if width == 80 { 48 } else { 32 };

    let mut content = Vec::new();

    // 添加ESC/POS头部命令
    content.extend_from_slice(&generate_legacy_esc_pos_header());

    // 设置字体大小 - 调整中号和大号使其比原来小一点
    match font_size {
        0 => { // 小号字体 (默认大小) - 保持不变
            content.extend_from_slice(b"\x1D\x21\x00"); // 正常大小 (1x1)
        },
        1 => { // 中号字体 - 只放大宽度，比原来小
            content.extend_from_slice(b"\x1D\x21\x01"); // 宽度2x，高度1x
        },
        2 => { // 大号字体 - 只放大高度，比原来小
            content.extend_from_slice(b"\x1D\x21\x10"); // 宽度1x，高度2x
        },
        _ => { // 默认情况
            content.extend_from_slice(b"\x1D\x21\x00"); // 正常大小
        }
    }

    // 设置行间距为更宽松的间距
    content.extend_from_slice(b"\x1B\x33\x30"); // 设置行间距为48/180英寸

    // ============= 头部信息 (居中) =============
    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");
    content.extend_from_slice(b"\x1B\x45\x01"); // 加粗
    content.extend_from_slice(&center_text_mixed_bytes(&order.rd_name.to_uppercase(), char_width));
    content.extend_from_slice(b"\x1B\x45\x00"); // 关闭加粗
    content.extend_from_slice(b"\n");

    // 订单类型 (居中)
    let order_type = get_order_type_text(order);
    content.extend_from_slice(b"\x1B\x45\x01"); // 加粗
    content.extend_from_slice(&center_text_mixed_bytes(order_type, char_width));
    content.extend_from_slice(b"\x1B\x45\x00"); // 关闭加粗
    content.extend_from_slice(b"\n");
    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n\n");

    // ============= 订单信息表格 =============
    // 订单号 (居中显示)
    content.extend_from_slice(b"\x1B\x45\x01"); // 加粗
    let order_line = format!("Order #: {}", order.order_id);
    content.extend_from_slice(&center_text_mixed_bytes(&order_line, char_width));
    content.extend_from_slice(b"\x1B\x45\x00"); // 关闭加粗
    content.extend_from_slice(b"\n");

    // 流水号 (居中显示)
    let serial = if order.serial_num > 0 {
        format!("#{:03}", order.serial_num)
    } else {
        format!("#{}", get_order_serial(order))
    };
    let serial_line = format!("Serial: {}", serial);
    content.extend_from_slice(&center_text_mixed_bytes(&serial_line, char_width));
    content.extend_from_slice(b"\n\n");

    // 基本信息表格 (左对齐标签，右对齐数值)
    content.extend_from_slice(&format_table_row_bytes("Order Date:", &format_order_time(&order.create_time), char_width));

    if order.delivery_style == 1 {  // 外送
        content.extend_from_slice(&format_table_row_bytes("Delivery Time:", &format_delivery_time(&order.delivery_time), char_width));
        if !order.recipient_distance.is_empty() && order.recipient_distance != "0.00" {
            let distance_line = format!("{} miles", order.recipient_distance);
            content.extend_from_slice(&format_table_row_bytes("Distance:", &distance_line, char_width));
        }
    } else {  // 自取
        content.extend_from_slice(&format_table_row_bytes("Pickup Time:", &format_delivery_time(&order.delivery_time), char_width));
    }

    content.extend_from_slice(&format_table_row_bytes("Payment:", get_payment_method_text(order.paystyle), char_width));
    content.extend_from_slice(&format_table_row_bytes("Customer:", &order.recipient_name, char_width));
    content.extend_from_slice(&format_table_row_bytes("Phone:", &order.recipient_phone, char_width));

    // 地址 (如果是外送)
    if !order.recipient_address.is_empty() && order.delivery_style == 1 {
        content.extend_from_slice(&format_table_row_bytes("Address:", &order.recipient_address, char_width));
    }

    content.extend_from_slice(b"\n");
    content.extend_from_slice("-".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");

    // ============= 商品明细表格 =============
    content.extend_from_slice(b"\x1B\x45\x01"); // 加粗
    content.extend_from_slice(&center_text_mixed_bytes("ORDER ITEMS", char_width));
    content.extend_from_slice(b"\x1B\x45\x00"); // 关闭加粗
    content.extend_from_slice(b"\n");
    content.extend_from_slice("-".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");

    // 表格标题 - 简化版本
    let header = format_table_header_bytes("Item Name", "Qty", "", "Total", char_width);
    content.extend_from_slice(&header);
    content.extend_from_slice("-".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");

    for item in &order.dishes_array {
        let price: f64 = item.price.parse().unwrap_or(0.0);
        let unit_price: f64 = item.unit_price.parse().unwrap_or(0.0);

        // 商品行 (使用混合编码处理菜名)
        content.extend_from_slice(&format_item_table_row_bytes(
            &item.dishes_name,
            item.amount,
            unit_price,
            price,
            char_width
        ));

        // 附加项目 (如米饭等) - 只显示名称，不显示价格和数量
        if !item.dishes_describe.is_empty() {
            content.extend_from_slice(b"  + ");
            content.extend_from_slice(&prepare_mixed_content_with_mode(&item.dishes_describe, "legacy"));
            content.extend_from_slice(b"\n");
        }

        // 特殊要求 (使用混合编码)
        if !item.remark.is_empty() {
            content.extend_from_slice(b"  Note: ");
            content.extend_from_slice(&prepare_mixed_content_with_mode(&item.remark, "legacy"));
            content.extend_from_slice(b"\n");
        }

        // 增加商品间的行距
        content.extend_from_slice(b"\n");
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

    content.extend_from_slice("-".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");
    content.extend_from_slice(b"\x1B\x45\x01"); // 加粗
    content.extend_from_slice(&center_text_mixed_bytes("PAYMENT SUMMARY", char_width));
    content.extend_from_slice(b"\x1B\x45\x00"); // 关闭加粗
    content.extend_from_slice(b"\n");
    content.extend_from_slice("-".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");

    // 小计
    content.extend_from_slice(&format_fee_line_bytes_with_mode("Subtotal", sub_total, char_width, "legacy"));

    // 折扣
    if discount_total > 0.0 {
        content.extend_from_slice(&format_fee_line_bytes_with_mode("Discount", -discount_total, char_width, "legacy"));
    }

    // 免费金额
    if exemption > 0.0 {
        content.extend_from_slice(&format_fee_line_bytes_with_mode("Exemption", -exemption, char_width, "legacy"));
    }

    // 税费
    if tax_fee > 0.0 {
        let tax_label = if tax_rate > 0.0 {
            format!("Tax ({:.1}%)", tax_rate * 100.0)
        } else {
            "Tax".to_string()
        };
        content.extend_from_slice(&format_fee_line_bytes_with_mode(&tax_label, tax_fee, char_width, "legacy"));
    }

    // 配送费
    if delivery_fee > 0.0 {
        content.extend_from_slice(&format_fee_line_bytes_with_mode("Delivery Fee", delivery_fee, char_width, "legacy"));
    }

    // 零售配送费
    if retail_delivery_fee > 0.0 {
        content.extend_from_slice(&format_fee_line_bytes_with_mode("Retail Del. Fee", retail_delivery_fee, char_width, "legacy"));
    }

    // 便民费
    if convenience_fee > 0.0 {
        let conv_rate: f64 = order.convenience_rate.parse().unwrap_or(0.0);
        let conv_label = if conv_rate > 0.0 {
            format!("Service Fee ({:.1}%)", conv_rate * 100.0)
        } else {
            "Service Fee".to_string()
        };
        content.extend_from_slice(&format_fee_line_bytes_with_mode(&conv_label, convenience_fee, char_width, "legacy"));
    }

    // 小费
    if tip_fee > 0.0 {
        content.extend_from_slice(&format_fee_line_bytes_with_mode("Tip", tip_fee, char_width, "legacy"));
    }

    content.extend_from_slice(b"\n");
    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");

    // 总计 (加粗显示)
    content.extend_from_slice(b"\x1B\x45\x01"); // 加粗
    content.extend_from_slice(&format_fee_line_bytes_with_mode("TOTAL", total, char_width, "legacy"));
    content.extend_from_slice(b"\x1B\x45\x00"); // 关闭加粗

    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");

    // 底部信息 (使用混合编码)
    if !order.order_notes.is_empty() {
        content.extend_from_slice(b"\nNotes:\n");
        content.extend_from_slice(&prepare_mixed_content_with_mode(&order.order_notes, "legacy"));
        content.extend_from_slice(b"\n");
    }

    content.extend_from_slice(b"\n");
    content.extend_from_slice(&center_text_mixed_bytes("Thank you for your order!", char_width));
    content.extend_from_slice(b"\n");
    let time_line = format!("Order Time: {}", format_simple_time(&order.create_time));
    content.extend_from_slice(&center_text_mixed_bytes(&time_line, char_width));
    content.extend_from_slice(b"\n\n\n\n"); // 空行，为切纸预留空间

    // 单次自动切纸命令 - 避免重复切纸
    content.extend_from_slice(b"\x1D\x56\x00"); // GS V 0 - 全切 (最通用的切纸命令)

    Ok(content)
}

// 支持中文的居中文本函数 (返回字节)
fn center_text_mixed_bytes(text: &str, width: usize) -> Vec<u8> {
    let display_len = display_width(text);
    if display_len >= width {
        return prepare_mixed_content_with_mode(text, "legacy");
    }

    let padding = (width - display_len) / 2;
    let mut result = " ".repeat(padding).into_bytes();
    result.extend_from_slice(&prepare_mixed_content_with_mode(text, "legacy"));
    result.extend_from_slice(b"\n");
    result
}

// 支持中文的表格行格式化函数 (返回字节)
fn format_table_row_bytes(label: &str, value: &str, width: usize) -> Vec<u8> {
    let label_bytes = prepare_mixed_content_with_mode(label, "legacy");
    let value_bytes = prepare_mixed_content_with_mode(value, "legacy");

    // 计算显示宽度
    let label_width = display_width(label);
    let value_width = display_width(value);

    if label_width + value_width + 2 <= width {
        // 可以在一行显示
        let padding = width - label_width - value_width;
        let mut result = label_bytes;
        result.extend_from_slice(" ".repeat(padding).as_bytes());
        result.extend_from_slice(&value_bytes);
        result.extend_from_slice(b"\n");
        result
    } else {
        // 需要分行显示
        let mut result = label_bytes;
        result.extend_from_slice(b"\n");
        result.extend_from_slice(&value_bytes);
        result.extend_from_slice(b"\n");
        result
    }
}

// 支持中文的表格头部格式化函数 (返回字节)
fn format_table_header_bytes(name: &str, qty: &str, _price: &str, total: &str, width: usize) -> Vec<u8> {
    let name_width = width * 60 / 100;  // 60% 给商品名
    let qty_width = 6;                  // 6个字符给数量
    let total_width = width - name_width - qty_width - 2; // 剩余给总价

    let mut result = Vec::new();

    // 商品名 (左对齐)
    let name_bytes = prepare_mixed_content_with_mode(name, "legacy");
    result.extend_from_slice(&name_bytes);
    let name_display_width = display_width(name);
    if name_display_width < name_width {
        result.extend_from_slice(" ".repeat(name_width - name_display_width).as_bytes());
    }

    // 数量 (居中)
    let qty_bytes = prepare_mixed_content_with_mode(qty, "legacy");
    let qty_display_width = display_width(qty);
    let qty_padding = (qty_width - qty_display_width) / 2;
    result.extend_from_slice(" ".repeat(qty_padding).as_bytes());
    result.extend_from_slice(&qty_bytes);
    result.extend_from_slice(" ".repeat(qty_width - qty_display_width - qty_padding).as_bytes());

    // 总价 (右对齐)
    let total_bytes = prepare_mixed_content_with_mode(total, "legacy");
    let total_display_width = display_width(total);
    if total_display_width < total_width {
        result.extend_from_slice(" ".repeat(total_width - total_display_width).as_bytes());
    }
    result.extend_from_slice(&total_bytes);
    result.extend_from_slice(b"\n");

    result
}

// 支持中文的商品行格式化函数 (返回字节)
fn format_item_table_row_bytes(name: &str, qty: i32, _unit_price: f64, total_price: f64, width: usize) -> Vec<u8> {
    let name_width = width * 75 / 100;  // 75% 给商品名 (增加了列宽)
    let qty_width = 4;                  // 4个字符给数量 (减少了宽度)
    let total_width = width - name_width - qty_width - 2; // 剩余给总价

    let mut result = Vec::new();

    // 商品名处理 - 智能单词换行，无省略号
    let name_display_width = display_width(name);
    if name_display_width <= name_width {
        // 商品名可以在一行显示
        let name_bytes = prepare_mixed_content_with_mode(name, "legacy");
        result.extend_from_slice(&name_bytes);
        result.extend_from_slice(" ".repeat(name_width - name_display_width).as_bytes());

        // 数量 (居中)
        let qty_str = qty.to_string();
        let qty_bytes = prepare_mixed_content_with_mode(&qty_str, "legacy");
        let qty_display_width = display_width(&qty_str);
        let qty_padding = (qty_width - qty_display_width) / 2;
        result.extend_from_slice(" ".repeat(qty_padding).as_bytes());
        result.extend_from_slice(&qty_bytes);
        result.extend_from_slice(" ".repeat(qty_width - qty_display_width - qty_padding).as_bytes());

        // 总价 (右对齐)
        let total_str = format!("{:.2}", total_price);
        let total_bytes = prepare_mixed_content_with_mode(&total_str, "legacy");
        let total_display_width = display_width(&total_str);
        if total_display_width < total_width {
            result.extend_from_slice(" ".repeat(total_width - total_display_width).as_bytes());
        }
        result.extend_from_slice(&total_bytes);
        result.extend_from_slice(b"\n");
    } else {
        // 商品名太长，使用智能换行显示
        let lines = smart_wrap_text(name, name_width);

        for (i, line) in lines.iter().enumerate() {
            if i == 0 {
                // 第一行：菜名 + 数量 + 总价
                let line_bytes = prepare_mixed_content_with_mode(line, "legacy");
                result.extend_from_slice(&line_bytes);
                let line_display_width = display_width(line);
                result.extend_from_slice(" ".repeat(name_width - line_display_width).as_bytes());

                // 数量 (居中)
                let qty_str = qty.to_string();
                let qty_bytes = prepare_mixed_content_with_mode(&qty_str, "legacy");
                let qty_display_width = display_width(&qty_str);
                let qty_padding = (qty_width - qty_display_width) / 2;
                result.extend_from_slice(" ".repeat(qty_padding).as_bytes());
                result.extend_from_slice(&qty_bytes);
                result.extend_from_slice(" ".repeat(qty_width - qty_display_width - qty_padding).as_bytes());

                // 总价 (右对齐)
                let total_str = format!("{:.2}", total_price);
                let total_bytes = prepare_mixed_content_with_mode(&total_str, "legacy");
                let total_display_width = display_width(&total_str);
                if total_display_width < total_width {
                    result.extend_from_slice(" ".repeat(total_width - total_display_width).as_bytes());
                }
                result.extend_from_slice(&total_bytes);
                result.extend_from_slice(b"\n");
            } else {
                // 后续行：只显示菜名续行，缩进2个空格
                result.extend_from_slice(b"  ");
                let line_bytes = prepare_mixed_content_with_mode(line, "legacy");
                result.extend_from_slice(&line_bytes);
                result.extend_from_slice(b"\n");
            }
        }
    }

    result
}

// 智能文本换行函数 - 保持单词完整，支持中英文
fn smart_wrap_text(text: &str, width: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current_line = String::new();
    let mut current_width = 0;

    // 按空格和标点符号分割，但保持分隔符
    let mut words = Vec::new();
    let mut current_word = String::new();

    for ch in text.chars() {
        if ch.is_whitespace() || matches!(ch, ',' | '.' | '(' | ')' | '[' | ']' | '{' | '}' | '-' | '/' | '\\') {
            if !current_word.is_empty() {
                words.push(current_word.clone());
                current_word.clear();
            }
            if !ch.is_whitespace() {
                words.push(ch.to_string());
            }
        } else {
            current_word.push(ch);
        }
    }

    // 添加最后一个单词
    if !current_word.is_empty() {
        words.push(current_word);
    }

    for word in words {
        let word_width = display_width(&word);

        // 如果当前行为空，直接添加单词（即使超宽也要添加，避免无限循环）
        if current_line.is_empty() {
            current_line = word;
            current_width = word_width;
        }
        // 如果添加这个单词会超宽，先结束当前行
        else if current_width + 1 + word_width > width {
            lines.push(current_line);
            current_line = word;
            current_width = word_width;
        }
        // 否则添加到当前行
        else {
            current_line.push(' ');
            current_line.push_str(&word);
            current_width += 1 + word_width;
        }
    }

    // 添加最后一行
    if !current_line.is_empty() {
        lines.push(current_line);
    }

    // 如果没有任何行，至少返回原文本（防止空结果）
    if lines.is_empty() {
        lines.push(text.to_string());
    }

    lines
}

// 支持中文的费用行格式化函数 (返回字节)
fn format_fee_line_bytes_with_mode(label: &str, amount: f64, width: usize, encoding_mode: &str) -> Vec<u8> {
    let mut result = Vec::new();
    let label_bytes = prepare_mixed_content_with_mode(label, encoding_mode);
    let amount_str = format!("${:.2}", amount);
    let amount_bytes = prepare_mixed_content_with_mode(&amount_str, encoding_mode);

    result.extend_from_slice(&label_bytes);
    let label_width = display_width(label);
    let amount_width = display_width(&amount_str);
    let padding = width.saturating_sub(label_width + amount_width);
    result.extend_from_slice(" ".repeat(padding).as_bytes());
    result.extend_from_slice(&amount_bytes);
    result.extend_from_slice(b"\n");
    result
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
        0 => "Pay at store",
        1 => "Online payment",
        _ => "Other",
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
        parsed.format("%H:%M").to_string()
    } else {
        time_str.to_string()
    }
}

// Helper function to format delivery time
fn format_delivery_time(time_str: &str) -> String {
    if let Ok(parsed) = chrono::NaiveDateTime::parse_from_str(time_str, "%Y-%m-%d %H:%M:%S") {
        parsed.format("%H:%M").to_string()
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

                // 判断打印机类型和宽度
                let (width, is_thermal, encoding_mode) = classify_printer(&name);
                println!("🔍 [SYSTEM] 分类结果: 宽度={}mm, 热敏打印机={}, 编码模式={}", width, is_thermal, encoding_mode);

                // 检查是否为默认打印机
                let is_default = (printer_info.Attributes & 0x00000004) != 0; // PRINTER_ATTRIBUTE_DEFAULT
                println!("🔍 [SYSTEM] 是否为默认打印机: {}", is_default);

                printers.push(PrinterConfig {
                    name: name.clone(),
                    width,
                    is_default,
                    is_enabled: false, // 默认禁用，用户需要手动选择
                    font_size: 0, // 默认小号字体
                    encoding_mode: encoding_mode.clone(), // 默认编码模式
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

// 根据打印机名称分类判断宽度
fn classify_printer(name: &str) -> (i32, bool, String) {
    let name_lower = name.to_lowercase();

    // 确定编码模式
    let encoding_mode = if name_lower.contains("userve") || name_lower.contains("v320n") || name_lower.contains("v320") {
        "userve_v320n".to_string() // uServe V320N 需要特殊的中文编码处理
    } else if name_lower.contains("xprinter") || name_lower.contains("gprinter") ||
              name_lower.contains("epson") || name_lower.contains("citizen") {
        "standard".to_string() // 标准ESC/POS编码
    } else {
        "auto".to_string() // 自动检测编码模式
    };

    // 检查是否为热敏打印机和宽度
    if name_lower.contains("58") || name_lower.contains("58mm") {
        (58, true, encoding_mode)
    } else if name_lower.contains("80") || name_lower.contains("80mm") {
        (80, true, encoding_mode)
    } else if name_lower.contains("thermal") || name_lower.contains("receipt") || name_lower.contains("pos") {
        // 热敏打印机但未明确宽度，默认80mm
        (80, true, encoding_mode)
    } else {
        // 其他类型打印机，默认80mm宽度
        (80, false, encoding_mode)
    }
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
        info!("✅ [TEST] 找到目标打印机: {} (宽度: {}mm)", printer.name, printer.width);

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

        let content = generate_print_content(&test_order, printer.width, printer.font_size)?;

        println!("✅ [TEST] 打印内容生成完成，长度: {} 字节", content.len());
        println!("🧪 [TEST] 打印内容预览 (前100字节转换为字符串):");
        let preview = String::from_utf8_lossy(&content[..std::cmp::min(100, content.len())]);
        println!("{}", preview);
        println!("🧪 [TEST] 开始调用打印机API...");

        // 实际调用打印机
        match print_to_printer(&printer.name, &content).await {
            Ok(_) => {
                println!("🎉 [TEST] 测试打印成功完成! 打印机: {}", printer.name);
        Ok(())
            }
            Err(e) => {
                println!("❌ [TEST] 标准打印失败: {}, 尝试增强版打印...", e);

                // 尝试增强版打印
                #[cfg(target_os = "windows")]
                match print_to_printer_enhanced(&printer.name, &content).await {
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
    println!("Manual print order requested for: {}", order_data.order_id);

    let printers_arc = state.printers.clone();

    // 创建 AppState Arc
    let state_arc = Arc::new(AppState {
        is_connected: state.is_connected.clone(),
        user_token: state.user_token.clone(),
        user_id: state.user_id.clone(),
        printers: state.printers.clone(),
        global_font_size: state.global_font_size.clone(),
        custom_encoding: state.custom_encoding.clone(),
        encoding_override: state.encoding_override.clone(),
    });

    match print_order(order_data.clone(), printers_arc, window, state_arc).await {
        Ok(_) => Ok(format!("Order {} printed successfully", order_data.order_id)),
        Err(e) => Err(format!("Failed to print order {}: {}", order_data.order_id, e)),
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
    let content_bytes = generate_print_content(&order_data, width, global_font_size)?;

    // 将字节数组转换为字符串用于预览
    // 尝试UTF-8解码，如果失败则使用lossy转换
    let preview_content = String::from_utf8(content_bytes)
        .unwrap_or_else(|e| {
            // 如果UTF-8解码失败，使用lossy转换
            String::from_utf8_lossy(&e.into_bytes()).to_string()
        });

    Ok(preview_content)
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
fn print_to_printer_sync(printer_name: &str, content: &[u8]) -> Result<(), String> {

    info!("🖨️ [DEBUG] 开始打印到打印机: {}", printer_name);
    debug!("🖨️ [DEBUG] 打印内容长度: {} 字节", content.len());

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

        // 写入打印内容 (现在是字节数组)
        let mut bytes_written: DWORD = 0;

        println!("🖨️ [DEBUG] 正在写入打印数据... ({} 字节)", content.len());

        let write_result = WritePrinter(
            printer_handle,
            content.as_ptr() as *mut _,
            content.len() as DWORD,
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

        println!("✅ [DEBUG] 写入成功, 已写入字节数: {} / {}", bytes_written, content.len());

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
async fn print_to_printer(printer_name: &str, content: &[u8]) -> Result<(), String> {
    let printer_name = printer_name.to_string();
    let content = content.to_vec();

    tokio::task::spawn_blocking(move || {
        print_to_printer_sync(&printer_name, &content)
    }).await.map_err(|e| format!("Task execution failed: {}", e))?
}

// 非Windows系统的占位实现
#[cfg(not(target_os = "windows"))]
async fn print_to_printer(printer_name: &str, content: &[u8]) -> Result<(), String> {
    let content_str = String::from_utf8_lossy(content);
    println!("Printing to {} (Linux/macOS simulation):\n{}", printer_name, content_str);
    Ok(())
}

// 增强版打印功能，包含更多调试信息和错误处理
#[cfg(target_os = "windows")]
fn print_to_printer_enhanced_sync(printer_name: &str, content: &[u8]) -> Result<(), String> {

    info!("🖨️ [ENHANCED] 开始增强版打印到打印机: {}", printer_name);
    debug!("🖨️ [ENHANCED] 打印内容长度: {} 字节", content.len());

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

            // 写入打印内容 (字节数组)
            let mut bytes_written: DWORD = 0;

            info!("🖨️ [ENHANCED] 正在写入打印数据... ({} 字节)", content.len());

            let write_result = WritePrinter(
                printer_handle,
                content.as_ptr() as *mut _,
                content.len() as DWORD,
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

            info!("✅ [ENHANCED] 写入成功, 已写入字节数: {} / {}", bytes_written, content.len());

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
async fn print_to_printer_enhanced(printer_name: &str, content: &[u8]) -> Result<(), String> {
    let printer_name = printer_name.to_string();
    let content = content.to_vec();

    tokio::task::spawn_blocking(move || {
        print_to_printer_enhanced_sync(&printer_name, &content)
    }).await.map_err(|e| format!("Task execution failed: {}", e))?
}

// 同步版本的命令行打印（用于线程安全）
#[allow(dead_code)]
fn print_via_command_sync(printer_name: &str, content: &[u8]) -> Result<(), String> {
    info!("🖨️ [COMMAND] 开始命令行打印");

    // 创建临时文件
    let temp_file = std::env::temp_dir().join("tauri_print_temp.txt");

    // 写入内容到临时文件 (字节数组)
    std::fs::write(&temp_file, content)
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
async fn print_via_command(printer_name: &str, content: &[u8]) -> Result<(), String> {
    let printer_name = printer_name.to_string();
    let content = content.to_vec();

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

// 托盘相关命令
#[tauri::command]
async fn show_main_window(app: AppHandle) -> Result<(), String> {
    match app.get_window("main") {
        Some(window) => {
            if let Err(e) = window.show() {
                error!("❌ [TRAY] 显示主窗口失败: {}", e);
                return Err(format!("显示窗口失败: {}", e));
            }
            if let Err(e) = window.set_focus() {
                warn!("⚠️ [TRAY] 设置窗口焦点失败: {}", e);
            }
            info!("✅ [TRAY] 主窗口已显示");
            Ok(())
        }
        None => {
            error!("❌ [TRAY] 找不到主窗口");
            Err("找不到主窗口".to_string())
        }
    }
}

#[tauri::command]
async fn hide_main_window(app: AppHandle) -> Result<(), String> {
    match app.get_window("main") {
        Some(window) => {
            if let Err(e) = window.hide() {
                error!("❌ [TRAY] 隐藏主窗口失败: {}", e);
                return Err(format!("隐藏窗口失败: {}", e));
            }
            info!("✅ [TRAY] 主窗口已隐藏到托盘");
            Ok(())
        }
        None => {
            error!("❌ [TRAY] 找不到主窗口");
            Err("找不到主窗口".to_string())
        }
    }
}

#[tauri::command]
async fn quit_application(app: AppHandle) -> Result<(), String> {
    info!("🚪 [TRAY] 应用程序正在退出");
    app.exit(0);
    Ok(())
}

#[tauri::command]
async fn toggle_window_visibility(app: AppHandle) -> Result<(), String> {
    match app.get_window("main") {
        Some(window) => {
            match window.is_visible() {
                Ok(true) => {
                    if let Err(e) = window.hide() {
                        error!("❌ [TRAY] 隐藏窗口失败: {}", e);
                        return Err(format!("隐藏窗口失败: {}", e));
                    }
                    info!("✅ [TRAY] 窗口已隐藏");
                }
                Ok(false) => {
                    if let Err(e) = window.show() {
                        error!("❌ [TRAY] 显示窗口失败: {}", e);
                        return Err(format!("显示窗口失败: {}", e));
                    }
                    if let Err(e) = window.set_focus() {
                        warn!("⚠️ [TRAY] 设置窗口焦点失败: {}", e);
                    }
                    info!("✅ [TRAY] 窗口已显示");
                }
                Err(e) => {
                    error!("❌ [TRAY] 检查窗口可见性失败: {}", e);
                    return Err(format!("检查窗口状态失败: {}", e));
                }
            }
            Ok(())
        }
        None => {
            error!("❌ [TRAY] 找不到主窗口");
            Err("找不到主窗口".to_string())
        }
    }
}

// 专门的中文编码测试函数 - 针对uServe V320N优化
#[tauri::command]
async fn test_chinese_encoding(printer_name: String, state: State<'_, AppState>) -> Result<String, String> {
    info!("🧪 [CHINESE_TEST] 开始中文编码测试: {}", printer_name);

    // 从锁中获取打印机配置并立即释放锁
    let printer_config = {
        let printers = state.printers.lock().unwrap();
        printers.iter().find(|p| p.name == printer_name).cloned()
    };

    if let Some(printer) = printer_config {
        info!("✅ [CHINESE_TEST] 找到目标打印机: {} (宽度: {}mm)", printer.name, printer.width);

        // 创建包含各种中文字符的测试内容
        let test_content = create_chinese_test_content(printer.width)?;

        // 执行打印测试
        match print_to_printer_enhanced(&printer.name, &test_content).await {
            Ok(_) => {
                info!("✅ [CHINESE_TEST] 中文编码测试打印成功");
                Ok("中文编码测试打印成功".to_string())
            }
            Err(e) => {
                error!("❌ [CHINESE_TEST] 中文编码测试打印失败: {}", e);
                Err(format!("中文编码测试打印失败: {}", e))
            }
        }
    } else {
        Err("打印机未找到".to_string())
    }
}

// 创建中文编码测试内容
fn create_chinese_test_content(width: i32) -> Result<Vec<u8>, String> {
    let char_width = if width == 80 { 48 } else { 32 };
    let mut content = Vec::new();

    // 添加ESC/POS头部命令
    content.extend_from_slice(&generate_userve_v320n_esc_pos_header());

    // 设置正常字体大小
    content.extend_from_slice(b"\x1D\x21\x00"); // 正常大小

    // 测试标题
    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");
    content.extend_from_slice(b"\x1B\x45\x01"); // 加粗
    content.extend_from_slice(&center_text_mixed_bytes("中文编码测试 CHINESE ENCODING TEST", char_width));
    content.extend_from_slice(b"\x1B\x45\x00"); // 关闭加粗
    content.extend_from_slice(b"\n");
    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n\n");

    // 基础中文字符测试
    content.extend_from_slice(&prepare_mixed_content_with_mode("基础中文字符测试:", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("你好世界 Hello World", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("中国菜单打印系统", "userve_v320n"));
    content.extend_from_slice(b"\n\n");

    // 餐饮专用字符测试
    content.extend_from_slice(&prepare_mixed_content_with_mode("餐饮专用字符测试:", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("宫保鸡丁 - $12.99", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("麻婆豆腐 - $10.50", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("红烧肉 - $18.88", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("酸辣汤 - $6.80", "userve_v320n"));
    content.extend_from_slice(b"\n\n");

    // 特殊符号测试
    content.extend_from_slice(&prepare_mixed_content_with_mode("特殊符号测试:", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("价格：￥128.00 (人民币符号)", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("温度：25℃ (摄氏度符号)", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("时间：12：30 (中文冒号)", "userve_v320n"));
    content.extend_from_slice(b"\n\n");

    // 中英文混合测试
    content.extend_from_slice(&prepare_mixed_content_with_mode("中英文混合测试:", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("Restaurant Name: 老王川菜馆", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("Order ID: 12345678", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("Customer: 张三 (Zhang San)", "userve_v320n"));
    content.extend_from_slice(b"\n\n");

    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("编码信息:", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("打印机型号: uServe V320N", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("编码方式: GBK/GB2312", "userve_v320n"));
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&prepare_mixed_content_with_mode("字符集: 中国国际字符集", "userve_v320n"));
    content.extend_from_slice(b"\n\n");

    let time_str = format_simple_time(&chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
    content.extend_from_slice(&prepare_mixed_content_with_mode(&format!("测试时间: {}", time_str), "userve_v320n"));
    content.extend_from_slice(b"\n\n");

    // 成功提示
    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&center_text_mixed_bytes("如果您能正确看到上述中文", char_width));
    content.extend_from_slice(&center_text_mixed_bytes("说明编码配置成功！", char_width));
    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n\n\n");

    // 切纸
    content.extend_from_slice(b"\x1D\x56\x00"); // GS V 0 - 切纸

    Ok(content)
}

// ============= 兼容性打印内容生成函数 =============

// 支持不同编码模式的打印内容生成函数
fn generate_print_content_with_encoding(order: &OrderData, width: i32, font_size: i32, encoding_mode: &str) -> Result<Vec<u8>, String> {
    // 根据纸张宽度设置字符数 (考虑中文字符占2个位置)
    let char_width = if width == 80 { 48 } else { 32 };

    let mut content = Vec::new();

    // 根据编码模式添加相应的ESC/POS头部命令
    content.extend_from_slice(&generate_esc_pos_header_with_mode(encoding_mode));

    // 设置字体大小
    match font_size {
        0 => content.extend_from_slice(b"\x1D\x21\x00"), // 正常大小
        1 => content.extend_from_slice(b"\x1D\x21\x01"), // 宽度2x，高度1x
        2 => content.extend_from_slice(b"\x1D\x21\x10"), // 宽度1x，高度2x
        _ => content.extend_from_slice(b"\x1D\x21\x00"), // 默认
    }

    // 设置行间距
    content.extend_from_slice(b"\x1B\x33\x30");

    // ============= 头部信息 =============
    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");
    content.extend_from_slice(b"\x1B\x45\x01"); // 加粗
    content.extend_from_slice(&center_text_mixed_bytes_with_mode(&order.rd_name.to_uppercase(), char_width, encoding_mode));
    content.extend_from_slice(b"\x1B\x45\x00"); // 关闭加粗
    content.extend_from_slice(b"\n");

    // 订单类型
    let order_type = get_order_type_text(order);
    content.extend_from_slice(b"\x1B\x45\x01"); // 加粗
    content.extend_from_slice(&center_text_mixed_bytes_with_mode(order_type, char_width, encoding_mode));
    content.extend_from_slice(b"\x1B\x45\x00"); // 关闭加粗
    content.extend_from_slice(b"\n");
    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n\n");

    // ============= 订单信息 =============
    content.extend_from_slice(b"\x1B\x45\x01"); // 加粗
    let order_line = format!("Order #: {}", order.order_id);
    content.extend_from_slice(&center_text_mixed_bytes_with_mode(&order_line, char_width, encoding_mode));
    content.extend_from_slice(b"\x1B\x45\x00"); // 关闭加粗
    content.extend_from_slice(b"\n");

    let serial = if order.serial_num > 0 {
        format!("#{:03}", order.serial_num)
    } else {
        format!("#{}", get_order_serial(order))
    };
    let serial_line = format!("Serial: {}", serial);
    content.extend_from_slice(&center_text_mixed_bytes_with_mode(&serial_line, char_width, encoding_mode));
    content.extend_from_slice(b"\n\n");

    // 基本信息表格
    content.extend_from_slice(&format_table_row_bytes_with_mode("Order Date:", &format_order_time(&order.create_time), char_width, encoding_mode));

    if order.delivery_style == 1 {
        content.extend_from_slice(&format_table_row_bytes_with_mode("Delivery Time:", &format_delivery_time(&order.delivery_time), char_width, encoding_mode));
        if !order.recipient_distance.is_empty() && order.recipient_distance != "0.00" {
            let distance_line = format!("{} miles", order.recipient_distance);
            content.extend_from_slice(&format_table_row_bytes_with_mode("Distance:", &distance_line, char_width, encoding_mode));
        }
    } else {
        content.extend_from_slice(&format_table_row_bytes_with_mode("Pickup Time:", &format_delivery_time(&order.delivery_time), char_width, encoding_mode));
    }

    content.extend_from_slice(&format_table_row_bytes_with_mode("Payment:", get_payment_method_text(order.paystyle), char_width, encoding_mode));
    content.extend_from_slice(&format_table_row_bytes_with_mode("Customer:", &order.recipient_name, char_width, encoding_mode));
    content.extend_from_slice(&format_table_row_bytes_with_mode("Phone:", &order.recipient_phone, char_width, encoding_mode));

    if !order.recipient_address.is_empty() && order.delivery_style == 1 {
        content.extend_from_slice(&format_table_row_bytes_with_mode("Address:", &order.recipient_address, char_width, encoding_mode));
    }

    content.extend_from_slice(b"\n");
    content.extend_from_slice("-".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");

    // ============= 商品明细 =============
    content.extend_from_slice(b"\x1B\x45\x01"); // 加粗
    content.extend_from_slice(&center_text_mixed_bytes_with_mode("ORDER ITEMS", char_width, encoding_mode));
    content.extend_from_slice(b"\x1B\x45\x00"); // 关闭加粗
    content.extend_from_slice(b"\n");
    content.extend_from_slice("-".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");

    let header = format_table_header_bytes_with_mode("Item Name", "Qty", "", "Total", char_width, encoding_mode);
    content.extend_from_slice(&header);
    content.extend_from_slice("-".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");

    for item in &order.dishes_array {
        let price: f64 = item.price.parse().unwrap_or(0.0);
        let unit_price: f64 = item.unit_price.parse().unwrap_or(0.0);

        content.extend_from_slice(&format_item_table_row_bytes_with_mode(
            &item.dishes_name,
            item.amount,
            unit_price,
            price,
            char_width,
            encoding_mode
        ));

        if !item.dishes_describe.is_empty() {
            content.extend_from_slice(b"  + ");
            content.extend_from_slice(&prepare_mixed_content_with_mode(&item.dishes_describe, encoding_mode));
            content.extend_from_slice(b"\n");
        }

        if !item.remark.is_empty() {
            content.extend_from_slice(b"  Note: ");
            content.extend_from_slice(&prepare_mixed_content_with_mode(&item.remark, encoding_mode));
            content.extend_from_slice(b"\n");
        }

        content.extend_from_slice(b"\n");
    }

    // ============= 费用明细 =============
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

    content.extend_from_slice("-".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");
    content.extend_from_slice(b"\x1B\x45\x01"); // 加粗
    content.extend_from_slice(&center_text_mixed_bytes_with_mode("PAYMENT SUMMARY", char_width, encoding_mode));
    content.extend_from_slice(b"\x1B\x45\x00"); // 关闭加粗
    content.extend_from_slice(b"\n");
    content.extend_from_slice("-".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");

    content.extend_from_slice(&format_fee_line_bytes_with_mode("Subtotal", sub_total, char_width, encoding_mode));

    if discount_total > 0.0 {
        content.extend_from_slice(&format_fee_line_bytes_with_mode("Discount", -discount_total, char_width, encoding_mode));
    }

    if exemption > 0.0 {
        content.extend_from_slice(&format_fee_line_bytes_with_mode("Exemption", -exemption, char_width, encoding_mode));
    }

    if tax_fee > 0.0 {
        let tax_label = if tax_rate > 0.0 {
            format!("Tax ({:.1}%)", tax_rate * 100.0)
        } else {
            "Tax".to_string()
        };
        content.extend_from_slice(&format_fee_line_bytes_with_mode(&tax_label, tax_fee, char_width, encoding_mode));
    }

    if delivery_fee > 0.0 {
        content.extend_from_slice(&format_fee_line_bytes_with_mode("Delivery Fee", delivery_fee, char_width, encoding_mode));
    }

    if retail_delivery_fee > 0.0 {
        content.extend_from_slice(&format_fee_line_bytes_with_mode("Retail Del. Fee", retail_delivery_fee, char_width, encoding_mode));
    }

    if convenience_fee > 0.0 {
        let conv_rate: f64 = order.convenience_rate.parse().unwrap_or(0.0);
        let conv_label = if conv_rate > 0.0 {
            format!("Service Fee ({:.1}%)", conv_rate * 100.0)
        } else {
            "Service Fee".to_string()
        };
        content.extend_from_slice(&format_fee_line_bytes_with_mode(&conv_label, convenience_fee, char_width, encoding_mode));
    }

    if tip_fee > 0.0 {
        content.extend_from_slice(&format_fee_line_bytes_with_mode("Tip", tip_fee, char_width, encoding_mode));
    }

    // 总计
    content.extend_from_slice("-".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");
    content.extend_from_slice(b"\x1B\x45\x01"); // 加粗
    content.extend_from_slice(&format_fee_line_bytes_with_mode("TOTAL", total, char_width, encoding_mode));
    content.extend_from_slice(b"\x1B\x45\x00"); // 关闭加粗
    content.extend_from_slice(b"\n");

    // ============= 订单备注 =============
    if !order.order_notes.is_empty() {
        content.extend_from_slice(b"\n");
        content.extend_from_slice("-".repeat(char_width).as_bytes());
        content.extend_from_slice(b"\n");
        content.extend_from_slice(b"\x1B\x45\x01"); // 加粗
        content.extend_from_slice(&center_text_mixed_bytes_with_mode("ORDER NOTES", char_width, encoding_mode));
        content.extend_from_slice(b"\x1B\x45\x00"); // 关闭加粗
        content.extend_from_slice(b"\n");
        content.extend_from_slice("-".repeat(char_width).as_bytes());
        content.extend_from_slice(b"\n");

        content.extend_from_slice(&prepare_mixed_content_with_mode(&order.order_notes, encoding_mode));
        content.extend_from_slice(b"\n");
    }

    // ============= 底部信息 =============
    content.extend_from_slice(b"\n");
    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");
    content.extend_from_slice(&center_text_mixed_bytes_with_mode("Thank you for your order!", char_width, encoding_mode));
    content.extend_from_slice(b"\n");
    let time_line = format!("Order Time: {}", format_simple_time(&order.create_time));
    content.extend_from_slice(&center_text_mixed_bytes_with_mode(&time_line, char_width, encoding_mode));
    content.extend_from_slice(b"\n\n\n\n");

    // 切纸命令
    content.extend_from_slice(b"\x1D\x56\x00");

    Ok(content)
}

// ============= 兼容性辅助函数 =============

// 智能中文内容处理函数 - 根据编码模式和内容类型选择最佳编码
fn prepare_chinese_content_with_mode(text: &str, encoding_mode: &str) -> Vec<u8> {
    let has_chinese = text.chars().any(|c| {
        let code = c as u32;
        (code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x3000 && code <= 0x303F) ||
        (code >= 0xFF00 && code <= 0xFFEF)
    });

    if has_chinese {
        encode_chinese_text_with_mode(text, encoding_mode)
    } else {
        text.as_bytes().to_vec()
    }
}

// 混合内容处理函数
fn prepare_mixed_content_with_mode(text: &str, encoding_mode: &str) -> Vec<u8> {
    let cleaned_text: String = text.chars()
        .filter(|c| !c.is_control() || matches!(*c, '\n' | '\r' | '\t'))
        .collect();

    prepare_chinese_content_with_mode(&cleaned_text, encoding_mode)
}

// ============= 兼容性ESC/POS头部生成函数 =============

// 传统ESC/POS头部
fn generate_legacy_esc_pos_header() -> Vec<u8> {
    let mut commands = Vec::new();
    commands.extend_from_slice(b"\x1B@"); // ESC @ - 初始化打印机
    commands
}

// uServe V320N专用ESC/POS头部
fn generate_userve_v320n_esc_pos_header() -> Vec<u8> {
    let mut commands = Vec::new();

    // 基础初始化
    commands.extend_from_slice(b"\x1B@"); // ESC @ - 初始化打印机

    // 字符集和编码设置 - 针对中文显示问题的关键修复
    commands.extend_from_slice(b"\x1B\x52\x0F"); // ESC R 15 - 设置国际字符集为中国
    commands.extend_from_slice(b"\x1B\x74\x00"); // ESC t 0 - 设置字符代码页为CP437

    // 汉字模式设置
    commands.extend_from_slice(b"\x1C\x26");     // FS & - 选择汉字模式
    commands.extend_from_slice(b"\x1C\x43\x01"); // FS C 1 - 选择汉字字符模式 (GB2312/GBK)

    // 汉字字符属性设置
    commands.extend_from_slice(b"\x1C\x2E");     // FS . - 取消汉字下划线模式
    commands.extend_from_slice(b"\x1C\x57\x00"); // FS W 0 - 设置汉字字符宽度为正常
    commands.extend_from_slice(b"\x1C\x53\x00\x00"); // FS S - 设置汉字左右间距为0

    // 打印机特定设置
    commands.extend_from_slice(b"\x1B\x61\x00");     // ESC a 0 - 左对齐
    commands.extend_from_slice(b"\x1D\x7C\x00"); // GS | - 设置打印密度为正常

    // 启用汉字打印 - 关键命令
    commands.extend_from_slice(b"\x1B\x39\x01"); // ESC 9 1 - 启用汉字打印

    // 额外的中文支持命令
    commands.extend_from_slice(b"\x1C\x21\x00"); // FS ! 0 - 设置汉字字符模式为正常
    commands.extend_from_slice(b"\x1C\x24\x00\x00"); // FS $ - 设置汉字绝对位置

    // 字符间距设置
    commands.extend_from_slice(b"\x1B\x20\x00"); // ESC SP 0 - 设置字符右间距为0

    // 行间距设置
    commands.extend_from_slice(b"\x1B\x33\x00"); // ESC 3 0 - 设置行间距为0

    commands
}

// 标准ESC/POS头部
fn generate_standard_esc_pos_header() -> Vec<u8> {
    let mut commands = Vec::new();
    commands.extend_from_slice(b"\x1B@"); // ESC @ - 初始化打印机
    commands.extend_from_slice(b"\x1B\x74\x01"); // ESC t 1 - 设置字符代码页
    commands.extend_from_slice(b"\x1C\x26");     // FS & - 选择汉字模式
    commands
}

// 主ESC/POS头部生成函数
fn generate_esc_pos_header_with_mode(encoding_mode: &str) -> Vec<u8> {
    match encoding_mode {
        "legacy" => generate_legacy_esc_pos_header(),
        "userve_v320n" => generate_userve_v320n_esc_pos_header(),
        "standard" => generate_standard_esc_pos_header(),
        "auto" | _ => generate_legacy_esc_pos_header(),
    }
}

// ============= 兼容性字节处理函数 =============

// 根据编码模式处理文本的字节版本
fn center_text_mixed_bytes_with_mode(text: &str, width: usize, encoding_mode: &str) -> Vec<u8> {
    let display_len = display_width(text);
    if display_len >= width {
        return prepare_mixed_content_with_mode(text, encoding_mode);
    }

    let padding = (width - display_len) / 2;
    let mut result = " ".repeat(padding).into_bytes();
    result.extend_from_slice(&prepare_mixed_content_with_mode(text, encoding_mode));
    result.extend_from_slice(b"\n");
    result
}

fn format_table_row_bytes_with_mode(label: &str, value: &str, width: usize, encoding_mode: &str) -> Vec<u8> {
    let label_bytes = prepare_mixed_content_with_mode(label, encoding_mode);
    let value_bytes = prepare_mixed_content_with_mode(value, encoding_mode);

    let label_width = display_width(label);
    let value_width = display_width(value);

    if label_width + value_width + 2 <= width {
        let padding = width - label_width - value_width;
        let mut result = label_bytes;
        result.extend_from_slice(" ".repeat(padding).as_bytes());
        result.extend_from_slice(&value_bytes);
        result.extend_from_slice(b"\n");
        result
    } else {
        let mut result = label_bytes;
        result.extend_from_slice(b"\n");
        result.extend_from_slice(&value_bytes);
        result.extend_from_slice(b"\n");
        result
    }
}

fn format_table_header_bytes_with_mode(name: &str, qty: &str, _price: &str, total: &str, width: usize, encoding_mode: &str) -> Vec<u8> {
    let name_width = width * 60 / 100;
    let qty_width = 6;
    let total_width = width - name_width - qty_width - 2;

    let mut result = Vec::new();

    let name_bytes = prepare_mixed_content_with_mode(name, encoding_mode);
    result.extend_from_slice(&name_bytes);
    let name_display_width = display_width(name);
    if name_display_width < name_width {
        result.extend_from_slice(" ".repeat(name_width - name_display_width).as_bytes());
    }

    let qty_bytes = prepare_mixed_content_with_mode(qty, encoding_mode);
    let qty_display_width = display_width(qty);
    let qty_padding = (qty_width - qty_display_width) / 2;
    result.extend_from_slice(" ".repeat(qty_padding).as_bytes());
    result.extend_from_slice(&qty_bytes);
    result.extend_from_slice(" ".repeat(qty_width - qty_display_width - qty_padding).as_bytes());

    let total_bytes = prepare_mixed_content_with_mode(total, encoding_mode);
    let total_display_width = display_width(total);
    if total_display_width < total_width {
        result.extend_from_slice(" ".repeat(total_width - total_display_width).as_bytes());
    }
    result.extend_from_slice(&total_bytes);
    result.extend_from_slice(b"\n");

    result
}

fn format_item_table_row_bytes_with_mode(name: &str, qty: i32, _unit_price: f64, total_price: f64, width: usize, encoding_mode: &str) -> Vec<u8> {
    let name_width = width * 75 / 100;
    let qty_width = 4;
    let total_width = width - name_width - qty_width - 2;

    let mut result = Vec::new();

    let name_display_width = display_width(name);
    if name_display_width <= name_width {
        let name_bytes = prepare_mixed_content_with_mode(name, encoding_mode);
        result.extend_from_slice(&name_bytes);
        result.extend_from_slice(" ".repeat(name_width - name_display_width).as_bytes());

        let qty_str = qty.to_string();
        let qty_bytes = prepare_mixed_content_with_mode(&qty_str, encoding_mode);
        let qty_display_width = display_width(&qty_str);
        let qty_padding = (qty_width - qty_display_width) / 2;
        result.extend_from_slice(" ".repeat(qty_padding).as_bytes());
        result.extend_from_slice(&qty_bytes);
        result.extend_from_slice(" ".repeat(qty_width - qty_display_width - qty_padding).as_bytes());

        let total_str = format!("{:.2}", total_price);
        let total_bytes = prepare_mixed_content_with_mode(&total_str, encoding_mode);
        let total_display_width = display_width(&total_str);
        if total_display_width < total_width {
            result.extend_from_slice(" ".repeat(total_width - total_display_width).as_bytes());
        }
        result.extend_from_slice(&total_bytes);
        result.extend_from_slice(b"\n");
    } else {
        let lines = smart_wrap_text(name, name_width);

        for (i, line) in lines.iter().enumerate() {
            if i == 0 {
                let line_bytes = prepare_mixed_content_with_mode(line, encoding_mode);
                result.extend_from_slice(&line_bytes);
                let line_display_width = display_width(line);
                result.extend_from_slice(" ".repeat(name_width - line_display_width).as_bytes());

                let qty_str = qty.to_string();
                let qty_bytes = prepare_mixed_content_with_mode(&qty_str, encoding_mode);
                let qty_display_width = display_width(&qty_str);
                let qty_padding = (qty_width - qty_display_width) / 2;
                result.extend_from_slice(" ".repeat(qty_padding).as_bytes());
                result.extend_from_slice(&qty_bytes);
                result.extend_from_slice(" ".repeat(qty_width - qty_display_width - qty_padding).as_bytes());

                let total_str = format!("{:.2}", total_price);
                let total_bytes = prepare_mixed_content_with_mode(&total_str, encoding_mode);
                let total_display_width = display_width(&total_str);
                if total_display_width < total_width {
                    result.extend_from_slice(" ".repeat(total_width - total_display_width).as_bytes());
                }
                result.extend_from_slice(&total_bytes);
                result.extend_from_slice(b"\n");
            } else {
                result.extend_from_slice(b"  ");
                let line_bytes = prepare_mixed_content_with_mode(line, encoding_mode);
                result.extend_from_slice(&line_bytes);
                result.extend_from_slice(b"\n");
            }
        }
    }

    result
}


fn main() {
    // 初始化日志系统
    if let Err(e) = init_logger() {
        eprintln!("❌ 初始化日志系统失败: {}", e);
        // 即使日志初始化失败也继续运行程序
    }

    info!("🚀 开始启动 Tauri 应用程序");

    // Windows 7 兼容性检查
    if let Err(e) = init_windows7_compatibility() {
        error!("❌ Windows兼容性检查失败: {}", e);
        std::process::exit(1);
    }

    info!("✅ 系统兼容性检查通过");

    // 创建系统托盘菜单
    let show = CustomMenuItem::new("show".to_string(), "显示主窗口");
    let hide = CustomMenuItem::new("hide".to_string(), "最小化到托盘");
    let quit = CustomMenuItem::new("quit".to_string(), "退出程序");

    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(hide)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    let system_tray = SystemTray::new()
        .with_menu(tray_menu)
        .with_tooltip("Order Print Client - 订单打印客户端");

    tauri::Builder::default()
        .manage(AppState {
            is_connected: Arc::new(Mutex::new(false)),
            user_token: Arc::new(Mutex::new(None)),
            user_id: Arc::new(Mutex::new(None)),
            printers: Arc::new(Mutex::new(Vec::new())),
            global_font_size: Arc::new(Mutex::new(0)),
            custom_encoding: Arc::new(Mutex::new(None)),
            encoding_override: Arc::new(Mutex::new(false)),
        })
        .invoke_handler(tauri::generate_handler![
            login,
            get_printers,
            set_printer_config,
            get_connection_status,
            test_print,
            toggle_printer,
            manual_print_order,
            get_print_preview,
            get_order_detail,
            get_order_list,
            debug_printer,
            get_log_content,
            get_log_info,
            clear_logs,
            open_log_folder,
            test_frontend_call,
            get_global_font_size,
            set_global_font_size,
            show_main_window,
            hide_main_window,
            quit_application,
            toggle_window_visibility,
            test_chinese_encoding,
            set_custom_encoding,
            get_custom_encoding,
            test_custom_encoding,
            test_all_encodings
        ])
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| {
            match event {
                SystemTrayEvent::LeftClick {
                    position: _,
                    size: _,
                    ..
                } => {
                    info!("🖱️ [TRAY] 托盘图标被左键点击");
                    // 左键点击切换窗口显示/隐藏
                    if let Some(window) = app.get_window("main") {
                        match window.is_visible() {
                            Ok(true) => {
                                if let Err(e) = window.hide() {
                                    error!("❌ [TRAY] 隐藏窗口失败: {}", e);
                                }
                            }
                            Ok(false) => {
                                if let Err(e) = window.show() {
                                    error!("❌ [TRAY] 显示窗口失败: {}", e);
                                } else if let Err(e) = window.set_focus() {
                                    warn!("⚠️ [TRAY] 设置窗口焦点失败: {}", e);
                                }
                            }
                            Err(e) => {
                                error!("❌ [TRAY] 检查窗口可见性失败: {}", e);
                            }
                        }
                    }
                }
                SystemTrayEvent::RightClick {
                    position: _,
                    size: _,
                    ..
                } => {
                    info!("🖱️ [TRAY] 托盘图标被右键点击，显示菜单");
                }
                SystemTrayEvent::DoubleClick {
                    position: _,
                    size: _,
                    ..
                } => {
                    info!("🖱️ [TRAY] 托盘图标被双击");
                    // 双击显示窗口
                    if let Some(window) = app.get_window("main") {
                        if let Err(e) = window.show() {
                            error!("❌ [TRAY] 显示窗口失败: {}", e);
                        } else if let Err(e) = window.set_focus() {
                            warn!("⚠️ [TRAY] 设置窗口焦点失败: {}", e);
                        }
                    }
                }
                SystemTrayEvent::MenuItemClick { id, .. } => {
                    info!("📋 [TRAY] 托盘菜单项被点击: {}", id);
                    match id.as_str() {
                        "show" => {
                            if let Some(window) = app.get_window("main") {
                                if let Err(e) = window.show() {
                                    error!("❌ [TRAY] 显示窗口失败: {}", e);
                                } else if let Err(e) = window.set_focus() {
                                    warn!("⚠️ [TRAY] 设置窗口焦点失败: {}", e);
                                }
                            }
                        }
                        "hide" => {
                            if let Some(window) = app.get_window("main") {
                                if let Err(e) = window.hide() {
                                    error!("❌ [TRAY] 隐藏窗口失败: {}", e);
                                }
                            }
                        }
                        "quit" => {
                            info!("🚪 [TRAY] 用户选择退出程序");
                            app.exit(0);
                        }
                        _ => {}
                    }
                }
                _ => {}
            }
        })
        .on_window_event(|event| {
            match event.event() {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // 阻止窗口关闭，改为隐藏到托盘
                    event.window().hide().unwrap();
                    api.prevent_close();
                    info!("🔄 [TRAY] 窗口关闭被拦截，已最小化到托盘");
                }
                _ => {}
            }
        })
        .setup(|_app| {
            info!("🎯 Tauri应用程序设置完成");
            info!("📌 [TRAY] 系统托盘已启用");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// 新增：设置自定义编码
#[tauri::command]
async fn set_custom_encoding(
    encoding: Option<String>,
    override_enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut custom_encoding = state.custom_encoding.lock().unwrap();
        *custom_encoding = encoding;
    }
    {
        let mut encoding_override = state.encoding_override.lock().unwrap();
        *encoding_override = override_enabled;
    }

    println!("Custom encoding set: {:?}, override: {}",
             state.custom_encoding.lock().unwrap(),
             *state.encoding_override.lock().unwrap());

    Ok(())
}

// 新增：获取自定义编码设置
#[tauri::command]
async fn get_custom_encoding(state: State<'_, AppState>) -> Result<(Option<String>, bool), String> {
    let custom_encoding = state.custom_encoding.lock().unwrap().clone();
    let encoding_override = *state.encoding_override.lock().unwrap();

    Ok((custom_encoding, encoding_override))
}

// 新增：测试自定义编码打印
#[tauri::command]
async fn test_custom_encoding(
    encoding: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let printers = state.printers.lock().unwrap().clone();

    // 优先使用启用的打印机，如果没有则使用所有打印机
    let mut test_printers: Vec<_> = printers.iter().filter(|p| p.is_enabled).collect();
    if test_printers.is_empty() {
        test_printers = printers.iter().collect();
    }

    if test_printers.is_empty() {
        return Err("No printers found. Please add printers first.".to_string());
    }

    let mut results = Vec::new();

    for printer in test_printers {
        // 创建测试订单数据
        let test_order = OrderData {
            order_id: "TEST-ENCODING".to_string(),
            rd_id: 1,
            user_id: "test".to_string(),
            order_status: 1,
            paystyle: 1,
            delivery_style: 1,
            delivery_type: 1,
            doordash_id: "".to_string(),
            recipient_name: "测试客户".to_string(),
            recipient_address: "测试地址".to_string(),
            recipient_phone: "1234567890".to_string(),
            recipient_distance: "".to_string(),
            rd_name: "测试餐厅".to_string(),
            rd_address: "餐厅地址".to_string(),
            rd_phone: "0987654321".to_string(),
            dishes_count: 1,
            dishes_id_list: "".to_string(),
            dishes_array: vec![DishItem {
                dishes_id: 1,
                dishes_name: "测试菜品".to_string(),
                amount: 1,
                price: "10.00".to_string(),
                unit_price: "10.00".to_string(),
                remark: "".to_string(),
                dishes_describe: "".to_string(),
                dishes_series_id: 0,
                image_url: "".to_string(),
                dishes_specs_id: serde_json::Value::Null,
            }],
            discount_total: "0.00".to_string(),
            exemption: "0.00".to_string(),
            sub_total: "10.00".to_string(),
            user_commission: "0.00".to_string(),
            tax_rate: "0.00".to_string(),
            tax_fee: "0.00".to_string(),
            delivery_fee: "0.00".to_string(),
            convenience_rate: "0.00".to_string(),
            convenience_fee: "0.00".to_string(),
            retail_delivery_fee: "0.00".to_string(),
            tip_fee: "0.00".to_string(),
            total: "10.00".to_string(),
            cloud_print: 0,
            order_notes: "编码测试".to_string(),
            serial_num: 1,
            order_pdf_url: "".to_string(),
            user_email: "".to_string(),
            create_time: "2024-01-01 12:00:00".to_string(),
            delivery_time: "2024-01-01 12:30:00".to_string(),
        };

        // 使用指定编码生成打印内容
        match generate_print_content_with_encoding(&test_order, printer.width, printer.font_size, &encoding) {
            Ok(content) => {
                match print_to_printer(&printer.name, &content).await {
                    Ok(_) => {
                        results.push(format!("✓ {} - 编码 {} 测试成功", printer.name, encoding));
                    }
                    Err(e) => {
                        results.push(format!("✗ {} - 打印失败: {}", printer.name, e));
                    }
                }
            }
            Err(e) => {
                results.push(format!("✗ {} - 内容生成失败: {}", printer.name, e));
            }
        }
    }

    Ok(results.join("\n"))
}

// 新增：测试所有编码打印
#[tauri::command]
async fn test_all_encodings(state: State<'_, AppState>) -> Result<String, String> {
    println!("🧪 开始测试所有编码");

    // 获取启用的打印机
    let printers = state.printers.lock().unwrap().clone();
    let enabled_printers: Vec<_> = printers.iter().filter(|p| p.is_enabled).collect();

    if enabled_printers.is_empty() {
        return Err("没有启用的打印机".to_string());
    }

    let mut all_results = Vec::new();

    for printer in enabled_printers {
        println!("📄 向打印机 {} 发送所有编码测试", printer.name);

        // 创建紧凑的测试内容，包含所有编码
        let test_content = create_all_encodings_test_content(printer.width)?;

        // 发送到打印机
        match print_to_printer_enhanced(&printer.name, &test_content).await {
            Ok(_) => {
                let msg = format!("✅ {} - 所有编码测试已发送", printer.name);
                println!("{}", msg);
                all_results.push(msg);
            }
            Err(e) => {
                let msg = format!("❌ {} - 所有编码测试失败: {}", printer.name, e);
                println!("{}", msg);
                all_results.push(msg);
            }
        }
    }

    Ok(all_results.join("\n"))
}

// 创建所有编码测试内容
fn create_all_encodings_test_content(width: i32) -> Result<Vec<u8>, String> {
    let mut content = Vec::new();
    let char_width = if width == 58 { 32 } else { 48 };

    // 定义要测试的所有编码列表（与HTML选择器中的选项完全对应）
    let test_encodings = vec![
        // 基础编码
        ("Auto", "auto"),
        ("Legacy", "legacy"),
        ("uServe V320N", "userve_v320n"),
        ("Standard", "standard"),
        ("GBK", "gbk"),
        ("GB2312", "gb2312"),
        ("GB18030", "gb18030"),
        ("UTF-8", "utf8"),
        ("Big5", "big5"),
        ("CP936", "cp936"),
        ("ISO-8859-1", "iso8859-1"),

        // US Common Encodings
        ("ASCII", "ascii"),
        ("CP437", "cp437"),
        ("CP850", "cp850"),
        ("CP1252", "cp1252"),

        // ISO-8859 系列 (15个)
        ("ISO-8859-2", "iso8859-2"),
        ("ISO-8859-3", "iso8859-3"),
        ("ISO-8859-4", "iso8859-4"),
        ("ISO-8859-5", "iso8859-5"),
        ("ISO-8859-6", "iso8859-6"),
        ("ISO-8859-7", "iso8859-7"),
        ("ISO-8859-8", "iso8859-8"),
        ("ISO-8859-9", "iso8859-9"),
        ("ISO-8859-10", "iso8859-10"),
        ("ISO-8859-11", "iso8859-11"),
        ("ISO-8859-13", "iso8859-13"),
        ("ISO-8859-14", "iso8859-14"),
        ("ISO-8859-15", "iso8859-15"),
        ("ISO-8859-16", "iso8859-16"),

        // Windows 代码页系列 (8个)
        ("CP1250", "cp1250"),
        ("CP1251", "cp1251"),
        ("CP1253", "cp1253"),
        ("CP1254", "cp1254"),
        ("CP1255", "cp1255"),
        ("CP1256", "cp1256"),
        ("CP1257", "cp1257"),
        ("CP1258", "cp1258"),

        // 美国打印机专用代码页 (9个)
        ("CP866", "cp866"),
        ("CP852", "cp852"),
        ("CP860", "cp860"),
        ("CP861", "cp861"),
        ("CP862", "cp862"),
        ("CP863", "cp863"),
        ("CP864", "cp864"),
        ("CP865", "cp865"),
        ("CP869", "cp869"),

        // UTF 变体 (4个)
        ("UTF-16", "utf16"),
        ("UTF-16LE", "utf16le"),
        ("UTF-16BE", "utf16be"),
        ("UTF-32", "utf32"),

        // Mac/Apple 编码 (3个)
        ("Macintosh", "macintosh"),
        ("Mac Latin 2", "maclatin2"),
        ("Mac Cyrillic", "maccyrillic"),

        // 亚洲语言编码 (8个)
        ("Shift_JIS", "shift_jis"),
        ("EUC-JP", "euc_jp"),
        ("ISO-2022-JP", "iso2022jp"),
        ("EUC-KR", "euc_kr"),
        ("CP949", "cp949"),
        ("KOI8-R", "koi8_r"),
        ("KOI8-U", "koi8_u"),
        ("TIS-620", "tis620"),
    ];

    // ESC/POS 初始化
    content.extend_from_slice(b"\x1B\x40"); // 初始化打印机
    content.extend_from_slice(b"\x1B\x61\x01"); // 居中对齐

    // 标题
    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");
    content.extend_from_slice(b"ALL ENCODINGS TEST / \xB1\xE0\xC2\xEB\xB2\xE2\xCA\xD4\n"); // 编码测试
    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n\n");

    // 左对齐
    content.extend_from_slice(b"\x1B\x61\x00");

    // 测试每种编码 - 使用紧凑格式
    for (display_name, encoding_code) in test_encodings {
        // 编码名称和测试文本在同一行，格式：编码名-测试
        let test_line = format!("{}-Test: Hello World! 你好世界! $123.45", display_name);
        let encoded_text = encode_chinese_text_with_mode(&test_line, encoding_code);
        content.extend_from_slice(&encoded_text);
        content.extend_from_slice(b"\n");
    }

    // 结束信息
    content.extend_from_slice(b"\n");
    content.extend_from_slice(b"\x1B\x61\x01"); // 居中对齐
    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n");
    content.extend_from_slice("Test Complete - 56 Encodings".as_bytes());
    content.extend_from_slice(b"\n");
    content.extend_from_slice("=".repeat(char_width).as_bytes());
    content.extend_from_slice(b"\n\n\n");

    // 切纸
    content.extend_from_slice(b"\x1D\x56\x00");

    Ok(content)
}

// ============= 新增编码函数 - 美国和国际常用编码 =============

// US Common Encodings
fn encode_text_ascii(text: &str) -> Vec<u8> {
    // ASCII编码 - 只保留7位ASCII字符
    text.chars()
        .map(|c| if c.is_ascii() { c as u8 } else { b'?' })
        .collect()
}

fn encode_text_cp437(text: &str) -> Vec<u8> {
    // CP437 (OEM-US) - 美国原始IBM PC字符集
    match encoding_rs::WINDOWS_1252.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP437编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp850(text: &str) -> Vec<u8> {
    // CP850 (DOS Latin-1) - 多语言DOS代码页
    match encoding_rs::WINDOWS_1252.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP850编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp1252(text: &str) -> Vec<u8> {
    // CP1252 (Windows-1252) - 西欧Windows字符集
    match encoding_rs::WINDOWS_1252.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP1252编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

// ISO-8859 系列编码
fn encode_text_iso8859_2(text: &str) -> Vec<u8> {
    // ISO-8859-2 (Latin-2) - 中欧字符集
    match encoding_rs::ISO_8859_2.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-2编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_iso8859_3(text: &str) -> Vec<u8> {
    // ISO-8859-3 (Latin-3) - 南欧字符集
    match encoding_rs::ISO_8859_3.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-3编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_iso8859_4(text: &str) -> Vec<u8> {
    // ISO-8859-4 (Latin-4) - 北欧字符集
    match encoding_rs::ISO_8859_4.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-4编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_iso8859_5(text: &str) -> Vec<u8> {
    // ISO-8859-5 (Cyrillic) - 西里尔字符集
    match encoding_rs::ISO_8859_5.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-5编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_iso8859_6(text: &str) -> Vec<u8> {
    // ISO-8859-6 (Arabic) - 阿拉伯字符集
    match encoding_rs::ISO_8859_6.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-6编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_iso8859_7(text: &str) -> Vec<u8> {
    // ISO-8859-7 (Greek) - 希腊字符集
    match encoding_rs::ISO_8859_7.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-7编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_iso8859_8(text: &str) -> Vec<u8> {
    // ISO-8859-8 (Hebrew) - 希伯来字符集
    match encoding_rs::ISO_8859_8.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-8编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_iso8859_9(text: &str) -> Vec<u8> {
    // ISO-8859-9 (Turkish) - 土耳其字符集
    match encoding_rs::WINDOWS_1254.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-9编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_iso8859_10(text: &str) -> Vec<u8> {
    // ISO-8859-10 (Nordic) - 北欧字符集
    match encoding_rs::ISO_8859_4.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-10编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_iso8859_11(text: &str) -> Vec<u8> {
    // ISO-8859-11 (Thai) - 泰语字符集
    match encoding_rs::WINDOWS_874.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-11编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_iso8859_13(text: &str) -> Vec<u8> {
    // ISO-8859-13 (Baltic) - 波罗的海字符集
    match encoding_rs::WINDOWS_1257.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-13编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_iso8859_14(text: &str) -> Vec<u8> {
    // ISO-8859-14 (Celtic) - 凯尔特字符集
    match encoding_rs::WINDOWS_1252.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-14编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_iso8859_15(text: &str) -> Vec<u8> {
    // ISO-8859-15 (Latin-9) - 西欧字符集（包含欧元符号）
    match encoding_rs::ISO_8859_15.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-15编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_iso8859_16(text: &str) -> Vec<u8> {
    // ISO-8859-16 (Latin-10) - 东南欧字符集
    match encoding_rs::ISO_8859_16.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-8859-16编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

// Windows 代码页系列
fn encode_text_cp1250(text: &str) -> Vec<u8> {
    // CP1250 (Windows-1250) - 中欧字符集
    match encoding_rs::WINDOWS_1250.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP1250编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp1251(text: &str) -> Vec<u8> {
    // CP1251 (Windows-1251) - 西里尔字符集
    match encoding_rs::WINDOWS_1251.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP1251编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp1253(text: &str) -> Vec<u8> {
    // CP1253 (Windows-1253) - 希腊字符集
    match encoding_rs::WINDOWS_1253.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP1253编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp1254(text: &str) -> Vec<u8> {
    // CP1254 (Windows-1254) - 土耳其字符集
    match encoding_rs::WINDOWS_1254.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP1254编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp1255(text: &str) -> Vec<u8> {
    // CP1255 (Windows-1255) - 希伯来字符集
    match encoding_rs::WINDOWS_1255.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP1255编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp1256(text: &str) -> Vec<u8> {
    // CP1256 (Windows-1256) - 阿拉伯字符集
    match encoding_rs::WINDOWS_1256.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP1256编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp1257(text: &str) -> Vec<u8> {
    // CP1257 (Windows-1257) - 波罗的海字符集
    match encoding_rs::WINDOWS_1257.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP1257编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp1258(text: &str) -> Vec<u8> {
    // CP1258 (Windows-1258) - 越南语字符集
    match encoding_rs::WINDOWS_1258.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP1258编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

// 美国打印机专用代码页
fn encode_text_cp866(text: &str) -> Vec<u8> {
    // CP866 (DOS Cyrillic) - DOS西里尔字符集
    match encoding_rs::IBM866.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP866编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp852(text: &str) -> Vec<u8> {
    // CP852 (DOS Latin-2) - DOS中欧字符集
    match encoding_rs::IBM866.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP852编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp860(text: &str) -> Vec<u8> {
    // CP860 (DOS Portuguese) - DOS葡萄牙语字符集
    match encoding_rs::WINDOWS_1252.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP860编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp861(text: &str) -> Vec<u8> {
    // CP861 (DOS Icelandic) - DOS冰岛语字符集
    match encoding_rs::WINDOWS_1252.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP861编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp862(text: &str) -> Vec<u8> {
    // CP862 (DOS Hebrew) - DOS希伯来语字符集
    match encoding_rs::WINDOWS_1255.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP862编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp863(text: &str) -> Vec<u8> {
    // CP863 (DOS French Canada) - DOS加拿大法语字符集
    match encoding_rs::WINDOWS_1252.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP863编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp864(text: &str) -> Vec<u8> {
    // CP864 (DOS Arabic) - DOS阿拉伯语字符集
    match encoding_rs::WINDOWS_1256.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP864编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp865(text: &str) -> Vec<u8> {
    // CP865 (DOS Nordic) - DOS北欧字符集
    match encoding_rs::WINDOWS_1252.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP865编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp869(text: &str) -> Vec<u8> {
    // CP869 (DOS Greek) - DOS希腊语字符集
    match encoding_rs::WINDOWS_1253.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP869编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

// UTF 变体
fn encode_text_utf16(text: &str) -> Vec<u8> {
    // UTF-16编码（默认小端序）
    match encoding_rs::UTF_16LE.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ UTF-16编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_utf16le(text: &str) -> Vec<u8> {
    // UTF-16LE编码（小端序）
    match encoding_rs::UTF_16LE.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ UTF-16LE编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_utf16be(text: &str) -> Vec<u8> {
    // UTF-16BE编码（大端序）
    match encoding_rs::UTF_16BE.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ UTF-16BE编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_utf32(text: &str) -> Vec<u8> {
    // UTF-32编码（每个字符4字节）
    let mut result = Vec::new();
    for ch in text.chars() {
        let code_point = ch as u32;
        result.extend_from_slice(&code_point.to_le_bytes());
    }
    result
}

// Mac/Apple 编码
fn encode_text_macintosh(text: &str) -> Vec<u8> {
    // Macintosh (Mac Roman) 编码
    match encoding_rs::MACINTOSH.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ Macintosh编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_maclatin2(text: &str) -> Vec<u8> {
    // Mac Latin 2 编码
    match encoding_rs::WINDOWS_1250.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ Mac Latin 2编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_maccyrillic(text: &str) -> Vec<u8> {
    // Mac Cyrillic 编码
    match encoding_rs::WINDOWS_1251.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ Mac Cyrillic编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

// 日语编码
fn encode_text_shift_jis(text: &str) -> Vec<u8> {
    // Shift_JIS编码
    match encoding_rs::SHIFT_JIS.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ Shift_JIS编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_euc_jp(text: &str) -> Vec<u8> {
    // EUC-JP编码
    match encoding_rs::EUC_JP.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ EUC-JP编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_iso2022jp(text: &str) -> Vec<u8> {
    // ISO-2022-JP编码
    match encoding_rs::ISO_2022_JP.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ ISO-2022-JP编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

// 韩语编码
fn encode_text_euc_kr(text: &str) -> Vec<u8> {
    // EUC-KR编码
    match encoding_rs::EUC_KR.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ EUC-KR编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_cp949(text: &str) -> Vec<u8> {
    // CP949 (Unified Hangul Code) 编码
    match encoding_rs::EUC_KR.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ CP949编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

// 其他常用编码
fn encode_text_koi8_r(text: &str) -> Vec<u8> {
    // KOI8-R (Russian) 编码
    match encoding_rs::KOI8_R.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ KOI8-R编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_koi8_u(text: &str) -> Vec<u8> {
    // KOI8-U (Ukrainian) 编码
    match encoding_rs::KOI8_U.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ KOI8-U编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}

fn encode_text_tis620(text: &str) -> Vec<u8> {
    // TIS-620 (Thai) 编码
    match encoding_rs::WINDOWS_874.encode(text) {
        (encoded, _, false) => encoded.into_owned(),
        (encoded, _, true) => {
            println!("⚠️ TIS-620编码时有字符无法编码，使用替换字符");
            encoded.into_owned()
        }
    }
}