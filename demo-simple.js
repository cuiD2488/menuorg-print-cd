const PrinterHybrid = require('./src/printer-hybrid');

async function simpleDemo() {
  console.log('🚀 MenuorgPrint - Rust 增强打印引擎演示\n');

  const printer = new PrinterHybrid();

  // 显示引擎信息
  const engineInfo = printer.getEngineInfo();
  console.log('📊 当前引擎状态:');
  console.log(
    `   • Rust 引擎: ${engineInfo.rustAvailable ? '✅ 可用' : '❌ 不可用'}`
  );
  console.log(`   • 当前使用: ${engineInfo.currentEngine}`);
  console.log(
    `   • 回退支持: ${engineInfo.fallbackAvailable ? '✅ 支持' : '❌ 不支持'}\n`
  );

  try {
    // 获取打印机列表
    console.log('📋 获取系统打印机...');
    const printers = await printer.getPrinters();

    if (printers.length === 0) {
      console.log('⚠️ 未检测到任何打印机');
      return;
    }

    console.log('✅ 发现打印机:');
    printers.forEach((p, index) => {
      console.log(
        `   ${index + 1}. ${p.name} (${p.width}mm, ${
          p.isThermal ? '热敏' : '普通'
        })`
      );
    });

    // 选择第一个打印机进行测试
    const testPrinter = printers[0];
    console.log(`\n🎯 选择打印机: ${testPrinter.name}`);

    // 只做测试打印，不做实际订单打印（避免错误）
    console.log('\n🧪 执行打印测试...');
    const testResult = await printer.testPrint(
      testPrinter.name,
      testPrinter.width,
      0
    );
    console.log('✅ 测试结果:', testResult.message);
  } catch (error) {
    console.error('❌ 演示过程中出现错误:', error.message);
  }

  console.log('\n🎉 演示完成！');
  console.log('\n💡 集成说明:');
  console.log('   • 优先使用高性能 Rust 引擎');
  console.log('   • 自动回退到 Node.js 实现');
  console.log('   • 完全兼容 Windows 7+');
  console.log('   • 支持中文和各种编码');
}

if (require.main === module) {
  simpleDemo().catch(console.error);
}

module.exports = simpleDemo;
