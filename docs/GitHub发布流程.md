# GPTgps GitHub 发布流程

## 1. 新建仓库

在你的 GitHub 账号下创建新仓库（例如 `GPTgps`）。

建议：

- Public
- 初始化不要勾选 README（本地已有）

## 2. 绑定远程

```bash
git remote rename origin upstream
git remote add origin https://github.com/<your-name>/GPTgps.git
```

## 3. 提交并推送

```bash
git add .
git commit -m "release: GPTgps v2.6.0 (navigation + segment + mark + ai summary)"
git push -u origin master
```

## 4. 打标签（可选）

```bash
git tag -a v2.6.0 -m "GPTgps v2.6.0"
git push origin v2.6.0
```

## 5. 发布说明建议

可直接引用 README 的以下内容：

- 功能总览
- 本地安装方式（`dist_mv3` / `dist_mv2`）
- 许可证与来源说明（CC BY-NC-SA 4.0）

