import type { FastifyInstance } from 'fastify';
import { readGlobalConfig, writeGlobalConfig } from '../utils/json-store';
import type { GlobalSettings } from '@antiwarden/shared';
import { hooksInstaller } from '../services/hooks-installer';

export async function settingsRoutes(fastify: FastifyInstance) {
    // Get global settings
    fastify.get('/api/settings', async () => {
        const config = await readGlobalConfig();
        return config.settings;
    });

    // Update global settings
    fastify.put<{
        Body: Partial<GlobalSettings>;
    }>('/api/settings', async (request) => {
        const config = await readGlobalConfig();
        config.settings = { ...config.settings, ...request.body };
        await writeGlobalConfig(config);
        return config.settings;
    });

    // ========== Claude Code Hooks Management ==========

    // Get hooks installation status
    fastify.get('/api/settings/hooks/status', async () => {
        return await hooksInstaller.getStatus();
    });

    // Install hooks (script + Claude settings)
    fastify.post('/api/settings/hooks/install', async () => {
        const result = await hooksInstaller.install();
        if (!result.success) {
            throw { statusCode: 500, message: result.message };
        }
        return result;
    });

    // Uninstall hooks
    fastify.delete('/api/settings/hooks/uninstall', async () => {
        const result = await hooksInstaller.uninstall();
        if (!result.success) {
            throw { statusCode: 500, message: result.message };
        }
        return result;
    });
}
