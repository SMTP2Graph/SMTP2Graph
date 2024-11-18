import { expect } from 'chai';
import { createTransport } from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { config, validateSendConfig } from '../_config';
import { Message } from '@microsoft/microsoft-graph-types';
import { Mailbox } from '../classes/Mailbox';
import { defaultTransportOptions, parseMailAddresses, stringOrBufferToString } from '../01receive/Helpers';

validateSendConfig();

export interface ISubmitMail
{
    transportOptions?: SMTPTransport.Options;
    mail?: Mail.Options;
}

export const defaultMail: Mail.Options = {
    from: config.mailbox,
    to: config.mailbox,
    text: 'Some mail contents',
};

export async function submitAndVerifyMail(submitProps: ISubmitMail)
{
    const { props, send, received } = await submitMail(submitProps);
    await verifyMail(props.mail!, send.messageId, received);

    return {props, send, received};
}

export async function submitMail(props: ISubmitMail)
{
    const transport = createTransport({...defaultTransportOptions, ...props.transportOptions});
    const mail = {...defaultMail, ...props.mail};

    const send: SMTPTransport.SentMessageInfo = await expect(transport.sendMail(mail), 'Failed to submit message').to.eventually.be.fulfilled;
    const received: Message = await expect(waitForMessage(send.messageId), 'No message was send').to.eventually.be.fulfilled;

    return {props, send, received};
}

export async function verifyMail(mail: Required<ISubmitMail>['mail'], messageId: string, received: Message)
{
    expect(received.internetMessageId, 'Message-Id from queued file doesn\'t match submitted message').to.equal(messageId);
    
    // Addresses
    if(mail.from) expect(received.from?.emailAddress?.address, 'From address not present').to.equal(mail.from);
    if(mail.to) expect(parseMailAddresses(mail.to), 'To addresses do not match').to.have.members(received.toRecipients?.map(r=>r.emailAddress?.address) || []);
    if(mail.cc) expect(parseMailAddresses(mail.cc), 'CC addresses do not match').to.have.members(received.ccRecipients?.map(r=>r.emailAddress?.address) || []);
    if(mail.replyTo) expect(parseMailAddresses(mail.replyTo), 'ReplyTo addresses do not match').to.have.members(received.replyTo?.map(r=>r.emailAddress?.address) || []);

    // Contents
    if(mail.subject) expect(received.subject, 'Subject does not match').to.equal(mail.subject);
    if(mail.text) expect(received.body?.content, 'Text body does not match').to.contain(mail.text);
    if(mail.html) expect(received.body?.content, 'HTML body does not match').to.contain(mail.html);

    // Properties
    if(mail.date) expect(received.sentDateTime, 'Date does not match').to.equal(mail.date);
    
    // Attachments
    if(mail.attachments)
    {
        expect(mail.attachments.length, 'Number of attachments does not match').to.equal(received.attachments?.length);

        for(const attachment of mail.attachments)
        {
            const receivedAttachment = received.attachments?.find(f=>f.name===attachment.filename);
            expect(receivedAttachment, `Could not find attachment "${attachment.filename}"`).to.not.be.undefined;
            if(receivedAttachment)
            {
                if(attachment.contentType) expect(receivedAttachment.contentType, 'Contenttype does not match').to.equal(attachment.contentType);
                if(attachment.content)
                {
                    if('contentBytes' in receivedAttachment)
                        expect(Buffer.from(receivedAttachment.contentBytes as string, 'base64').toString(), 'Content does not match').to.equal(stringOrBufferToString(attachment.content as Buffer|string));
                    else
                        throw new Error(`Attachment "${attachment.filename}" has no content`);
                }
                if(attachment.contentDisposition === 'inline')
                    expect(receivedAttachment.isInline, `Attachment "${attachment.filename}" is not inline`).to.be.true;
                else
                    expect(receivedAttachment.isInline, `Attachment "${attachment.filename}" is inline`).to.be.false;
            }
        }
    }
}

export async function waitForMessage(msgId: string)
{
    for(let i=0; i<15; i++)
    {
        await sleep(250);

        const message = await Mailbox.fetchMessageByMsgId(msgId);
        if(message) return message;
    }

    throw new Error(`Failed to find a messages with ID "${msgId}"`);
}

const sleep = (ms: number)=>new Promise(r=>setTimeout(r, ms));
