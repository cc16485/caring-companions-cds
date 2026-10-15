// Illustrated portraits for fictional practice caregivers (no real photos).
export function portraitSvg({ skin, hair, style, top, bg }) {
  const H = {
    bob: `<path d="M30 46c0-16 9-24 20-24s20 8 20 24v14c-3 2-6 2-8 0V44c-4-4-20-4-24 0v16c-2 2-5 2-8 0z" fill="${hair}"/>`,
    long: `<path d="M28 48c0-18 10-26 22-26s22 8 22 26v26c-4 3-9 3-12 0V46c-5-5-15-5-20 0v28c-3 3-8 3-12 0z" fill="${hair}"/>`,
    short: `<path d="M32 44c0-14 8-21 18-21s18 7 18 21c-4-6-10-8-18-8s-14 2-18 8z" fill="${hair}"/>`,
    curly: `<g fill="${hair}"><circle cx="36" cy="38" r="9"/><circle cx="48" cy="30" r="10"/><circle cx="62" cy="34" r="9"/><circle cx="67" cy="46" r="7"/><circle cx="33" cy="49" r="7"/></g>`,
    bun: `<g fill="${hair}"><circle cx="50" cy="20" r="8"/><path d="M32 46c0-14 8-21 18-21s18 7 18 21c-4-6-10-8-18-8s-14 2-18 8z"/></g>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/>` +
    `<path d="M14 100c2-20 17-30 36-30s34 10 36 30z" fill="${top}"/><path d="M42 62h16v12c-4 4-12 4-16 0z" fill="${skin}"/>` +
    `<ellipse cx="50" cy="47" rx="17" ry="19" fill="${skin}"/>${H[style] || ''}` +
    `<circle cx="44" cy="49" r="1.8" fill="#16283a"/><circle cx="56" cy="49" r="1.8" fill="#16283a"/>` +
    `<path d="M44 57q6 5 12 0" stroke="#16283a" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`;
}
export const svgData = svg => 'data:image/svg+xml;base64,' + btoa(svg);
export function proofDoc(title) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 380"><rect width="300" height="380" fill="#fff" stroke="#ccc"/>` +
    `<text x="20" y="40" font-family="sans-serif" font-size="14" font-weight="700" fill="#0e3860">PRACTICE PROOF</text>` +
    `<text x="20" y="66" font-family="sans-serif" font-size="12" fill="#333">${title}</text>` +
    `<text x="20" y="92" font-family="sans-serif" font-size="11" fill="#a33">Fictional. Not a real record.</text></svg>`;
  return { mime: 'image/svg+xml', data: svgData(svg) };
}
