@echo off
chcp 65001 > nul
echo 🧪 测试中文编码修复效果
echo.

echo 📋 1. 获取打印机列表
printer-engine.exe list-printers
echo.

echo 🖨️ 2. 测试中文打印（请在命令中输入你的打印机名称）
echo 示例命令:
echo printer-engine.exe test-print -p "XP-80C" -w 80 -f 0
echo.

echo 📝 3. 测试中文订单打印
echo 创建测试订单JSON...

set TEST_ORDER={"order_id":"TEST-001","rd_id":123,"user_id":"user123","order_status":1,"paystyle":1,"delivery_style":1,"delivery_type":1,"doordash_id":"","recipient_name":"张三","recipient_address":"北京市朝阳区测试地址123号","recipient_phone":"13800138000","recipient_distance":"2.5km","rd_name":"中华美食餐厅","rd_address":"北京市海淀区中关村大街1号","rd_phone":"01012345678","dishes_count":2,"dishes_id_list":"1,2","dishes_array":[{"dishes_name":"宫保鸡丁","amount":2,"price":"28.00","remark":"微辣"},{"dishes_name":"红烧肉","amount":1,"price":"35.00","remark":""}],"discount_dishes_info":{},"sub_total":"91.00","user_commission":"0.00","discount_total":"5.00","exemption":"0.00","tax_rate":"8.5","tax_fee":"7.31","delivery_fee":"3.00","convenience_rate":"2.5","convenience_fee":"2.28","retail_delivery_fee":"0.00","tip_fee":"10.00","total":"108.59","cloud_print":1,"order_notes":"请尽快配送","serial_num":1,"order_pdf_url":"","user_email":"test@example.com","create_time":"2024-01-15 12:30:00","delivery_time":"2024-01-15 13:00:00","order_date":"2024-01-15","pickup_time":"13:00","payment_method":"支付宝"}

echo 测试订单包含以下中文内容:
echo - 收件人: 张三
echo - 餐厅名: 中华美食餐厅
echo - 菜品: 宫保鸡丁, 红烧肉
echo - 地址: 北京市朝阳区测试地址123号
echo.

echo 运行订单打印测试（请替换打印机名称）:
echo printer-engine.exe print-order -p "XP-80C" -o "%TEST_ORDER%" -w 80 -f 0
echo.

echo ✅ 编码修复内容:
echo 1. 添加了 encoding_rs 依赖进行 UTF-8 → GBK 编码转换
echo 2. 在 ESC/POS 指令中设置了中文字符模式
echo 3. 选择了 GBK 编码页以支持中文字符
echo 4. 开启了中文字符打印模式
echo.

pause