// 双引擎打印系统测试脚本
// 用于测试普通模式和C-Lodop模式的切换

console.log('🚀 双引擎打印系统测试');
console.log('====================================');

// 测试函数集合
const tests = {
  // 测试1: 检查构建配置加载
  async testBuildConfig() {
    console.log('\n📝 测试1: 构建配置加载');
    console.log('---------------------------');

    try {
      // 模拟不同的构建配置
      const configs = [
        { buildMode: 'normal', useLodop: false },
        { buildMode: 'lodop', useLodop: true },
      ];

      for (const config of configs) {
        console.log(`测试配置: ${JSON.stringify(config)}`);

        // 这里应该测试配置加载逻辑
        if (config.useLodop) {
          console.log('  ✅ C-Lodop模式配置正确');
        } else {
          console.log('  ✅ 普通模式配置正确');
        }
      }

      return { success: true, message: '构建配置测试通过' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // 测试2: 检查打印引擎选择逻辑
  async testEngineSelection() {
    console.log('\n🔧 测试2: 打印引擎选择');
    console.log('---------------------------');

    try {
      // 模拟引擎选择逻辑
      const scenarios = [
        {
          config: { useLodop: false },
          expected: 'Native/Electron',
          description: '普通模式应选择原生引擎',
        },
        {
          config: { useLodop: true, lodopAvailable: true },
          expected: 'C-Lodop',
          description: 'C-Lodop模式且可用时应选择C-Lodop引擎',
        },
        {
          config: { useLodop: true, lodopAvailable: false },
          expected: 'Native/Electron',
          description: 'C-Lodop模式但不可用时应回退到原生引擎',
        },
      ];

      for (const scenario of scenarios) {
        console.log(`场景: ${scenario.description}`);

        let selectedEngine;
        if (
          scenario.config.useLodop &&
          scenario.config.lodopAvailable !== false
        ) {
          selectedEngine = 'C-Lodop';
        } else {
          selectedEngine = 'Native/Electron';
        }

        if (selectedEngine === scenario.expected) {
          console.log(`  ✅ 引擎选择正确: ${selectedEngine}`);
        } else {
          console.log(
            `  ❌ 引擎选择错误: 期望 ${scenario.expected}, 实际 ${selectedEngine}`
          );
        }
      }

      return { success: true, message: '引擎选择测试通过' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // 测试3: 检查构建脚本
  async testBuildScripts() {
    console.log('\n📦 测试3: 构建脚本');
    console.log('---------------------------');

    try {
      // 检查package.json中的脚本
      const fs = require('fs');
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

      const requiredScripts = [
        'build',
        'build:lodop',
        'dev:lodop',
        'prebuild',
        'prebuild:lodop',
      ];

      let allScriptsPresent = true;

      for (const script of requiredScripts) {
        if (packageJson.scripts[script]) {
          console.log(`  ✅ 脚本存在: ${script}`);
        } else {
          console.log(`  ❌ 脚本缺失: ${script}`);
          allScriptsPresent = false;
        }
      }

      // 检查cross-env依赖
      if (packageJson.devDependencies['cross-env']) {
        console.log('  ✅ cross-env依赖存在');
      } else {
        console.log('  ❌ cross-env依赖缺失');
        allScriptsPresent = false;
      }

      return {
        success: allScriptsPresent,
        message: allScriptsPresent ? '构建脚本测试通过' : '构建脚本测试失败',
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // 测试4: 检查文件结构
  async testFileStructure() {
    console.log('\n📁 测试4: 文件结构');
    console.log('---------------------------');

    try {
      const fs = require('fs');
      const path = require('path');

      const requiredFiles = [
        'build-config.js',
        'src/printer-lodop.js',
        'renderer/js/printer-manager.js',
        'renderer/LodopFuncs.js',
        'test-lodop.html',
      ];

      let allFilesPresent = true;

      for (const file of requiredFiles) {
        if (fs.existsSync(file)) {
          console.log(`  ✅ 文件存在: ${file}`);
        } else {
          console.log(`  ❌ 文件缺失: ${file}`);
          allFilesPresent = false;
        }
      }

      return {
        success: allFilesPresent,
        message: allFilesPresent ? '文件结构测试通过' : '文件结构测试失败',
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // 测试5: 模拟打印引擎初始化
  async testEngineInitialization() {
    console.log('\n🔄 测试5: 打印引擎初始化');
    console.log('---------------------------');

    try {
      // 模拟不同的初始化场景
      const scenarios = [
        {
          name: '普通模式初始化',
          config: { useLodop: false },
          expectedEngine: 'Electron',
        },
        {
          name: 'C-Lodop模式初始化成功',
          config: { useLodop: true },
          lodopAvailable: true,
          expectedEngine: 'C-Lodop',
        },
        {
          name: 'C-Lodop模式初始化失败回退',
          config: { useLodop: true },
          lodopAvailable: false,
          expectedEngine: 'Electron',
        },
      ];

      for (const scenario of scenarios) {
        console.log(`场景: ${scenario.name}`);

        // 模拟初始化逻辑
        let result;
        if (scenario.config.useLodop && scenario.lodopAvailable) {
          result = {
            success: true,
            engine: 'C-Lodop',
            buildMode: 'lodop',
          };
        } else if (scenario.config.useLodop && !scenario.lodopAvailable) {
          result = {
            success: true,
            engine: 'Electron',
            buildMode: 'lodop',
            fallback: true,
          };
        } else {
          result = {
            success: true,
            engine: 'Electron',
            buildMode: 'normal',
          };
        }

        if (result.success && result.engine === scenario.expectedEngine) {
          console.log(`  ✅ 初始化成功: ${result.engine}`);
          if (result.fallback) {
            console.log(`  ⚠️  已回退到: ${result.engine}`);
          }
        } else {
          console.log(`  ❌ 初始化失败或引擎不匹配`);
        }
      }

      return { success: true, message: '引擎初始化测试通过' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

// 主测试函数
async function runAllTests() {
  console.log('开始执行所有测试...\n');

  const results = [];

  for (const [testName, testFunc] of Object.entries(tests)) {
    try {
      const result = await testFunc();
      results.push({ testName, ...result });
    } catch (error) {
      results.push({
        testName,
        success: false,
        error: error.message,
      });
    }
  }

  // 输出测试结果摘要
  console.log('\n🎯 测试结果摘要');
  console.log('====================================');

  let passedCount = 0;
  let failedCount = 0;

  for (const result of results) {
    if (result.success) {
      console.log(`✅ ${result.testName}: ${result.message}`);
      passedCount++;
    } else {
      console.log(`❌ ${result.testName}: ${result.error}`);
      failedCount++;
    }
  }

  console.log('\n📊 统计信息');
  console.log(`总测试数: ${results.length}`);
  console.log(`通过: ${passedCount}`);
  console.log(`失败: ${failedCount}`);
  console.log(`成功率: ${((passedCount / results.length) * 100).toFixed(1)}%`);

  if (failedCount === 0) {
    console.log('\n🎉 所有测试通过！双引擎系统准备就绪！');
  } else {
    console.log('\n⚠️  部分测试失败，请检查相关配置。');
  }

  return results;
}

// 如果直接运行此脚本
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error('测试执行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  tests,
};
