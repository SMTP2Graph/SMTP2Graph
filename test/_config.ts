import 'dotenv/config';
import fs from 'fs';
import 'mocha';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);
chai.config.truncateThreshold = 400;

export const testimage = fs.readFileSync('test/testimage.png');

export const config = {
    clientId: process.env.CLIENTID!,
    clientSecret: process.env.CLIENTSECRET!,
    clientTenant: process.env.CLIENTTENANT!,
    mailbox: process.env.MAILBOX!,
    additionalRecipient: process.env.ADDITIONALRECIPIENT!,
};

export function validateSendConfig()
{
    if(!config.clientId)
        throw new Error('No clientId defined');
    else if(!config.clientSecret)
        throw new Error('No clientSecret defined');
    else if(!config.clientTenant)
        throw new Error('No clientTenant defined');
    else if(!config.mailbox)
        throw new Error('No mailbox defined');
    else if(!config.additionalRecipient)
        throw new Error('No additionalRecipient defined');
}
