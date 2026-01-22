---
name: antiwarden-task-update
description: "更新现有 AntiWarden 任务卡片的状态或内容"
---

# 更新 AntiWarden 任务卡片

用于标记任务完成、添加执行结果或修改任务内容。

## 使用方法

在你的回复中包含以下格式的任务更新请求：

```
任务已完成，更新 AntiWarden 卡片：

[ANTIWARDEN:UPDATE]
taskId: abc123
status: completed
description: |
  完成了以下优化：
  - 添加了 user_id 索引
  - 使用 DataLoader 实现批量加载
  - 查询时间从 500ms 降到 50ms
[/ANTIWARDEN:UPDATE]
```

## 参数说明

- **taskId** (必填): 要更新的任务 ID
- **status** (可选): 新状态 - `idle`, `running`, `completed`, `failed`
- **title** (可选): 新标题
- **description** (可选): 新描述或追加描述
- **prompt** (可选): 更新执行 prompt

## 状态说明

| 状态 | 含义 |
|------|------|
| `idle` | 未开始，等待执行 |
| `running` | 正在执行中 |
| `completed` | 执行成功完成 |
| `failed` | 执行失败 |

## 最佳实践

- 任务完成时标记为 `completed` 并添加执行结果描述
- 发现问题时标记为 `failed` 并说明失败原因
- 更新描述时可以追加内容而非完全覆盖
