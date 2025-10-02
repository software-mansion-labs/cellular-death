#!/bin/bash

mkdir -p build

pnpm build

cp package-nwjs-template.json dist/package.json

pnpm  download:win

cp -r dist/ bin/nwjs-win

cd bin

zip -r ../build/nwjs-win.zip nwjs-win
