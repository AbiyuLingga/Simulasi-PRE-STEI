import { Component, type ReactNode } from 'react';
import { LabCanvas } from './render/LabCanvas';
import { Breadboard2DEditor } from './ui/Breadboard2DEditor';
import { LabDrawer } from './ui/LabDrawer';
import { MinimalHUD } from './ui/MinimalHUD';
import { TutorialOverlay } from './ui/TutorialOverlay';

class WebGLErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' };

  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-[#14191f] p-6 text-[#f8fafc]">
          <div className="max-w-md space-y-2 rounded border border-[#ef4444] bg-[#1e252e] p-4 text-sm">
            <div className="font-bold">WebGL gagal dimuat</div>
            <div className="font-mono-readout text-xs text-[#cbd5e1]">{this.state.message}</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#14191f]">
      <h1 className="sr-only">EL-2101 3D Lab Simulator</h1>
      <WebGLErrorBoundary>
        <LabCanvas />
      </WebGLErrorBoundary>
      <Breadboard2DEditor />
      <MinimalHUD />
      <TutorialOverlay />
      <LabDrawer />
    </main>
  );
}

export default App;
