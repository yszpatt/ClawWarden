import { exec } from 'child_process';
import { promisify } from 'util';
import { join, basename } from 'path';
import { existsSync, rmSync, cpSync, rmSync as rm } from 'fs';

const execAsync = promisify(exec);

export interface WorktreeInfo {
    path: string;
    branch: string;
    createdAt: string;
    removedAt?: string;  // When worktree was deleted (for historical tracking)
}

export class WorktreeManager {
    /**
     * Check if a directory is a git repository
     */
    async isGitRepo(projectPath: string): Promise<boolean> {
        try {
            await execAsync('git rev-parse --git-dir', { cwd: projectPath });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get the default branch name (main, master, or HEAD)
     */
    async getDefaultBranch(projectPath: string): Promise<string> {
        try {
            // First try to get current branch
            const { stdout: currentBranch } = await execAsync('git branch --show-current', { cwd: projectPath });
            if (currentBranch.trim()) {
                return currentBranch.trim();
            }

            // Try remote HEAD
            try {
                const { stdout } = await execAsync('git symbolic-ref refs/remotes/origin/HEAD', { cwd: projectPath });
                const branch = stdout.trim().replace('refs/remotes/origin/', '');
                if (branch) return branch;
            } catch { }

            // Check if 'main' branch exists
            try {
                await execAsync('git rev-parse --verify main', { cwd: projectPath });
                return 'main';
            } catch { }

            // Check if 'master' branch exists
            try {
                await execAsync('git rev-parse --verify master', { cwd: projectPath });
                return 'master';
            } catch { }

            // Use HEAD as ultimate fallback
            return 'HEAD';
        } catch {
            return 'HEAD';
        }
    }

    /**
     * Check if repository has any commits
     */
    async hasCommits(projectPath: string): Promise<boolean> {
        try {
            await execAsync('git rev-parse HEAD', { cwd: projectPath });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Ensure repository has at least one commit
     */
    async ensureHasCommit(projectPath: string): Promise<void> {
        const hasCommit = await this.hasCommits(projectPath);
        if (!hasCommit) {
            console.log('[WorktreeManager] Repository is empty, creating initial commit...');
            // Create a .gitignore file if it doesn't exist
            try {
                await execAsync('test -f .gitignore || echo "node_modules/\n.clawwarden/\n.worktrees/" > .gitignore', { cwd: projectPath });
                await execAsync('git add -A', { cwd: projectPath });
                await execAsync('git commit --allow-empty -m "Initial commit by ClawWarden"', { cwd: projectPath });
                console.log('[WorktreeManager] Initial commit created');
            } catch (error: any) {
                console.error('[WorktreeManager] Failed to create initial commit:', error.message);
                throw new Error('Repository has no commits and failed to create initial commit');
            }
        }
    }

    /**
     * Create a new worktree for a task
     * Returns null if project is not a git repository
     */
    async createWorktree(
        projectPath: string,
        taskId: string,
        baseBranch?: string
    ): Promise<WorktreeInfo | null> {
        // Check if project is a git repository
        const isGit = await this.isGitRepo(projectPath);
        if (!isGit) {
            console.log('[WorktreeManager] Project is not a git repository, skipping worktree creation');
            return null;
        }

        // Ensure repository has at least one commit
        await this.ensureHasCommit(projectPath);

        const defaultBranch = baseBranch || await this.getDefaultBranch(projectPath);
        const branchName = `task/${taskId}`;
        const worktreePath = join(projectPath, '.worktrees', taskId);

        // Create .worktrees directory if it doesn't exist
        const worktreesDir = join(projectPath, '.worktrees');
        if (!existsSync(worktreesDir)) {
            await execAsync(`mkdir -p "${worktreesDir}"`);
        }

        // Check if worktree already exists
        if (existsSync(worktreePath)) {
            console.log('[WorktreeManager] Worktree already exists:', worktreePath);
            return {
                path: worktreePath,
                branch: branchName,
                createdAt: new Date().toISOString(),
            };
        }

        // Check if branch already exists
        let branchExists = false;
        try {
            await execAsync(`git rev-parse --verify "${branchName}"`, { cwd: projectPath });
            branchExists = true;
        } catch {
            branchExists = false;
        }

        console.log('[WorktreeManager] Creating worktree for task:', taskId);
        console.log('[WorktreeManager] Branch exists:', branchExists);
        console.log('[WorktreeManager] Base branch:', defaultBranch);

        try {
            if (branchExists) {
                // Branch exists, just add worktree
                await execAsync(
                    `git worktree add "${worktreePath}" "${branchName}"`,
                    { cwd: projectPath }
                );
            } else {
                // Create new branch with worktree
                await execAsync(
                    `git worktree add -b "${branchName}" "${worktreePath}" "${defaultBranch}"`,
                    { cwd: projectPath }
                );
            }
        } catch (error: any) {
            console.error('[WorktreeManager] Failed to create worktree:', error.message);
            throw error;
        }

        // Copy .claude directory from project to worktree if it exists
        // Plain copy to ensure all configs are available in worktree
        const sourceClaudeDir = join(projectPath, '.claude');
        const targetClaudeDir = join(worktreePath, '.claude');
        if (existsSync(sourceClaudeDir)) {
            try {
                cpSync(sourceClaudeDir, targetClaudeDir, { recursive: true, force: true });
                console.log('[WorktreeManager] Copied .claude directory to worktree');
            } catch (error: any) {
                console.warn('[WorktreeManager] Failed to copy .claude directory:', error.message);
                // Don't fail the worktree creation if .claude copy fails
            }
        }

        // Cleanup: Remove deprecated .agent directory if it exists
        const agentDir = join(worktreePath, '.agent');
        if (existsSync(agentDir)) {
            try {
                rm(agentDir, { recursive: true, force: true });
                console.log('[WorktreeManager] Removed deprecated .agent directory from worktree');
            } catch (error: any) {
                console.warn('[WorktreeManager] Failed to remove .agent directory:', error.message);
            }
        }

        return {
            path: worktreePath,
            branch: branchName,
            createdAt: new Date().toISOString(),
        };
    }

    /**
     * Remove a worktree
     * Note: Conversation history is preserved in project directory
     */
    async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
        // Remove the git worktree
        if (existsSync(worktreePath)) {
            await execAsync(`git worktree remove "${worktreePath}" --force`, {
                cwd: projectPath,
            });
            console.log(`[WorktreeManager] Removed worktree: ${worktreePath}`);
        }

        // Note: We do NOT delete the conversation history here
        // Conversation history is stored in {projectPath}/.clawwarden/sessions/
        // and should be preserved even after worktree is removed
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
        const taskBranch = branchName;

        try {
            // Step 0: Commit any uncommitted changes in the worktree
            console.log(`[WorktreeManager] Step 0: Committing changes in worktree: ${worktreePath}`);
            if (existsSync(worktreePath)) {
                try {
                    // Check if there are any changes to commit
                    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: worktreePath });

                    if (statusOutput.trim()) {
                        console.log(`[WorktreeManager] Found uncommitted changes, committing...`);
                        await execAsync('git add -A', { cwd: worktreePath });
                        await execAsync('git commit -m "Task completed - auto commit by ClawWarden"', { cwd: worktreePath });
                        console.log(`[WorktreeManager] Changes committed successfully`);
                    } else {
                        console.log(`[WorktreeManager] No uncommitted changes in worktree`);
                    }
                } catch (commitError: any) {
                    console.log(`[WorktreeManager] Commit attempt result: ${commitError.message}`);
                    // Continue even if commit fails (might be "nothing to commit")
                }
            }

            // Step 1: Check if task branch has any commits ahead of target branch
            console.log(`[WorktreeManager] Step 1: Checking for commits to merge...`);
            try {
                const { stdout: commitsAhead } = await execAsync(
                    `git log "${targetBranch}".."${taskBranch}" --oneline`,
                    { cwd: projectPath }
                );

                if (!commitsAhead.trim()) {
                    console.log(`[WorktreeManager] No commits to merge - task branch has no new commits`);
                    return {
                        success: false,
                        message: '没有需要合并的内容。任务分支没有新的提交。请确保在 worktree 中有代码变更。',
                    };
                }
                console.log(`[WorktreeManager] Found commits to merge:\n${commitsAhead}`);
            } catch (checkError: any) {
                console.log(`[WorktreeManager] Could not check commits: ${checkError.message}`);
                // Continue with merge attempt
            }

            // Step 2: Switch to target branch
            console.log(`[WorktreeManager] Step 2: Switching to target branch: ${targetBranch}`);
            await execAsync(`git checkout "${targetBranch}"`, { cwd: projectPath });

            // Step 3: Perform the merge
            console.log(`[WorktreeManager] Step 3: Merging branch: ${taskBranch} into ${targetBranch}`);
            const { stdout, stderr } = await execAsync(
                `git merge "${taskBranch}" --no-ff -m "Merge ${taskBranch} into ${targetBranch}"`,
                { cwd: projectPath }
            );

            if (stderr) {
                console.log(`[WorktreeManager] Merge stderr: ${stderr}`);
            }
            console.log(`[WorktreeManager] Merge stdout: ${stdout}`);

            // Step 4: Verify merge was successful
            console.log(`[WorktreeManager] Step 4: Verifying merge success...`);
            try {
                await execAsync(`git merge-base --is-ancestor "${taskBranch}" HEAD`, { cwd: projectPath });
                console.log(`[WorktreeManager] Merge verified successfully`);
            } catch (verifyError) {
                console.error(`[WorktreeManager] Merge verification failed:`, verifyError);
                return {
                    success: false,
                    message: `Merge verification failed - worktree preserved. Error: ${verifyError instanceof Error ? verifyError.message : 'Unknown error'}`,
                };
            }

            // Step 5: Only remove worktree after verified merge
            console.log(`[WorktreeManager] Step 5: Removing worktree: ${worktreePath}`);
            await this.removeWorktree(projectPath, worktreePath);

            // Step 6: Delete the branch
            try {
                await execAsync(`git branch -d "${taskBranch}"`, { cwd: projectPath });
                console.log(`[WorktreeManager] Branch deleted: ${taskBranch}`);
            } catch {
                console.log(`[WorktreeManager] Could not delete branch ${taskBranch} (may be expected)`);
            }

            return {
                success: true,
                message: stdout || 'Merge successful',
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Merge failed';
            console.error(`[WorktreeManager] Merge failed:`, message);

            // Check if this is a merge conflict
            if (message.includes('CONFLICT') || message.includes('Automatic merge failed')) {
                try {
                    await execAsync('git merge --abort', { cwd: projectPath });
                    console.log(`[WorktreeManager] Merge aborted due to conflicts`);
                } catch {
                    // Ignore abort errors
                }
                return {
                    success: false,
                    message: `合并冲突: ${message}. Worktree 已保留，请手动解决冲突。`,
                };
            }

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
