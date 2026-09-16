import type { LauncherIcon } from '@buginbox/shared';

/**
 * A small fixed set of preset icons. Owners pick one; they cannot supply their
 * own markup, so no host-controlled SVG is ever injected.
 */
const PATHS: Record<LauncherIcon, string> = {
  bug: 'M8 2.5a4 4 0 0 1 4 4v.2h2.2a1 1 0 1 1 0 2H12.9c.06.33.1.66.1 1v.3h2.2a1 1 0 1 1 0 2H13v.3a5 5 0 0 1-10 0V12H.9a1 1 0 1 1 0-2H3v-.3c0-.34.04-.67.1-1H.9a1 1 0 0 1 0-2H3.1v-.2a4 4 0 0 1 4-4h.9Z',
  chat: 'M2 3.5A2.5 2.5 0 0 1 4.5 1h9A2.5 2.5 0 0 1 16 3.5v6a2.5 2.5 0 0 1-2.5 2.5H7.7l-3.5 2.8A1 1 0 0 1 2.6 14v-2H2.5A2.5 2.5 0 0 1 0 9.5v-6A2.5 2.5 0 0 1 2.5 1',
  flag: 'M3 1a1 1 0 0 1 1 1v.3l2.6-.6a5 5 0 0 1 3 .2l1.2.5a5 5 0 0 0 3 .2l.9-.2A1 1 0 0 1 16 3.4v6.3a1 1 0 0 1-.8 1l-1.1.2a7 7 0 0 1-4.2-.3l-1.2-.5a3 3 0 0 0-1.8-.1L4 10.6V15a1 1 0 1 1-2 0V2a1 1 0 0 1 1-1Z',
  help: 'M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm0 12.5a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2ZM9.3 8.6c-.5.3-.6.5-.6.9a.8.8 0 0 1-1.6 0c0-1.1.5-1.7 1.3-2.2.6-.4.8-.6.8-1A1.2 1.2 0 0 0 8 5.2c-.6 0-1 .3-1.2.8a.8.8 0 0 1-1.5-.5A2.8 2.8 0 0 1 8 3.6a2.8 2.8 0 0 1 2.8 2.7c0 1.1-.6 1.7-1.5 2.3Z',
  megaphone:
    'M13.5 1a1 1 0 0 1 1 1v11a1 1 0 0 1-1.6.8L9 11.2V4.8l3.9-3.6a1 1 0 0 1 .6-.2ZM7.5 5v6H4.2a.7.7 0 0 0-.1 0l.8 3.3A1.4 1.4 0 0 1 3.5 16a1.4 1.4 0 0 1-1.4-1.1L1.3 11A3 3 0 0 1 2 5h5.5Z',
};

export function launcherIconSvg(icon: LauncherIcon): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '17');
  svg.setAttribute('height', '17');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PATHS[icon] ?? PATHS.bug);
  svg.appendChild(path);
  return svg;
}

export function closeIconSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M3.5 3.5l9 9m0-9l-9 9');
  svg.appendChild(path);
  return svg;
}

export function successIconSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '34');
  svg.setAttribute('height', '34');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '10');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M7.5 12.5l3 3 6-6.5');
  svg.appendChild(circle);
  svg.appendChild(path);
  return svg;
}
