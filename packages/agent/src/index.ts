import { createServer } from './server';
import * as fs from 'fs';
import * as util from 'util';
import * as path from 'path';
import * as os from 'os';

// Redirect console output to file
const logFile = fs.createWriteStream(path.join(process.cwd(), 'agent.log'), { flags: 'a' });
const logStdout = process.stdout;

console.log = function (...args) {
    const msg = util.format.apply(null, args) + '\n';
    logFile.write(msg);
    logStdout.write(msg);
};

console.error = function (...args) {
    const msg = util.format.apply(null, args) + '\n';
    logFile.write(msg);
    logStdout.write(msg);
};

const DEFAULT_PORT = 6172;
const CONFIG_PATH = path.join(os.homedir(), '.vibewarden', 'config.json');

let PORT = DEFAULT_PORT;

try {
    if (fs.existsSync(CONFIG_PATH)) {
        const configContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const config = JSON.parse(configContent);
        if (config.settings?.agentPort && typeof config.settings.agentPort === 'number') {
            PORT = config.settings.agentPort;
            console.log(`Loaded configuration from ${CONFIG_PATH}, using port ${PORT}`);
        }
    }
} catch (error) {
    console.warn(`Failed to read config from ${CONFIG_PATH}, using default port ${DEFAULT_PORT}`);
}

if (process.env.PORT) {
    PORT = parseInt(process.env.PORT);
    console.log(`Using PORT from environment variable: ${PORT}`);
}

// Set valid editor for SDK (GIT_EDITOR=true causes editor startup to fail)
// Use a no-op editor command since we handle edits programmatically
if (!process.env.EDITOR || process.env.GIT_EDITOR === 'true') {
    process.env.EDITOR = '/usr/bin/vim';
    process.env.GIT_EDITOR = '/usr/bin/vim';
}

async function main() {
    const server = await createServer();

    try {
        await server.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`Agent running on http://localhost:${PORT}`);

        // Cleanup on exit
        const cleanup = () => {
            console.log('Shutting down agent...');

            process.exit(0);
        };

        process.on('SIGTERM', cleanup);
        process.on('SIGINT', cleanup);

    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

main();
