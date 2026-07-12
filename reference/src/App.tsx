import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Settings, Play, UploadCloud, Info } from 'lucide-react';
import { convertSvgToDesmos } from './utils';
import './types';

export default function App() {
  const calculatorRef = useRef<HTMLElement>(null);
  const [calculator, setCalculator] = useState<any>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Settings
  const [threshold, setThreshold] = useState(128);
  const [optTolerance, setOptTolerance] = useState(0.2);
  const [scale, setScale] = useState(0.05);

  useEffect(() => {
    if (calculatorRef.current && window.Desmos && !calculator) {
      const calc = window.Desmos.Calculator(calculatorRef.current, {
        expressions: true,
        settingsMenu: true,
        zoomButtons: true,
        expressionsTopbar: true,
      });
      setCalculator(calc);
    }
    
    return () => {
      // Clean up if component unmounts (though usually App doesn't unmount)
    };
  }, [calculatorRef, calculator]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleVectorize = async () => {
    if (!selectedFile || !calculator) return;

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('threshold', threshold.toString());
      formData.append('optTolerance', optTolerance.toString());

      const res = await fetch('/api/vectorize', {
        method: 'POST',
        body: formData,
      });

      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Server returned HTML instead of JSON. The server might be restarting or crashed. Please try again in a few seconds.');
      }

      if (!res.ok) {
        throw new Error(`Failed to vectorize image: ${res.statusText}`);
      }

      const data = await res.json();
      
      if (data.svg) {
        const equations = convertSvgToDesmos(data.svg, scale, true);
        
        const folderId = `folder_${Date.now()}`;
        const expressions: any[] = [
          { id: folderId, type: 'folder', title: `Vectorized: ${selectedFile.name}` }
        ];

        equations.forEach((eq, idx) => {
          expressions.push({
            id: `${folderId}_eq_${idx}`,
            folderId: folderId,
            latex: eq,
            color: '#000000', // Black lines like a sketch
            lines: true,
            fill: false,
          });
        });

        // Set all expressions at once for performance
        calculator.setExpressions(expressions);
      }

    } catch (err: any) {
      console.error(err);
      alert(err.message || 'An error occurred during vectorization.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#fdfdfd] text-[#1a1a1a] font-sans select-none overflow-hidden underline-offset-4">
      {/* Header Navigation */}
      <header className="h-12 border-b border-gray-200 flex items-center px-4 bg-white z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold italic text-xl">V</div>
          <span className="font-semibold text-lg tracking-tight">VectoGraph <span className="text-blue-600">Pro</span></span>
        </div>
        <div className="ml-8 flex gap-6 text-sm font-medium text-gray-500">
          <span className="text-blue-600 border-b-2 border-blue-600 h-12 flex items-center">Calculator</span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <button 
            onClick={handleVectorize}
            disabled={!selectedFile || isProcessing}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Processing...' : 'Export to Graph'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Equations & Image Processing */}
        <aside className="w-80 border-r border-gray-200 bg-[#fcfcfc] flex flex-col shrink-0">
          <div className="p-3 border-b border-gray-200 bg-white flex justify-between items-center">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Image Source</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {/* Image Vectorizer Module */}
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <UploadCloud className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-xs font-bold text-blue-800 uppercase tracking-tight">Vectorization Engine</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 bg-blue-600 text-white rounded">{selectedFile ? 'Ready' : 'Waiting'}</span>
              </div>
              
              {/* Image Placeholder Preview */}
              <div className="w-full h-32 bg-white rounded border border-dashed border-blue-300 flex flex-col items-center justify-center mb-4 relative overflow-hidden cursor-pointer hover:bg-gray-50 transition-colors">
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileChange} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" className="h-full w-full object-contain p-1" />
                ) : (
                  <div className="text-center flex flex-col items-center">
                    <span className="text-[10px] text-blue-700 font-medium">Click or Drag Image</span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase">Threshold</label>
                    <span className="text-[9px] font-mono text-gray-500">{threshold}</span>
                  </div>
                  <input type="range" min="0" max="255" value={threshold} onChange={(e) => setThreshold(parseInt(e.target.value))} className="w-full h-1 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                  <div className="flex justify-between text-[9px] text-blue-600 font-mono italic">
                    <span>Lighter</span>
                    <span>Darker</span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase">Curve Tolerance</label>
                    <span className="text-[9px] font-mono text-gray-500">{optTolerance}</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" value={optTolerance} onChange={(e) => setOptTolerance(parseFloat(e.target.value))} className="w-full h-1 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                  <div className="flex justify-between text-[9px] text-blue-600 font-mono italic">
                    <span>Precise</span>
                    <span>Smooth</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase">Output Scale</label>
                    <span className="text-[9px] font-mono text-gray-500">{scale}</span>
                  </div>
                  <input type="range" min="0.01" max="0.2" step="0.01" value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} className="w-full h-1 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                  <div className="flex justify-between text-[9px] text-blue-600 font-mono italic">
                    <span>Small</span>
                    <span>Large</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mt-2">
              <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-400">INFO</span>
                <Info className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <div className="p-3 text-[10px] text-gray-500 leading-tight space-y-2">
                <p>Vectorization engine translates raster lines into parametric spline equations.</p>
                <p>Dense sketches may produce high equation counts, affecting graph render performance.</p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-white border-t border-gray-200">
            <button 
              onClick={handleVectorize}
              disabled={!selectedFile || isProcessing}
              className="w-full py-2 bg-gray-900 text-white rounded text-xs font-bold uppercase tracking-widest hover:bg-black transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed">
                {isProcessing ? 'Processing...' : 'Recalculate All'}
            </button>
          </div>
        </aside>

        {/* Main Graph Area */}
        <main className="relative flex-1 bg-[#fdfdfd] overflow-hidden">
          <div 
            ref={calculatorRef} 
            id="calculator" 
            className="absolute inset-0 w-full h-full"
          />
        </main>
      </div>

      {/* Bottom Status Bar */}
      <footer className="h-6 bg-gray-900 text-[10px] text-gray-400 flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Desmos Engine</span>
          <span>Precision: High-P (64-bit)</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{isProcessing ? 'Extracting Equations...' : 'Ready'}</span>
          <span className="text-gray-500 uppercase font-bold">Build v1.0.42-Stable</span>
        </div>
      </footer>
    </div>
  );
}
