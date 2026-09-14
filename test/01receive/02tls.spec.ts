import { expect } from 'chai';
import '../_config';
import { Server } from '../classes/Server';
import { submitAndVerifyMail } from './Helpers';
import { tlsCertPath, tlsKeyPath } from './tls-fixture';

describe('Receive: TLS', async function(){
    const server = new Server({
        mode: 'receive',
        receive: {
            secure: true,
            tlsKeyPath,
            tlsCertPath,
        },
    });

    before('Start server', async function(){
        await expect(server.start(), 'Failed to start SMTP server').to.eventually.be.fulfilled;
    });

    after('Stop server', async function(){
        await server.stop();
    });

    it('Submit message', async function(){
        await submitAndVerifyMail({
            transportOptions: {
                secure: true,
                ignoreTLS: false,
                tls: {rejectUnauthorized: false}, // Skip chain validation
            },
        });
    });

    it('Connect to non secure server', async function(){
        // Restart server in non-secure mode
        await expect(server.restart({receive: {secure: false}}), 'Failed to restart server').to.eventually.be.fulfilled;

        await expect(submitAndVerifyMail({transportOptions: {
            secure: true,
            ignoreTLS: false,
        }})).to.eventually.be.rejectedWith(/wrong version number/);
    });
});
