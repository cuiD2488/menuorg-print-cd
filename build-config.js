// 构建配置文件
// 已精简为纯CLodop方案，默认启用CLodop模式

const fs = require('fs');
const path = require('path');

// 由于已精简为纯CLodop方案，默认启用CLodop
const buildMode = 'clodop';
const isLodopMode = true;

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
