#!/bin/bash

mkdir -p bin

url="$1"
shortname="$2"

filename=$(basename "$url")

cd bin

if [ -f "$filename" ]; then
    exit 0
fi

curl -L -o "$filename" "$url"

unzip "$filename"

filename="${filename%.zip}"

mv "$filename" "$shortname"
