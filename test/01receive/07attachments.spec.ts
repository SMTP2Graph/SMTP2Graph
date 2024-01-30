import { expect } from 'chai';
import '../_config';
import { Server } from '../classes/Server';
import { submitAndVerifyMail } from './Helpers';
import { testimage } from '../_config';

describe('Receive: Attachments', async function(){
    const server = new Server({
        mode: 'receive',
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
                attachments: [
                    {contentType: 'image/png', content: testimage, filename: 'testimage.png', contentDisposition: 'inline'},
                ],
            },
        });
    });

});
