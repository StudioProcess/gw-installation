#!/bin/sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

HASH=$( find . -type f -not -path '*/.git/*' -not -path '*/.DS_Store' -not -path './node_modules/*' -not -path './hash.sh' \
| xargs shasum -a 256 \
| shasum -a 256 \
| cut -d " " -f 1 )

if [ $# -gt 0 ]; then
    if [[ $HASH == $1* ]]; then
        echo "${YELLOW}INCOMPLETE${NC}"
    else
        if [ $HASH = $1 ]; then
            echo "${GREEN}VERIFIED${NC}"
        else
            echo "${RED}NOT VERIFIED${NC}"
        fi
    fi
else
    echo $HASH
fi
