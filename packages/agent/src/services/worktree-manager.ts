import { exec } from 'child_process';
import { promisify } from 'util';
import { join, basename } from 'path';
import { existsSync, rmSync } from 'fs';

const execAsync = promisify(exec);

export interface WorktreeInfo {
    path: string;
    branch: string;
    createdAt: string;
}

export class WorktreeManager {
    /**
     * Create a new worktree for a task
     */
    async createWorktree(
        projectPath: string,
        taskId: string,
        baseBranch: string = 'master'
    ): Promise<WorktreeInfo> {
        const branchName = `task/${taskId}`;
        const worktreePath = join(projectPath, '.worktrees', taskId);

        // Create .worktrees directory if it doesn't exist
        const worktreesDir = join(projectPath, '.worktrees');
        if (!existsSync(worktreesDir)) {
            await execAsync(`mkdir -p "${worktreesDir}"`);
        }

        // Create branch and worktree
        try {
            // First, try to create a new branch
            await execAsync(
                `git worktree add -b "${branchName}" "${worktreePath}" "${baseBranch}"`,
                { cwd: projectPath }
            );
        } catch (error) {
            // If branch already exists, just add worktree
            await execAsync(
                `git worktree add "${worktreePath}" "${branchName}"`,
                { cwd: projectPath }
            );
        }

        return {
            path: worktreePath,
            branch: branchName,
            createdAt: new Date().toISOString(),
        };
    }

    /**
     * Remove a worktree
     */
    async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
        if (existsSync(worktreePath)) {
            await execAsync(`git worktree remove "${worktreePath}" --force`, {
                cwd: projectPath,
            });
        }
    }

    /**
     * Merge a worktree branch into main branch
     */
    async mergeWorktree(
        projectPath: string,
        worktreePath: string,
        branchName: string,
        targetBranch: string = 'master'
    ): Promise<{ success: boolean; message: string }> {
        try {
            // Get branch from worktree
            const taskBranch = branchName;

            // Switch to target branch and merge
            await execAsync(`git checkout "${targetBranch}"`, { cwd: projectPath });

            const { stdout, stderr } = await execAsync(
                `git merge "${taskBranch}" --no-ff -m "Merge ${taskBranch} into ${targetBranch}"`,
                { cwd: projectPath }
            );

            // Remove worktree after successful merge
            await this.removeWorktree(projectPath, worktreePath);

            // Delete the branch
            try {
                await execAsync(`git branch -d "${taskBranch}"`, { cwd: projectPath });
            } catch {
                // Branch might already be deleted or have unmerged changes
            }

            return {
                success: true,
                message: stdout || 'Merge successful',
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Merge failed';
            return {
                success: false,
                message,
            };
        }
    }

    /**
     * List all worktrees for a project
     */
    async listWorktrees(projectPath: string): Promise<string[]> {
        try {
            const { stdout } = await execAsync('git worktree list --porcelain', {
                cwd: projectPath,
            });

            const worktrees: string[] = [];
            const lines = stdout.split('\n');

            for (const line of lines) {
                if (line.startsWith('worktree ')) {
                    const path = line.replace('worktree ', '');
                    // Skip the main worktree
                    if (path !== projectPath) {
                        worktrees.push(path);
                    }
                }
            }

            return worktrees;
        } catch {
            return [];
        }
    }

    /**
     * Cleanup orphaned worktrees
     */
    async cleanup(projectPath: string): Promise<void> {
        await execAsync('git worktree prune', { cwd: projectPath });
    }
}

export const worktreeManager = new WorktreeManager();
