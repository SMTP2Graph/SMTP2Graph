FROM node:20-alpine

ARG VERSION
LABEL version="SMTP2Graph v${VERSION}"

# Install runtime dependencies for WebUI (express, ajv are externals not bundled by webpack)
COPY package.json package-lock.json /opt/smtp2graph/
RUN cd /opt/smtp2graph && npm ci --omit=dev && rm package.json package-lock.json
ENV NODE_PATH=/opt/smtp2graph/node_modules

# Add SMTP2Graph binary
COPY dist/server.js /bin/smtp2graph.js
COPY docker/startup.sh /bin/
COPY docker/test.sh /bin/

# Set execute permissions
RUN chmod +x /bin/startup.sh
RUN chmod +x /bin/test.sh

WORKDIR /data
VOLUME /data
EXPOSE 587
EXPOSE 3000
ENTRYPOINT startup.sh
