import { expect } from 'chai';
import '../_config';
import { Server } from '../classes/Server';
import { submitAndVerifyMail } from './Helpers';

describe('Receive: Size restriction', async function(){
    const server = new Server({
        mode: 'receive',
        receive: {maxSize: '1k'},
    });

    before('Start server', async function(){
        await expect(server.start(), 'Failed to start SMTP server').to.eventually.be.fulfilled;
    });

    after('Stop server', async function(){
        await server.stop();
    });

    it('Message within limit', async function(){
        await submitAndVerifyMail({
            mail: {
                text: 'A'.repeat(500),
            },
        });
    });

    it('Message exceeding limit', async function(){
        await expect(submitAndVerifyMail({
            mail: {
                text: 'A'.repeat(1100),
            },
        }), 'Message was accepted, while it shouldn\'t').to.eventually.be.rejectedWith(/Message exceeds/i);
    });

});
