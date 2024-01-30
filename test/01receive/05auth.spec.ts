import { expect } from 'chai';
import '../_config';
import { Server } from '../classes/Server';
import { defaultMail, submitAndVerifyMail } from './Helpers';

describe('Receive: Authentication', async function(){
    const server = new Server({
        mode: 'receive',
        receive: {
            requireAuth: true,
            allowInsecureAuth: true,
            tlsKeyPath: 'test/localhost.key',
            tlsCertPath: 'test/localhost.crt',
            users: [
                {username: 'user', password: 'P@ssword!', allowedFrom: [defaultMail.from as string]},
            ],
        },
    });

    before('Start server', async function(){
        await expect(server.start(), 'Failed to start SMTP server').to.eventually.be.fulfilled;
    });

    after('Stop server', async function(){
        await server.stop();
    });

    it('Without username/password denied', async function(){
        await expect(submitAndVerifyMail({})).to.eventually.be.rejectedWith(/authentication Required/i);
    });

    it('Incorrect username denied', async function(){
        await expect(submitAndVerifyMail({
            transportOptions: {
                auth: {
                    user: `${server.config.receive?.users?.[0].username}_incorrect`,
                    pass: server.config.receive?.users?.[0].password,
                },
            },
        })).to.eventually.be.rejectedWith(/Invalid login/i);
    });

    it('Incorrect password denied', async function(){
        await expect(submitAndVerifyMail({
            transportOptions: {
                auth: {
                    user: server.config.receive?.users?.[0].username,
                    pass: `${server.config.receive?.users?.[0].password}_incorrect`,
                },
            },
        })).to.eventually.be.rejectedWith(/Invalid login/i);
    });

    it('Accept valid login', async function(){
        await expect(submitAndVerifyMail({
            transportOptions: {
                auth: {
                    user: server.config.receive?.users?.[0].username,
                    pass: server.config.receive?.users?.[0].password,
                },
            },
        })).to.eventually.be.fulfilled;
    });

    it('Invalid FROM denied', async function(){
        await expect(submitAndVerifyMail({
            transportOptions: {
                auth: {
                    user: server.config.receive?.users?.[0].username,
                    pass: server.config.receive?.users?.[0].password,
                },
            },
            mail: {
                from: 'invalidfrom@example.com',
            },
        })).to.eventually.be.rejectedWith(/not allowed/i);
    });

    it('Brute force protection', async function(){
        let tooManyAttempts = false

        for(let i=0; i<15; i++)
        {
            try {
                await submitAndVerifyMail({
                    transportOptions: {
                        auth: {user: 'invalid', pass: 'invalid'},
                    },
                });
            } catch(error) {
                if(!/535 Invalid login/i.test(String(error))) // We expect some "Invalid login" errors, so we ignore those
                {
                    if(/Too many failed logins/i.test(String(error))) // We reached the limit
                    {
                        tooManyAttempts = true;
                        break;
                    }
                    else
                        throw error;
                }
            }
        }

        expect(tooManyAttempts, 'We were not blocked after 15 attempts').to.be.true;
    });

    it('Deny insecure auth', async function(){
        await expect(server.restart({receive: {
            ...server.config.receive,
            allowInsecureAuth: false,
        }}), 'Failed to restart server').to.eventually.be.fulfilled;

        await expect(submitAndVerifyMail({
            transportOptions: {
                auth: {
                    user: server.config.receive?.users?.[0].username,
                    pass: server.config.receive?.users?.[0].password,
                },
                tls: {rejectUnauthorized: false}, // Do not check certiticate chain
            },
        })).to.eventually.be.rejectedWith(/Must issue a STARTTLS/i);
    });

    it('Accept secure auth', async function(){
        await expect(submitAndVerifyMail({
            transportOptions: {
                auth: {
                    user: server.config.receive?.users?.[0].username,
                    pass: server.config.receive?.users?.[0].password,
                },
                ignoreTLS: false,
                tls: {rejectUnauthorized: false}, // Do not check certiticate chain
            },
        })).to.eventually.be.fulfilled;
    });

});
