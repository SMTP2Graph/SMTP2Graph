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
    certificateThumbprint: process.env.AZURE_CERT_THUMBPRINT!,
    certificatePrivateKeyPath: process.env.AZURE_CERT_PRIVATE_KEY_PATH!,
    mailbox: process.env.MAILBOX!,
    additionalRecipient: process.env.ADDITIONALRECIPIENT!,
    deniedMailbox: process.env.DENIED_MAILBOX!,
};

export function validateCertificateSendConfig()
{
    if(!config.clientId)
        throw new Error('No clientId defined');
    else if(!config.clientTenant)
        throw new Error('No clientTenant defined');
    else if(!config.certificateThumbprint)
        throw new Error('No certificate thumbprint defined');
    else if(!config.certificatePrivateKeyPath)
        throw new Error('No certificate private key path defined');
    else if(!fs.existsSync(config.certificatePrivateKeyPath))
        throw new Error('Certificate private key file does not exist');
    else if(!config.mailbox)
        throw new Error('No mailbox defined');
}

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
    else if(!config.deniedMailbox)
        throw new Error('No deniedMailbox defined');
}
