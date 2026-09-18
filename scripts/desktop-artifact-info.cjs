'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, 'dist/desktop'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const models = ['ui/model-source.js', 'ui/dial-model.js', 'ui/viewer.js', 'ui/assets/yogo-pro-front.png', 'ui/assets/yogo-pro-controls.png', 'ui/assets/yogo-pro-underside.jpg'];
const artifacts = fs.readdirSync(output).filter(name => /\.(dmg|zip|exe)$/.test(name)).map(name => ({name, bytes:fs.statSync(path.join(output,name)).size, sha256:hash(path.join(output,name))}));
if (!artifacts.length) throw Error('No desktop artifacts found');
const info = {
  version:require('../package.json').version,
  commit:process.env.GITHUB_SHA || execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  platform:process.platform, arch:process.arch,
  channel:'public beta',
  signing:process.platform === 'darwin' ? 'ad-hoc; not Developer ID signed or notarized' : 'unsigned',
  artifacts,
  models:models.map(name => ({name,sha256:hash(path.join(root,name))}))
};
fs.writeFileSync(path.join(output,`BUILD_INFO-${process.platform}-${process.arch}.json`), JSON.stringify(info,null,2)+'\n');
fs.writeFileSync(path.join(output,`SHA256SUMS-${process.platform}-${process.arch}.txt`), artifacts.map(item => item.sha256+'  '+item.name).join('\n')+'\n');
for (const name of ['START_HERE.md','AI_SETUP.md','THIRD_PARTY_NOTICES.md','LICENSE']) fs.copyFileSync(path.join(root,name),path.join(output,name));
console.log(JSON.stringify(info,null,2));
