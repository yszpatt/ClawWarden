import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to the templates directory
const CLAUDE_TEMPLATE_DIR = join(__dirname, '../../templates/claude');

/**
 * Sensitive keys to exclude from settings.json template
 */
const SENSITIVE_KEYS = [
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
    'API_TIMEOUT_MS',
    'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
    'env'
];

/**
 * Options for installing .claude directory
 */
export interface InstallClaudeOptions {
    /** Whether to inherit global rules from ~/.claude/rules/ */
    inheritGlobalRules?: boolean;
    /** Whether to create ClawWarden integration files */
    createClawWardenIntegration?: boolean;
    /** Whether to overwrite existing files */
    overwriteExisting?: boolean;
    /** Custom path to user's global .claude directory */
    globalClaudePath?: string;
}

/**
 * Result of detecting user's Claude config
 */
export interface DetectClaudeConfigResult {
    hasGlobalConfig: boolean;
    globalConfigPath: string;
    hasRulesDir: boolean;
    rulesDir: string;
    availableRules: string[];
    hasSettings: boolean;
    settingsPath: string;
}

/**
 * Detect the user's global Claude configuration
 */
export function detectUserClaudeConfig(
    globalClaudePath?: string
): DetectClaudeConfigResult {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const claudeDir = globalClaudePath || join(homeDir, '.claude');
    const rulesDir = join(claudeDir, 'rules');
    const settingsPath = join(claudeDir, 'settings.json');

    const hasGlobalConfig = existsSync(claudeDir);
    const hasRulesDir = existsSync(rulesDir);
    const hasSettings = existsSync(settingsPath);

    let availableRules: string[] = [];
    if (hasRulesDir) {
        try {
            availableRules = readdirSync(rulesDir)
                .filter(f => f.endsWith('.md'))
                .sort();
        } catch {
            // Ignore errors reading rules directory
        }
    }

    return {
        hasGlobalConfig,
        globalConfigPath: claudeDir,
        hasRulesDir,
        rulesDir,
        availableRules,
        hasSettings,
        settingsPath
    };
}

/**
 * Sanitize settings object by removing sensitive keys
 */
export function sanitizeSettings(settings: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(settings)) {
        if (SENSITIVE_KEYS.includes(key)) {
            continue;
        }

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const nestedSanitized = sanitizeSettings(value as Record<string, unknown>);
            if (Object.keys(nestedSanitized).length > 0) {
                sanitized[key] = nestedSanitized;
            }
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

/**
 * Read the global settings.json and return a sanitized version
 */
export function getSanitizedGlobalSettings(globalClaudePath?: string): Record<string, unknown> | null {
    const detection = detectUserClaudeConfig(globalClaudePath);

    if (!detection.hasSettings) {
        return null;
    }

    try {
        const content = readFileSync(detection.settingsPath, 'utf-8');
        const settings = JSON.parse(content);
        return sanitizeSettings(settings);
    } catch {
        return null;
    }
}

/**
 * Copy a file from source to destination if it doesn't exist or overwrite is enabled
 */
function copyFileSafe(source: string, dest: string, overwrite: boolean): boolean {
    if (existsSync(dest) && !overwrite) {
        return false;
    }

    // Ensure destination directory exists
    const destDir = dirname(dest);
    if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
    }

    copyFileSync(source, dest);
    return true;
}

/**
 * Create the .claude directory structure in a project
 */
export function createDirectoryStructure(projectPath: string): void {
    const claudeDir = join(projectPath, '.claude');

    // Create subdirectories
    const subdirs = ['rules', 'skills', 'agents', 'commands', 'prompts'];
    for (const subdir of subdirs) {
        const dirPath = join(claudeDir, subdir);
        if (!existsSync(dirPath)) {
            mkdirSync(dirPath, { recursive: true });
        }
    }
}

/**
 * Copy README files from template to project
 */
export function copyTemplateReadmes(projectPath: string, overwrite: boolean): void {
    const claudeDir = join(projectPath, '.claude');

    const readmeFiles = [
        join(CLAUDE_TEMPLATE_DIR, 'rules', 'README.md'),
        join(CLAUDE_TEMPLATE_DIR, 'skills', 'README.md'),
        join(CLAUDE_TEMPLATE_DIR, 'agents', 'README.md'),
        join(CLAUDE_TEMPLATE_DIR, 'commands', 'README.md'),
        join(CLAUDE_TEMPLATE_DIR, 'prompts', 'README.md')
    ];

    for (const readmeFile of readmeFiles) {
        if (!existsSync(readmeFile)) {
            continue;
        }
        const relativePath = readmeFile.replace(CLAUDE_TEMPLATE_DIR, '');
        const destPath = join(claudeDir, relativePath);
        copyFileSafe(readmeFile, destPath, overwrite);
    }
}

/**
 * Copy ClawWarden integration rules to the project
 */
export function copyClawWardenIntegration(projectPath: string, overwrite: boolean): void {
    const claudeDir = join(projectPath, '.claude');
    const integrationSource = join(CLAUDE_TEMPLATE_DIR, 'rules', 'clawwarden-integration.md');
    const integrationDest = join(claudeDir, 'rules', 'clawwarden-integration.md');

    copyFileSafe(integrationSource, integrationDest, overwrite);
}

/**
 * Copy project context template to the project
 */
export function copyProjectContextTemplate(projectPath: string, overwrite: boolean): void {
    const claudeDir = join(projectPath, '.claude');
    const contextSource = join(CLAUDE_TEMPLATE_DIR, 'rules', 'project-context.md.template');
    const contextDest = join(claudeDir, 'rules', 'project-context.md');

    // Only copy if it doesn't exist, even with overwrite=true
    // This is a template for the user to fill in
    if (!existsSync(contextDest)) {
        copyFileSafe(contextSource, contextDest, false);
    }
}

/**
 * Recursively copy a directory
 */
function copyDirectory(source: string, target: string): void {
    if (!existsSync(target)) {
        mkdirSync(target, { recursive: true });
    }

    const entries = readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
        const sourcePath = join(source, entry.name);
        const targetPath = join(target, entry.name);

        if (entry.isDirectory()) {
            copyDirectory(sourcePath, targetPath);
        } else {
            copyFileSync(sourcePath, targetPath);
        }
    }
}

/**
 * Copy ClawWarden skills to the project
 */
export function copyClawWardenSkills(projectPath: string, overwrite: boolean): string[] {
    const installed: string[] = [];
    const templateSkillsDir = join(CLAUDE_TEMPLATE_DIR, 'skills');
    const targetSkillsDir = join(projectPath, '.claude', 'skills');

    // Ensure target directory exists
    if (!existsSync(targetSkillsDir)) {
        mkdirSync(targetSkillsDir, { recursive: true });
    }

    // Check if template skills directory exists
    if (!existsSync(templateSkillsDir)) {
        return installed;
    }

    // Get all skill directories (starting with 'clawwarden-')
    const entries = readdirSync(templateSkillsDir, { withFileTypes: true });
    const skillDirs = entries.filter(e => e.isDirectory() && e.name.startsWith('clawwarden-'));

    for (const skillDir of skillDirs) {
        const sourcePath = join(templateSkillsDir, skillDir.name);
        const targetPath = join(targetSkillsDir, skillDir.name);

        // Skip if already installed
        if (existsSync(targetPath) && !overwrite) {
            continue;
        }

        // Copy skill directory
        copyDirectory(sourcePath, targetPath);
        installed.push(skillDir.name);
    }

    return installed;
}

/**
 * Copy agents directory to the project (plain copy, no filtering)
 */
export function copyAgents(projectPath: string, overwrite: boolean): string[] {
    const copied: string[] = [];
    const templateAgentsDir = join(CLAUDE_TEMPLATE_DIR, 'agents');
    const targetAgentsDir = join(projectPath, '.claude', 'agents');

    // Skip if source doesn't exist
    if (!existsSync(templateAgentsDir)) {
        return copied;
    }

    // Skip if already exists and overwrite is false
    if (existsSync(targetAgentsDir) && !overwrite) {
        return copied;
    }

    // Plain copy entire directory
    copyDirectory(templateAgentsDir, targetAgentsDir);
    copied.push('agents');

    return copied;
}

/**
 * Copy global rules from ~/.claude/rules/ to project
 */
export function copyGlobalRules(
    projectPath: string,
    inheritGlobalRules: boolean,
    globalClaudePath?: string
): string[] {
    const copied: string[] = [];

    if (!inheritGlobalRules) {
        return copied;
    }

    const detection = detectUserClaudeConfig(globalClaudePath);

    if (!detection.hasRulesDir) {
        return copied;
    }

    const destRulesDir = join(projectPath, '.claude', 'rules');

    // Ensure destination directory exists
    if (!existsSync(destRulesDir)) {
        mkdirSync(destRulesDir, { recursive: true });
    }

    for (const ruleFile of detection.availableRules) {
        const sourcePath = join(detection.rulesDir, ruleFile);
        const destPath = join(destRulesDir, ruleFile);

        try {
            copyFileSync(sourcePath, destPath);
            copied.push(ruleFile);
        } catch {
            // Skip files that can't be copied
        }
    }

    return copied;
}

/**
 * Create settings.json in the project
 */
export function createProjectSettings(
    projectPath: string,
    overwrite: boolean,
    useGlobalSettings: boolean,
    globalClaudePath?: string
): void {
    const settingsDest = join(projectPath, '.claude', 'settings.json');

    if (existsSync(settingsDest) && !overwrite) {
        return;
    }

    let settings: Record<string, unknown> = {};

    if (useGlobalSettings) {
        const sanitized = getSanitizedGlobalSettings(globalClaudePath);
        if (sanitized) {
            settings = sanitized;
        }
    }

    // If no global settings or sanitize returned empty, use template
    if (Object.keys(settings).length === 0) {
        const templatePath = join(CLAUDE_TEMPLATE_DIR, 'settings.json.template');
        if (existsSync(templatePath)) {
            try {
                const content = readFileSync(templatePath, 'utf-8');
                settings = JSON.parse(content);
            } catch {
                // Use default if template fails
                settings = {
                    model: 'opus',
                    inheritGlobalSettings: false
                };
            }
        }
    }

    // Ensure directory exists
    const settingsDir = dirname(settingsDest);
    if (!existsSync(settingsDir)) {
        mkdirSync(settingsDir, { recursive: true });
    }

    writeFileSync(settingsDest, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Main entry point: Install .claude directory to a project
 * Plain copy entire templates/claude directory to project .claude
 */
export async function installClaudeDirectory(
    projectPath: string,
    options: InstallClaudeOptions = {}
): Promise<{
    success: boolean;
    created: string[];
    skipped: string[];
    errors: string[];
}> {
    const {
        inheritGlobalRules = false,
        overwriteExisting = false,
        globalClaudePath
    } = options;

    const result = {
        success: true,
        created: [] as string[],
        skipped: [] as string[],
        errors: [] as string[]
    };

    const targetClaudeDir = join(projectPath, '.claude');

    try {
        // Plain copy entire templates/claude directory to project .claude
        if (existsSync(CLAUDE_TEMPLATE_DIR)) {
            // Skip if target exists and overwrite is false
            if (existsSync(targetClaudeDir) && !overwriteExisting) {
                result.skipped.push('.claude/ (already exists)');
            } else {
                copyDirectory(CLAUDE_TEMPLATE_DIR, targetClaudeDir);
                result.created.push('.claude/');
            }
        }

        // Copy global rules if requested
        if (inheritGlobalRules) {
            const copiedRules = copyGlobalRules(projectPath, true, globalClaudePath);
            result.created.push(...copiedRules.map(r => `.claude/rules/${r}`));
        }

    } catch (error) {
        result.success = false;
        result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
}

/**
 * Check if a project has .claude directory installed
 */
export function hasClaudeInstalled(projectPath: string): boolean {
    const claudeDir = join(projectPath, '.claude');
    return existsSync(claudeDir);
}

/**
 * Get the .claude directory structure for a project
 */
export function getClaudeStructure(projectPath: string): Record<string, string[]> | null {
    const claudeDir = join(projectPath, '.claude');

    if (!existsSync(claudeDir)) {
        return null;
    }

    const structure: Record<string, string[]> = {};

    const subdirs = ['rules', 'skills', 'agents', 'commands', 'prompts'];

    for (const subdir of subdirs) {
        const dirPath = join(claudeDir, subdir);
        if (existsSync(dirPath)) {
            try {
                structure[subdir] = readdirSync(dirPath);
            } catch {
                structure[subdir] = [];
            }
        } else {
            structure[subdir] = [];
        }
    }

    // Check for settings.json
    structure['settings'] = [];
    if (existsSync(join(claudeDir, 'settings.json'))) {
        structure['settings'] = ['settings.json'];
    }

    return structure;
}
