import type { FastifyInstance } from 'fastify';
import { readGlobalConfig, writeGlobalConfig } from '../utils/json-store';
import type { GlobalSettings } from '@clawwarden/shared';

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
}
