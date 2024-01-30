# SMTP2Graph tests

There are multiple test methods:
- `npm run test:receive`: Test the SMTP server
- `npm run test:send`: Test sending over the Graph API (needs additional config)
- `npm run test`: Run all tests

## Send test config

You'll need the following config to run tests (you can put a .env file in your working directory):

```env
CLIENTID="01234567-89ab-cdef-0123-456789abcdef"
CLIENTSECRET="VGhpcyBpcyB2ZXJ5IHNlY3JldCE="
CLIENTTENANT="contoso"
MAILBOX="test@example.com"
ADDITIONALRECIPIENT="test2@example.com"
```

- The application registration needs the permissions `Mail.Read` and `Mail.Send` to the `MAILBOX`
- `ADDITIONALRECIPIENT` is an additional recipient (do not use an alias for this, but a different mailbox or distribution group)
