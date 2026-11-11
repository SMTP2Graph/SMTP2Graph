# SMTP2Graph

> SMTP2Graph is a robust, versatile and lightweight multiplatform application that will run an SMTP server which relays messages over Microsoft 365/Exchange Online using the Microsoft Graph API.

[![GitHub Last Release](https://img.shields.io/github/v/release/SMTP2Graph/SMTP2Graph?style=for-the-badge)](https://github.com/SMTP2Graph/SMTP2Graph/releases)
[![GitHub Last Release Date](https://img.shields.io/github/release-date/smtp2graph/smtp2graph?style=for-the-badge)](https://github.com/SMTP2Graph/SMTP2Graph/releases)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/smtp2graph?style=for-the-badge&logo=githubsponsors)](https://github.com/sponsors/SMTP2Graph)
[![GitHub Repo stars](https://img.shields.io/github/stars/smtp2graph/smtp2graph?style=for-the-badge&logo=github&color=E3B341)](https://github.com/SMTP2Graph/SMTP2Graph/stargazers)
[![Docker pulls](https://img.shields.io/docker/pulls/smtp2graph/smtp2graph?style=for-the-badge&logo=docker)](https://hub.docker.com/r/smtp2graph/smtp2graph)

## Documentation
[Full documentation](https://www.smtp2graph.com) | [Installation](https://www.smtp2graph.com/#/installation)

## What is it

SMTP2Graph is an SMTP server that will send messages over the Microsoft 365/Exchange Online platform. You don't need a userlicense for this, but you need to create an application registration in Entra ID (Azure AD) and assign it the desired permissions.

## Features

- SMTP AUTH support (PLAIN and LOGIN)
- TLS support
- IP whitelist
- FROM whitelist
- Rate limiter
- Brute force protection
- No issues with SPF/DKIM/DMARC (it's handled by M365)

## Configuration using environment variables

Instead of a `config.yml`, SMTP2Graph can be fully configured using environment variables (ideal for Docker). When both are present, environment variables take precedence over the config file. When no `config.yml` exists, it is not required as long as at least one `SMTP2GRAPH_*` variable is set. See [docker/docker-compose.example.yml](docker/docker-compose.example.yml) for an example.

| Environment variable | config.yml property | Type |
|---|---|---|
| `SMTP2GRAPH_MODE` | `mode` | `full`, `receive` or `send` (default: `full`) |
| `SMTP2GRAPH_SEND_APPREG_TENANT` | `send.appReg.tenant` | string |
| `SMTP2GRAPH_SEND_APPREG_ID` | `send.appReg.id` | string |
| `SMTP2GRAPH_SEND_APPREG_SECRET` | `send.appReg.secret` | string |
| `SMTP2GRAPH_SEND_APPREG_CERTIFICATE_THUMBPRINT` | `send.appReg.certificate.thumbprint` | string |
| `SMTP2GRAPH_SEND_APPREG_CERTIFICATE_PRIVATEKEYPATH` | `send.appReg.certificate.privateKeyPath` | path |
| `SMTP2GRAPH_SEND_RETRYLIMIT` | `send.retryLimit` | number |
| `SMTP2GRAPH_SEND_RETRYINTERVAL` | `send.retryInterval` | number |
| `SMTP2GRAPH_SEND_FORCEMAILBOX` | `send.forceMailbox` | string |
| `SMTP2GRAPH_RECEIVE_PORT` | `receive.port` | number (Docker default: 587) |
| `SMTP2GRAPH_RECEIVE_LISTENADDRESS` | `receive.listenAddress` | string |
| `SMTP2GRAPH_RECEIVE_SECURE` | `receive.secure` | boolean |
| `SMTP2GRAPH_RECEIVE_TLSKEYPATH` | `receive.tlsKeyPath` | path |
| `SMTP2GRAPH_RECEIVE_TLSCERTPATH` | `receive.tlsCertPath` | path |
| `SMTP2GRAPH_RECEIVE_MAXSIZE` | `receive.maxSize` | string (eg. `25m`) |
| `SMTP2GRAPH_RECEIVE_BANNER` | `receive.banner` | string |
| `SMTP2GRAPH_RECEIVE_IPWHITELIST` | `receive.ipWhitelist` | comma separated list |
| `SMTP2GRAPH_RECEIVE_ALLOWEDFROM` | `receive.allowedFrom` | comma separated list |
| `SMTP2GRAPH_RECEIVE_ALLOWINSECUREAUTH` | `receive.allowInsecureAuth` | boolean |
| `SMTP2GRAPH_RECEIVE_REQUIREAUTH` | `receive.requireAuth` | boolean |
| `SMTP2GRAPH_RECEIVE_USERS_<n>_USERNAME` | `receive.users[n].username` | string |
| `SMTP2GRAPH_RECEIVE_USERS_<n>_PASSWORD` | `receive.users[n].password` | string |
| `SMTP2GRAPH_RECEIVE_USERS_<n>_ALLOWEDFROM` | `receive.users[n].allowedFrom` | comma separated list |
| `SMTP2GRAPH_RECEIVE_RATELIMIT_DURATION` | `receive.rateLimit.duration` | number |
| `SMTP2GRAPH_RECEIVE_RATELIMIT_LIMIT` | `receive.rateLimit.limit` | number |
| `SMTP2GRAPH_RECEIVE_AUTHLIMIT_DURATION` | `receive.authLimit.duration` | number |
| `SMTP2GRAPH_RECEIVE_AUTHLIMIT_LIMIT` | `receive.authLimit.limit` | number |
| `SMTP2GRAPH_HTTPPROXY_HOST` | `httpProxy.host` | string |
| `SMTP2GRAPH_HTTPPROXY_PORT` | `httpProxy.port` | number |
| `SMTP2GRAPH_HTTPPROXY_PROTOCOL` | `httpProxy.protocol` | `http` or `https` |
| `SMTP2GRAPH_HTTPPROXY_USERNAME` | `httpProxy.username` | string |
| `SMTP2GRAPH_HTTPPROXY_PASSWORD` | `httpProxy.password` | string |

Booleans accept `true`/`false` (also `1`/`0`, `yes`/`no`). Users are numbered starting at 0 (`SMTP2GRAPH_RECEIVE_USERS_0_USERNAME`, `SMTP2GRAPH_RECEIVE_USERS_1_USERNAME`, ...). Key and certificate files still need to be mounted into the container, for example in `/data`.

```sh
docker run -d -p 587:587 -v ./data:/data \
  -e SMTP2GRAPH_SEND_APPREG_TENANT=contoso \
  -e SMTP2GRAPH_SEND_APPREG_ID=01234567-89ab-cdef-0123-456789abcdef \
  -e SMTP2GRAPH_SEND_APPREG_SECRET=VGhpcyBpcyB2ZXJ5IHNlY3JldCE= \
  -e SMTP2GRAPH_RECEIVE_IPWHITELIST=192.168.30.0/24 \
  smtp2graph/smtp2graph
```

## Support the project

If you like this project, please consider supporting its development.

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-Github?style=for-the-badge&logo=githubsponsors&label=GitHub)](https://github.com/sponsors/SMTP2Graph)
[![Paypal donation](https://img.shields.io/badge/Donate-2997D8?style=for-the-badge&logo=paypal&label=Paypal)](https://paypal.me/roelvbdev)
