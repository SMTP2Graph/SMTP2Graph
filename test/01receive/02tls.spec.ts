import { expect } from 'chai';
import '../_config';
import { Server } from '../classes/Server';
import { submitAndVerifyMail } from './Helpers';

describe('Receive: TLS', async function(){
    const server = new Server({
        mode: 'receive',
        receive: {
            secure: true,
            tlsKeyPath: 'test/localhost.key',
            tlsCertPath: 'test/localhost.crt',
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

    it('Default floor: reject client constrained to TLS 1.0 when minVersion is omitted', async function(){
        await expect(submitAndVerifyMail({
            transportOptions: {
                secure: true,
                ignoreTLS: false,
                tls: {
                    minVersion: 'TLSv1',
                    maxVersion: 'TLSv1',
                    ciphers: 'DEFAULT@SECLEVEL=0',
                    rejectUnauthorized: false,
                },
            },
        })).to.eventually.be.rejected;
    });

    it('Legacy opt-in: accept client when configured with minVersion TLSv1 and DEFAULT@SECLEVEL=0', async function(){
        await expect(server.restart({
            receive: {
                secure: true,
                tlsKeyPath: 'test/localhost.key',
                tlsCertPath: 'test/localhost.crt',
                tls: {
                    minVersion: 'TLSv1',
                    ciphers: 'DEFAULT@SECLEVEL=0',
                },
            },
        }), 'Failed to restart server with legacy TLS 1.0 configuration').to.eventually.be.fulfilled;

        await submitAndVerifyMail({
            transportOptions: {
                secure: true,
                ignoreTLS: false,
                tls: {
                    minVersion: 'TLSv1',
                    maxVersion: 'TLSv1',
                    ciphers: 'DEFAULT@SECLEVEL=0',
                    rejectUnauthorized: false,
                },
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

    it('Enforce minVersion: reject client below minimum version', async function(){
        await expect(server.restart({
            receive: {
                secure: true,
                tlsKeyPath: 'test/localhost.key',
                tlsCertPath: 'test/localhost.crt',
                tls: {
                    minVersion: 'TLSv1.3',
                },
            },
        }), 'Failed to restart server with minVersion TLSv1.3').to.eventually.be.fulfilled;

        await expect(submitAndVerifyMail({
            transportOptions: {
                secure: true,
                ignoreTLS: false,
                tls: {
                    maxVersion: 'TLSv1.2',
                    rejectUnauthorized: false,
                },
            },
        })).to.eventually.be.rejectedWith(/protocol version/i);
    });

    it('Enforce minVersion: accept client meeting minimum version', async function(){
        await submitAndVerifyMail({
            transportOptions: {
                secure: true,
                ignoreTLS: false,
                tls: {
                    minVersion: 'TLSv1.3',
                    rejectUnauthorized: false,
                },
            },
        });
    });

    it('Enforce ciphers policy: reject disallowed cipher', async function(){
        await expect(server.restart({
            receive: {
                secure: true,
                tlsKeyPath: 'test/localhost.key',
                tlsCertPath: 'test/localhost.crt',
                tls: {
                    minVersion: 'TLSv1.2',
                    maxVersion: 'TLSv1.2',
                    ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
                },
            },
        }), 'Failed to restart server with cipher restrictions').to.eventually.be.fulfilled;

        await expect(submitAndVerifyMail({
            transportOptions: {
                secure: true,
                ignoreTLS: false,
                tls: {
                    minVersion: 'TLSv1.2',
                    maxVersion: 'TLSv1.2',
                    ciphers: 'ECDHE-RSA-AES128-GCM-SHA256',
                    rejectUnauthorized: false,
                },
            },
        })).to.eventually.be.rejectedWith(/handshake failure/i);
    });

    it('Enforce ciphers policy: accept allowed cipher', async function(){
        await submitAndVerifyMail({
            transportOptions: {
                secure: true,
                ignoreTLS: false,
                tls: {
                    minVersion: 'TLSv1.2',
                    maxVersion: 'TLSv1.2',
                    ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
                    rejectUnauthorized: false,
                },
            },
        });
    });

    it('Support ecdhCurve configuration', async function(){
        await expect(server.restart({
            receive: {
                secure: true,
                tlsKeyPath: 'test/localhost.key',
                tlsCertPath: 'test/localhost.crt',
                tls: {
                    minVersion: 'TLSv1.2',
                    ecdhCurve: 'X25519MLKEM768:X25519:prime256v1:secp384r1',
                },
            },
        }), 'Failed to restart server with ecdhCurve configuration').to.eventually.be.fulfilled;

        await submitAndVerifyMail({
            transportOptions: {
                secure: true,
                ignoreTLS: false,
                tls: {
                    rejectUnauthorized: false,
                },
            },
        });
    });

    it('Apply TLS policy to STARTTLS', async function(){
        await expect(server.restart({
            receive: {
                secure: false,
                tlsKeyPath: 'test/localhost.key',
                tlsCertPath: 'test/localhost.crt',
                tls: {
                    minVersion: 'TLSv1.3',
                },
            },
        }), 'Failed to restart server for STARTTLS test').to.eventually.be.fulfilled;

        // Reject below minVersion over STARTTLS
        await expect(submitAndVerifyMail({
            transportOptions: {
                secure: false,
                ignoreTLS: false,
                requireTLS: true,
                tls: {
                    maxVersion: 'TLSv1.2',
                    rejectUnauthorized: false,
                },
            },
        })).to.eventually.be.rejectedWith(/protocol version/i);

        // Accept meeting minVersion over STARTTLS
        await submitAndVerifyMail({
            transportOptions: {
                secure: false,
                ignoreTLS: false,
                requireTLS: true,
                tls: {
                    minVersion: 'TLSv1.3',
                    rejectUnauthorized: false,
                },
            },
        });
    });
});
