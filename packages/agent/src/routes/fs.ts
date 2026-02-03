import type { FastifyInstance } from 'fastify';
import { readdir, stat } from 'fs/promises';
import { join, isAbsolute } from 'path';
import { homedir } from 'os';
import type { FsListResponse, FsItem } from '@clawwarden/shared';

export async function fsRoutes(fastify: FastifyInstance) {
    fastify.get<{
        Querystring: { path?: string };
    }>('/api/fs/list', async (request) => {
        let targetPath = request.query.path || homedir();

        // Ensure path is absolute
        if (!isAbsolute(targetPath)) {
            targetPath = join(homedir(), targetPath);
        }

        try {
            const entries = await readdir(targetPath, { withFileTypes: true });

            const items: FsItem[] = [];

            for (const entry of entries) {
                // Skip hidden files/folders (optional, but usually cleaner for pickers)
                if (entry.name.startsWith('.')) continue;

                const fullPath = join(targetPath, entry.name);

                try {
                    // We only care about directories for a folder picker, 
                    // but we can list both if needed. For now, let's list both but mark them.
                    items.push({
                        name: entry.name,
                        path: fullPath,
                        isDirectory: entry.isDirectory()
                    });
                } catch (e) {
                    // Skip files we can't stat
                    continue;
                }
            }

            // Sort: directories first, then alphabetically
            items.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });

            const response: FsListResponse = {
                currentPath: targetPath,
                items
            };

            return response;
        } catch (error) {
            fastify.log.error(error);
            throw { statusCode: 500, message: `Failed to read directory: ${targetPath}` };
        }
    });
}
