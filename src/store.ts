import { create } from 'zustand';
import { defaults, type Settings } from './shared/model';
interface UI { settings: Settings; message: string; busy: string; setSettings: (s: Settings) => void; notify: (s: string) => void; setBusy: (s: string) => void }
let timer: ReturnType<typeof setTimeout>;
export const useUI = create<UI>(set => ({ settings: defaults, message: '', busy: '', setSettings: settings => set({ settings }), notify: message => { clearTimeout(timer); set({ message }); timer = setTimeout(() => set({ message: '' }), 6500); }, setBusy: busy => set({ busy }) }));
