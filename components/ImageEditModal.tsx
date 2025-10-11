
import React, { useState, useEffect } from 'react';
import { ImageFile, EditHistory } from '../types';
import { ExclamationTriangleIcon, SparklesIcon, ReplaceIcon, DownloadIcon } from './Icons';
import { enhancePrompt } from '../services/geminiService';

interface ImageEditModalProps {
  image: ImageFile | null;
  source: 'original' | 'edited';
  onClose: () => void;
  onProcess: (imageId: string, prompt: string, sourceDataUrl: string) => Promise<void>;
  onSavePrompt: (imageId: string, prompt: string) => void;
  isProcessing: boolean;
  globalPrompt: string;
  error?: string | null;
}

const ImageEditModal: React.FC<ImageEditModalProps> = ({ image, source, onClose, onProcess, onSavePrompt, isProcessing, globalPrompt, error }) => {
  const [activeImageUrl, setActiveImageUrl] = useState('');
  const [activePrompt, setActivePrompt] = useState('');
  const [activeTimestamp, setActiveTimestamp] = useState<number | null>(null);
  const [originalPrompt, setOriginalPrompt] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);


  useEffect(() => {
    if (image) {
      const sourceImageUrl = source === 'original' 
        ? image.originalDataUrl 
        : (image.editedDataUrl || image.originalDataUrl);
      
      setActiveImageUrl(sourceImageUrl);
      setActivePrompt(image.prompt || globalPrompt || '');
      setOriginalPrompt(null);
      setIsEnhancing(false);
      setEnhanceError(null);

      if (sourceImageUrl === image.originalDataUrl) {
        setActiveTimestamp(0);
      } else {
        const matchingHistoryItem = image.history?.find(h => h.dataUrl === sourceImageUrl);
        setActiveTimestamp(matchingHistoryItem ? matchingHistoryItem.timestamp : null);
      }
    }
  }, [image, source, globalPrompt]);

  if (!image) return null;

  const handleProcess = () => {
    onProcess(image.id, activePrompt, activeImageUrl);
  };
  
  const handleSave = () => {
    if (image) {
      onSavePrompt(image.id, activePrompt);
      onClose();
    }
  };
  
  const handleEnhancePrompt = async () => {
    if (!activePrompt.trim() || isEnhancing) return;

    const promptToEnhance = activePrompt;
    setIsEnhancing(true);
    setEnhanceError(null);
    setOriginalPrompt(promptToEnhance);
    try {
      const enhanced = await enhancePrompt(promptToEnhance);
      setActivePrompt(enhanced);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to enhance prompt.";
      setEnhanceError(errorMessage);
      setActivePrompt(promptToEnhance);
      setOriginalPrompt(null);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleRevertPrompt = () => {
    if (originalPrompt !== null) {
      setActivePrompt(originalPrompt);
      setOriginalPrompt(null);
      setEnhanceError(null);
    }
  };
  
  const handleDownload = () => {
    if (!image || !activeImageUrl) return;

    const link = document.createElement('a');
    link.href = activeImageUrl;

    const originalName = image.file.name.replace(/\.[^/.]+$/, "");
    const mimeType = activeImageUrl.substring(activeImageUrl.indexOf(':') + 1, activeImageUrl.indexOf(';'));
    const extension = mimeType.split('/')[1] || 'png';

    let suffix: string;
    if (activeTimestamp === 0) {
      suffix = 'original';
    } else if (activeTimestamp) {
      suffix = `edited-${activeTimestamp}`;
    } else {
      suffix = 'edited-current';
    }

    link.download = `${originalName}-${suffix}.${extension}`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const historyItems: (EditHistory | { dataUrl: string; prompt: string; timestamp: number; })[] = [
    { dataUrl: image.originalDataUrl, prompt: '(Original Image)', timestamp: 0 },
    ...(image.history || [])
  ];

  const handleHistoryClick = (item: EditHistory | { dataUrl: string; prompt: string; timestamp: number; }) => {
    setActiveImageUrl(item.dataUrl);
    setActivePrompt(item.timestamp === 0 ? (image.prompt || globalPrompt || '') : item.prompt);
    setActiveTimestamp(item.timestamp);
  }

  return (
    <div 
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col border border-gray-600">
        <header className="p-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-xl font-bold text-white">Edit Image</h2>
          <p className="text-sm text-gray-400 truncate" title={image.file.name}>{image.file.name}</p>
        </header>
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <aside className="w-48 bg-gray-900/50 p-3 flex flex-col flex-shrink-0 border-r border-gray-700">
            <h3 className="text-lg font-semibold text-gray-200 mb-3 px-1">History</h3>
            <div className="overflow-y-auto flex-grow space-y-2 pr-1">
              {historyItems.map((item) => (
                <button
                  key={item.timestamp}
                  onClick={() => handleHistoryClick(item)}
                  className={`w-full text-left rounded-lg overflow-hidden border-2 transition-colors ${activeTimestamp === item.timestamp ? 'border-brand-blue' : 'border-transparent hover:border-gray-600'}`}
                  title={item.prompt}
                >
                  <img src={item.dataUrl} alt={`History from ${new Date(item.timestamp).toLocaleString()}`} className="w-full aspect-square object-cover bg-gray-900" />
                  <p className="text-xs text-gray-400 p-2 truncate bg-gray-800">{item.prompt}</p>
                </button>
              ))}
            </div>
          </aside>
          
          {/* Main Content */}
          <main className="flex-1 flex flex-col p-6 min-w-0">
            <div className="w-full flex-1 bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center min-h-0">
              <img src={activeImageUrl} alt="Editing source" className="max-w-full max-h-full object-contain" />
            </div>
            <div className="mt-6 flex-shrink-0 flex flex-col">
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="image-prompt" className="block text-lg font-semibold text-gray-200">
                  Editing Prompt
                </label>
                {originalPrompt === null ? (
                  <button
                    onClick={handleEnhancePrompt}
                    disabled={isProcessing || isEnhancing || !activePrompt.trim()}
                    className="flex items-center px-3 py-1 text-sm font-semibold text-white bg-gradient-to-r from-brand-purple to-purple-700 rounded-md hover:from-purple-600 hover:to-purple-800 transition-all transform hover:scale-105 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed disabled:scale-100"
                    title="Use AI to improve and expand your prompt"
                  >
                    <SparklesIcon className={`w-4 h-4 mr-2 ${isEnhancing ? 'animate-pulse' : ''}`} />
                    {isEnhancing ? 'Enhancing...' : 'Enhance Prompt'}
                  </button>
                ) : (
                  <button
                    onClick={handleRevertPrompt}
                    disabled={isProcessing || isEnhancing}
                    className="flex items-center px-3 py-1 text-sm font-semibold text-gray-200 bg-gray-600 rounded-md hover:bg-gray-500 transition-colors disabled:opacity-50"
                    title="Revert to your original prompt"
                  >
                    <ReplaceIcon className="w-4 h-4 mr-2" />
                    Revert
                  </button>
                )}
              </div>
              <textarea
                id="image-prompt"
                value={activePrompt}
                onChange={(e) => {
                  setActivePrompt(e.target.value);
                  if (originalPrompt !== null) {
                    setOriginalPrompt(null);
                    setEnhanceError(null);
                  }
                }}
                placeholder="e.g., make the background a surreal landscape"
                disabled={isProcessing}
                rows={4}
                className="w-full p-3 text-base bg-gray-900 border-2 border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors disabled:opacity-50"
              />
              {enhanceError && (
                  <p className="text-red-400 text-xs mt-1 px-1">{enhanceError}</p>
              )}
            </div>
          </main>
        </div>
        <footer className="p-4 flex justify-end items-center space-x-4 border-t border-gray-700 flex-shrink-0">
          {error && (
            <div className="flex items-start text-red-400 text-sm flex-grow mr-4">
              <ExclamationTriangleIcon className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Error:</p> 
                <p>{error}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleDownload}
            className="px-6 py-2 text-base font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors flex items-center"
            title="Download the currently displayed image"
          >
            <DownloadIcon className="w-5 h-5 mr-2" />
            Download
          </button>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-6 py-2 text-base font-semibold text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isProcessing}
            className="px-6 py-2 text-base font-semibold text-white bg-brand-purple rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            Save Prompt & Close
          </button>
          <button
            onClick={handleProcess}
            disabled={isProcessing || !activePrompt.trim()}
            className="px-6 py-2 text-base font-semibold text-white bg-brand-blue rounded-md hover:bg-blue-500 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center"
          >
            <SparklesIcon className={`w-5 h-5 mr-2 ${isProcessing ? 'animate-pulse' : ''}`} />
            {isProcessing ? 'Processing...' : 'Process this Image'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ImageEditModal;
