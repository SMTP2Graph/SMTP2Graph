import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import '../_config';
import { Server } from '../classes/Server';
import { submitMail } from './Helpers';

function queuePayloads(storageRoot: string): string[]
{
    const queuePath = path.join(storageRoot, 'queue');
    return fs.readdirSync(queuePath).filter(entry=>entry.endsWith('.eml'));
}

describe('Receive: rejected submission queue isolation', function(){
    it('does not queue an oversize message', async function(){
        const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smtp2graph-oversize-'));
        const server = new Server({
            mode: 'receive',
            receive: {maxSize: '1k'},
            storage: {rootPath: storageRoot},
        });
        await server.start();

        try {
            await expect(submitMail({
                mail: {text: 'A'.repeat(2048)},
            })).to.be.rejectedWith(/Message exceeds/i);
            expect(queuePayloads(storageRoot), 'oversize submission created a queue payload').to.deep.equal([]);
        } finally {
            await server.stop();
            fs.rmSync(storageRoot, {recursive: true, force: true});
        }
    });

    it('does not queue a submission without required SMTP authentication', async function(){
        const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smtp2graph-auth-required-'));
        const server = new Server({
            mode: 'receive',
            receive: {
                requireAuth: true,
                users: [{username: 'authorized-user', password: 'synthetic-test-password', allowedFrom: ['noreply@example.com']}],
            },
            storage: {rootPath: storageRoot},
        });
        await server.start();

        try {
            await expect(submitMail({})).to.be.rejectedWith(/authentication required/i);
            expect(queuePayloads(storageRoot), 'unauthenticated submission created a queue payload').to.deep.equal([]);
        } finally {
            await server.stop();
            fs.rmSync(storageRoot, {recursive: true, force: true});
        }
    });

    it('does not queue an authenticated sender outside the allowlist', async function(){
        const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smtp2graph-from-denied-'));
        const server = new Server({
            mode: 'receive',
            receive: {
                requireAuth: true,
                allowedFrom: ['noreply@example.com'],
                users: [{username: 'authorized-user', password: 'synthetic-test-password', allowedFrom: ['noreply@example.com']}],
            },
            storage: {rootPath: storageRoot},
        });
        await server.start();

        try {
            await expect(submitMail({
                transportOptions: {
                    auth: {user: 'authorized-user', pass: 'synthetic-test-password'},
                },
                mail: {from: 'outside@example.com'},
            })).to.be.rejectedWith(/not allowed/i);
            expect(queuePayloads(storageRoot), 'sender outside the allowlist created a queue payload').to.deep.equal([]);
        } finally {
            await server.stop();
            fs.rmSync(storageRoot, {recursive: true, force: true});
        }
    });
});
