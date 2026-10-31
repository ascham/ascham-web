// What a test run holds on this machine: its ports, and what it has started.
// Dev tooling only, never shipped.
import net from 'node:net';

// Whether nothing is listening on a local port.
export const portFree = (port) => new Promise((resolve) => {
  const s = net.createServer();
  s.once('error', () => resolve(false));
  s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
});

// Everything started and not yet stopped, each as a function that stops it
// and removes its folders. Each removes itself once it has run.
export const live = new Set();
