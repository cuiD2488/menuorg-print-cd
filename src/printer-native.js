const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 导入安全的控制台输出函数
const { safeConsoleLog, safeConsoleError } = require('../main');

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
      // 查找 Rust 可执行文件
      this.executablePath = path.join(
        __dirname,
        '..',
        'target',
        'release',
        'printer-engine.exe'
      );

      if (fs.existsSync(this.executablePath)) {
        safeLog('[SUCCESS] 检测到 Rust 打印引擎:', this.executablePath);
        this.isInitialized = true;
      } else {
        safeLog('[WARNING] Rust 打印引擎未找到，路径:', this.executablePath);
        safeLog('[INFO] 请先运行: cargo build --release');
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
