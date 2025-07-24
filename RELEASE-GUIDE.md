# 📦 MenuorgPrint 发布指南

## 概述

本文档详细说明如何配置GitHub仓库并发布MenuorgPrint应用的新版本，包括自动更新功能的完整设置流程。

## 📋 目录

1. [前置准备](#前置准备)
2. [GitHub仓库配置](#github仓库配置)
3. [本地环境配置](#本地环境配置)
4. [发布配置](#发布配置)
5. [第一次发布](#第一次发布)
6. [日常更新发布](#日常更新发布)
7. [自动化发布（可选）](#自动化发布可选)
8. [故障排除](#故障排除)
9. [最佳实践](#最佳实践)

---

## 前置准备

### 必需工具和账号

- ✅ GitHub账号
- ✅ Git已安装并配置
- ✅ Node.js 16+ 已安装
- ✅ 本地代码已准备完毕

### 检查本地环境

```bash
# 检查必要工具版本
node --version    # 应该 >= 16.0.0
npm --version     # 应该 >= 8.0.0
git --version     # 任意版本

# 检查项目状态
npm list electron electron-builder electron-updater
```

---

## GitHub仓库配置

### 步骤1：创建GitHub仓库

1. **登录GitHub**
   - 访问 [github.com](https://github.com)
   - 点击右上角 "+" → "New repository"

2. **仓库设置**
   ```
   Repository name: win7-print
   Description: MenuorgPrint - Restaurant Order Printing System
   Visibility: Public (重要：自动更新需要公开仓库)
   Initialize: 不要勾选任何初始化选项
   ```

3. **推送本地代码**
   ```bash
   # 在项目根目录执行
   git remote add origin https://github.com/您的用户名/win7-print.git
   git branch -M main
   git add .
   git commit -m "Initial commit with auto-update functionality"
   git push -u origin main
   ```

### 步骤2：创建GitHub Personal Access Token

1. **进入Token设置页面**
   ```
   GitHub首页 → 右上角头像 → Settings → 
   左侧菜单 Developer settings → Personal access tokens → 
   Tokens (classic) → Generate new token (classic)
   ```

2. **配置Token**
   ```
   Note: MenuorgPrint Auto Update
   Expiration: No expiration (或选择较长时间)
   
   Select scopes (权限选择):
   ✅ repo (完整的仓库权限)
     ✅ repo:status
     ✅ repo_deployment
     ✅ public_repo
     ✅ repo:invite
   ✅ write:packages
   ✅ read:packages
   ```

3. **保存Token**
   - 点击 "Generate token"
   - **⚠️ 重要**：立即复制Token并保存到安全位置
   - Token格式：`ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **注意**：Token只显示一次，丢失需要重新生成

### 步骤3：配置仓库权限

1. **Actions权限设置**
   ```
   仓库页面 → Settings → Actions → General →
   Actions permissions: Allow all actions and reusable workflows
   Workflow permissions: Read and write permissions
   ```

2. **Releases权限验证**
   ```
   仓库页面 → Settings → 确认 Features 中的 Issues 和 Projects 已启用
   ```

---

## 本地环境配置

### 步骤1：安装依赖

```bash
# 安装自动更新依赖
npm install electron-updater@^6.1.7 semver@^7.5.4

# 如果安装失败，尝试清理缓存
npm cache clean --force
npm install electron-updater@^6.1.7 semver@^7.5.4 --legacy-peer-deps
```

### 步骤2：配置环境变量

选择以下任一方法配置GitHub Token：

#### 方法1：系统环境变量（推荐）
```bash
# Windows PowerShell (管理员模式)
[Environment]::SetEnvironmentVariable("GH_TOKEN", "您的GitHub_Token", "User")

# 重启命令行窗口使生效
```

#### 方法2：项目.env文件
```bash
# 在项目根目录创建 .env 文件
echo GH_TOKEN=您的GitHub_Token > .env

# 添加到 .gitignore (重要：避免泄露Token)
echo .env >> .gitignore
```

#### 方法3：临时设置（仅当前会话）
```bash
# PowerShell
$env:GH_TOKEN = "您的GitHub_Token"

# 验证设置
echo $env:GH_TOKEN
```

### 步骤3：验证Token配置

```bash
# 测试GitHub连接
git ls-remote https://github.com/您的用户名/win7-print.git

# 如果安装了GitHub CLI，可以验证
gh auth status
```

---

## 发布配置

### 步骤1：更新package.json

编辑 `package.json` 文件，确保以下配置正确：

```json
{
  "name": "restaurant-order-printer",
  "version": "1.0.0",
  "build": {
    "appId": "com.restaurant.orderprinter",
    "productName": "MenuorgPrint",
    "publish": [
      {
        "provider": "github",
        "owner": "您的GitHub用户名",
        "repo": "win7-print",
        "private": false,
        "releaseType": "release"
      }
    ]
  }
}
```

**⚠️ 重要配置说明**：
- `owner`: 替换为您的GitHub用户名
- `repo`: 仓库名称，必须与GitHub仓库名一致
- `private`: 设为 `false`（公开仓库）
- `releaseType`: 设为 `"release"`（正式版本）

### 步骤2：验证构建配置

```bash
# 测试本地构建
npm run build

# 检查构建输出
ls dist/
```

构建成功后，`dist/` 目录应包含：
- `MenuorgPrint Setup 1.0.0.exe` (安装包)
- `latest.yml` (更新元数据)

---

## 第一次发布

### 步骤1：准备发布

```bash
# 1. 确保所有代码已提交
git add .
git commit -m "feat: Add auto-update functionality"
git push origin main

# 2. 确认版本号
grep '"version"' package.json
```

### 步骤2：执行发布

```bash
# 构建并发布到GitHub Releases
npm run release
```

**发布过程中的输出示例**：
```bash
Building for Windows x64
Packaging app for Windows x64
Creating NSIS installer
Uploading to GitHub Releases...
Release created successfully: v1.0.0
```

### 步骤3：验证发布结果

1. **检查GitHub Releases**
   ```
   访问：https://github.com/您的用户名/win7-print/releases
   确认看到 v1.0.0 release 和下载文件
   ```

2. **下载测试**
   ```
   下载 MenuorgPrint Setup 1.0.0.exe
   在测试机器上安装并运行
   测试自动更新功能
   ```

### 步骤4：手动创建Release（如果自动发布失败）

1. **访问GitHub仓库页面**
   - 点击右侧 "Releases" → "Create a new release"

2. **填写Release信息**
   ```
   Tag version: v1.0.0
   Release title: MenuorgPrint v1.0.0
   Description: 
   ## 🎉 初始版本发布
   
   ### ✨ 主要功能
   - CLodop打印引擎集成
   - 多种纸张规格支持
   - 分菜打印功能
   - 自动更新功能
   
   ### 📦 安装说明
   1. 下载 MenuorgPrint Setup 1.0.0.exe
   2. 以管理员身份运行安装程序
   3. 按提示完成安装
   4. 确保已安装CLodop打印服务
   ```

3. **上传文件**
   - 将 `dist/` 目录下的文件拖拽到附件区域
   - 必须包含：`.exe` 安装包和 `latest.yml` 文件

4. **发布Release**
   - 确认信息无误后点击 "Publish release"

---

## 日常更新发布

### 版本更新流程

```bash
# 1. 修改版本号
# 编辑 package.json，更新 "version" 字段
# 例如：从 "1.0.0" 改为 "1.1.0"

# 2. 更新版本号的快捷方式
npm version patch   # 1.0.0 → 1.0.1 (补丁版本)
npm version minor   # 1.0.0 → 1.1.0 (次要版本)
npm version major   # 1.0.0 → 2.0.0 (主要版本)

# 3. 提交版本更新
git add package.json
git commit -m "chore: bump version to v1.1.0"
git push origin main

# 4. 构建并发布
npm run release

# 5. 可选：创建Git标签
git tag v1.1.0
git push origin v1.1.0
```

### 发布清单

每次发布前检查：

- [ ] 代码已测试完毕
- [ ] 版本号已更新
- [ ] 更新日志已准备
- [ ] 所有代码已提交
- [ ] GitHub Token仍然有效
- [ ] 网络连接正常

### 发布后验证

```bash
# 1. 确认GitHub Release已创建
curl -s https://api.github.com/repos/您的用户名/win7-print/releases/latest

# 2. 测试自动更新
# - 运行旧版本应用
# - 检查是否检测到新版本
# - 测试下载和安装流程
```

---

## 自动化发布（可选）

### 创建GitHub Actions工作流

创建 `.github/workflows/release.yml` 文件：

```bash
# 创建目录
mkdir -p .github/workflows
```

**文件内容**：

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: windows-latest

    steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Build application
      run: npm run build
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

    - name: Release
      run: npm run release
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 使用自动化工作流

```bash
# 1. 更新版本号
npm version minor

# 2. 推送代码和标签
git push origin main
git push origin --tags

# 3. GitHub Actions会自动构建和发布
# 查看进度：https://github.com/您的用户名/win7-print/actions
```

---

## 故障排除

### 常见错误和解决方案

#### 1. Token权限不足
```bash
Error: 403 Forbidden - You don't have permission to create releases

解决方案：
1. 检查GitHub Token权限是否包含 'repo' 权限
2. 重新生成Token并确保选择正确的权限
3. 更新环境变量中的Token
```

#### 2. 网络连接问题
```bash
Error: connect ECONNREFUSED 140.82.112.3:443

解决方案：
1. 检查网络连接
2. 确认可以访问GitHub
3. 检查防火墙设置
4. 如在中国大陆，考虑使用代理
```

#### 3. 版本冲突
```bash
Error: Release already exists for this tag

解决方案：
1. 检查是否已存在同版本的Release
2. 删除现有Release后重新发布
3. 或增加版本号后重新发布
```

#### 4. 文件上传失败
```bash
Error: Failed to upload release assets

解决方案：
1. 检查文件大小（GitHub限制2GB）
2. 确认文件没有被占用
3. 重新构建后再次上传
```

#### 5. 构建失败
```bash
Error: Command failed: electron-builder

解决方案：
1. 清理node_modules：rm -rf node_modules && npm install
2. 清理构建缓存：rm -rf dist
3. 更新electron-builder：npm update electron-builder
4. 检查构建配置是否正确
```

### 调试工具

```bash
# 1. 详细构建日志
npm run build -- --verbose

# 2. 测试GitHub连接
curl -H "Authorization: token 您的Token" \
  https://api.github.com/repos/您的用户名/win7-print/releases

# 3. 验证构建输出
file dist/MenuorgPrint\ Setup\ *.exe

# 4. 检查更新元数据
cat dist/latest.yml
```

---

## 最佳实践

### 版本管理

1. **语义化版本控制**
   ```
   主版本号.次版本号.修订号 (major.minor.patch)
   
   例如：
   1.0.0 → 1.0.1 (修复bug)
   1.0.1 → 1.1.0 (新功能)
   1.1.0 → 2.0.0 (破坏性变更)
   ```

2. **分支策略**
   ```bash
   main    - 稳定版本，用于发布
   develop - 开发分支
   feature/xxx - 功能分支
   hotfix/xxx  - 热修复分支
   ```

### 发布时机

1. **定期发布**：每2-4周发布一次次要版本
2. **紧急修复**：发现严重bug时立即发布补丁版本
3. **功能发布**：重要功能完成后发布次要版本

### 质量保证

1. **发布前测试**
   ```bash
   # 运行所有测试
   npm test
   
   # 构建测试
   npm run build
   
   # 安装测试
   # 在干净的Windows环境中测试安装包
   ```

2. **回滚准备**
   ```bash
   # 保留上一个版本的安装包
   # 准备回滚脚本
   # 确保可以快速恢复到稳定版本
   ```

### 安全注意事项

1. **Token安全**
   - 定期更换GitHub Token
   - 不要在代码中硬编码Token
   - 使用环境变量或安全的存储方式

2. **文件签名**（生产环境推荐）
   ```json
   {
     "build": {
       "win": {
         "certificateFile": "path/to/certificate.p12",
         "certificatePassword": "password"
       }
     }
   }
   ```

3. **更新安全**
   - 只从官方源下载更新
   - 验证下载文件的完整性
   - 提供安全的回滚机制

### 监控和分析

1. **发布监控**
   ```bash
   # 监控GitHub API使用情况
   curl -H "Authorization: token 您的Token" \
     https://api.github.com/rate_limit
   ```

2. **用户反馈**
   - 收集自动更新成功/失败的统计数据
   - 监控GitHub Issues中的用户反馈
   - 分析下载量和使用情况

---

## 📞 技术支持

如果在发布过程中遇到问题：

1. **查看本文档的故障排除部分**
2. **检查GitHub Actions日志**：仓库页面 → Actions
3. **查看electron-builder文档**：[electron.build](https://www.electron.build/)
4. **检查electron-updater文档**：[GitHub](https://github.com/electron-userland/electron-builder/tree/master/packages/electron-updater)

---

## 📋 发布检查清单

### 发布前检查
- [ ] 代码已完成并测试
- [ ] 版本号已更新
- [ ] 更新日志已准备
- [ ] GitHub Token有效
- [ ] 网络连接正常
- [ ] 本地构建成功

### 发布执行
- [ ] 提交所有代码
- [ ] 执行 `npm run release`
- [ ] 验证构建成功
- [ ] 检查GitHub Release

### 发布后验证
- [ ] 下载安装包测试
- [ ] 测试自动更新功能
- [ ] 验证应用正常运行
- [ ] 收集用户反馈

---

**最后更新**: 2024年12月  
**版本**: 1.0.0  
**适用于**: MenuorgPrint v1.0.0+ 