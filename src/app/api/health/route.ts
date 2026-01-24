import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const nodeModules = path.join(process.cwd(), 'node_modules');
        const dotPrisma = path.join(nodeModules, '.prisma/client');
        // Also check build output locations
        const nextServer = path.join(process.cwd(), '.next/server');

        const listFiles = (dir: string) => {
            if (!fs.existsSync(dir)) return [`${dir} not found`];
            return fs.readdirSync(dir).map(f => {
                try {
                    const stats = fs.statSync(path.join(dir, f));
                    // Show size and permissions (octal)
                    return `${f} (${stats.size}b, chmod:${(stats.mode & 0o777).toString(8)})`;
                } catch (e) { return `${f} (stat err)`; }
            });
        };

        return NextResponse.json({
            status: 'ok',
            cwd: process.cwd(),
            files: {
                dotPrisma: listFiles(dotPrisma),
                nodeModulesRoot: listFiles(nodeModules).filter(f => f.includes('prisma')),
                nextServer: listFiles(nextServer).slice(0, 10) // Sample
            },
            env: {
                PRISMA_CLI_BINARY_TARGETS: process.env.PRISMA_CLI_BINARY_TARGETS,
                HAS_DATABASE_URL: !!process.env.DATABASE_URL,
                // Check if we are running in a constrained environment
                NODE_ENV: process.env.NODE_ENV
            }
        }, { status: 200 });
    } catch (e: any) {
        return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
    }
}
