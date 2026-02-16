import { promises } from 'node:fs';
import path from 'node:path';
import { getLaneConfig, DEFAULT_LANE_CONFIGS } from '@vibewarden/shared';
import type { LaneConfig, LaneActionConfig } from '@vibewarden/shared';

/**
 * 项目级配置文件路径（相对于项目根目录）
 */
export const PROJECT_LANE_CONFIG_FILE = '.vibewarden/laneconfig.json';

/**
 * 项目级配置接口
 */
export interface ProjectLaneConfig {
    /** 允许文件顶层注释 */
    _comment?: string;
    [laneId: string]: (Omit<Partial<LaneConfig>, 'primaryActions'> & {
        /** 主操作列表覆盖 */
        primaryActions?: Array<Partial<LaneActionConfig> & {
            id: string;
            /** 允许操作级注释 */
            _comment?: string;
        }>;
        /** 允许泳道级注释 */
        _comment?: string;
    }) | string | undefined;
}

/**
 * 读取项目级泳道配置
 *
 * @param projectPath - 项目根目录路径
 * @returns 项目级配置对象，文件不存在时返回空对象
 */
export async function readProjectLaneConfig(
    projectPath: string
): Promise<ProjectLaneConfig> {
    const configPath = path.join(projectPath, PROJECT_LANE_CONFIG_FILE);
    try {
        const content = await promises.readFile(configPath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return {};
    }
}

/**
 * 写入项目级泳道配置
 */
export async function writeProjectLaneConfig(
    projectPath: string,
    config: ProjectLaneConfig
): Promise<void> {
    const configPath = path.join(projectPath, PROJECT_LANE_CONFIG_FILE);
    const configDir = path.dirname(configPath);
    await promises.mkdir(configDir, { recursive: true });
    await promises.writeFile(
        configPath,
        JSON.stringify(config, null, 2),
        'utf-8'
    );
}

/**
 * 生成全量的项目级配置文件
 */
export async function generateProjectLaneConfig(
    projectPath: string
): Promise<void> {
    const config: ProjectLaneConfig = {
        _comment: 'VibeWarden 泳道配置文件。在这里自定义你的 Agent 工作流。系统优先从此文件读取配置。\n\n' +
            '常用字段说明：\n' +
            '- primaryActions: 为该泳道定义的按钮操作。支持自定义 Prompt、工具和模型。\n' +
            '- promptSource: "user" (用户 Prompt), "plan-doc" (基于 .md 计划), "lane-only" (仅系统 Prompt)\n' +
            '- onCompleteLane: 任务执行成功后自动流转到的下一个泳道 ID\n' +
            '- allowedTools: 限制 Agent 可以使用的工具（如 ["Read", "Find"] 等）'
    };

    // 将所有默认配置填充到文件中，实现全量生成
    for (const [laneId, defaultConfig] of Object.entries(DEFAULT_LANE_CONFIGS)) {
        config[laneId] = {
            ...defaultConfig,
            _comment: `配置 ${defaultConfig.name} 泳道的行为`
        };
    }

    await writeProjectLaneConfig(projectPath, config);
}

/**
 * 合并主操作列表
 * 
 * 逻辑：如果 overrideActions 存在，则以 overrideActions 的顺序和内容为准。
 * 对于 overrideActions 中的每一项，如果其 ID 在 defaultActions 中存在，则合并默认配置。
 * 不在 overrideActions 中的项将被排除。
 */
function mergePrimaryActions(
    defaultActions: LaneActionConfig[],
    overrideActions?: Array<Partial<LaneActionConfig>>
): LaneActionConfig[] {
    // 只有在 overrideActions 确实不存（undefined）在时，才使用默认值
    // 如果是空数组，说明用户想要一个空的操作列表
    if (overrideActions === undefined) {
        return defaultActions;
    }

    const defaultMap = new Map(
        defaultActions.map(action => [action.id, action])
    );

    return overrideActions.map(override => {
        const defaultAction = defaultMap.get(override.id || '');
        return {
            ...defaultAction,
            ...override,
        } as LaneActionConfig;
    });
}

/**
 * 获取合并后的泳道配置
 *
 * 优先级：overrideActions (参数) > laneOverride.primaryActions (项目文件) > defaultConfig.primaryActions (默认)
 */
export async function getMergedLaneConfig(
    laneId: string,
    projectPath: string,
    defaultConfig: LaneConfig = DEFAULT_LANE_CONFIGS[laneId] || {},
    overrideActions?: Array<Partial<LaneActionConfig>>
): Promise<LaneConfig> {
    const projectConfig = await readProjectLaneConfig(projectPath);
    const laneValue = projectConfig[laneId];
    const laneOverride = (typeof laneValue === 'object' ? laneValue : {}) || {};

    let mergedPrimaryActions = mergePrimaryActions(
        defaultConfig.primaryActions || [],
        (laneOverride.primaryActions || []) as Array<Partial<LaneActionConfig>>
    );

    if (overrideActions && overrideActions.length > 0) {
        mergedPrimaryActions = mergePrimaryActions(
            mergedPrimaryActions,
            overrideActions
        );
    }

    return {
        ...defaultConfig,
        ...laneOverride,
        primaryActions: mergedPrimaryActions,
    } as LaneConfig;
}

/**
 * 获取合并后的所有泳道配置
 */
export async function getAllMergedLaneConfigs(
    projectPath: string
): Promise<LaneConfig[]> {
    const laneIds = Object.keys(DEFAULT_LANE_CONFIGS);
    const configs: LaneConfig[] = [];

    for (const laneId of laneIds) {
        const defaultConfig = getLaneConfig(laneId);
        if (defaultConfig) {
            configs.push(await getMergedLaneConfig(laneId, projectPath, defaultConfig));
        }
    }

    return configs;
}
