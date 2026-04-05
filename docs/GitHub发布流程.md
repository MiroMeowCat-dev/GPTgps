# GPTgps GitHub 发布流程

## 1. 创建仓库

在你的 GitHub 账号下创建新仓库，例如 `GPTgps`。

建议：

- 公开仓库
- 不要勾选初始化 README

## 2. 绑定远程

如果本地还保留上游仓库，可以这样保留 upstream，同时把你自己的仓库作为 origin：

```bash
git remote rename origin upstream
git remote add origin https://github.com/<your-name>/GPTgps.git
```

如果 `origin` 已经是你自己的仓库，就不需要重复添加。

## 3. 提交并推送

```bash
git add README.md docs/ manifests/ src/
git commit -m "release: GPTgps v2.6.0"
git push -u origin master
```

如果当前默认分支是 `main`，把上面的 `master` 改成 `main`。

## 4. 打标签（可选）

```bash
git tag -a v2.6.0 -m "GPTgps v2.6.0"
git push origin v2.6.0
```

## 5. 发布页建议写什么

建议至少包含：

- 项目简介
- 支持的网站
- 安装方法
- 核心功能
- 已知限制
- 许可协议与来源说明

这些内容已经基本写在 [README.md](/C:/Users/36135/Documents/Codex%20GPTgps/README.md) 里，可以直接复用。
