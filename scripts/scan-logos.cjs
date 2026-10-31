
const fs = require('fs');
const scanDirs = ['src', 'src-tauri', 'scripts'];
const skip = ['node_modules', 'dist', 'target'];
let results = [];
function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + '/' + f.name;
    if (f.isDirectory()) { if (!skip.some(s => p.includes(s))) walk(p); continue; }
    if (!/\.(ts|tsx|html|css|svg|json|rs|md)$/.test(f.name)) continue;
    const c = fs.readFileSync(p, 'utf8');
    const lines = c.split('\n');
    lines.forEach(function(l, i) {
      if (l.includes('\u2726') || l.includes('favicon') || l.includes('logo') || l.includes('aether-ide-icon') || l.includes('aether-ide-logo'))
        results.push(p.replace('./', '') + ':' + (i+1) + ' -> ' + l.trim().slice(0, 100));
    });
  }
}
scanDirs.forEach(walk);
const readme = fs.readFileSync('README.md', 'utf8');
readme.split('\n').forEach(function(l, i) {
  if (l.includes('\u2726') || l.includes('logo') || l.includes('aether-ide-icon') || l.includes('aether-ide-logo'))
    results.push('README.md:' + (i+1) + ' -> ' + l.trim().slice(0, 100));
});
console.log(results.join('\n'));
console.log('total:', results.length);

