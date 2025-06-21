const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 临时解决方案：在这里定义安全输出函数
function safeLog(...args) {
  if (process.platform === 'win32') {
    const message = args
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join(' ');

    try {
      const buffer = Buffer.from(message, 'utf8');
      process.stdout.write(buffer);
      process.stdout.write('\n');
    } catch (error) {
      console.log(...args);
    }
  } else {
    console.log(...args);
  }
}

function safeError(...args) {
  if (process.platform === 'win32') {
    const message = args
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join(' ');

    try {
      const buffer = Buffer.from(message, 'utf8');
      process.stderr.write(buffer);
      process.stderr.write('\n');
    } catch (error) {
      console.error(...args);
    }
  } else {
    console.error(...args);
  }
}

class PrinterNative {
  constructor() {
    this.isInitialized = false;
    this.executablePath = null;
    this.checkExecutable();
  }

  checkExecutable() {
    try {
      // 检测是否是打包后的应用
      const isPackaged =
        require('electron') &&
        require('electron').app &&
        require('electron').app.isPackaged;

      let basePath;
      if (isPackaged) {
        // 打包后的路径：extraResources 被放在 resources 目录下
        basePath = process.resourcesPath;
        safeLog('[INFO] 检测到打包环境，资源路径:', basePath);
      } else {
        // 开发环境路径
        basePath = path.join(__dirname, '..');
        safeLog('[INFO] 检测到开发环境，基础路径:', basePath);
      }

      // 查找 Rust 可执行文件的多个可能位置
      const possiblePaths = [
        // 打包后的路径（extraResources 配置）
        path.join(basePath, 'printer-engine.exe'),
        // 备用路径1 - 在 app 目录下
        path.join(basePath, 'app', 'printer-engine.exe'),
        // 备用路径2 - 在 resources 子目录下
        path.join(basePath, 'resources', 'printer-engine.exe'),
        // 开发环境路径
        path.join(basePath, 'target', 'release', 'printer-engine.exe'),
        // 应用程序同级目录
        path.join(path.dirname(process.execPath), 'printer-engine.exe'),
        // 当前工作目录
        path.join(process.cwd(), 'printer-engine.exe'),
      ];

      safeLog('[DEBUG] 搜索 Rust 可执行文件的路径:');
      possiblePaths.forEach((p, i) => safeLog(`[DEBUG] ${i + 1}. ${p}`));

      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          this.executablePath = testPath;
          safeLog('[SUCCESS] 检测到 Rust 打印引擎:', this.executablePath);
          this.isInitialized = true;
          return;
        }
      }

      // 如果都没找到，记录详细信息以便调试
      safeLog('[WARNING] Rust 打印引擎未找到');
      safeLog('[DEBUG] isPackaged:', isPackaged);
      safeLog('[DEBUG] 当前工作目录:', process.cwd());
      safeLog('[DEBUG] __dirname:', __dirname);
      safeLog('[DEBUG] process.execPath:', process.execPath);
      safeLog('[DEBUG] process.resourcesPath:', process.resourcesPath);

      // 列出实际存在的文件以便调试
      if (basePath && fs.existsSync(basePath)) {
        try {
          const files = fs.readdirSync(basePath);
          safeLog(
            '[DEBUG] 资源目录内容:',
            files.filter((f) => f.endsWith('.exe'))
          );
        } catch (e) {
          safeLog('[DEBUG] 无法读取资源目录:', e.message);
        }
      }
    } catch (error) {
      safeError('[ERROR] 检查 Rust 打印引擎失败:', error);
    }
  }

  async getPrinters() {
    if (!this.isInitialized) {
      throw new Error('Rust 打印引擎未初始化');
    }

    try {
      const result = execSync(`"${this.executablePath}" list-printers`, {
        encoding: 'utf8',
        timeout: 10000,
      });

      return JSON.parse(result.trim());
    } catch (error) {
      console.error('获取打印机列表失败:', error);
      throw new Error(`获取打印机列表失败: ${error.message}`);
    }
  }

  async printOrder(printerName, orderData, width = 80, fontSize = 0) {
    if (!this.isInitialized) {
      throw new Error('Rust 打印引擎未初始化');
    }

    try {
      // 创建临时文件来避免命令行参数长度限制
      const tempFile = path.join(
        require('os').tmpdir(),
        `order_${Date.now()}.json`
      );
      fs.writeFileSync(tempFile, JSON.stringify(orderData), 'utf8');

      try {
        const orderJson = fs.readFileSync(tempFile, 'utf8');
        const command = `"${
          this.executablePath
        }" print-order --printer "${printerName}" --order "${orderJson.replace(
          /"/g,
          '\\"'
        )}" --width ${width} --font-size ${fontSize}`;

        const result = execSync(command, {
          encoding: 'utf8',
          timeout: 10000,
        });

        const printResult = JSON.parse(result.trim());

        if (printResult.success) {
          return {
            success: true,
            message: printResult.message,
          };
        } else {
          throw new Error(printResult.message);
        }
      } finally {
        // 清理临时文件
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    } catch (error) {
      console.error('Rust 打印订单失败:', error);
      throw new Error(`打印失败: ${error.message}`);
    }
  }

  async testPrint(printerName, width = 80, fontSize = 0) {
    if (!this.isInitialized) {
      throw new Error('Rust 打印引擎未初始化');
    }

    try {
      const command = `"${this.executablePath}" test-print --printer "${printerName}" --width ${width} --font-size ${fontSize}`;

      const result = execSync(command, {
        encoding: 'utf8',
        timeout: 10000,
      });

      const printResult = JSON.parse(result.trim());

      if (printResult.success) {
        return {
          success: true,
          message: printResult.message,
        };
      } else {
        throw new Error(printResult.message);
      }
    } catch (error) {
      console.error('Rust 测试打印失败:', error);
      throw new Error(`测试打印失败: ${error.message}`);
    }
  }

  isAvailable() {
    return this.isInitialized;
  }

  // 获取引擎版本信息
  async getVersion() {
    if (!this.isInitialized) {
      return null;
    }

    try {
      const result = execSync(`"${this.executablePath}" --version`, {
        encoding: 'utf8',
        timeout: 5000,
      });
      return result.trim();
    } catch (error) {
      return null;
    }
  }

  // 测试引擎连接
  async testConnection() {
    if (!this.isInitialized) {
      return false;
    }

    try {
      execSync(`"${this.executablePath}" list-printers`, {
        encoding: 'utf8',
        timeout: 5000,
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = PrinterNative;
