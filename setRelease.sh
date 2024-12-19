#!/bin/bash

RELEASE=$1

case ${RELEASE} in
"avado" | "ap") ;;
*)
  echo "Invalid RELEASE (avado | ap)"
  exit
  ;;
esac

for file in \
    docker-compose.yml \
    dappnode_package.json \
    avatar.png
do
    BASENAME=${file%.*}
    EXT=${file##*.}
    rm -f $file
    ln -sf build/${BASENAME}-${RELEASE}.${EXT} $file
done