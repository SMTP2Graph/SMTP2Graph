import { expect } from 'chai';
import '../_config';
import { Server } from '../classes/Server';
import { submitAndVerifyMail } from './Helpers';

describe('Receive: IP whitelist', async function(){
    const server = new Server({
        mode: 'receive',
        receive: {ipWhitelist: ['127.0.0.1']},
    });

    before('Start server', async function(){
        await expect(server.start(), 'Failed to start SMTP server').to.eventually.be.fulfilled;
    });

    after('Stop server', async function(){
        await server.stop();
    });

    it('Allowed IP', async function(){
        await submitAndVerifyMail({});
    });

    it('Allowed CIDR', async function(){
        await expect(server.restart({receive: {ipWhitelist: ['127.0.0.0/8']}}), 'Failed to restart server').to.eventually.be.fulfilled;
        await submitAndVerifyMail({});
    });

    it('Dissalowed IP', async function(){
        await expect(server.restart({receive: {ipWhitelist: ['127.0.0.2']}}), 'Failed to restart server').to.eventually.be.fulfilled;
        await expect(submitAndVerifyMail({}), 'Connectiong was accepted').to.eventually.be.rejectedWith(/not allowed to connect/i);
    });
});
