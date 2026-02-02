import { existsSync } from 'fs';
import { mkdir, readdir, copyFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to the skills templates in the ClawWarden package
const SKILLS_TEMPLATE_DIR = join(__dirname, '../../../../skills');

/**
 * Install ClawWarden skills to a project's .agent/skills directory
 */
export async function installSkills(projectPath: string): Promise<string[]> {
    const targetSkillsDir = join(projectPath, '.agent', 'skills');
    const installed: string[] = [];

    // Ensure target directory exists
    if (!existsSync(targetSkillsDir)) {
        await mkdir(targetSkillsDir, { recursive: true });
    }

    // Check if template directory exists
    if (!existsSync(SKILLS_TEMPLATE_DIR)) {
        console.warn('Skills template directory not found:', SKILLS_TEMPLATE_DIR);
        return installed;
    }

    // Get all skill directories
    const entries = await readdir(SKILLS_TEMPLATE_DIR, { withFileTypes: true });
    const skillDirs = entries.filter(e => e.isDirectory() && e.name.startsWith('antiwarden-'));

    for (const skillDir of skillDirs) {
        const sourcePath = join(SKILLS_TEMPLATE_DIR, skillDir.name);
        const targetPath = join(targetSkillsDir, skillDir.name);

        // Skip if already installed
        if (existsSync(targetPath)) {
            console.log(`Skill ${skillDir.name} already installed, skipping`);
            continue;
        }

        // Copy skill directory
        await copyDirectory(sourcePath, targetPath);
        installed.push(skillDir.name);
    }

    return installed;
}

/**
 * Recursively copy a directory
 */
async function copyDirectory(source: string, target: string): Promise<void> {
    await mkdir(target, { recursive: true });

    const entries = await readdir(source, { withFileTypes: true });

    for (const entry of entries) {
        const sourcePath = join(source, entry.name);
        const targetPath = join(target, entry.name);

        if (entry.isDirectory()) {
            await copyDirectory(sourcePath, targetPath);
        } else {
            await copyFile(sourcePath, targetPath);
        }
    }
}

/**
 * Check if a project has ClawWarden skills installed
 */
export function hasSkillsInstalled(projectPath: string): boolean {
    const skillsDir = join(projectPath, '.agent', 'skills');
    if (!existsSync(skillsDir)) return false;

    const createSkill = join(skillsDir, 'antiwarden-task-create');
    const updateSkill = join(skillsDir, 'antiwarden-task-update');

    return existsSync(createSkill) && existsSync(updateSkill);
}
