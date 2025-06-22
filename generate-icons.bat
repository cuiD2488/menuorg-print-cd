@echo off
chcp 65001 >nul
echo.
echo ========================================
echo 🖨️  餐厅订单打印机图标生成器
echo ========================================
echo.
echo 📋 步骤说明：
echo 1. 即将打开图标生成器网页
echo 2. 在网页中下载各种尺寸的PNG图标
echo 3. 将下载的文件重命名并保存到assets目录
echo 4. 使用在线工具转换为ICO和ICNS格式
echo.
echo 🔧 需要的文件：
echo    assets/icon.ico     (Windows)
echo    assets/icon.icns    (macOS)
echo    assets/icon.png     (Linux)
echo.
echo ⚡ 快速链接：
echo    ICO转换: https://convertio.co/png-ico/
echo    ICNS转换: https://iconverticons.com/online/
echo.
pause
echo 正在打开图标生成器...
start assets/create-simple-icons.html
echo.
echo ✅ 图标生成器已打开！
echo 📁 请将生成的图标文件保存到 assets/ 目录
echo.
pause