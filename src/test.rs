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







fn generate_print_content(order: &OrderData, width: i32, font_size: i32) -> Result<String, String> {
    let mut content = String::new();

    // ESC/POS 初始化命令
    content.push_str("\x1B@"); // 初始化打印机

    // 设置字体大小
    match font_size {
        0 => content.push_str("\x1D\x21\x00"), // 正常大小
        1 => content.push_str("\x1D\x21\x10"), // 宽度1x，高度2x
        2 => content.push_str("\x1D\x21\x11"), // 宽度2x，高度2x
        _ => content.push_str("\x1D\x21\x00"), // 默认为正常大小
    }

    // 设置行间距
    content.push_str("\x1B\x33\x20"); // 设置行间距

    let char_width = if width == 80 { 48 } else { 32 }; // 字符宽度

    // ============= 餐厅信息 =============
    content.push_str(&"=".repeat(char_width));
    content.push_str("\n");
    content.push_str("\x1B\x45\x01"); // 加粗
    content.push_str(&center_text_mixed(&order.rd_name, char_width));
    content.push_str("\x1B\x45\x00"); // 关闭加粗
    content.push_str("\n");
    content.push_str(&"=".repeat(char_width));
    content.push_str("\n\n");

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

    // ============= 商品明细 =============
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