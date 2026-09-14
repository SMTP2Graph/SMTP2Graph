import fs from 'fs';
import os from 'os';
import path from 'path';
import { createConnection, Socket } from 'net';
import { expect } from 'chai';
import '../_config';
import { Server } from '../classes/Server';
import { LowLevelSMTPClient } from '../classes/LowLevelSMTPClient';

function connectAndReadGreeting(): Promise<Socket>
{
    return new Promise((resolve, reject)=>{
        const socket = createConnection(1337, '127.0.0.1');
        socket.once('error', reject);
        socket.once('data', data=>{
            socket.off('error', reject);
            if(/^220 /.test(data.toString())) resolve(socket);
            else reject(new Error(data.toString()));
        });
    });
}

describe('Receive: policy guards', function(){
    it('limits concurrent sessions per source IP and releases the slot on close', async function(){
        const server = new Server({mode: 'receive', receive: {maxSessionsPerIp: 1}});
        await server.start();
        const first = await connectAndReadGreeting();

        try {
            await expect(connectAndReadGreeting()).to.be.rejectedWith(/421 Too many concurrent sessions/i);
            first.destroy();
            await new Promise(resolve=>setTimeout(resolve, 100));
            const replacement = await connectAndReadGreeting();
            replacement.destroy();
        } finally {
            first.destroy();
            await server.stop();
        }
    });

    it('limits messages per client at MAIL FROM', async function(){
        const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smtp2graph-rate-'));
        const server = new Server({
            mode: 'receive',
            receive: {rateLimit: {duration: 60, limit: 1}},
            storage: {rootPath: storageRoot},
        });
        const client = new LowLevelSMTPClient('127.0.0.1', 1337);
        await server.start();

        try {
            await client.sendMail('noreply@example.com', 'receiver@example.com', {}, 'first');
            await expect(client.sendMail('noreply@example.com', 'receiver@example.com', {}, 'second')).to.be.rejectedWith(/451 Rate limit exceeded/i);
        } finally {
            await server.stop();
            fs.rmSync(storageRoot, {recursive: true, force: true});
        }
    });

    it('returns 451 before DATA when persistent storage reaches its threshold', async function(){
        const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smtp2graph-capacity-'));
        const queuePath = path.join(storageRoot, 'queue');
        fs.mkdirSync(queuePath, {recursive: true});
        fs.writeFileSync(path.join(queuePath, 'existing.eml'), Buffer.alloc(820));
        const server = new Server({
            mode: 'receive',
            storage: {rootPath: storageRoot, maxBytes: 1024, rejectThresholdPercent: 80},
        });
        const client = new LowLevelSMTPClient('127.0.0.1', 1337);
        await server.start();

        try {
            await expect(client.sendMail('noreply@example.com', 'receiver@example.com', {}, 'must not queue')).to.be.rejectedWith(/451 Queue capacity threshold reached/i);
            expect(fs.readdirSync(queuePath)).to.deep.equal(['existing.eml']);
        } finally {
            await server.stop();
            fs.rmSync(storageRoot, {recursive: true, force: true});
        }
    });
});
