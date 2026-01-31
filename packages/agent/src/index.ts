import { createServer } from './server';
import * as fs from 'fs';
import * as util from 'util';
import * as path from 'path';

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

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4001;



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
