import type { DesktopBridge } from '@pea/contracts';

declare global {
  interface Window {
    pea: DesktopBridge;
  }
}
