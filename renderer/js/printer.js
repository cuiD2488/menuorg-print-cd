// 中文编码类型枚举（参考main.rs实现）
const ChineseEncoding = {
  UTF8: 'UTF8',
  GBK: 'GBK',
  GB2312: 'GB2312',
  GB18030: 'GB18030',
  BIG5: 'BIG5',
  AUTO: 'AUTO',
};

// 中文字符类型检测结果
const ChineseCharacterType = {
  NONE: 'NONE',
  SYMBOLS_ONLY: 'SYMBOLS_ONLY',
  SIMPLIFIED: 'SIMPLIFIED',
  TRADITIONAL: 'TRADITIONAL',
  MIXED: 'MIXED',
};

// 中文编码检测器（参考main.rs的逻辑）
class ChineseEncodingDetector {
  constructor() {
    // 简体中文常用字符集
    this.simplifiedChars = new Set([
      '你',
      '我',
      '他',
      '的',
      '是',
      '在',
      '有',
      '个',
      '人',
      '这',
      '了',
      '中',
      '国',
      '上',
      '来',
      '到',
      '时',
      '大',
      '地',
      '为',
      '子',
      '能',
      '说',
      '生',
      '自',
      '己',
      '面',
      '下',
      '而',
      '和',
      '订',
      '单',
      '菜',
      '品',
      '价',
      '格',
      '数',
      '量',
      '总',
      '计',
    ]);

    // 繁体中文常用字符集
    this.traditionalChars = new Set([
      '您',
      '們',
      '個',
      '國',
      '來',
      '時',
      '為',
      '說',
      '過',
      '後',
      '間',
      '裡',
      '點',
      '對',
      '現',
      '學',
      '會',
      '應',
      '開',
      '關',
      '訂',
      '單',
      '菜',
      '品',
      '價',
      '格',
      '數',
      '量',
      '總',
      '計',
    ]);
  }

  // 检测中文字符类型（参考main.rs逻辑）
  detectChineseType(text) {
    let hasSimplified = false;
    let hasTraditional = false;
    let hasCJKChars = false;
    let hasSymbols = false;

    for (const char of text) {
      const code = char.charCodeAt(0);

      if (this.isCJKUnifiedIdeograph(code)) {
        hasCJKChars = true;

        if (this.simplifiedChars.has(char)) {
          hasSimplified = true;
        } else if (this.traditionalChars.has(char)) {
          hasTraditional = true;
        }
      } else if (this.isCJKSymbolOrPunctuation(code)) {
        hasSymbols = true;
      }
    }

    if (!hasCJKChars && !hasSymbols) return ChineseCharacterType.NONE;
    if (!hasCJKChars && hasSymbols) return ChineseCharacterType.SYMBOLS_ONLY;
    if (hasCJKChars && hasSimplified && !hasTraditional)
      return ChineseCharacterType.SIMPLIFIED;
    if (hasCJKChars && !hasSimplified && hasTraditional)
      return ChineseCharacterType.TRADITIONAL;
    if (hasCJKChars && hasSimplified && hasTraditional)
      return ChineseCharacterType.MIXED;
    return ChineseCharacterType.SIMPLIFIED; // 默认为简体
  }

  // 检查是否为CJK统一表意文字
  isCJKUnifiedIdeograph(code) {
    return (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK统一表意文字
      (code >= 0x3400 && code <= 0x4dbf) || // CJK扩展A
      (code >= 0xf900 && code <= 0xfaff)
    ); // CJK兼容表意文字
  }

  // 检查是否为CJK符号和标点
  isCJKSymbolOrPunctuation(code) {
    return (
      (code >= 0x3000 && code <= 0x303f) || // CJK符号和标点
      (code >= 0xff00 && code <= 0xffef)
    ); // 全角ASCII
  }

  // 智能选择最佳编码（参考main.rs逻辑）
  autoSelectEncoding(text, printerConfig) {
    const charType = this.detectChineseType(text);

    console.log(`🔍 [编码检测] 字符类型: ${charType}`);

    switch (charType) {
      case ChineseCharacterType.NONE:
      case ChineseCharacterType.SYMBOLS_ONLY:
        return ChineseEncoding.UTF8;

      case ChineseCharacterType.SIMPLIFIED:
        // 简体中文优先使用GBK或GB18030
        if (printerConfig.fallbackEncodings.includes(ChineseEncoding.GB18030)) {
          return ChineseEncoding.GB18030;
        } else if (
          printerConfig.fallbackEncodings.includes(ChineseEncoding.GBK)
        ) {
          return ChineseEncoding.GBK;
        }
        return printerConfig.recommendedEncoding;

      case ChineseCharacterType.TRADITIONAL:
        // 繁体中文优先使用Big5
        if (printerConfig.fallbackEncodings.includes(ChineseEncoding.BIG5)) {
          return ChineseEncoding.BIG5;
        }
        return ChineseEncoding.UTF8;

      case ChineseCharacterType.MIXED:
        // 混合文本使用最兼容的编码
        if (printerConfig.fallbackEncodings.includes(ChineseEncoding.GB18030)) {
          return ChineseEncoding.GB18030;
        }
        return ChineseEncoding.UTF8;

      default:
        return ChineseEncoding.UTF8;
    }
  }

  // 测试编码兼容性
  testEncodingCompatibility(text, encoding) {
    try {
      // 使用TextEncoder测试编码（浏览器环境的模拟）
      let encoder;
      let success = true;
      let encodedSize = 0;
      let errorCount = 0;
      let compatibilityScore = 1.0;

      switch (encoding) {
        case ChineseEncoding.UTF8:
          encoder = new TextEncoder('utf-8');
          encodedSize = encoder.encode(text).length;
          break;
        case ChineseEncoding.GBK:
        case ChineseEncoding.GB2312:
        case ChineseEncoding.GB18030:
          // 浏览器环境模拟GBK编码检测
          encodedSize = this.estimateGBKSize(text);
          compatibilityScore = this.calculateGBKCompatibility(text);
          if (compatibilityScore < 0.8) {
            errorCount = 1;
          }
          break;
        case ChineseEncoding.BIG5:
          // 浏览器环境模拟Big5编码检测
          encodedSize = this.estimateBig5Size(text);
          compatibilityScore = this.calculateBig5Compatibility(text);
          if (compatibilityScore < 0.8) {
            errorCount = 1;
          }
          break;
        default:
          encoder = new TextEncoder('utf-8');
          encodedSize = encoder.encode(text).length;
      }

      success = errorCount === 0;

      return {
        encoding,
        success,
        encodedSize,
        errorCount,
        compatibilityScore,
        sampleBytes:
          encodedSize > 0
            ? Array.from(encoder ? encoder.encode(text.substring(0, 10)) : [])
            : [],
      };
    } catch (error) {
      return {
        encoding,
        success: false,
        encodedSize: 0,
        errorCount: 1,
        compatibilityScore: 0.0,
        sampleBytes: [],
      };
    }
  }

  // 估算GBK编码大小
  estimateGBKSize(text) {
    let size = 0;
    for (const char of text) {
      if (char.charCodeAt(0) < 128) {
        size += 1; // ASCII字符
      } else {
        size += 2; // 中文字符
      }
    }
    return size;
  }

  // 计算GBK兼容性
  calculateGBKCompatibility(text) {
    const charType = this.detectChineseType(text);
    switch (charType) {
      case ChineseCharacterType.SIMPLIFIED:
        return 0.95;
      case ChineseCharacterType.TRADITIONAL:
        return 0.7;
      case ChineseCharacterType.MIXED:
        return 0.8;
      case ChineseCharacterType.SYMBOLS_ONLY:
        return 0.9;
      default:
        return 1.0;
    }
  }

  // 估算Big5编码大小
  estimateBig5Size(text) {
    return this.estimateGBKSize(text); // 简化实现
  }

  // 计算Big5兼容性
  calculateBig5Compatibility(text) {
    const charType = this.detectChineseType(text);
    switch (charType) {
      case ChineseCharacterType.TRADITIONAL:
        return 0.95;
      case ChineseCharacterType.SIMPLIFIED:
        return 0.6;
      case ChineseCharacterType.MIXED:
        return 0.75;
      case ChineseCharacterType.SYMBOLS_ONLY:
        return 0.9;
      default:
        return 1.0;
    }
  }

  // 测试所有编码并排序
  testAllEncodings(text) {
    const encodings = [
      ChineseEncoding.UTF8,
      ChineseEncoding.GBK,
      ChineseEncoding.GB18030,
      ChineseEncoding.BIG5,
    ];

    const results = encodings.map((encoding) =>
      this.testEncodingCompatibility(text, encoding)
    );

    // 按兼容性评分排序
    results.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    return results;
  }
}

class PrinterManager {
  constructor() {
    this.printers = [];
    this.selectedPrinters = [];
    this.isInitialized = false;
    this.globalFontSize = 0; // 0=小, 1=中, 2=大

    // 新增：编码检测器
    this.encodingDetector = new ChineseEncodingDetector();

    // 新增：默认编码配置
    this.defaultEncodingConfig = {
      recommendedEncoding: ChineseEncoding.AUTO,
      fallbackEncodings: [
        ChineseEncoding.GBK,
        ChineseEncoding.UTF8,
        ChineseEncoding.GB18030,
        ChineseEncoding.BIG5,
      ],
      commandLevel: 1, // ESC/POS命令兼容级别
    };
  }

  async init() {
    try {
      await this.loadPrinters();
      await this.loadConfig();
      this.isInitialized = true;
      console.log('打印机管理器初始化完成');
    } catch (error) {
      console.error('打印机管理器初始化失败:', error);
    }
  }

  async loadPrinters() {
    try {
      // 检查是否在Electron环境中
      if (window.electronAPI && window.electronAPI.getPrinters) {
        this.printers = await window.electronAPI.getPrinters();
      } else {
        // 浏览器环境下的模拟数据
        console.log('🌐 浏览器环境：使用模拟打印机数据');
        this.printers = this.generateMockPrinters();
      }
      console.log('已加载打印机列表:', this.printers);

      // 确保每个打印机都有完整的属性（增强版，包含编码配置）
      this.printers = this.printers.map((printer) => ({
        name: printer.name || '',
        status: printer.status || 'Ready',
        width: printer.width || 80,
        isThermal: printer.isThermal || false,
        isEnabled: printer.isEnabled || false,
        fontSize: printer.fontSize || 0,
        isDefault: printer.isDefault || false,
        // 新增：编码相关配置
        supportsChinese: this.detectChineseSupport(printer.name),
        recommendedEncoding: this.detectRecommendedEncoding(printer.name),
        fallbackEncodings: this.detectFallbackEncodings(printer.name),
        commandLevel: this.detectCommandLevel(printer.name),
      }));

      return this.printers;
    } catch (error) {
      console.error('加载打印机列表失败:', error);
      this.printers = [];
      return [];
    }
  }

  // 新增：检测打印机中文支持（参考main.rs逻辑）
  detectChineseSupport(printerName) {
    const name = printerName.toLowerCase();
    return (
      name.includes('xprinter') ||
      name.includes('gprinter') ||
      name.includes('thermal') ||
      name.includes('receipt') ||
      name.includes('pos') ||
      name.includes('epson') ||
      name.includes('canon')
    );
  }

  // 新增：检测推荐编码
  detectRecommendedEncoding(printerName) {
    const name = printerName.toLowerCase();

    if (name.includes('xprinter') || name.includes('gprinter')) {
      return ChineseEncoding.GBK; // 国产热敏打印机通常支持GBK较好
    } else if (name.includes('epson')) {
      return ChineseEncoding.UTF8; // Epson通常UTF-8支持较好
    } else if (name.includes('canon') || name.includes('hp')) {
      return ChineseEncoding.GBK; // 传统打印机厂商
    }

    return ChineseEncoding.AUTO; // 默认自动检测
  }

  // 新增：检测备用编码
  detectFallbackEncodings(printerName) {
    const name = printerName.toLowerCase();

    if (name.includes('xprinter') || name.includes('gprinter')) {
      return [
        ChineseEncoding.GBK,
        ChineseEncoding.GB18030,
        ChineseEncoding.UTF8,
      ];
    } else if (name.includes('epson')) {
      return [ChineseEncoding.UTF8, ChineseEncoding.GBK, ChineseEncoding.BIG5];
    }

    return this.defaultEncodingConfig.fallbackEncodings;
  }

  // 新增：检测命令兼容级别
  detectCommandLevel(printerName) {
    const name = printerName.toLowerCase();

    if (name.includes('thermal') || name.includes('pos')) {
      return 2; // 热敏打印机通常支持扩展命令
    } else if (name.includes('epson') || name.includes('xprinter')) {
      return 1; // 标准命令集
    }

    return 0; // 基础命令集
  }

  // 新增：生成模拟打印机数据（用于浏览器环境测试）
  generateMockPrinters() {
    return [
      {
        name: 'XPrinter XP-58III (USB)',
        status: 'Ready',
        width: 58,
        isThermal: true,
        isEnabled: false,
        fontSize: 0,
        isDefault: false,
        supportsChinese: true,
        recommendedEncoding: ChineseEncoding.GBK,
        fallbackEncodings: [
          ChineseEncoding.GBK,
          ChineseEncoding.GB18030,
          ChineseEncoding.UTF8,
        ],
        commandLevel: 2,
      },
      {
        name: 'EPSON TM-T82III',
        status: 'Ready',
        width: 80,
        isThermal: true,
        isEnabled: false,
        fontSize: 0,
        isDefault: false,
        supportsChinese: true,
        recommendedEncoding: ChineseEncoding.UTF8,
        fallbackEncodings: [
          ChineseEncoding.UTF8,
          ChineseEncoding.GBK,
          ChineseEncoding.BIG5,
        ],
        commandLevel: 1,
      },
      {
        name: 'GPrinter GP-58130IVC',
        status: 'Ready',
        width: 58,
        isThermal: true,
        isEnabled: false,
        fontSize: 0,
        isDefault: true,
        supportsChinese: true,
        recommendedEncoding: ChineseEncoding.GBK,
        fallbackEncodings: [
          ChineseEncoding.GBK,
          ChineseEncoding.GB2312,
          ChineseEncoding.UTF8,
        ],
        commandLevel: 2,
      },
      {
        name: 'Canon PIXMA TS3300',
        status: 'Ready',
        width: 80,
        isThermal: false,
        isEnabled: false,
        fontSize: 0,
        isDefault: false,
        supportsChinese: false,
        recommendedEncoding: ChineseEncoding.UTF8,
        fallbackEncodings: [ChineseEncoding.UTF8, ChineseEncoding.GBK],
        commandLevel: 0,
      },
      {
        name: 'HP LaserJet Pro M404n',
        status: 'Offline',
        width: 80,
        isThermal: false,
        isEnabled: false,
        fontSize: 0,
        isDefault: false,
        supportsChinese: false,
        recommendedEncoding: ChineseEncoding.UTF8,
        fallbackEncodings: [ChineseEncoding.UTF8],
        commandLevel: 0,
      },
    ];
  }

  async loadConfig() {
    try {
      let config;

      // 检查是否在Electron环境中
      if (window.electronAPI && window.electronAPI.getConfig) {
        config = await window.electronAPI.getConfig();
      } else {
        // 浏览器环境下使用localStorage
        const savedConfig = localStorage.getItem('printerManagerConfig');
        config = savedConfig ? JSON.parse(savedConfig) : {};
      }

      if (config.selectedPrinters) {
        this.selectedPrinters = config.selectedPrinters;
      }
      if (config.globalFontSize !== undefined) {
        this.globalFontSize = config.globalFontSize;
      }
      if (config.printerSettings) {
        // 合并保存的打印机设置
        this.printers = this.printers.map((printer) => {
          const savedSettings = config.printerSettings.find(
            (p) => p.name === printer.name
          );
          return savedSettings ? { ...printer, ...savedSettings } : printer;
        });
      }
      console.log('已加载打印机配置:', this.selectedPrinters);
    } catch (error) {
      console.error('加载打印机配置失败:', error);
    }
  }

  async saveConfig() {
    try {
      const config = {
        selectedPrinters: this.selectedPrinters,
        globalFontSize: this.globalFontSize,
        printerSettings: this.printers.map((p) => ({
          name: p.name,
          width: p.width,
          isEnabled: p.isEnabled,
          fontSize: p.fontSize,
        })),
        lastUpdated: new Date().toISOString(),
      };

      // 检查是否在Electron环境中
      if (window.electronAPI && window.electronAPI.saveConfig) {
        await window.electronAPI.saveConfig(config);
      } else {
        // 浏览器环境下使用localStorage
        localStorage.setItem('printerManagerConfig', JSON.stringify(config));
      }

      console.log('打印机配置已保存');
      return true;
    } catch (error) {
      console.error('保存打印机配置失败:', error);
      return false;
    }
  }

  setSelectedPrinters(printerNames) {
    this.selectedPrinters = Array.isArray(printerNames)
      ? printerNames
      : [printerNames];
    console.log('已设置选中的打印机:', this.selectedPrinters);
    this.saveConfig();
  }

  getSelectedPrinters() {
    return this.selectedPrinters;
  }

  getAllPrinters() {
    return this.printers;
  }

  // 获取启用的打印机
  getEnabledPrinters() {
    return this.printers.filter((p) => p.isEnabled);
  }

  // 切换打印机启用状态
  togglePrinter(printerName, enabled) {
    const printer = this.printers.find((p) => p.name === printerName);
    if (printer) {
      printer.isEnabled = enabled;
      console.log(`打印机 ${printerName} 已${enabled ? '启用' : '禁用'}`);
      this.saveConfig();
      return true;
    }
    return false;
  }

  // 设置打印机字体大小
  setPrinterFontSize(printerName, fontSize) {
    const printer = this.printers.find((p) => p.name === printerName);
    if (printer && fontSize >= 0 && fontSize <= 2) {
      printer.fontSize = fontSize;
      console.log(`打印机 ${printerName} 字体大小设置为: ${fontSize}`);
      this.saveConfig();
      return true;
    }
    return false;
  }

  // 设置全局字体大小
  setGlobalFontSize(fontSize) {
    if (fontSize >= 0 && fontSize <= 2) {
      this.globalFontSize = fontSize;
      // 同时更新所有打印机的字体大小
      this.printers.forEach((printer) => {
        printer.fontSize = fontSize;
      });
      console.log(`全局字体大小设置为: ${fontSize}`);
      this.saveConfig();
      return true;
    }
    return false;
  }

  // 获取全局字体大小
  getGlobalFontSize() {
    return this.globalFontSize;
  }

  // 获取字体大小文本
  getFontSizeText(fontSize) {
    switch (fontSize) {
      case 0:
        return '小';
      case 1:
        return '中';
      case 2:
        return '大';
      default:
        return '未知';
    }
  }

  // 增强版测试打印（支持编码测试）
  async testPrint(printerName = null, testEncodings = false) {
    const printersToTest = printerName
      ? [printerName]
      : this.getEnabledPrinters().map((p) => p.name);

    if (printersToTest.length === 0) {
      throw new Error('没有启用的打印机可供测试');
    }

    const results = [];

    for (const printerNameToTest of printersToTest) {
      try {
        const printer = this.printers.find((p) => p.name === printerNameToTest);
        const width = printer ? printer.width : 80;
        const fontSize = printer ? printer.fontSize : this.globalFontSize;

        console.log(
          `开始测试打印机: ${printerNameToTest} (宽度: ${width}mm, 字体: ${this.getFontSizeText(
            fontSize
          )})`
        );

        // 如果需要测试编码
        if (testEncodings && printer) {
          const encodingTestResult = await this.testPrinterEncodings(printer);
          results.push({
            printer: printerNameToTest,
            success: true,
            encodingTest: encodingTestResult,
          });
          console.log(
            `打印机编码测试完成: ${printerNameToTest}`,
            encodingTestResult
          );
        } else {
          // 标准测试打印
          if (window.electronAPI && window.electronAPI.testPrint) {
            // Electron环境：使用真实的测试打印
            await window.electronAPI.testPrint(
              printerNameToTest,
              width,
              fontSize
            );
          } else {
            // 浏览器环境：使用模拟测试打印
            await this.mockTestPrint(printerNameToTest, width, fontSize);
          }
          results.push({ printer: printerNameToTest, success: true });
          console.log(`打印机测试成功: ${printerNameToTest}`);
        }
      } catch (error) {
        console.error(`打印机测试失败: ${printerNameToTest}`, error);
        results.push({
          printer: printerNameToTest,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  // 新增：测试打印机编码兼容性
  async testPrinterEncodings(printer) {
    console.log(`🧪 [编码测试] 开始测试打印机编码兼容性: ${printer.name}`);

    // 测试用的中文文本（参考main.rs的测试内容）
    const testTexts = {
      simplified: '简体中文测试：你好世界！订单#123，总计￥99.50',
      traditional: '繁體中文測試：您好世界！訂單#123，總計￥99.50',
      mixed: '混合文本测試：Hello 世界！Order#123，總計$99.50',
      symbols: '符号测试：【订单】※￥＄€∞±≠≤≥',
      menu: '菜品：宫保鸡丁、麻婆豆腐、白米饭',
      address: '地址：北京市朝阳区望京街道123号2B室',
    };

    const results = {};

    for (const [textType, testText] of Object.entries(testTexts)) {
      console.log(`🔍 [编码测试] 测试文本类型: ${textType}`);

      const charType = this.encodingDetector.detectChineseType(testText);
      const encodingTests = this.encodingDetector.testAllEncodings(testText);

      // 智能选择推荐编码
      const recommendedEncoding = this.encodingDetector.autoSelectEncoding(
        testText,
        {
          recommendedEncoding: printer.recommendedEncoding,
          fallbackEncodings: printer.fallbackEncodings,
        }
      );

      results[textType] = {
        text: testText,
        characterType: charType,
        recommendedEncoding: recommendedEncoding,
        allEncodingTests: encodingTests,
        bestEncoding: encodingTests[0],
      };

      console.log(
        `✅ [编码测试] ${textType} - 字符类型: ${charType}, 推荐编码: ${recommendedEncoding}`
      );
    }

    // 生成编码兼容性报告
    const compatibilityReport = this.generateEncodingCompatibilityReport(
      printer,
      results
    );

    return {
      printer: printer.name,
      chineseSupport: printer.supportsChinese,
      recommendedEncoding: printer.recommendedEncoding,
      fallbackEncodings: printer.fallbackEncodings,
      testResults: results,
      compatibilityReport: compatibilityReport,
      timestamp: new Date().toISOString(),
    };
  }

  // 新增：生成编码兼容性报告
  generateEncodingCompatibilityReport(printer, testResults) {
    const report = {
      overallScore: 0,
      encodingScores: {},
      recommendations: [],
      warnings: [],
    };

    // 计算各编码的总体评分
    const encodings = [
      ChineseEncoding.UTF8,
      ChineseEncoding.GBK,
      ChineseEncoding.GB18030,
      ChineseEncoding.BIG5,
    ];

    for (const encoding of encodings) {
      let totalScore = 0;
      let testCount = 0;

      for (const [textType, result] of Object.entries(testResults)) {
        const encodingTest = result.allEncodingTests.find(
          (test) => test.encoding === encoding
        );
        if (encodingTest) {
          totalScore += encodingTest.compatibilityScore;
          testCount++;
        }
      }

      const avgScore = testCount > 0 ? totalScore / testCount : 0;
      report.encodingScores[encoding] = {
        averageScore: avgScore,
        grade: this.getCompatibilityGrade(avgScore),
        testCount: testCount,
      };
    }

    // 计算总体评分
    const scores = Object.values(report.encodingScores).map(
      (s) => s.averageScore
    );
    report.overallScore = scores.length > 0 ? Math.max(...scores) : 0;

    // 生成建议
    const bestEncoding = Object.entries(report.encodingScores).sort(
      ([, a], [, b]) => b.averageScore - a.averageScore
    )[0];

    if (bestEncoding) {
      const [encoding, scoreInfo] = bestEncoding;

      if (scoreInfo.averageScore >= 0.9) {
        report.recommendations.push(
          `推荐使用 ${encoding} 编码，兼容性极佳 (${(
            scoreInfo.averageScore * 100
          ).toFixed(1)}%)`
        );
      } else if (scoreInfo.averageScore >= 0.8) {
        report.recommendations.push(
          `推荐使用 ${encoding} 编码，兼容性良好 (${(
            scoreInfo.averageScore * 100
          ).toFixed(1)}%)`
        );
      } else {
        report.recommendations.push(
          `建议使用 ${encoding} 编码，但可能存在兼容性问题 (${(
            scoreInfo.averageScore * 100
          ).toFixed(1)}%)`
        );
      }
    }

    // 生成警告
    if (report.overallScore < 0.7) {
      report.warnings.push(
        '⚠️ 该打印机对中文支持可能有限，建议进行实际打印测试'
      );
    }

    if (!printer.supportsChinese) {
      report.warnings.push('⚠️ 该打印机可能不是专门为中文优化的型号');
    }

    return report;
  }

  // 新增：获取兼容性等级
  getCompatibilityGrade(score) {
    if (score >= 0.95) return '优秀';
    if (score >= 0.85) return '良好';
    if (score >= 0.7) return '一般';
    if (score >= 0.5) return '较差';
    return '很差';
  }

  // 新增：测试单一编码
  async testSingleEncoding(text, encoding, printerName) {
    const printer = this.printers.find((p) => p.name === printerName);
    if (!printer) {
      throw new Error(`打印机 ${printerName} 不存在`);
    }

    console.log(`🧪 [单编码测试] 打印机: ${printerName}, 编码: ${encoding}`);
    console.log(`📝 [单编码测试] 测试文本: ${text}`);

    try {
      // 检查是否在Electron环境中
      if (
        window.electronAPI &&
        window.electronAPI.testPrinterEncodingCompatibility
      ) {
        // Electron环境：使用真实的编码兼容性测试
        console.log(`🔌 [真实测试] 调用Electron API进行编码测试`);
        const result =
          await window.electronAPI.testPrinterEncodingCompatibility(
            printerName,
            text,
            encoding
          );

        console.log(`✅ [真实测试] 编码测试结果:`, result);
        return {
          printer: printerName,
          encoding: encoding,
          text: text,
          result: result,
          timestamp: new Date().toISOString(),
          source: 'electron-api',
        };
      } else {
        // 浏览器环境：使用本地编码检测
        console.log(`🌐 [模拟测试] 使用本地编码检测`);
        const encodingTest = this.encodingDetector.testEncodingCompatibility(
          text,
          encoding
        );
        console.log(`📊 [模拟测试] 兼容性测试结果:`, encodingTest);

        return {
          printer: printerName,
          encoding: encoding,
          text: text,
          result: encodingTest,
          timestamp: new Date().toISOString(),
          source: 'local-detector',
        };
      }
    } catch (error) {
      console.error(`❌ [编码测试] 测试失败:`, error);
      throw error;
    }
  }

  async printOrder(orderData, printerName = null) {
    if (!orderData) {
      throw new Error('订单数据不能为空');
    }

    console.log('开始打印订单:', orderData.order_id || 'Unknown');

    // 如果指定了打印机名称，只打印到该打印机
    if (printerName) {
      const printer = this.printers.find((p) => p.name === printerName);
      if (!printer) {
        throw new Error(`找不到指定的打印机: ${printerName}`);
      }

      console.log(`向指定打印机打印: ${printerName}`);
      return await this.printToSinglePrinter(orderData, printer);
    }

    // 否则，向所有选中的打印机打印
    const selectedPrinters = this.getSelectedPrinters();
    if (selectedPrinters.length === 0) {
      throw new Error('没有选择任何打印机，无法打印订单');
    }

    console.log(`向 ${selectedPrinters.length} 台选中的打印机打印订单`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const results = [];

    // 并行向所有选中的打印机打印
    const printPromises = selectedPrinters.map(async (printerName) => {
      const printer = this.printers.find((p) => p.name === printerName);
      if (!printer) {
        const error = `找不到打印机: ${printerName}`;
        errors.push(error);
        errorCount++;
        return { printer: printerName, success: false, error };
      }

      try {
        console.log(`向打印机 ${printerName} 发送订单打印`);
        await this.printToSinglePrinter(orderData, printer);
        successCount++;
        console.log(`打印机 ${printerName} 订单打印成功`);
        return { printer: printerName, success: true };
      } catch (error) {
        errorCount++;
        const errorMsg = `${printerName}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`打印机 ${printerName} 订单打印失败:`, error);
        return { printer: printerName, success: false, error: error.message };
      }
    });

    const printResults = await Promise.all(printPromises);
    results.push(...printResults);

    // 汇总结果
    const summary = {
      总打印机数: selectedPrinters.length,
      成功数量: successCount,
      失败数量: errorCount,
      详细结果: results,
      错误列表: errors,
    };

    console.log('订单打印结果汇总:', summary);

    if (successCount === 0) {
      throw new Error(`所有打印机都打印失败: ${errors.join('; ')}`);
    }

    if (errorCount > 0) {
      console.warn(
        `订单打印部分成功: ${successCount} 成功, ${errorCount} 失败`
      );
    }

    return summary;
  }

  // 向单个打印机打印的辅助方法（增强编码支持）
  async printToSinglePrinter(orderData, printer) {
    try {
      const width = printer.width || 80;
      const fontSize =
        printer.fontSize !== undefined ? printer.fontSize : this.globalFontSize;

      console.log(
        `🖨️ [打印] 打印机: ${
          printer.name
        }, 宽度=${width}mm, 字体=${this.getFontSizeText(fontSize)}`
      );

      // 检测订单内容中的中文字符并选择最佳编码
      const orderText = this.extractOrderText(orderData);
      const selectedEncoding = await this.selectOptimalEncoding(
        orderText,
        printer
      );

      console.log(
        `🔍 [编码] 为打印机 ${printer.name} 选择编码: ${selectedEncoding}`
      );

      // 生成优化的打印内容（包含编码优化的ESC/POS命令）
      const optimizedContent = this.generateOptimizedPrintContent(
        orderData,
        width,
        fontSize,
        selectedEncoding,
        printer.commandLevel
      );

      // 发送打印任务（可以选择使用优化内容或原始API）
      if (window.electronAPI && window.electronAPI.printOrderWithEncoding) {
        // Electron环境：使用真实的编码优化打印接口
        await window.electronAPI.printOrderWithEncoding(
          printer.name,
          orderData,
          selectedEncoding
        );
      } else if (optimizedContent) {
        // 浏览器环境：使用模拟编码打印
        await this.mockPrintOrderWithEncoding(
          printer.name,
          optimizedContent,
          selectedEncoding
        );
      } else {
        // 回退到基础打印接口
        if (window.electronAPI && window.electronAPI.printOrder) {
          await window.electronAPI.printOrder(orderData, width, fontSize);
        } else {
          await this.mockPrintOrder(orderData, width, fontSize, printer.name);
        }
      }

      console.log(`✅ [打印] 打印机 ${printer.name} 打印成功`);
      return true;
    } catch (error) {
      console.error(`❌ [打印] 打印机 ${printer.name} 打印失败:`, error);

      // 尝试使用备用编码重新打印
      if (printer.fallbackEncodings && printer.fallbackEncodings.length > 1) {
        console.log(`🔄 [打印] 尝试使用备用编码重新打印...`);
        return await this.printWithFallbackEncoding(orderData, printer);
      }

      throw error;
    }
  }

  // 新增：提取订单中的文本内容
  extractOrderText(orderData) {
    const textParts = [];

    // 收集所有文本字段
    if (orderData.recipient_name) textParts.push(orderData.recipient_name);
    if (orderData.recipient_address)
      textParts.push(orderData.recipient_address);
    if (orderData.rd_name) textParts.push(orderData.rd_name);
    if (orderData.rd_address) textParts.push(orderData.rd_address);
    if (orderData.order_notes) textParts.push(orderData.order_notes);

    // 收集菜品名称和备注
    if (orderData.dishes_array) {
      orderData.dishes_array.forEach((dish) => {
        if (dish.dishes_name) textParts.push(dish.dishes_name);
        if (dish.remark) textParts.push(dish.remark);
        if (dish.dishes_describe) textParts.push(dish.dishes_describe);
      });
    }

    return textParts.join(' ');
  }

  // 新增：为打印机选择最优编码
  async selectOptimalEncoding(text, printer) {
    console.log(`🤖 [智能选择] 开始为打印机 ${printer.name} 选择最优编码`);

    try {
      // 检查是否在Electron环境中
      if (window.electronAPI && window.electronAPI.selectOptimalEncoding) {
        // Electron环境：使用真实的智能编码选择
        console.log(`🔌 [智能选择] 调用Electron API进行智能编码选择`);
        const selectedEncoding = await window.electronAPI.selectOptimalEncoding(
          text,
          printer.name
        );

        console.log(`✅ [智能选择] Electron API选择编码: ${selectedEncoding}`);
        return selectedEncoding;
      } else {
        // 浏览器环境：使用本地智能选择逻辑
        console.log(`🌐 [智能选择] 使用本地智能选择逻辑`);
        return this.selectOptimalEncodingLocal(text, printer);
      }
    } catch (error) {
      console.error(`❌ [智能选择] 智能选择失败，使用本地逻辑:`, error);
      return this.selectOptimalEncodingLocal(text, printer);
    }
  }

  // 本地智能编码选择逻辑
  selectOptimalEncodingLocal(text, printer) {
    if (printer.recommendedEncoding === ChineseEncoding.AUTO) {
      return this.encodingDetector.autoSelectEncoding(text, {
        recommendedEncoding: ChineseEncoding.AUTO,
        fallbackEncodings:
          printer.fallbackEncodings ||
          this.defaultEncodingConfig.fallbackEncodings,
      });
    } else {
      // 使用打印机的推荐编码，但先验证兼容性
      const compatibilityTest = this.encodingDetector.testEncodingCompatibility(
        text,
        printer.recommendedEncoding
      );

      if (
        compatibilityTest.success &&
        compatibilityTest.compatibilityScore >= 0.8
      ) {
        return printer.recommendedEncoding;
      } else {
        console.log(
          `⚠️ [编码] 推荐编码 ${printer.recommendedEncoding} 兼容性不佳，自动选择备用编码`
        );
        return this.encodingDetector.autoSelectEncoding(text, {
          recommendedEncoding: ChineseEncoding.AUTO,
          fallbackEncodings:
            printer.fallbackEncodings ||
            this.defaultEncodingConfig.fallbackEncodings,
        });
      }
    }
  }

  // 新增：生成优化的打印内容（参考main.rs的ESC/POS命令生成）
  generateOptimizedPrintContent(
    orderData,
    width,
    fontSize,
    encoding,
    commandLevel
  ) {
    try {
      console.log(
        `🛠️ [内容生成] 生成优化打印内容，编码: ${encoding}, 命令级别: ${commandLevel}`
      );

      // 基础ESC/POS命令（参考main.rs逻辑）
      let content = '';

      // 初始化命令
      content += '\x1B@'; // ESC @ - 初始化打印机

      // 根据编码设置汉字模式（参考main.rs的编码设置）
      switch (encoding) {
        case ChineseEncoding.GBK:
        case ChineseEncoding.GB2312:
        case ChineseEncoding.GB18030:
          content += '\x1C\x26'; // 启用汉字模式
          content += '\x1C\x43\x01'; // 选择汉字字符模式
          if (commandLevel >= 1) {
            content += '\x1B\x39\x01'; // 设置汉字模式（扩展命令）
          }
          break;
        case ChineseEncoding.BIG5:
          content += '\x1C\x26'; // 启用汉字模式
          content += '\x1C\x43\x01'; // 选择汉字字符模式
          if (commandLevel >= 1) {
            content += '\x1B\x39\x02'; // Big5模式（如果支持）
          }
          break;
        case ChineseEncoding.UTF8:
        default:
          // UTF-8模式通常不需要特殊设置，但某些打印机需要
          if (commandLevel >= 1) {
            content += '\x1C\x28\x43\x02\x00\x00\x08'; // UTF-8模式（高级命令）
          }
          break;
      }

      // 设置字体大小（参考main.rs的字体设置）
      switch (fontSize) {
        case 0: // 小号字体
          content += '\x1D\x21\x00'; // 正常大小 (1x1)
          break;
        case 1: // 中号字体
          content += '\x1D\x21\x10'; // 宽度1x，高度2x
          break;
        case 2: // 大号字体
          content += '\x1D\x21\x11'; // 宽度2x，高度2x
          break;
      }

      // 设置行间距
      content += '\x1B\x33\x30'; // 设置行间距

      // 生成订单内容（简化版，实际应该生成完整的订单格式）
      const charWidth = width === 80 ? 48 : 32;

      // 标题
      content += '='.repeat(charWidth) + '\n';
      content += '\x1B\x45\x01'; // 加粗
      content +=
        this.centerText(orderData.rd_name || 'RESTAURANT ORDER', charWidth) +
        '\n';
      content += '\x1B\x45\x00'; // 关闭加粗
      content += '='.repeat(charWidth) + '\n\n';

      // 订单号
      content += `Order #: ${orderData.order_id || 'N/A'}\n`;
      content += `Customer: ${orderData.recipient_name || 'N/A'}\n`;
      if (orderData.recipient_address) {
        content += `Address: ${orderData.recipient_address}\n`;
      }
      content += '\n';

      // 商品列表
      content += '-'.repeat(charWidth) + '\n';
      content += 'ITEMS:\n';
      content += '-'.repeat(charWidth) + '\n';

      if (orderData.dishes_array) {
        orderData.dishes_array.forEach((dish) => {
          content += `${dish.dishes_name || 'Item'} x${dish.amount || 1}\n`;
          if (dish.remark) {
            content += `  Note: ${dish.remark}\n`;
          }
          content += `  $${dish.price || '0.00'}\n\n`;
        });
      }

      // 总计
      content += '-'.repeat(charWidth) + '\n';
      content += '\x1B\x45\x01'; // 加粗
      content += `TOTAL: $${orderData.total || '0.00'}\n`;
      content += '\x1B\x45\x00'; // 关闭加粗
      content += '='.repeat(charWidth) + '\n';

      // 底部信息
      content += '\nThank you for your order!\n';
      content += new Date().toLocaleString() + '\n\n\n';

      // 切纸命令
      content += '\x1D\x56\x00'; // GS V 0 - 全切

      console.log(
        `✅ [内容生成] 优化内容生成完成，长度: ${content.length} 字符`
      );
      return content;
    } catch (error) {
      console.error(`❌ [内容生成] 生成优化内容失败:`, error);
      return null; // 返回null表示生成失败，将使用原始方法
    }
  }

  // 新增：使用备用编码重试打印
  async printWithFallbackEncoding(orderData, printer) {
    const orderText = this.extractOrderText(orderData);

    for (let i = 1; i < printer.fallbackEncodings.length; i++) {
      const fallbackEncoding = printer.fallbackEncodings[i];

      try {
        console.log(`🔄 [备用编码] 尝试使用 ${fallbackEncoding} 编码`);

        // 测试编码兼容性
        const compatibilityTest =
          this.encodingDetector.testEncodingCompatibility(
            orderText,
            fallbackEncoding
          );

        if (
          compatibilityTest.success &&
          compatibilityTest.compatibilityScore >= 0.7
        ) {
          // 使用备用编码重新生成内容
          const optimizedContent = this.generateOptimizedPrintContent(
            orderData,
            printer.width || 80,
            printer.fontSize !== undefined
              ? printer.fontSize
              : this.globalFontSize,
            fallbackEncoding,
            printer.commandLevel
          );

          if (window.electronAPI && window.electronAPI.printOrderWithEncoding) {
            // Electron环境：使用真实的编码优化打印接口
            await window.electronAPI.printOrderWithEncoding(
              printer.name,
              orderData,
              fallbackEncoding
            );
          } else if (optimizedContent) {
            // 浏览器环境：使用模拟编码打印
            await this.mockPrintOrderWithEncoding(
              printer.name,
              optimizedContent,
              fallbackEncoding
            );
          } else {
            // 回退到基础打印接口
            if (window.electronAPI && window.electronAPI.printOrder) {
              await window.electronAPI.printOrder(
                orderData,
                printer.width || 80,
                printer.fontSize !== undefined
                  ? printer.fontSize
                  : this.globalFontSize
              );
            } else {
              await this.mockPrintOrder(
                orderData,
                printer.width || 80,
                printer.fontSize !== undefined
                  ? printer.fontSize
                  : this.globalFontSize,
                printer.name
              );
            }
          }

          console.log(`✅ [备用编码] 使用 ${fallbackEncoding} 编码打印成功`);
          return true;
        }
      } catch (error) {
        console.log(
          `❌ [备用编码] ${fallbackEncoding} 编码打印失败:`,
          error.message
        );
        continue;
      }
    }

    throw new Error(`所有备用编码都打印失败`);
  }

  // 新增：文本居中功能
  centerText(text, width) {
    const textWidth = this.calculateDisplayWidth(text);
    if (textWidth >= width) {
      return text;
    }
    const padding = Math.floor((width - textWidth) / 2);
    return ' '.repeat(padding) + text;
  }

  // 新增：计算显示宽度（考虑中文字符占用2个位置）
  calculateDisplayWidth(text) {
    let width = 0;
    for (const char of text) {
      if (char.charCodeAt(0) > 127) {
        width += 2; // 中文字符占2个位置
      } else {
        width += 1; // ASCII字符占1个位置
      }
    }
    return width;
  }

  // 新增：模拟打印方法（用于浏览器环境测试）
  async mockPrintOrder(orderData, width, fontSize, printerName) {
    console.log(`🖨️ [模拟打印] 打印机: ${printerName}`);
    console.log(`📄 [模拟打印] 订单ID: ${orderData.order_id || 'N/A'}`);
    console.log(`🔧 [模拟打印] 配置: ${width}mm, 字体大小: ${fontSize}`);

    // 模拟网络延迟
    await new Promise((resolve) =>
      setTimeout(resolve, 500 + Math.random() * 1000)
    );

    // 模拟打印内容生成
    const content = this.generateOptimizedPrintContent(
      orderData,
      width,
      fontSize,
      ChineseEncoding.UTF8,
      1
    );
    console.log(
      `📝 [模拟打印] 生成内容长度: ${content ? content.length : 0} 字符`
    );

    // 随机模拟成功/失败（90%成功率）
    if (Math.random() > 0.1) {
      console.log(`✅ [模拟打印] ${printerName} 打印成功`);
      return true;
    } else {
      throw new Error(`模拟打印失败: ${printerName} 连接超时`);
    }
  }

  async mockPrintOrderWithEncoding(printerName, content, encoding) {
    console.log(`🖨️ [模拟编码打印] 打印机: ${printerName}, 编码: ${encoding}`);
    console.log(`📄 [模拟编码打印] 内容长度: ${content.length} 字符`);

    // 模拟网络延迟
    await new Promise((resolve) =>
      setTimeout(resolve, 300 + Math.random() * 700)
    );

    // 根据编码类型模拟不同的成功率
    let successRate = 0.95; // 默认95%成功率

    switch (encoding) {
      case ChineseEncoding.GBK:
      case ChineseEncoding.GB18030:
        successRate = 0.92; // GBK系列92%成功率
        break;
      case ChineseEncoding.BIG5:
        successRate = 0.85; // Big5 85%成功率
        break;
      case ChineseEncoding.UTF8:
        successRate = 0.98; // UTF8 98%成功率
        break;
    }

    if (Math.random() < successRate) {
      console.log(
        `✅ [模拟编码打印] ${printerName} 编码打印成功 (${encoding})`
      );
      return true;
    } else {
      throw new Error(
        `模拟编码打印失败: ${printerName} 不支持 ${encoding} 编码`
      );
    }
  }

  // 生成打印预览
  async generatePrintPreview(orderData, settings = {}) {
    try {
      const enabledPrinters = this.getEnabledPrinters();
      const printer =
        enabledPrinters.length > 0
          ? enabledPrinters[0]
          : { width: 80, fontSize: 0 };

      const previewSettings = {
        paperWidth: settings.paperWidth || printer.width || 80,
        fontSize:
          settings.fontSize !== undefined
            ? settings.fontSize
            : printer.fontSize !== undefined
            ? printer.fontSize
            : this.globalFontSize,
        fontFamily: settings.fontFamily || 'SimSun',
        lineSpacing: settings.lineSpacing || 1.2,
        margin: settings.margin || 5,
        showLogo: settings.showLogo !== undefined ? settings.showLogo : true,
        showOrderTime:
          settings.showOrderTime !== undefined ? settings.showOrderTime : true,
        showItemDetails:
          settings.showItemDetails !== undefined
            ? settings.showItemDetails
            : true,
        showSeparator:
          settings.showSeparator !== undefined ? settings.showSeparator : true,
      };

      return await window.electronAPI.generatePrintPreview(
        orderData,
        previewSettings
      );
    } catch (error) {
      console.error('生成打印预览失败:', error);
      throw error;
    }
  }

  async refreshPrinters() {
    await this.loadPrinters();
    return this.printers;
  }

  isPrinterAvailable(printerName) {
    return this.printers.some(
      (printer) => printer.name === printerName && printer.status !== 'Error'
    );
  }

  getAvailablePrinters() {
    return this.printers.filter((printer) => printer.status !== 'Error');
  }

  getPrinterStatus(printerName) {
    const printer = this.printers.find((p) => p.name === printerName);
    return printer ? printer.status : 'Unknown';
  }

  getPrinterInfo(printerName) {
    return this.printers.find((p) => p.name === printerName);
  }

  isAnyPrinterSelected() {
    return this.selectedPrinters.length > 0;
  }

  isAnyPrinterEnabled() {
    return this.printers.some((p) => p.isEnabled);
  }

  getSelectedPrintersCount() {
    return this.selectedPrinters.length;
  }

  getEnabledPrintersCount() {
    return this.printers.filter((p) => p.isEnabled).length;
  }

  validateSelectedPrinters() {
    // 检查选中的打印机是否仍然可用
    const availablePrinterNames = this.printers.map((p) => p.name);
    const validSelectedPrinters = this.selectedPrinters.filter((name) =>
      availablePrinterNames.includes(name)
    );

    if (validSelectedPrinters.length !== this.selectedPrinters.length) {
      console.warn('部分选中的打印机不再可用，已自动移除');
      this.selectedPrinters = validSelectedPrinters;
      this.saveConfig();
    }

    return validSelectedPrinters;
  }

  // 获取打印机类型文本
  getPrinterTypeText(printer) {
    if (printer.isThermal) {
      return `热敏打印机 (${printer.width}mm)`;
    } else {
      return `普通打印机 (${printer.width}mm)`;
    }
  }

  // 获取打印机状态图标
  getPrinterStatusIcon(printer) {
    if (!printer.isEnabled) return '⚪'; // 禁用
    switch (printer.status) {
      case 'Ready':
        return '🟢'; // 就绪
      case 'Error':
        return '🔴'; // 错误
      case 'Offline':
        return '🟡'; // 离线
      default:
        return '⚪'; // 未知
    }
  }

  // 获取打印机状态文本
  getPrinterStatusText(printer) {
    if (!printer.isEnabled) return '已禁用';
    switch (printer.status) {
      case 'Ready':
        return '就绪';
      case 'Error':
        return '错误';
      case 'Offline':
        return '离线';
      default:
        return '未知';
    }
  }

  // 新增：获取编码信息
  getEncodingInfo(printerName) {
    const printer = this.printers.find((p) => p.name === printerName);
    if (!printer) {
      return null;
    }

    return {
      name: printer.name,
      supportsChinese: printer.supportsChinese,
      recommendedEncoding: printer.recommendedEncoding,
      fallbackEncodings: printer.fallbackEncodings,
      commandLevel: printer.commandLevel,
      encodingDescription: this.getEncodingDescription(
        printer.recommendedEncoding
      ),
    };
  }

  // 新增：获取编码描述
  getEncodingDescription(encoding) {
    const descriptions = {
      [ChineseEncoding.UTF8]: 'UTF-8 - 通用Unicode编码，兼容性最好但文件较大',
      [ChineseEncoding.GBK]: 'GBK - 简体中文标准编码，适合大陆地区使用',
      [ChineseEncoding.GB2312]: 'GB2312 - 简体中文基础编码，字符集较少',
      [ChineseEncoding.GB18030]: 'GB18030 - 最新中文国标编码，字符集最全',
      [ChineseEncoding.BIG5]: 'Big5 - 繁体中文标准编码，适合港台地区使用',
      [ChineseEncoding.AUTO]: '自动检测 - 根据文本内容智能选择最佳编码',
    };

    return descriptions[encoding] || '未知编码';
  }

  // 新增：批量测试所有打印机编码
  async testAllPrintersEncoding() {
    console.log('🧪 [批量测试] 开始测试所有打印机编码兼容性');

    const enabledPrinters = this.getEnabledPrinters();
    if (enabledPrinters.length === 0) {
      throw new Error('没有启用的打印机可供测试');
    }

    const results = {};

    for (const printer of enabledPrinters) {
      try {
        console.log(`🔍 [批量测试] 测试打印机: ${printer.name}`);
        const encodingTestResult = await this.testPrinterEncodings(printer);
        results[printer.name] = encodingTestResult;
        console.log(`✅ [批量测试] ${printer.name} 测试完成`);
      } catch (error) {
        console.error(`❌ [批量测试] ${printer.name} 测试失败:`, error);
        results[printer.name] = {
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    }

    // 生成总体报告
    const summaryReport = this.generateBatchTestSummary(results);

    console.log('📊 [批量测试] 所有打印机编码测试完成', summaryReport);

    return {
      individual: results,
      summary: summaryReport,
    };
  }

  // 新增：生成批量测试总结报告
  generateBatchTestSummary(results) {
    const summary = {
      totalPrinters: Object.keys(results).length,
      successfulTests: 0,
      failedTests: 0,
      bestOverallEncoding: null,
      recommendations: [],
      warnings: [],
    };

    const encodingScores = {};
    let totalOverallScore = 0;

    for (const [printerName, result] of Object.entries(results)) {
      if (result.error) {
        summary.failedTests++;
        summary.warnings.push(
          `打印机 ${printerName} 测试失败: ${result.error}`
        );
        continue;
      }

      summary.successfulTests++;
      totalOverallScore += result.compatibilityReport.overallScore;

      // 统计各编码的平均表现
      for (const [encoding, scoreInfo] of Object.entries(
        result.compatibilityReport.encodingScores
      )) {
        if (!encodingScores[encoding]) {
          encodingScores[encoding] = { totalScore: 0, count: 0 };
        }
        encodingScores[encoding].totalScore += scoreInfo.averageScore;
        encodingScores[encoding].count++;
      }
    }

    // 计算最佳总体编码
    let bestEncoding = null;
    let bestScore = 0;

    for (const [encoding, stats] of Object.entries(encodingScores)) {
      const avgScore = stats.totalScore / stats.count;
      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestEncoding = encoding;
      }
    }

    summary.bestOverallEncoding = bestEncoding;
    summary.averageCompatibility =
      summary.successfulTests > 0
        ? totalOverallScore / summary.successfulTests
        : 0;

    // 生成建议
    if (summary.averageCompatibility >= 0.9) {
      summary.recommendations.push(
        '✅ 所有打印机对中文支持良好，建议继续使用当前配置'
      );
    } else if (summary.averageCompatibility >= 0.7) {
      summary.recommendations.push(
        '⚠️ 大部分打印机中文兼容性良好，建议对低分打印机进行特别配置'
      );
    } else {
      summary.recommendations.push(
        '❌ 多数打印机中文兼容性较差，建议检查打印机设置或更换设备'
      );
    }

    if (bestEncoding) {
      summary.recommendations.push(`🎯 推荐使用 ${bestEncoding} 作为默认编码`);
    }

    return summary;
  }

  // 新增：导出编码测试报告
  exportEncodingReport(testResults, format = 'json') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `printer-encoding-report-${timestamp}`;

    try {
      let content;
      let mimeType;
      let fileExtension;

      switch (format.toLowerCase()) {
        case 'json':
          content = JSON.stringify(testResults, null, 2);
          mimeType = 'application/json';
          fileExtension = 'json';
          break;
        case 'csv':
          content = this.convertReportToCSV(testResults);
          mimeType = 'text/csv';
          fileExtension = 'csv';
          break;
        case 'txt':
          content = this.convertReportToText(testResults);
          mimeType = 'text/plain';
          fileExtension = 'txt';
          break;
        default:
          throw new Error(`不支持的格式: ${format}`);
      }

      // 创建下载链接
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.${fileExtension}`;
      link.click();
      URL.revokeObjectURL(url);

      console.log(`📄 [导出] 编码测试报告已导出: ${filename}.${fileExtension}`);
      return true;
    } catch (error) {
      console.error('❌ [导出] 导出报告失败:', error);
      throw error;
    }
  }

  // 新增：转换报告为CSV格式
  convertReportToCSV(testResults) {
    const headers = [
      'Printer Name',
      'Chinese Support',
      'Recommended Encoding',
      'Overall Score',
      'UTF8 Score',
      'GBK Score',
      'GB18030 Score',
      'BIG5 Score',
    ];

    let csv = headers.join(',') + '\n';

    if (testResults.individual) {
      for (const [printerName, result] of Object.entries(
        testResults.individual
      )) {
        if (result.error) {
          csv += `"${printerName}","Error","${result.error}","","","","",""\n`;
          continue;
        }

        const row = [
          `"${printerName}"`,
          result.chineseSupport ? 'Yes' : 'No',
          `"${result.recommendedEncoding}"`,
          result.compatibilityReport.overallScore.toFixed(3),
          result.compatibilityReport.encodingScores[
            ChineseEncoding.UTF8
          ]?.averageScore.toFixed(3) || '',
          result.compatibilityReport.encodingScores[
            ChineseEncoding.GBK
          ]?.averageScore.toFixed(3) || '',
          result.compatibilityReport.encodingScores[
            ChineseEncoding.GB18030
          ]?.averageScore.toFixed(3) || '',
          result.compatibilityReport.encodingScores[
            ChineseEncoding.BIG5
          ]?.averageScore.toFixed(3) || '',
        ];

        csv += row.join(',') + '\n';
      }
    }

    return csv;
  }

  // 新增：转换报告为纯文本格式
  convertReportToText(testResults) {
    let text = '打印机中文编码兼容性测试报告\n';
    text += '='.repeat(50) + '\n';
    text += `生成时间: ${new Date().toLocaleString()}\n\n`;

    if (testResults.summary) {
      text += '总体概况:\n';
      text += '-'.repeat(20) + '\n';
      text += `测试打印机数量: ${testResults.summary.totalPrinters}\n`;
      text += `测试成功: ${testResults.summary.successfulTests}\n`;
      text += `测试失败: ${testResults.summary.failedTests}\n`;
      text += `平均兼容性: ${(
        testResults.summary.averageCompatibility * 100
      ).toFixed(1)}%\n`;
      text += `推荐编码: ${
        testResults.summary.bestOverallEncoding || 'N/A'
      }\n\n`;

      if (testResults.summary.recommendations.length > 0) {
        text += '建议:\n';
        testResults.summary.recommendations.forEach((rec) => {
          text += `  • ${rec}\n`;
        });
        text += '\n';
      }
    }

    if (testResults.individual) {
      text += '详细结果:\n';
      text += '-'.repeat(20) + '\n';

      for (const [printerName, result] of Object.entries(
        testResults.individual
      )) {
        text += `\n打印机: ${printerName}\n`;

        if (result.error) {
          text += `  错误: ${result.error}\n`;
          continue;
        }

        text += `  中文支持: ${result.chineseSupport ? '是' : '否'}\n`;
        text += `  推荐编码: ${result.recommendedEncoding}\n`;
        text += `  总体评分: ${(
          result.compatibilityReport.overallScore * 100
        ).toFixed(1)}%\n`;

        text += '  各编码评分:\n';
        for (const [encoding, scoreInfo] of Object.entries(
          result.compatibilityReport.encodingScores
        )) {
          text += `    ${encoding}: ${(scoreInfo.averageScore * 100).toFixed(
            1
          )}% (${scoreInfo.grade})\n`;
        }
      }
    }

    return text;
  }

  // 新增：模拟测试打印
  async mockTestPrint(printerName, width, fontSize) {
    console.log(
      `🧪 [模拟测试] 打印机: ${printerName}, 宽度: ${width}mm, 字体: ${fontSize}`
    );

    // 模拟网络延迟
    await new Promise((resolve) =>
      setTimeout(resolve, 800 + Math.random() * 400)
    );

    // 模拟测试页面生成
    const testContent = this.generateTestPageContent(
      printerName,
      width,
      fontSize
    );
    console.log(`📝 [模拟测试] 生成测试页面: ${testContent.length} 字符`);

    // 模拟成功率（95%）
    if (Math.random() < 0.95) {
      console.log(`✅ [模拟测试] ${printerName} 测试打印成功`);
      return true;
    } else {
      throw new Error(`模拟测试失败: ${printerName} 纸张不足`);
    }
  }

  // 新增：生成测试页面内容
  generateTestPageContent(printerName, width, fontSize) {
    const charWidth = width === 80 ? 48 : 32;
    let content = '';

    // 基础ESC/POS命令
    content += '\x1B@'; // 初始化

    // 字体大小设置
    switch (fontSize) {
      case 0:
        content += '\x1D\x21\x00';
        break; // 小号
      case 1:
        content += '\x1D\x21\x10';
        break; // 中号
      case 2:
        content += '\x1D\x21\x11';
        break; // 大号
    }

    // 测试内容
    content += '='.repeat(charWidth) + '\n';
    content += this.centerText('中文编码测试页面', charWidth) + '\n';
    content += '='.repeat(charWidth) + '\n\n';

    content += `打印机: ${printerName}\n`;
    content += `纸张宽度: ${width}mm\n`;
    content += `字体大小: ${this.getFontSizeText(fontSize)}\n`;
    content += `测试时间: ${new Date().toLocaleString()}\n\n`;

    content += '-'.repeat(charWidth) + '\n';
    content += '中文字符测试:\n';
    content += '简体: 你好世界！订单打印测试\n';
    content += '繁體: 您好世界！訂單列印測試\n';
    content += '符号: ￥＄€【】※±≠≤≥\n';
    content += '数字: 0123456789\n';
    content += '英文: ABCDEFGHIJKLMNOPQRSTUVWXYZ\n';
    content += '-'.repeat(charWidth) + '\n\n';

    content += '如果以上内容显示正常，\n';
    content += '说明打印机中文支持良好。\n\n';

    content += '测试完成 ' + new Date().toLocaleTimeString() + '\n\n\n';

    // 切纸命令
    content += '\x1D\x56\x00';

    return content;
  }
}

// 导出编码相关常量和工具类
window.ChineseEncoding = ChineseEncoding;
window.ChineseCharacterType = ChineseCharacterType;
window.ChineseEncodingDetector = ChineseEncodingDetector;
