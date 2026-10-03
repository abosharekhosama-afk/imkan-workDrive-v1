
// smoke logic mirrored for CI-less check
function align(els, align) {
  if (els.length === 1) {
    const e = {...els[0]};
    if (align === 'left') e.x = 0;
    if (align === 'center') e.x = (100 - e.width) / 2;
    if (align === 'right') e.x = 100 - e.width;
    return [e];
  }
  const minX = Math.min(...els.map(e => e.x));
  const maxR = Math.max(...els.map(e => e.x + e.width));
  return els.map(e => {
    const n = {...e};
    if (align === 'left') n.x = minX;
    if (align === 'right') n.x = maxR - e.width;
    if (align === 'center') n.x = (minX + maxR) / 2 - e.width / 2;
    return n;
  });
}
const a = align([{x:10,width:20},{x:40,width:10}], 'left');
if (a[0].x !== 10 || a[1].x !== 10) throw new Error('align left fail');
const b = align([{x:10,width:20}], 'center');
if (Math.abs(b[0].x - 40) > 0.01) throw new Error('single center fail '+b[0].x);
console.log('object-ops smoke ok');
