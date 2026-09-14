import { expect } from 'chai';
import { config, validateCertificateSendConfig } from '../_config';
import { Server } from '../classes/Server';
import { submitAndVerifyMail } from './Helpers';

validateCertificateSendConfig();

describe('Send: certificate credential', function(){
    const server = new Server({
        mode: 'full',
        send: {
            appReg: {
                id: config.clientId,
                tenant: config.clientTenant,
                certificate: {
                    thumbprint: config.certificateThumbprint,
                    privateKeyPath: config.certificatePrivateKeyPath,
                },
            },
        },
    });

    before('Start server', async function(){
        await expect(server.start(), 'Failed to start SMTP server with certificate credential').to.eventually.be.fulfilled;
    });

    after('Stop server', async function(){
        await server.stop();
    });

    it('sends and verifies a synthetic message without appReg.secret', async function(){
        await submitAndVerifyMail({
            mail: {
                subject: `TEST: ${this.test?.title}`,
                text: 'Certificate credential qualification message',
            },
        });
    });
});
