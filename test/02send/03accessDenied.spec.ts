import { expect } from 'chai';
import fs from 'fs';
import { createTransport } from 'nodemailer';
import path from 'path';
import { config } from '../_config';
import { Server } from '../classes/Server';
import { defaultTransportOptions } from '../01receive/Helpers';
import { defaultMail } from './Helpers';

describe('Send: denied mailbox', function(){
    const server = new Server({
        mode: 'full',
        send: {
            appReg: {
                id: config.clientId,
                tenant: config.clientTenant,
                secret: config.clientSecret,
            },
            forceMailbox: config.deniedMailbox,
        },
    });

    before('Start server', async function(){
        await expect(server.start(), 'Failed to start SMTP server').to.eventually.be.fulfilled;
    });

    after('Stop server', async function(){
        await server.stop();
    });

    it('moves ErrorAccessDenied payload to failed after durable SMTP acknowledgement', async function(){
        const transport = createTransport(defaultTransportOptions);
        const result = await transport.sendMail({
            ...defaultMail,
            subject: `TEST: ${this.test?.title}`,
            to: config.additionalRecipient,
        });
        expect(result.messageId, 'SMTP submission should return a message ID').to.be.a('string');

        const failedPath = await waitForFailedMessage(result.messageId);
        expect(fs.existsSync(failedPath)).to.equal(true);
    });
});

async function waitForFailedMessage(messageId: string): Promise<string>
{
    for(let attempt = 0; attempt < 20; attempt++)
    {
        const failedDir = path.join('mailroot', 'failed');
        if(fs.existsSync(failedDir))
        {
            const match = fs.readdirSync(failedDir).find(file=>{
                const content = fs.readFileSync(path.join(failedDir, file), 'utf-8');
                return content.includes(messageId);
            });
            if(match) return path.join(failedDir, match);
        }
        await new Promise(resolve=>setTimeout(resolve, 250));
    }

    throw new Error('No failed payload found for denied mailbox');
}
