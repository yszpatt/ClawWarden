/**
 * 泳道提示词来源
 */
export type PromptSource = 'user' | 'plan-doc' | 'lane-only' | 'custom';

/**
 * 输出格式类型
 */
export type OutputFormat = 'json_schema' | 'text';

/**
 * JSON Schema 类型
 */
export type JsonSchema = Record<string, unknown> | { type: string;[key: string]: unknown };

/**
 * 单个主操作配置
 */
export interface LaneActionConfig {
    /** 操作标识 */
    id: string;

    /** 操作名称 */
    name: string;

    /** 按钮文本 */
    buttonLabel: string;

    /** 按钮图标 (lucide-react 名称) */
    buttonIcon: string;

    /** 系统提示词（优先级高于泳道级） */
    systemPrompt?: string;

    /** 输出格式 */
    outputFormat?: OutputFormat;

    /** 输出 Schema */
    outputSchema?: JsonSchema;

    /** Agent 名称（可选） */
    agentName?: string;

    /** 使用的模型（可选） */
    model?: 'haiku' | 'sonnet' | 'opus';

    /** 执行时是否需要 worktree（覆盖任务卡片的 useWorktree） */
    requiresWorktree?: boolean;
}

/**
 * 泳道配置接口
 */
export interface LaneConfig {
    // ========== 基础信息 ==========
    /** 泳道 ID */
    id: string;

    /** 泳道名称 */
    name: string;

    /** 排序顺序 */
    order: number;

    /** 泳道颜色 */
    color: string;

    /** 泳道描述 */
    description?: string;

    // ========== 多核心操作支持 ==========
    /** 主操作列表 */
    primaryActions: LaneActionConfig[];

    // ========== 默认执行逻辑配置 ==========
    /** 提示词来源 */
    promptSource: PromptSource;

    /** 自定义 Prompt 模板 */
    customPromptTemplate?: string;

    /** 泳道级默认系统提示词 */
    systemPrompt?: string;

    /** 是否需要计划文档 */
    requiresPlan: boolean;

    /** 是否生成计划文档 */
    generatesPlan: boolean;

    /** 允许的工具列表，默认全部 */
    allowedTools?: string[];

    // ========== 流转配置 ==========
    /** 完成后自动移至的泳道 ID */
    onCompleteLane?: string;

    /** 失败后移至的泳道 ID */
    onFailureLane?: string;

    // ========== UI 配置 ==========
    /** 是否在看板上显示 */
    showInBoard: boolean;

    /** 是否允许创建任务 */
    allowTaskCreation: boolean;
}
