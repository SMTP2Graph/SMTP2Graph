import { expect } from 'chai';
import '../_config';
import { Server } from '../classes/Server';
import { submitAndVerifyMail } from './Helpers';

describe('Receive: Basic', async function(){
    const server = new Server({
        mode: 'receive',
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

    it('Plaintext + HTML message', async function(){
        await submitAndVerifyMail({
            mail: {
                subject: `TEST: ${this.test?.title}`,
                text: 'Klik here <https://www.smtp2graph.com>',
                html: '<a href="https://www.smtp2graph.com">Klik here</a>',
            },
        });
    });

    it('TO recipients', async function(){
        await submitAndVerifyMail({
            mail: {
                to: ['receiver@example.com','receiver2@example.com','receiver3@example.com'],
                subject: `TEST: ${this.test?.title}`,
            },
        });
    });

    it('CC recipients', async function(){
        await submitAndVerifyMail({
            mail: {
                cc: ['receiver2@example.com','receiver3@example.com'],
                subject: `TEST: ${this.test?.title}`,
            },
        });
    });

    it('BCC recipients', async function(){
        await submitAndVerifyMail({
            mail: {
                cc: ['cc1@example.com','cc3@example.com'],
                bcc: ['bcc1@example.com','bcc2@example.com'],
                subject: `TEST: ${this.test?.title}`,
            },
        });
    });

    it('Reply-To address', async function(){
        await submitAndVerifyMail({
            mail: {
                replyTo: 'replyto@example.com',
                subject: `TEST: ${this.test?.title}`,
            },
        });
    });

});
