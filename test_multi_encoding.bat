@echo off
chcp 65001 > nul
echo 🌍 测试多编码打印支持
echo.

echo 📋 1. 获取打印机列表
printer-engine.exe list-printers
echo.

echo 🔤 2. 显示支持的编码
printer-engine.exe list-encodings
echo.

echo 🧪 3. 测试不同编码打印 (请输入你的打印机名称)
echo.
echo 🇨🇳 中文简体 (GBK):
echo printer-engine.exe test-print -p "你的打印机" -w 80 -f 0 -e GBK
echo.
echo 🇹🇼 中文繁体 (BIG5):
echo printer-engine.exe test-print -p "你的打印机" -w 80 -f 0 -e BIG5
echo.
echo 🇯🇵 日文 (Shift_JIS):
echo printer-engine.exe test-print -p "你的打印机" -w 80 -f 0 -e Shift_JIS
echo.
echo 🇰🇷 韩文 (EUC_KR):
echo printer-engine.exe test-print -p "你的打印机" -w 80 -f 0 -e EUC_KR
echo.
echo 🇪🇺 西欧 (ISO_8859_1):
echo printer-engine.exe test-print -p "你的打印机" -w 80 -f 0 -e ISO_8859_1
echo.

pause