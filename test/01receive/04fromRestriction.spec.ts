import { expect } from 'chai';
import '../_config';
import { Server } from '../classes/Server';
import { submitAndVerifyMail } from './Helpers';

describe('Receive: From restriction', async function(){
    const server = new Server({
        mode: 'receive',
        receive: {allowedFrom: ['validfrom@example.com']},
    });

    before('Start server', async function(){
        await expect(server.start(), 'Failed to start SMTP server').to.eventually.be.fulfilled;
    });

    after('Stop server', async function(){
        await server.stop();
    });

    it('Valid address', async function(){
        await submitAndVerifyMail({
            mail: {
                from: 'validfrom@example.com'
            },
        });
    });

    it('Invalid address', async function(){
        await expect(submitAndVerifyMail({
            mail: {
                from: 'invalidfrom@example.com'
            },
        }), 'Message was accepted, while it shouldn\'t').to.eventually.be.rejectedWith(/not allowed/i);
    });

});
