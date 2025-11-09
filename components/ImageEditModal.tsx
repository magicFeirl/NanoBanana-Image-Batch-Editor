
import React, { useState, useEffect } from 'react';
import { ImageFile, EditHistory } from '../types';
import { ExclamationTriangleIcon, SparklesIcon, ReplaceIcon, DownloadIcon, TagIcon } from './Icons';
import { enhancePrompt, getTagsFromImage } from '../services/geminiService';
import { promptSuggestionsEditing, PromptSuggestion } from '../prompts';

interface ImageEditModalProps {
  image: ImageFile | null;
  source: 'original' | 'edited';
  onClose: () => void;
  onProcess: (imageId: string, prompt: string, sourceDataUrl: string) => Promise<void>;
  onSavePrompt: (imageId: string, prompt: string) => void;
  isProcessing: boolean;
  globalPrompt: string;
  error?: string | null;
  taggingSystemPrompt: string;
  onMarkAsAutoTagged: (imageId: string) => void;
}

const ImageEditModal: React.FC<ImageEditModalProps> = ({ image, source, onClose, onProcess, onSavePrompt, isProcessing, globalPrompt, error, taggingSystemPrompt, onMarkAsAutoTagged }) => {
  const [activeImageUrl, setActiveImageUrl] = useState('');
  const [activePrompt, setActivePrompt] = useState('');
  const [activeTimestamp, setActiveTimestamp] = useState<number | null>(null);
  const [originalPrompt, setOriginalPrompt] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isTagging, setIsTagging] = useState(false);
  const [promptHelperError, setPromptHelperError] = useState<string | null>(null);
  const [autoTagBeforeSingleProcess, setAutoTagBeforeSingleProcess] = useState(true);


  useEffect(() => {
    if (image) {
      const sourceImageUrl = source === 'original' 
        ? image.originalDataUrl 
        : (image.editedDataUrl || image.originalDataUrl);
      
      setActiveImageUrl(sourceImageUrl);
      setActivePrompt(image.prompt || globalPrompt || '');
      setOriginalPrompt(null);
      setIsEnhancing(false);
      setIsTagging(false);
      setPromptHelperError(null);
      setAutoTagBeforeSingleProcess(!image.hasBeenAutoTaggedInModal);

      if (sourceImageUrl === image.originalDataUrl) {
        setActiveTimestamp(0);
      } else {
        const matchingHistoryItem = image.history?.find(h => h.dataUrl === sourceImageUrl);
        setActiveTimestamp(matchingHistoryItem ? matchingHistoryItem.timestamp : null);
      }
    }
  }, [image, source, globalPrompt]);

  if (!image) return null;

  const generateTagsForCurrentImage = async (): Promise<string | null> => {
    if (!image) return null;
    setIsTagging(true);
    setPromptHelperError(null);
    try {
        const base64Data = activeImageUrl.split(',')[1];
        if (!base64Data) throw new Error('Invalid image data URL.');

        const tagsResponse = await getTagsFromImage(
            base64Data,
            image.file.type,
            taggingSystemPrompt
        );
        onMarkAsAutoTagged(image.id); // Mark as tagged on successful API call
        const tagsPart = tagsResponse.split('.')[0];
        const cleanedTags = tagsPart.replace(/\.$/, '').trim();
        const allTags = cleanedTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        const uniqueTags = [...new Set(allTags)].join(', ');
        return uniqueTags;
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to generate tags.";
        setPromptHelperError(errorMessage);
        return null;
    } finally {
        setIsTagging(false);
    }
  };

  const handleAutoTagButtonClick = async () => {
    if (isTagging || isEnhancing) return;
    const generatedTags = await generateTagsForCurrentImage();
    if (generatedTags) {
        setActivePrompt(prev => {
            const existingTags = new Set(prev.trim().split(/, ?/g).filter(Boolean));
            const newTags = generatedTags.split(/, ?/g).filter(Boolean);
            newTags.forEach(t => existingTags.add(t));
            return Array.from(existingTags).join(', ');
        });
    }
  };

  const handleProcess = async () => {
    let finalPrompt = activePrompt;
    if (autoTagBeforeSingleProcess) {
        const generatedTags = await generateTagsForCurrentImage();
        if (generatedTags) {
            const existingTags = new Set(activePrompt.trim().split(/, ?/g).filter(Boolean));
            const newTags = generatedTags.split(/, ?/g).filter(Boolean);
            newTags.forEach(t => existingTags.add(t));
            finalPrompt = Array.from(existingTags).join(', ');
            setActivePrompt(finalPrompt); // Update UI before processing
        } else {
            console.error("Auto-tagging failed, processing with existing prompt.");
            // Error message is shown via promptHelperError state
        }
    }
    await onProcess(image.id, finalPrompt, activeImageUrl);
  };
  
  const handleSave = () => {
    if (image) {
      onSavePrompt(image.id, activePrompt);
      onClose();
    }
  };
  
  const handleEnhancePrompt = async () => {
    if (!activePrompt.trim() || isEnhancing || isTagging) return;

    const promptToEnhance = activePrompt;
    setIsEnhancing(true);
    setPromptHelperError(null);
    setOriginalPrompt(promptToEnhance);
    try {
      const enhanced = await enhancePrompt(promptToEnhance);
      setActivePrompt(enhanced);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to enhance prompt.";
      setPromptHelperError(errorMessage);
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
      setPromptHelperError(null);
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
  };

  const handleSuggestionSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;
    if (!selectedValue) return;

    const selectedSuggestion = promptSuggestionsEditing.find(p => p.value === selectedValue);

    if (selectedSuggestion) {
        const newPrompt = selectedSuggestion.value;
        
        setActivePrompt(prevPrompt => {
            if (!prevPrompt.trim()) {
                return newPrompt;
            }
            const existingTags = prevPrompt.split(',').map(tag => tag.trim()).filter(Boolean);
            const newTags = newPrompt.split(',').map(tag => tag.trim()).filter(Boolean);
            const combinedTags = new Set([...existingTags, ...newTags]);
            return Array.from(combinedTags).join(', ');
        });
    }
    e.target.value = ''; // Reset select
  };

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
                  disabled={isTagging}
                  className={`w-full text-left rounded-lg overflow-hidden border-2 transition-colors ${activeTimestamp === item.timestamp ? 'border-brand-blue' : 'border-transparent hover:border-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-transparent`}
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
              <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                <label htmlFor="image-prompt" className="block text-lg font-semibold text-gray-200">
                  Editing Prompt
                </label>
                <div className="flex items-center space-x-2">
                    <select
                        id="modal-prompt-select-editing"
                        value=""
                        onChange={handleSuggestionSelect}
                        disabled={isProcessing || isTagging}
                        className="p-1.5 text-sm bg-gray-900 border-2 border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors disabled:opacity-50"
                        aria-label="Select a preset editing prompt to append"
                    >
                        <option value="" disabled>Append Preset...</option>
                        {promptSuggestionsEditing.map((p) => (
                            <option key={p.label} value={p.value}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                    <div className="flex items-center p-1 rounded-md bg-gray-900/50 border border-gray-700">
                        <button
                          onClick={handleAutoTagButtonClick}
                          disabled={isProcessing || isTagging || isEnhancing}
                          className="flex items-center px-2 py-0.5 text-sm font-semibold text-white bg-gradient-to-r from-teal-500 to-cyan-600 rounded-md hover:from-teal-600 hover:to-cyan-700 transition-all transform hover:scale-105 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed disabled:scale-100"
                          title="Generate tags from the current image and prepend them to the prompt"
                        >
                          <TagIcon className={`w-4 h-4 mr-2 ${isTagging ? 'animate-pulse' : ''}`} />
                          {isTagging ? 'Tagging...' : 'Auto Tag'}
                        </button>
                        <div className="h-5 w-px bg-gray-600 mx-2"></div>
                        <div className="flex items-center pr-1">
                              <input
                                  type="checkbox"
                                  id="autoTagBeforeSingleProcess"
                                  checked={autoTagBeforeSingleProcess}
                                  onChange={(e) => setAutoTagBeforeSingleProcess(e.target.checked)}
                                  disabled={isProcessing || isTagging || isEnhancing}
                                  className="h-4 w-4 rounded border-gray-500 bg-gray-800 text-teal-500 focus:ring-teal-500"
                              />
                              <label htmlFor="autoTagBeforeSingleProcess" className="ml-2 block text-xs text-gray-400 select-none cursor-pointer whitespace-nowrap">
                                  Auto-tag on Process
                              </label>
                          </div>
                    </div>
                    {originalPrompt === null ? (
                      <button
                        onClick={handleEnhancePrompt}
                        disabled={isProcessing || isEnhancing || isTagging || !activePrompt.trim()}
                        className="flex items-center px-3 py-1 text-sm font-semibold text-white bg-gradient-to-r from-brand-purple to-purple-700 rounded-md hover:from-purple-600 hover:to-purple-800 transition-all transform hover:scale-105 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed disabled:scale-100"
                        title="Use AI to improve and expand your prompt"
                      >
                        <SparklesIcon className={`w-4 h-4 mr-2 ${isEnhancing ? 'animate-pulse' : ''}`} />
                        {isEnhancing ? 'Enhancing...' : 'Enhance Prompt'}
                      </button>
                    ) : (
                      <button
                        onClick={handleRevertPrompt}
                        disabled={isProcessing || isEnhancing || isTagging}
                        className="flex items-center px-3 py-1 text-sm font-semibold text-gray-200 bg-gray-600 rounded-md hover:bg-gray-500 transition-colors disabled:opacity-50"
                        title="Revert to your original prompt"
                      >
                        <ReplaceIcon className="w-4 h-4 mr-2" />
                        Revert
                      </button>
                    )}
                </div>
              </div>
              <textarea
                id="image-prompt"
                value={activePrompt}
                onChange={(e) => {
                  setActivePrompt(e.target.value);
                  if (originalPrompt !== null) {
                    setOriginalPrompt(null);
                    setPromptHelperError(null);
                  }
                }}
                placeholder="e.g., make the background a surreal landscape"
                disabled={isProcessing || isTagging}
                rows={4}
                className="w-full p-3 text-base bg-gray-900 border-2 border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors disabled:opacity-50"
              />
              {promptHelperError && (
                  <p className="text-red-400 text-xs mt-1 px-1">{promptHelperError}</p>
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
            disabled={isProcessing || isTagging}
            className="px-6 py-2 text-base font-semibold text-white bg-brand-purple rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            Save Prompt & Close
          </button>
          <button
            onClick={handleProcess}
            disabled={isProcessing || isTagging || !activePrompt.trim()}
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