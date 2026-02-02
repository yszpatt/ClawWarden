import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface HooksInstallResult {
    success: boolean;
    message: string;
    installedPath?: string;
    settingsPath?: string;
}

export interface HooksStatus {
    scriptInstalled: boolean;
    scriptPath: string;
    settingsConfigured: boolean;
    settingsPath: string;
}

// Claude settings.json paths
const CLAUDE_SETTINGS_DIR = path.join(os.homedir(), '.claude');
const CLAUDE_SETTINGS_PATH = path.join(CLAUDE_SETTINGS_DIR, 'settings.json');

// Hook script installation path
const HOOK_SCRIPT_DIR = path.join(os.homedir(), '.local', 'bin');
const HOOK_SCRIPT_NAME = 'clawwarden-hook.sh';
const HOOK_SCRIPT_PATH = path.join(HOOK_SCRIPT_DIR, HOOK_SCRIPT_NAME);

// Source script path (relative to this file when built)
const SOURCE_SCRIPT_PATH = path.join(__dirname, '..', '..', 'scripts', 'clawwarden-hook.sh');

class HooksInstaller {
    /**
     * Check current installation status
     */
    async getStatus(): Promise<HooksStatus> {
        const scriptInstalled = await this.isScriptInstalled();
        const settingsConfigured = await this.isSettingsConfigured();

        return {
            scriptInstalled,
            scriptPath: HOOK_SCRIPT_PATH,
            settingsConfigured,
            settingsPath: CLAUDE_SETTINGS_PATH,
        };
    }

    /**
     * Check if hook script is installed
     */
    private async isScriptInstalled(): Promise<boolean> {
        try {
            await fs.access(HOOK_SCRIPT_PATH, fs.constants.X_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if Claude settings.json is configured with our hooks
     */
    private async isSettingsConfigured(): Promise<boolean> {
        try {
            const content = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
            const settings = JSON.parse(content);
            const hooks = settings.hooks?.Stop;
            if (!Array.isArray(hooks)) return false;

            return hooks.some((hook: any) =>
                hook.hooks?.some((h: any) =>
                    h.command?.includes('clawwarden-hook.sh')
                )
            );
        } catch {
            return false;
        }
    }

    /**
     * Install the hook script to ~/.local/bin/
     */
    async installScript(): Promise<HooksInstallResult> {
        try {
            // Ensure target directory exists
            await fs.mkdir(HOOK_SCRIPT_DIR, { recursive: true });

            // Read source script
            const scriptContent = await fs.readFile(SOURCE_SCRIPT_PATH, 'utf-8');

            // Write to target location
            await fs.writeFile(HOOK_SCRIPT_PATH, scriptContent, { mode: 0o755 });

            return {
                success: true,
                message: `Hook script installed to ${HOOK_SCRIPT_PATH}`,
                installedPath: HOOK_SCRIPT_PATH,
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to install hook script: ${error.message}`,
            };
        }
    }

    /**
     * Configure Claude settings.json with our hooks
     */
    async configureSettings(): Promise<HooksInstallResult> {
        try {
            // Ensure .claude directory exists
            await fs.mkdir(CLAUDE_SETTINGS_DIR, { recursive: true });

            // Read existing settings or create new
            let settings: Record<string, any> = {};
            try {
                const content = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
                settings = JSON.parse(content);
            } catch {
                // File doesn't exist or is invalid, start fresh
            }

            // Ensure hooks structure exists
            if (!settings.hooks) {
                settings.hooks = {};
            }

            // Define our Stop hook configuration
            const antiwardenStopHook = {
                matcher: '*',
                hooks: [
                    {
                        type: 'command',
                        command: `${HOOK_SCRIPT_PATH} stop`,
                    },
                ],
            };

            // Add or update Stop hooks
            if (!Array.isArray(settings.hooks.Stop)) {
                settings.hooks.Stop = [];
            }

            // Remove existing antiwarden hooks and add new one
            settings.hooks.Stop = settings.hooks.Stop.filter(
                (hook: any) => !hook.hooks?.some((h: any) => h.command?.includes('clawwarden-hook.sh'))
            );
            settings.hooks.Stop.push(antiwardenStopHook);

            // Write updated settings
            await fs.writeFile(
                CLAUDE_SETTINGS_PATH,
                JSON.stringify(settings, null, 2),
                'utf-8'
            );

            return {
                success: true,
                message: `Claude settings configured at ${CLAUDE_SETTINGS_PATH}`,
                settingsPath: CLAUDE_SETTINGS_PATH,
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to configure Claude settings: ${error.message}`,
            };
        }
    }

    /**
     * Full installation: script + settings
     */
    async install(): Promise<HooksInstallResult> {
        // Install script first
        const scriptResult = await this.installScript();
        if (!scriptResult.success) {
            return scriptResult;
        }

        // Configure settings
        const settingsResult = await this.configureSettings();
        if (!settingsResult.success) {
            return settingsResult;
        }

        return {
            success: true,
            message: 'Hook script and Claude settings configured successfully',
            installedPath: HOOK_SCRIPT_PATH,
            settingsPath: CLAUDE_SETTINGS_PATH,
        };
    }

    /**
     * Uninstall: remove script and clean settings
     */
    async uninstall(): Promise<HooksInstallResult> {
        const errors: string[] = [];

        // Remove script
        try {
            await fs.unlink(HOOK_SCRIPT_PATH);
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                errors.push(`Failed to remove script: ${error.message}`);
            }
        }

        // Clean settings
        try {
            const content = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
            const settings = JSON.parse(content);

            if (settings.hooks?.Stop) {
                settings.hooks.Stop = settings.hooks.Stop.filter(
                    (hook: any) => !hook.hooks?.some((h: any) => h.command?.includes('clawwarden-hook.sh'))
                );

                // Remove empty arrays
                if (settings.hooks.Stop.length === 0) {
                    delete settings.hooks.Stop;
                }
                if (Object.keys(settings.hooks).length === 0) {
                    delete settings.hooks;
                }

                await fs.writeFile(
                    CLAUDE_SETTINGS_PATH,
                    JSON.stringify(settings, null, 2),
                    'utf-8'
                );
            }
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                errors.push(`Failed to clean settings: ${error.message}`);
            }
        }

        if (errors.length > 0) {
            return {
                success: false,
                message: errors.join('; '),
            };
        }

        return {
            success: true,
            message: 'Hook script and Claude settings removed',
        };
    }
}

export const hooksInstaller = new HooksInstaller();
