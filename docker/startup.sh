#!/bin/sh

WORKDIR=`pwd`
CFGFILE="$WORKDIR/config.yml"

if [ ! -f "$CFGFILE" ]; then
    echo "The file '$CFGFILE' does not exist. Did you mount $WORKDIR and put a config file in there?" >&2
    exit 1
fi

# Run SMTP2Graph
node /bin/smtp2graph.js --receive.port=587
