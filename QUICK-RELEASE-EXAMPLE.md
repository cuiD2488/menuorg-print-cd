# 🚀 快速发布示例

这是一个实际的发布操作示例，帮助您快速上手。

## ⚡ 5分钟快速发布

### 前提条件
- [ ] 已有GitHub账号
- [ ] 代码已在本地准备完毕
- [ ] 已安装Node.js和Git

### 第1步：配置GitHub（一次性操作）

```bash
# 1. 在GitHub上创建仓库 win7-print
# 2. 获取GitHub Token（见完整指南）
# 3. 设置环境变量
$env:GH_TOKEN = "ghp_你的Token"
```

### 第2步：推送代码到GitHub

```bash
# 添加远程仓库（替换为你的用户名）
git remote add origin https://github.com/你的用户名/win7-print.git

# 推送代码
git add .
git commit -m "Initial commit with auto-update"
git push -u origin main
```

### 第3步：更新package.json

编辑 `package.json`，替换GitHub用户名：

```json
{
  "build": {
    "publish": [
      {
        "provider": "github",
        "owner": "你的用户名",  👈 改这里
        "repo": "win7-print",
        "private": false
      }
    ]
  }
}
```

### 第4步：安装依赖并发布

```bash
# 安装自动更新依赖
npm install electron-updater@^6.1.7 semver@^7.5.4

# 构建并发布第一个版本
npm run release
```

### 第5步：验证发布成功

访问：`https://github.com/你的用户名/win7-print/releases`

应该看到 v1.0.0 release 和下载文件。

---

## 🔄 日常更新发布

### 发布新版本（例如：1.0.0 → 1.1.0）

```bash
# 方法1：手动修改
# 编辑 package.json: "version": "1.1.0"

# 方法2：使用npm命令（推荐）
npm version minor  # 1.0.0 → 1.1.0

# 提交并发布
git push origin main
npm run release
```

### 发布补丁版本（例如：1.1.0 → 1.1.1）

```bash
npm version patch  # 1.1.0 → 1.1.1
git push origin main
npm run release
```

---

## 🛠️ 实际操作示例

### 场景1：修复bug后发布补丁

```bash
# 1. 修复代码
git add .
git commit -m "fix: 修复打印机连接问题"

# 2. 更新版本号
npm version patch

# 3. 推送和发布
git push origin main
npm run release
```

### 场景2：添加新功能后发布

```bash
# 1. 完成新功能
git add .
git commit -m "feat: 新增自动重连功能"

# 2. 更新版本号
npm version minor

# 3. 推送和发布
git push origin main
npm run release
```

### 场景3：使用GitHub Actions自动发布

```bash
# 1. 确保代码已提交
git add .
git commit -m "feat: 添加新功能"

# 2. 创建并推送标签
git tag v1.2.0
git push origin main
git push origin v1.2.0

# 3. GitHub Actions会自动构建和发布
# 查看进度：https://github.com/你的用户名/win7-print/actions
```

---

## 📋 发布清单模板

每次发布前检查：

```
发布版本：v1.1.0
发布日期：2024-12-XX

准备工作：
- [ ] 代码测试完成
- [ ] 功能验证通过
- [ ] 文档已更新
- [ ] 版本号已更新

发布执行：
- [ ] git push origin main
- [ ] npm run release
- [ ] 验证GitHub Release
- [ ] 测试下载安装

发布后：
- [ ] 通知相关人员
- [ ] 更新用户文档
- [ ] 监控用户反馈
```

---

## ⚠️ 常见问题快速解决

### Token权限错误
```bash
Error: 403 Forbidden

解决：检查GitHub Token是否包含 repo 权限
```

### 网络连接问题
```bash
Error: connect ECONNREFUSED

解决：检查网络，确保可以访问GitHub
```

### 版本冲突
```bash
Error: Release already exists

解决：增加版本号或删除现有Release
```

### 构建失败
```bash
Error: electron-builder failed

解决：
npm cache clean --force
rm -rf node_modules
npm install
npm run build
```

---

## 📞 需要帮助？

1. 查看 [完整发布指南](RELEASE-GUIDE.md)
2. 查看 [自动更新指南](AUTO-UPDATE-GUIDE.md)
3. 检查 GitHub Actions 日志
4. 联系技术支持

---

**记住**：第一次配置可能需要10-15分钟，之后每次发布只需要2-3分钟！ 