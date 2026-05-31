[English](README.md) | 中文版

# 锤子便签工具箱

针对锤子欢喜云（cloud.smartisan.com）的一系列油猴脚本（Tampermonkey / Greasemonkey），需通过 [Tampermonkey](https://www.tampermonkey.net/) 或兼容的用户脚本管理器安装使用。

> 「锤子便签工具箱」脚本借鉴于 [anyuxurl/smartisan-notes-export](https://github.com/anyuxurl/smartisan-notes-export) 实现。

## 脚本列表

### 1. 锤子便签工具箱（导出 + 删除）

**文件**: `锤子便签工具箱.user.js`

集成了便签导出与批量删除功能，在 `#/notes` 页面右下角显示两个悬浮按钮：

| 按钮 | 颜色 | 功能 |
|---|---|---|
| ⬇ | 绿色 | 导出便签（ZIP / 独立 .md，含图片） |
| 🗑 | 红色 | 批量删除便签（模拟点击，仅便签 iframe 内显示） |

**导出功能**:
- 全部导出为 ZIP（自实现 STORE 模式，无外部依赖）
- 自定义导出：按分类 / 按顺序视图勾选笔记
- 支持内嵌图片下载与 base64 内联
- 包含修改时间、创建时间（可开关）
- Shift + 点击绿色按钮直接全部导出

**删除功能**:
- 读取 IndexedDB 获取便签列表
- 按分类筛选、搜索过滤
- 模拟点击逐条删除，带速率限制
- 两阶段删除：当前分类 → 自动跳转回收站 → 彻底删除
- 暂停 / 恢复 / 停止控制

**安装**: 直接安装 `锤子便签工具箱.user.js`，访问 <https://cloud.smartisan.com/?from=snote#/notes> 即可使用。

---

### 2. 锤子便签联系人删除助手

**文件**: `锤子便签联系人删除助手.user.js`

在 `#/contacts` 页面自动删除联系人。

- 红色悬浮按钮，点击后滚动收集全部联系人
- 确认后模拟点击逐条进入「编辑」→「删除联系人」→「确认」
- 虚拟滚动列表自动遍历
- 暂停 / 恢复 / 停止控制

**安装**: 单独安装 `锤子便签联系人删除助手.user.js`，访问 <https://cloud.smartisan.com/?from=snote#/contacts> 即可使用。

---

## 测试环境

- Google Chrome 148.0.7778.96 (Official Build) (64-bit) + Tampermonkey

## 许可

MIT
