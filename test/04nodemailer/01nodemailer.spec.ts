import { Readable } from 'stream';
import { expect } from 'chai';
import '../_config';
import MailComposer from 'nodemailer/lib/mail-composer';
import addressparser from 'nodemailer/lib/addressparser';

describe('Nodemailer 9 compatibility', function(){
    it('Does not treat malformed addresses as usable mailboxes', function(){
        const parsed = addressparser('broken <', {flatten: true});
        expect(parsed).to.have.length(1);
        expect(parsed[0].address).to.equal('');
    });

    it('Strips BCC by default and preserves it when requested', async function(){
        const options = {
            from: 'sender@example.com',
            to: 'receiver@example.com',
            bcc: 'hidden@example.com',
            subject: 'BCC behavior',
            text: 'Message body',
        };
        const stripped = await new MailComposer(options).compile().build();
        const preservedMessage = new MailComposer(options).compile();
        preservedMessage.keepBcc = true;
        const preserved = await preservedMessage.build();

        expect(stripped.toString()).not.to.match(/^Bcc:/mi);
        expect(preserved.toString()).to.match(/^Bcc: hidden@example\.com$/mi);
    });

    it('Preserves raw EML content exactly', async function(){
        const raw = Buffer.from([
            'From: sender@example.com',
            'To: receiver@example.com',
            'Bcc: hidden@example.com',
            'Subject: Raw message',
            'X-Test: original',
            '',
            'Raw body',
            '',
        ].join('\r\n'));
        const message = new MailComposer({raw: Readable.from([raw])}).compile();
        message.keepBcc = true;

        expect(await message.build()).to.deep.equal(raw);
    });

    it('Prevents CRLF values from injecting additional headers', async function(){
        const raw = await new MailComposer({
            from: 'sender@example.com\r\nBcc: attacker@example.com',
            to: 'receiver@example.com',
            subject: 'Safe subject\r\nX-Injected: true',
            text: 'Message body',
        }).compile().build();
        const headers = raw.toString().split('\r\n\r\n', 1)[0];

        expect(headers).not.to.match(/^Bcc:/mi);
        expect(headers).not.to.match(/^X-Injected:/mi);
    });
});
