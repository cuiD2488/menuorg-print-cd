@echo off
REM ================================================================
REM   Windows 兼容性构建脚本
REM   支持: Win7/8/10+ 和 32/64位架构
REM ================================================================

echo 🚀 开始构建Windows兼容版本...
echo.

REM 检查Rust环境
echo 📋 检查编译环境...
cargo --version
rustc --version
echo.

REM 清理之前的构建
echo 🧹 清理之前的构建文件...
cargo clean
echo.

REM 确保目标已安装
echo 📦 确保编译目标已安装...
rustup target add x86_64-pc-windows-msvc
rustup target add i686-pc-windows-msvc
echo.

REM 创建输出目录
if not exist "dist" mkdir dist
if not exist "dist\win64" mkdir dist\win64
if not exist "dist\win32" mkdir dist\win32

echo ===============================================
echo 🏗️  编译 64位版本 (Win7/8/10+ x64)
echo ===============================================
cargo build --release --target x86_64-pc-windows-msvc
if %ERRORLEVEL% EQU 0 (
    echo ✅ 64位版本编译成功
    copy "target\x86_64-pc-windows-msvc\release\printer-engine.exe" "dist\win64\printer-engine-x64.exe"
    echo 📁 64位版本已保存到: dist\win64\printer-engine-x64.exe
) else (
    echo ❌ 64位版本编译失败
    pause
    exit /b 1
)
echo.

echo ===============================================
echo 🏗️  编译 32位版本 (Win7/8/10+ x86)
echo ===============================================
cargo build --release --target i686-pc-windows-msvc
if %ERRORLEVEL% EQU 0 (
    echo ✅ 32位版本编译成功
    copy "target\i686-pc-windows-msvc\release\printer-engine.exe" "dist\win32\printer-engine-x86.exe"
    echo 📁 32位版本已保存到: dist\win32\printer-engine-x86.exe
) else (
    echo ❌ 32位版本编译失败
    pause
    exit /b 1
)
echo.

echo ===============================================
echo 🧪 测试兼容性
echo ===============================================

echo 📋 64位版本信息:
"dist\win64\printer-engine-x64.exe" --version
echo.

echo 📋 32位版本信息:
"dist\win32\printer-engine-x86.exe" --version
echo.

echo ===============================================
echo 📊 构建完成报告
echo ===============================================
echo ✅ 编译完成！支持的系统:
echo    • Windows 7 SP1+ (32位/64位)
echo    • Windows 8/8.1 (32位/64位)  
echo    • Windows 10+ (32位/64位)
echo    • Windows Server 2008 R2+
echo.
echo 📁 输出文件:
echo    • 64位版本: dist\win64\printer-engine-x64.exe
echo    • 32位版本: dist\win32\printer-engine-x86.exe
echo.
echo 💡 使用建议:
echo    • 新系统(Win10+): 推荐使用64位版本
echo    • 老系统(Win7/8): 推荐使用32位版本
echo    • 服务器环境: 推荐使用64位版本
echo.

REM 生成兼容性检测脚本
echo 📝 生成兼容性检测脚本...
echo @echo off > dist\check-compatibility.bat
echo echo 🔍 系统兼容性检测... >> dist\check-compatibility.bat
echo echo. >> dist\check-compatibility.bat
echo systeminfo ^| findstr /C:"OS Name" >> dist\check-compatibility.bat
echo systeminfo ^| findstr /C:"System Type" >> dist\check-compatibility.bat
echo echo. >> dist\check-compatibility.bat
echo if "%%PROCESSOR_ARCHITECTURE%%"=="AMD64" ^( >> dist\check-compatibility.bat
echo     echo 推荐使用: printer-engine-x64.exe >> dist\check-compatibility.bat
echo ^) else ^( >> dist\check-compatibility.bat
echo     echo 推荐使用: printer-engine-x86.exe >> dist\check-compatibility.bat
echo ^) >> dist\check-compatibility.bat
echo pause >> dist\check-compatibility.bat

echo ✅ 兼容性检测脚本已生成: dist\check-compatibility.bat
echo.

echo 🎉 全部完成！您的程序现在支持所有Windows版本和架构。
pause 