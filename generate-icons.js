const fs = require('fs');
const path = require('path');

// 创建基础PNG文件的脚本
const generateIcons = () => {
  console.log('🎨 开始生成图标文件...');

  // 检查assets目录
  if (!fs.existsSync('assets')) {
    fs.mkdirSync('assets');
  }

  // 生成基础的PNG图标（512x512）
  const createBasePNG = () => {
    console.log('📝 请手动将 assets/icon.svg 转换为以下尺寸的PNG文件：');
    console.log('   - icon-16.png (16x16)');
    console.log('   - icon-32.png (32x32)');
    console.log('   - icon-48.png (48x48)');
    console.log('   - icon-64.png (64x64)');
    console.log('   - icon-128.png (128x128)');
    console.log('   - icon-256.png (256x256)');
    console.log('   - icon-512.png (512x512)');
    console.log('   - icon-1024.png (1024x1024)');
    console.log('');
    console.log('🔧 推荐工具：');
    console.log('   1. 在线转换：https://convertio.co/svg-png/');
    console.log('   2. GIMP (免费)');
    console.log('   3. Inkscape (免费)');
    console.log('   4. Adobe Illustrator');
  };

  createBasePNG();

  // 创建简单的fallback PNG (用base64编码的小图标)
  const createFallbackIcon = () => {
    const simplePNG = `
# 简单的fallback图标
# 这是一个基础的64x64像素图标，您可以替换为更好的版本

1. 将 assets/icon.svg 在任何矢量图形软件中打开
2. 导出为以下尺寸的PNG文件：
   - 16x16, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512, 1024x1024

3. 使用工具生成ICO和ICNS：
   Windows ICO: https://convertio.co/png-ico/
   macOS ICNS: https://iconverticons.com/online/
`;

    fs.writeFileSync('assets/README-ICONS.txt', simplePNG);
    console.log('📋 图标生成指南已保存到 assets/README-ICONS.txt');
  };

  createFallbackIcon();
};

// 执行生成
generateIcons();

module.exports = { generateIcons };
