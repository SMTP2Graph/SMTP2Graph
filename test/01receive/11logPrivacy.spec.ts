import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { stringify } from 'yaml';
import { createTransport } from 'nodemailer';
import { expect } from 'chai';
import '../_config';

interface IRunningServer
{
    process: ChildProcessWithoutNullStreams;
    output: () => string;
}

async function startServer(baseDir: string): Promise<IRunningServer>
{
    const configPath = path.join(baseDir, 'config.yml');
    fs.writeFileSync(configPath, stringify({
        mode: 'receive',
        storage: {rootPath: path.join(baseDir, 'mailroot')},
        receive: {port: 1337},
    }));

    const proc = spawn('node', [
        path.resolve('dist/server.js'),
        `--baseDir=${baseDir}`,
        `--config=${configPath}`,
    ]);
    let output = '';
    proc.stdout.on('data', data=>{ output += data.toString(); });
    proc.stderr.on('data', data=>{ output += data.toString(); });

    await new Promise<void>((resolve, reject)=>{
        const timeout = setTimeout(()=>{
            cleanup();
            reject(new Error('gateway listener did not become ready'));
        }, 5000);
        const onOutput = ()=>{
            if(output.includes('Server started'))
            {
                cleanup();
                resolve();
            }
        };
        const onExit = ()=>{
            cleanup();
            reject(new Error('gateway exited before listener readiness'));
        };
        const cleanup = ()=>{
            clearTimeout(timeout);
            proc.stdout.off('data', onOutput);
            proc.stderr.off('data', onOutput);
            proc.off('exit', onExit);
        };
        proc.stdout.on('data', onOutput);
        proc.stderr.on('data', onOutput);
        proc.on('exit', onExit);
    });

    return {process: proc, output: ()=>output};
}

async function stopServer(server: IRunningServer): Promise<void>
{
    await new Promise<void>(resolve=>{
        server.process.once('exit', ()=>resolve());
        server.process.kill('SIGINT');
    });
}

function readLogFiles(baseDir: string): string
{
    const logsDir = path.join(baseDir, 'logs');
    if(!fs.existsSync(logsDir)) return '';
    return fs.readdirSync(logsDir)
        .filter(entry=>fs.statSync(path.join(logsDir, entry)).isFile())
        .map(entry=>fs.readFileSync(path.join(logsDir, entry), 'utf-8'))
        .join('\n');
}

describe('Receive: log privacy', function(){
    it('does not emit SMTP body or attachment markers to console or file logs', async function(){
        const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smtp2graph-log-privacy-'));
        const bodyMarker = `body-marker-${randomUUID()}`;
        const attachmentMarker = `attachment-marker-${randomUUID()}`;
        const server = await startServer(baseDir);

        try {
            const transport = createTransport({host: '127.0.0.1', port: 1337, ignoreTLS: true});
            await transport.sendMail({
                from: 'noreply@example.com',
                to: 'receiver@example.com',
                text: `Synthetic message ${bodyMarker}`,
                attachments: [{filename: `${attachmentMarker}.txt`, content: attachmentMarker}],
            });
            await new Promise(resolve=>setTimeout(resolve, 100));

            const logSurfaces = `${server.output()}\n${readLogFiles(baseDir)}`;
            expect(logSurfaces.includes(bodyMarker), 'gateway log surface contains a synthetic body marker').to.equal(false);
            expect(logSurfaces.includes(attachmentMarker), 'gateway log surface contains a synthetic attachment marker').to.equal(false);
        } finally {
            await stopServer(server);
            fs.rmSync(baseDir, {recursive: true, force: true});
        }
    });
});
