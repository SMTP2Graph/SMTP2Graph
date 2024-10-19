import { expect } from 'chai';
import { createTransport } from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { AddressObject, EmailAddress, ParsedMail } from 'mailparser';
import { MailQueue } from '../classes/MailQueue';

export interface ISubmitMail
{
    transportOptions?: SMTPTransport.Options;
    mail?: Mail.Options;
}

export const defaultTransportOptions: SMTPTransport.Options = {
    host: '127.0.0.1',
    port: 1337,
    ignoreTLS: true,
};

export const defaultMail: Mail.Options = {
    from: 'noreply@example.com',
    to: 'receiver@example.com',
    text: 'Some mail contents',
};

export async function submitAndVerifyMail(submitProps: ISubmitMail)
{
    const { props, send, received } = await submitMail(submitProps);
    await verifyMail(props.mail || {}, send, received);

    return {props, send, received};
}

export async function submitMail(props: ISubmitMail)
{
    const transport = createTransport({...defaultTransportOptions, ...props.transportOptions});
    const mail = {...defaultMail, ...props.mail};

    const fileWaiter = MailQueue.startWaitForFile();
    
    const send: SMTPTransport.SentMessageInfo = await expect(transport.sendMail(mail), 'Failed to submit message').to.eventually.be.fulfilled;
    const queueFile: string = await expect(fileWaiter(), 'No message was queued').to.eventually.be.fulfilled;
    const received: ParsedMail = await expect(MailQueue.readFile(queueFile), 'Failed to parse queued file').to.eventually.be.fulfilled;

    return {props, send, received};
}

export async function verifyMail(mail: Required<ISubmitMail>['mail'], send: SMTPTransport.SentMessageInfo, received: ParsedMail)
{
    expect(received.messageId, 'Message-Id from queued file doesn\'t match submitted message').to.equal(send.messageId);
    
    // Addresses
    if(mail.from) expect(received.from?.value.map(v=>v.address), 'From address not present').to.include(mail.from);
    if(mail.to) expect(parseMailAddresses(mail.to), 'To addresses do not match').to.have.members(parseParsedMailAddresses(received.to || []));
    if(mail.cc) expect(parseMailAddresses(mail.cc), 'CC addresses do not match').to.have.members(parseParsedMailAddresses(received.cc || []));
    if(mail.bcc) expect(parseMailAddresses(mail.bcc), 'BCC addresses do not match').to.have.members(parseParsedMailAddresses(received.bcc || []));
    if(mail.replyTo) expect(parseMailAddresses(mail.replyTo), 'ReplyTo addresses do not match').to.have.members(parseParsedMailAddresses(received.replyTo || []));

    // Contents
    if(mail.subject) expect(received.subject, 'Subject does not match').to.equal(mail.subject);
    if(mail.text) expect(received.text, 'Text body does not match').to.contain(mail.text);
    if(mail.html) expect(received.html, 'HTML body does not match').to.contain(mail.html);

    // Properties
    if(mail.date) expect(received.date, 'Date does not match').to.equal((mail.date instanceof Date)?mail.date:new Date(mail.date));
    
    // Attachments
    if(mail.attachments)
    {
        expect(mail.attachments.length, 'Number of attachments does not match').to.equal(received.attachments.length);

        for(const attachment of mail.attachments)
        {
            const receivedAttachment = received.attachments.find(f=>f.filename===attachment.filename);
            expect(receivedAttachment, `Could not find attachment "${attachment.filename}"`).to.not.be.undefined;
            if(attachment.contentType) expect(receivedAttachment?.contentType, 'Contenttype does not match').to.equal(attachment.contentType);
            if(attachment.content) expect(stringOrBufferToString(receivedAttachment?.content), 'Content does not match').to.equal(stringOrBufferToString(attachment.content as Buffer|string));
            if(attachment.contentDisposition) expect(receivedAttachment?.contentDisposition, 'Contentdispositon does not match').to.equal(attachment.contentDisposition);
        }
    }
}

export function stringOrBufferToString(input: Buffer|string|undefined): string|undefined
{
    if(input instanceof Buffer)
        return input.toString();
    else
        return input;
}

/** Transform to/cc/bcc addresses from `Mail.Options` to a string array */
export function parseMailAddresses(addresses: Required<Mail.Options>['to']): string[]
{
    addresses = (addresses instanceof Array)?addresses:[addresses];
    return addresses.map(a=>(typeof a === 'string')?a:a.address);
}

/** Transform to/cc/bcc addresses from `Mail.Options` to a string array */
function parseParsedMailAddresses(addresses: AddressObject | AddressObject[]): string[]
{
    addresses = (addresses instanceof Array)?addresses:[addresses];
    const emailAddresses: EmailAddress[] = [];
    addresses.forEach(address=>emailAddresses.push(...address.value));

    return emailAddresses.map(a=>String(a.address));
}
