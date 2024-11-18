import { expect } from 'chai';
import { Message } from '@microsoft/microsoft-graph-types';
import Mail from 'nodemailer/lib/mailer';
import { config } from '../_config';
import { Server } from '../classes/Server';
import LowLevelSMTPClient from '../classes/LowLevelSMTPClient';
import { defaultTransportOptions } from '../01receive/Helpers';
import { defaultMail, submitAndVerifyMail, verifyMail, waitForMessage } from './Helpers';

describe('Send: Basic', async function(){
    const server = new Server({
        mode: 'full',
        send: {
            appReg: {
                id: config.clientId,
                tenant: config.clientTenant,
                secret: config.clientSecret,
            },
        },
    });

    before('Start server', async function(){
        await expect(server.start(), 'Failed to start SMTP server').to.eventually.be.fulfilled;
    });

    after('Stop server', async function(){
        await server.stop();
    });

    it('Plaintext message', async function(){
        await submitAndVerifyMail({
            mail: {
                subject: `TEST: ${this.test?.title}`,
                text: 'Some mail contents',
            },
        });
    });

    it('HTML message', async function(){
        await submitAndVerifyMail({
            mail: {
                subject: `TEST: ${this.test?.title}`,
                html: '<a href="https://www.smtp2graph.com">Klik here</a>',
            },
        });
    });

    it('TO recipients', async function(){
        await submitAndVerifyMail({
            mail: {
                to: [config.mailbox, config.additionalRecipient],
                subject: `TEST: ${this.test?.title}`,
            },
        });
    });

    it('CC recipients', async function(){
        await submitAndVerifyMail({
            mail: {
                to: [],
                cc: [config.mailbox, config.additionalRecipient],
                subject: `TEST: ${this.test?.title}`,
            },
        });
    });

    it('BCC recipients', async function(){
        await submitAndVerifyMail({
            mail: {
                to: [],
                bcc: [config.mailbox],
                subject: `TEST: ${this.test?.title}`,
            },
        });
    });

    it('Reply-To address', async function(){
        await submitAndVerifyMail({
            mail: {
                replyTo: config.additionalRecipient,
                subject: `TEST: ${this.test?.title}`,
            },
        });
    });

    it('No From/To/Cc headers', async function(){
        const client = new LowLevelSMTPClient(defaultTransportOptions.host!, defaultTransportOptions.port!);

        const mail: Mail.Options = {
            ...defaultMail,
            subject: `TEST: ${this.test?.title}`,
        };

        const messageId: string = await expect(client.sendMail(defaultMail.from as string, defaultMail.to as string, {Subject: mail.subject!}, defaultMail.text as string), 'Failed to send message').to.eventually.be.fulfilled;
        const received: Message = await expect(waitForMessage(messageId), 'No message was send').to.eventually.be.fulfilled;

        delete mail.to; // We don't expect a To header
        await verifyMail(mail, messageId, received);
    });

});
