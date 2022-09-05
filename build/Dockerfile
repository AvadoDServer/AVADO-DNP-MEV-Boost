ARG VERSION
FROM --platform=linux/amd64 flashbots/mev-boost:${VERSION}

COPY start.sh /
RUN chmod a+x /start.sh

ENTRYPOINT ["/start.sh"]
