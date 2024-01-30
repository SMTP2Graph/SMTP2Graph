import { expect } from 'chai';
import '../_config';
import { Server } from '../classes/Server';
import { submitAndVerifyMail } from './Helpers';

describe('Receive: Rate limiter', async function(){
    const server = new Server({
        mode: 'receive',
        receive: {rateLimit: {duration: 60, limit: 10}},
    });

    before('Start server', async function(){
        await expect(server.start(), 'Failed to start SMTP server').to.eventually.be.fulfilled;
    });

    after('Stop server', async function(){
        await server.stop();
    });

    it('Hit rate limit', async function(){
        let rateLimitExceeded = false

        for(let i=0; i<15; i++)
        {
            try {
                await submitAndVerifyMail({});
            } catch(error) {
                if(/Rate limit exceeded/i.test(String(error)))
                {
                    rateLimitExceeded = true;
                    break;
                }
                else
                    throw error;
            }
        }

        expect(rateLimitExceeded, 'We were not blocked after 15 attempts').to.be.true;
    });

});
