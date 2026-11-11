import { expect } from 'chai';
import '../_config';
import { Server } from '../classes/Server';
import { submitAndVerifyMail } from './Helpers';

describe('Receive: Environment variable config', async function(){
    // No config file, everything is configured through environment variables
    const server = new Server(undefined, {
        SMTP2GRAPH_MODE: 'receive',
        SMTP2GRAPH_RECEIVE_IPWHITELIST: '10.0.0.1, 127.0.0.0/8 ,::1',
        SMTP2GRAPH_RECEIVE_ALLOWEDFROM: 'first@example.com,second@example.com, third@example.com',
    });

    before('Start server', async function(){
        await expect(server.start(), 'Failed to start SMTP server').to.eventually.be.fulfilled;
    });

    after('Stop server', async function(){
        await server.stop();
    });

    it('Allowed IP from whitelist list', async function(){
        await submitAndVerifyMail({mail: {from: 'first@example.com'}});
    });

    it('Every address from allowed FROM list', async function(){
        await submitAndVerifyMail({mail: {from: 'second@example.com'}});
        await submitAndVerifyMail({mail: {from: 'third@example.com'}});
    });

    it('Allowed FROM is case insensitive', async function(){
        await submitAndVerifyMail({mail: {from: 'FIRST@example.com'}});
    });

    it('FROM address not in list', async function(){
        await expect(submitAndVerifyMail({mail: {from: 'notlisted@example.com'}}), 'Message was accepted, while it shouldn\'t').to.eventually.be.rejectedWith(/not allowed/i);
    });

    it('Disallowed IP (not in whitelist list)', async function(){
        await expect(server.restart(undefined, {SMTP2GRAPH_RECEIVE_IPWHITELIST: '10.0.0.1,192.168.0.0/16,127.0.0.2'}), 'Failed to restart server').to.eventually.be.fulfilled;
        await expect(submitAndVerifyMail({mail: {from: 'first@example.com'}}), 'Connection was accepted').to.eventually.be.rejectedWith(/not allowed to connect/i);
    });

    it('Environment variables override the config file', async function(){
        // The config file blocks our IP and FROM address, the environment variables allow them
        await expect(server.restart({
            mode: 'receive',
            receive: {ipWhitelist: ['127.0.0.2'], allowedFrom: ['other@example.com']},
        }, {SMTP2GRAPH_RECEIVE_IPWHITELIST: '127.0.0.1'}), 'Failed to restart server').to.eventually.be.fulfilled;
        await submitAndVerifyMail({mail: {from: 'second@example.com'}});
    });
});
