import { createServer } from './server';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4001;

async function main() {
    const server = await createServer();

    try {
        await server.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`Agent running on http://localhost:${PORT}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

main();
