// C-Lodop修复验证脚本
console.log('🔧 C-Lodop修复验证');
console.log('=====================================');

// 检查构建配置
const fs = require('fs');
const path = require('path');

try {
  const configPath = path.join(__dirname, 'renderer', 'build-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  console.log('📋 当前构建配置:');
  console.log('  构建模式:', config.buildMode);
  console.log('  使用C-Lodop:', config.useLodop);
  console.log('  构建时间:', config.buildTime);
  console.log('  版本:', config.version);

  if (config.useLodop) {
    console.log('\n✅ 配置正确：应用已设置为C-Lodop模式');
  } else {
    console.log('\n❌ 配置错误：应用未设置为C-Lodop模式');
  }
} catch (error) {
  console.error('❌ 读取构建配置失败:', error.message);
}

// 检查关键文件
console.log('\n📁 检查关键文件:');
const files = [
  'renderer/LodopFuncs.js',
  'renderer/js/printer-manager.js',
  'src/printer-lodop.js',
  'renderer/index.html',
];

files.forEach((file) => {
  if (fs.existsSync(file)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - 文件不存在`);
  }
});

// 检查HTML中的脚本引用
console.log('\n📄 检查HTML脚本引用:');
try {
  const htmlContent = fs.readFileSync('renderer/index.html', 'utf8');

  if (htmlContent.includes('LodopFuncs.js')) {
    console.log('  ✅ LodopFuncs.js 已在HTML中引用');
  } else {
    console.log('  ❌ LodopFuncs.js 未在HTML中引用');
  }

  if (htmlContent.includes('printer-manager.js')) {
    console.log('  ✅ printer-manager.js 已在HTML中引用');
  } else {
    console.log('  ❌ printer-manager.js 未在HTML中引用');
  }
} catch (error) {
  console.error('❌ 读取HTML文件失败:', error.message);
}

// 检查PrinterManager类冲突
console.log('\n🔍 检查PrinterManager类定义:');
try {
  const printerJs = fs.readFileSync('renderer/js/printer.js', 'utf8');
  const printerManagerJs = fs.readFileSync(
    'renderer/js/printer-manager.js',
    'utf8'
  );

  const printerJsHasClass = printerJs.includes('class PrinterManager');
  const printerManagerJsHasClass = printerManagerJs.includes(
    'class PrinterManager'
  );
  const printerJsHasLegacyClass = printerJs.includes(
    'class LegacyPrinterManager'
  );

  if (printerJsHasClass) {
    console.log('  ❌ printer.js 仍包含 PrinterManager 类定义 - 存在冲突');
  } else if (printerJsHasLegacyClass) {
    console.log('  ✅ printer.js 已重命名为 LegacyPrinterManager - 冲突已解决');
  } else {
    console.log('  ⚠️  printer.js 中未找到相关类定义');
  }

  if (printerManagerJsHasClass) {
    console.log('  ✅ printer-manager.js 包含 PrinterManager 类定义');
  } else {
    console.log('  ❌ printer-manager.js 未包含 PrinterManager 类定义');
  }
} catch (error) {
  console.error('❌ 检查类定义失败:', error.message);
}

console.log('\n🎯 修复建议:');
console.log('1. 确保C-Lodop客户端正在运行（已启动）');
console.log('2. 在浏览器开发者工具中检查控制台错误');
console.log('3. 访问 test-lodop.html 进行详细测试');
console.log('4. 如果仍有问题，可能需要重启应用');

console.log('\n✨ 验证完成！');
