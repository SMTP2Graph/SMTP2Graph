FROM node:20-alpine

ARG VERSION
LABEL version="SMTP2Graph v${VERSION}"

# Add SMTP2Graph binary
COPY dist/server.js /bin/smtp2graph.js
COPY docker/startup.sh /bin/
COPY docker/test.sh /bin/

# Set execute permissions
RUN chmod +x /bin/startup.sh /bin/test.sh

WORKDIR /data
VOLUME /data
EXPOSE 587
USER 65532:65532
ENTRYPOINT ["/bin/startup.sh", "node", "/bin/smtp2graph.js"]
