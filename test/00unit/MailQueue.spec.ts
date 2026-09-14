import { expect } from 'chai';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);

describe('MailQueue: permanent failure and durable enqueue', ()=>{
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smtp2graph-queue-'));
    const configPath = path.join(process.cwd(), 'config.yml');
    let MailQueue: typeof import('../../src/classes/MailQueue').MailQueue;
    let Mailer: typeof import('../../src/classes/Mailer').Mailer;
    let MailboxAccessDenied: typeof import('../../src/classes/Mailer').MailboxAccessDenied;

    before(async ()=>{
        fs.writeFileSync(configPath, [
            'mode: full',
            'send:',
            '  appReg:',
            '    id: test-client',
            '    tenant: test-tenant',
            '    secret: test-secret',
        ].join('\n'));
        (globalThis as any).DEBUG = false;
        ({MailQueue} = require('../../src/classes/MailQueue'));
        ({Mailer, MailboxAccessDenied} = require('../../src/classes/Mailer'));
    });

    after(()=>{
        if(fs.existsSync(configPath)) fs.unlinkSync(configPath);
        fs.rmSync(root, {recursive: true, force: true});
    });

    it('fsyncs the queued file and queue directory before resolving enqueue', async ()=>{
        const queue = new MailQueue(path.join(root, 'durable'));
        const source = path.join(queue.tempPath, 'message.eml');
        fs.writeFileSync(source, 'From: sender@example.test\r\n\r\nbody');

        const originalFsync = fs.fsyncSync;
        let fsyncCalls = 0;
        fs.fsyncSync = ((fd: number) => {
            fsyncCalls++;
            return originalFsync(fd);
        }) as typeof fs.fsyncSync;
        try {
            await queue.add(source);
        } finally {
            fs.fsyncSync = originalFsync;
            await queue.close();
        }

        expect(fsyncCalls).to.equal(2);
        expect(fs.existsSync(path.join(root, 'durable', 'queue', 'message.eml'))).to.equal(true);
    });

    it('moves an unrecoverable delivery error from queue to failed', async ()=>{
        const queueRoot = path.join(root, 'permanent');
        const queue = new MailQueue(queueRoot);
        const filename = 'permanent.eml';
        const originalSendEml = Mailer.sendEml;
        Mailer.sendEml = async ()=>{
            throw new MailboxAccessDenied('denied');
        };

        try {
            fs.writeFileSync(path.join(queueRoot, 'queue', filename), 'From: sender@example.test\r\n\r\nbody');
            await new Promise(resolve=>setTimeout(resolve, 250));
            expect(fs.existsSync(path.join(queueRoot, 'failed', filename))).to.equal(true);
            expect(fs.existsSync(path.join(queueRoot, 'queue', filename))).to.equal(false);
        } finally {
            Mailer.sendEml = originalSendEml;
            await queue.close();
        }
    });
});
