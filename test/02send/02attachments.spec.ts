import { expect } from 'chai';
import { config, testimage } from '../_config';
import { Server } from '../classes/Server';
import { submitAndVerifyMail } from './Helpers';

describe('Send: Attachments', async function(){
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

    it('Normal attachments', async function(){
        await submitAndVerifyMail({
            mail: {
                subject: `TEST: ${this.test?.title}`,
                attachments: [
                    {contentType: 'text/plain', content: 'Test content', filename: 'test.txt'},
                    {contentType: 'application/json', content: '{"Test": "content"}', filename: 'test.json'},
                ],
            },
        });
    });

    it('Inline attachment', async function(){
        await submitAndVerifyMail({
            mail: {
                subject: `TEST: ${this.test?.title}`,
                html: 'This is our image:<br><img src="cid:smtp2graph-logo">', // We don't close the HTML tags, because this is how the Graph will return the content
                attachments: [
                    {contentType: 'image/png', content: testimage, filename: 'testimage.png', contentDisposition: 'inline', cid: 'smtp2graph-logo'},
                ],
            },
        });
    });

});
