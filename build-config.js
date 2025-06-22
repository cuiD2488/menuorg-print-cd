// 构建配置文件
// 根据环境变量 BUILD_MODE 来设置不同的构建配置

const fs = require('fs');
const path = require('path');

const buildMode = process.env.BUILD_MODE || 'normal';
const isLodopMode = buildMode === 'lodop';

console.log(`[BUILD] 构建模式: ${buildMode}`);
console.log(`[BUILD] C-Lodop模式: ${isLodopMode ? '启用' : '禁用'}`);

// 创建构建时配置文件
const buildConfig = {
  buildMode: buildMode,
  useLodop: isLodopMode,
  buildTime: new Date().toISOString(),
  version: require('./package.json').version,
};

// 写入构建配置到renderer目录
const configPath = path.join(__dirname, 'renderer', 'build-config.json');
fs.writeFileSync(configPath, JSON.stringify(buildConfig, null, 2));

console.log(`[BUILD] 构建配置已写入: ${configPath}`);
console.log(`[BUILD] 配置内容:`, buildConfig);

module.exports = buildConfig;
