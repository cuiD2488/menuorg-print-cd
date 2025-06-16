# 中文编码增强版打印机管理器使用指南

基于 main.rs 实现逻辑的 JavaScript 版本，支持智能中文编码检测和兼容性测试。

## 主要功能

### 1. 智能编码检测
- 自动识别简体中文、繁体中文、混合文本
- 支持 UTF-8、GBK、GB2312、GB18030、Big5 等多种编码
- 根据文本内容智能选择最佳编码

### 2. 打印机编码兼容性测试
- 单个打印机编码测试
- 批量打印机编码测试
- 生成详细的兼容性报告

### 3. 增强的打印功能
- 自动编码优化
- 多重备用编码策略
- ESC/POS 命令优化

## 使用示例

### 基本使用

```javascript
// 初始化打印机管理器
const printerManager = new PrinterManager();
await printerManager.init();

// 获取打印机列表
const printers = await printerManager.loadPrinters();
console.log('检测到的打印机:', printers);

// 查看打印机编码信息
printers.forEach(printer => {
  const encodingInfo = printerManager.getEncodingInfo(printer.name);
  console.log(`${printer.name} 编码信息:`, encodingInfo);
});
```

### 编码兼容性测试

```javascript
// 测试单个打印机编码兼容性
const testResult = await printerManager.testPrint('XPrinter58', true); // 第二个参数为true启用编码测试
console.log('编码测试结果:', testResult);

// 测试所有启用的打印机
const batchTestResult = await printerManager.testAllPrintersEncoding();
console.log('批量测试结果:', batchTestResult);

// 导出测试报告
printerManager.exportEncodingReport(batchTestResult, 'json'); // 支持 json、csv、txt 格式
```

### 测试特定编码

```javascript
const testText = "测试文本：宫保鸡丁、麻婆豆腐 ￥99.50";
const encodingTest = await printerManager.testSingleEncoding(
  testText, 
  ChineseEncoding.GBK, 
  'XPrinter58'
);
console.log('GBK编码测试结果:', encodingTest);
```

### 智能编码检测

```javascript
const detector = new ChineseEncodingDetector();

// 检测文本字符类型
const charType = detector.detectChineseType("简体中文测试文本");
console.log('字符类型:', charType); // 输出: SIMPLIFIED

// 测试所有编码并排序
const encodingTests = detector.testAllEncodings("测试文本：訂單#123");
encodingTests.forEach(test => {
  console.log(`${test.encoding}: ${(test.compatibilityScore * 100).toFixed(1)}%`);
});

// 自动选择最佳编码
const bestEncoding = detector.autoSelectEncoding("混合文本測試", {
  recommendedEncoding: ChineseEncoding.AUTO,
  fallbackEncodings: [ChineseEncoding.GBK, ChineseEncoding.UTF8, ChineseEncoding.BIG5]
});
console.log('推荐编码:', bestEncoding);
```

### 打印订单（增强版）

```javascript
const orderData = {
  order_id: "ORD-2025-001",
  recipient_name: "张三",
  recipient_address: "北京市朝阳区望京街道123号",
  rd_name: "老王川菜馆",
  dishes_array: [
    {
      dishes_name: "宫保鸡丁",
      amount: 1,
      price: "28.00",
      remark: "不要太辣"
    },
    {
      dishes_name: "麻婆豆腐",
      amount: 1,
      price: "18.00",
      remark: "多放花椒"
    }
  ],
  total: "46.00"
};

// 自动选择最佳编码打印
await printerManager.printOrder(orderData);
```

## 编码兼容性报告示例

### 单个打印机报告

```javascript
{
  "printer": "XPrinter XP-58III",
  "chineseSupport": true,
  "recommendedEncoding": "GBK",
  "fallbackEncodings": ["GBK", "GB18030", "UTF8"],
  "testResults": {
    "simplified": {
      "characterType": "SIMPLIFIED",
      "recommendedEncoding": "GBK",
      "bestEncoding": {
        "encoding": "GBK",
        "compatibilityScore": 0.95,
        "success": true
      }
    },
    "traditional": {
      "characterType": "TRADITIONAL", 
      "recommendedEncoding": "BIG5",
      "bestEncoding": {
        "encoding": "UTF8",
        "compatibilityScore": 0.85,
        "success": true
      }
    }
  },
  "compatibilityReport": {
    "overallScore": 0.89,
    "encodingScores": {
      "GBK": {
        "averageScore": 0.92,
        "grade": "优秀"
      },
      "UTF8": {
        "averageScore": 0.88,
        "grade": "良好"
      }
    },
    "recommendations": [
      "推荐使用 GBK 编码，兼容性极佳 (92.0%)"
    ],
    "warnings": []
  }
}
```

### 批量测试总结报告

```javascript
{
  "summary": {
    "totalPrinters": 3,
    "successfulTests": 3,
    "failedTests": 0,
    "bestOverallEncoding": "GBK",
    "averageCompatibility": 0.87,
    "recommendations": [
      "✅ 所有打印机对中文支持良好，建议继续使用当前配置",
      "🎯 推荐使用 GBK 作为默认编码"
    ],
    "warnings": []
  }
}
```

## 编码类型说明

| 编码 | 描述 | 适用场景 |
|------|------|----------|
| UTF8 | 通用Unicode编码，兼容性最好但文件较大 | 国际化应用、混合语言文本 |
| GBK | 简体中文标准编码，适合大陆地区使用 | 简体中文为主的应用 |
| GB2312 | 简体中文基础编码，字符集较少 | 基础简体中文应用 |
| GB18030 | 最新中文国标编码，字符集最全 | 需要完整中文字符集的应用 |
| BIG5 | 繁体中文标准编码，适合港台地区使用 | 繁体中文为主的应用 |
| AUTO | 根据文本内容智能选择最佳编码 | 不确定文本类型的场景 |

## 打印机兼容性等级

| 等级 | 分数范围 | 描述 |
|------|----------|------|
| 优秀 | 95%+ | 完美支持，无需调整 |
| 良好 | 85-94% | 支持良好，偶有小问题 |
| 一般 | 70-84% | 基本支持，可能需要调整 |
| 较差 | 50-69% | 支持有限，建议更换设备 |
| 很差 | <50% | 不建议使用 |

## 最佳实践建议

1. **首次使用时运行完整编码测试**
   ```javascript
   const testResults = await printerManager.testAllPrintersEncoding();
   printerManager.exportEncodingReport(testResults, 'json');
   ```

2. **根据业务场景选择合适编码**
   - 纯简体中文环境：优先使用 GBK
   - 纯繁体中文环境：优先使用 BIG5  
   - 混合语言环境：使用 UTF8 或 AUTO

3. **定期测试打印机兼容性**
   - 新增打印机时必须进行编码测试
   - 定期检查现有打印机的编码兼容性
   - 保存测试报告以便后续参考

4. **错误处理和备用方案**
   - 始终配置多个备用编码
   - 监控打印失败率和错误日志
   - 对兼容性较差的打印机使用保守配置

## 错误排查

### 常见问题

1. **中文字符显示为乱码**
   - 检查打印机是否支持中文
   - 尝试不同的编码类型
   - 检查ESC/POS命令设置

2. **编码测试失败**
   - 确认打印机连接正常
   - 检查打印机驱动安装
   - 验证打印机型号支持中文

3. **性能问题**
   - 减少同时测试的文本类型
   - 使用缓存已测试的结果
   - 异步执行批量测试

通过这个增强版的打印机管理器，您可以获得更好的中文打印兼容性和更智能的编码选择，显著提升热敏打印机的中文输出质量。 