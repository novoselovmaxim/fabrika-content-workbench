interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  getPlatform: () => string;
  openExternal: (url: string) => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
