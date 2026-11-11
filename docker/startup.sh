#!/bin/sh

WORKDIR=`pwd`
CFGFILE="$WORKDIR/config.yml"

# A config file is only required when SMTP2Graph isn't configured through SMTP2GRAPH_* environment variables
if [ ! -f "$CFGFILE" ] && ! env | grep -q '^SMTP2GRAPH_'; then
    echo "The file '$CFGFILE' does not exist and no SMTP2GRAPH_* environment variables are set. Either mount $WORKDIR with a config file in it, or configure SMTP2Graph using environment variables." >&2
    exit 1
fi

# Run SMTP2Graph (port 587 is used, unless configured otherwise in config.yml or SMTP2GRAPH_RECEIVE_PORT)
exec node /bin/smtp2graph.js --receive.port=587
