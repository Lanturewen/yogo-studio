'use strict';
const path=require('path'),fs=require('fs');
const root=path.resolve(__dirname,'..');
require('esbuild').buildSync({entryPoints:[path.join(root,'ui/model-source.js')],outfile:path.join(root,'ui/viewer.js'),bundle:true,minify:true,format:'iife',target:'chrome120',legalComments:'eof'});
fs.copyFileSync(path.join(root,'node_modules/three/LICENSE'),path.join(root,'ui/THREE-LICENSE.txt'));

fs.copyFileSync(path.join(root,'node_modules/camera-controls/LICENSE'),path.join(root,'ui/CAMERA-CONTROLS-LICENSE.txt'));
