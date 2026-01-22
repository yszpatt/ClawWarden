---
name: antiwarden-task-create
description: "创建新的 AntiWarden 任务卡片（默认进入设计泳道，需人工审核后执行）"
---

# 创建 AntiWarden 任务卡片

当你完成一个任务后发现有后续优化点或新的工作项，使用此 skill 创建新的任务卡片。

## 使用方法

在你的回复中包含以下格式的任务创建请求：

```
我发现了一个优化点，让我创建一个 AntiWarden 任务卡片：

[ANTIWARDEN:CREATE]
title: 优化数据库查询性能
description: 发现 N+1 查询问题，需要添加索引和使用批量加载优化
prompt: |
  请分析 src/services/user-service.ts 中的数据库查询，
  找出 N+1 查询问题并进行优化。
  1. 添加适当的索引
  2. 使用批量加载替代循环查询
  3. 添加查询性能测试
[/ANTIWARDEN:CREATE]
```

## 参数说明

- **title** (必填): 任务标题，简洁描述任务内容
- **description** (必填): 任务描述，解释为什么需要这个任务
- **prompt** (可选): Claude 执行此任务时使用的 prompt

## 行为

1. 卡片默认创建在 **设计泳道**
2. 卡片标记为 `createdBy: 'claude'`，在 Web 界面显示为 🤖 标识
3. 卡片状态为 `idle`，需要用户审核后手动执行
4. 创建后会写入项目的 `.antiwarden/tasks.json` 文件

## 最佳实践

- 每次只创建一个任务卡片
- 标题应简洁明了（10-30 字）
- 描述应解释任务的背景和原因
- Prompt 应详细具体，包含文件路径和预期结果
- 不要为已完成的工作创建卡片
