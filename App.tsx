
import React, { useState, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import ImageUploader from './components/ImageUploader';
import PromptInput from './components/PromptInput';
import ImageList from './components/ImageList';
import ImageEditModal from './components/ImageEditModal';
import Lightbox from './components/Lightbox';
import { ImageFile, ImageStatus, EditHistory } from './types';
import { editImage, RateLimitError, getTagsFromImage } from './services/geminiService';
import { SparklesIcon, PlayIcon, DownloadIcon, RetryIcon, ClockIcon, ShuffleIcon, TrashIcon, XCircleIcon, RequeueIcon, TagIcon, ChevronDownIcon } from './components/Icons';
import { promptSuggestions, promptSuggestionsCloseUp, promptSuggestionsPose, promptSuggestionsExpression, promptSuggestionsBodyParts, PromptSuggestion, promptSuggestionsFullBody, promptSuggestionsEditing, promptSuggestionsTextToVideo } from './prompts';

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      if (window.parent && window.parent.localStorage) {
        return window.parent.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn("Could not access parent localStorage, falling back to iframe's localStorage.", e);
    }
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      console.error("localStorage is not available.", e);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (window.parent && window.parent.localStorage) {
        window.parent.localStorage.setItem(key, value);
        return;
      }
    } catch (e) {
       console.warn("Could not access parent localStorage, falling back to iframe's localStorage.", e);
    }
     try {
        window.localStorage.setItem(key, value);
    } catch (e) {
        console.error("localStorage is not available.", e);
    }
  },
};

const taggingPresets = [
  { 
    key: 'general', 
    label: 'General', 
    prompt: "You are an expert image analyst. Your task is to generate a concise, comma-separated list of tags describing the key elements of the image, including subject, style, colors, and composition. Focus on keywords useful for AI image generation. Keep it brief." 
  },
  { 
    key: 'character', 
    label: 'Character (No Features)', 
    prompt: "You are an expert image analyst specializing in character art. Your task is to generate a concise, comma-separated list of tags describing everything EXCEPT the character's specific features like hair color, eye color, or clothing. Focus on tags for pose, expression, composition, background, and overall art style. Keep it brief and useful for AI image generation."
  },
  { 
    key: 'character_only', 
    label: 'Character Only (Features)', 
    prompt: "You are a specialized image tagger. Your only task is to generate comma-separated tags for the character's eye color, hair color, and clothing from the image provided. Do not include any other information. Focus exclusively on these three categories. Output only the tags."
  },
];

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const compressImageToPNG = (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (err) => reject(err);
        img.src = dataUrl;
    });
};

const App: React.FC = () => {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState<string>('masterpiece, best quality, keep original art style, keep original character design, keep original features, keep original clothing, ');
  const [promptHistory, setPromptHistory] = useState<string[]>(() => {
    try {
      const savedHistory = safeLocalStorage.getItem('promptHistory');
      return savedHistory ? JSON.parse(savedHistory) : [];
    } catch (error) {
      console.error("Failed to parse prompt history from localStorage", error);
      return [];
    }
  });
  const [pinnedPrompts, setPinnedPrompts] = useState<string[]>(() => {
    try {
      const savedPins = safeLocalStorage.getItem('pinnedPrompts');
      return savedPins ? JSON.parse(savedPins) : [];
    } catch (error) {
      console.error("Failed to parse pinned prompts from localStorage", error);
      return [];
    }
  });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<number>(0);
  const [throttleDelay, setThrottleDelay] = useState<number>(0);
  const [isCoolingDown, setIsCoolingDown] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [editingImage, setEditingImage] = useState<ImageFile | null>(null);
  const [editSource, setEditSource] = useState<'original' | 'edited'>('edited');
  const [isSingleProcessing, setIsSingleProcessing] = useState<boolean>(false);
  const [singleProcessingError, setSingleProcessingError] = useState<string | null>(null);
  const [zipFilename, setZipFilename] = useState<string>('nanobanana-edits');
  const [combinePrompts, setCombinePrompts] = useState<boolean>(true);
  const [randomizeSources, setRandomizeSources] = useState({
    angle: false,
    closeup: false,
    pose: true,
    expression: true,
    bodyParts: false,
    fullBody: false,
    textToVideo: false
  });
  const [totalInBatch, setTotalInBatch] = useState<number>(0);
  const [repeatCount, setRepeatCount] = useState<number>(1);
  const [randomizeForEachEdit, setRandomizeForEachEdit] = useState<boolean>(true);
  const [processedTodayCount, setProcessedTodayCount] = useState<number>(0);
  const [taggingSystemPrompt, setTaggingSystemPrompt] = useState<string>(taggingPresets[2].prompt);
  const [taggingPresetKey, setTaggingPresetKey] = useState<string>('character_only');
  const [isTagging, setIsTagging] = useState<boolean>(false);
  const [autoTagBeforeProcessing, setAutoTagBeforeProcessing] = useState<boolean>(true);
  const [isTaggingSectionVisible, setIsTaggingSectionVisible] = useState<boolean>(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string } | null>(null);
  const [enableCompression, setEnableCompression] = useState<boolean>(false);
  const [useNaturalLanguage, setUseNaturalLanguage] = useState<boolean>(false);

  const getCounterStyles = (count: number): { containerClasses: string; numberClasses: string } => {
    let containerClasses = "mt-4 text-sm font-medium tracking-wide transition-all duration-300 inline-block";
    let numberClasses = "font-bold text-base";

    if (count >= 100) {
        containerClasses += " p-2 rounded-lg bg-red-900/50 border border-red-700 text-red-300 scale-105";
        numberClasses += " text-red-200 text-lg animate-pulse";
    } else if (count >= 70) {
        containerClasses += " p-2 rounded-lg bg-orange-800/50 border border-orange-700 text-orange-300 scale-105";
        numberClasses += " text-orange-200 text-lg animate-pulse";
    } else if (count >= 40) {
        containerClasses += " text-yellow-400";
        numberClasses += " text-yellow-300";
    } else {
        containerClasses += " text-gray-500";
        numberClasses += " text-gray-300";
    }
    return { containerClasses, numberClasses };
  };

  useEffect(() => {
    const getPacificToday = () => {
      return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    };

    try {
      const storedStatsRaw = safeLocalStorage.getItem('processedImageStats');
      const todayStr = getPacificToday();

      if (storedStatsRaw) {
        const storedStats = JSON.parse(storedStatsRaw);
        if (storedStats.date === todayStr) {
          setProcessedTodayCount(storedStats.count);
        } else {
          safeLocalStorage.setItem('processedImageStats', JSON.stringify({ count: 0, date: todayStr }));
          setProcessedTodayCount(0);
        }
      } else {
        safeLocalStorage.setItem('processedImageStats', JSON.stringify({ count: 0, date: todayStr }));
      }
    } catch (error) {
      console.error("Failed to manage processed stats in localStorage", error);
    }
  }, []);

  useEffect(() => {
    try {
      safeLocalStorage.setItem('promptHistory', JSON.stringify(promptHistory));
    } catch (error) {
      console.error("Failed to save prompt history to localStorage", error);
    }
  }, [promptHistory]);

  useEffect(() => {
    try {
      safeLocalStorage.setItem('pinnedPrompts', JSON.stringify(pinnedPrompts));
    } catch (error) {
      console.error("Failed to save pinned prompts to localStorage", error);
    }
  }, [pinnedPrompts]);

  useEffect(() => {
    if (!isProcessing) {
        setTotalInBatch(0);
    }
  }, [isProcessing]);

  const incrementProcessedTodayCount = useCallback(() => {
    const getPacificToday = () => {
      return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    };
    const todayStr = getPacificToday();

    try {
        const storedStatsRaw = safeLocalStorage.getItem('processedImageStats');
        let currentCountForToday = 0;

        if (storedStatsRaw) {
            const storedStats = JSON.parse(storedStatsRaw);
            if (storedStats.date === todayStr) {
                currentCountForToday = storedStats.count;
            }
        }

        const newCount = currentCountForToday + 1;
        safeLocalStorage.setItem('processedImageStats', JSON.stringify({ count: newCount, date: todayStr }));
        setProcessedTodayCount(newCount);
    } catch (error) {
        console.error("Failed to update processed count in localStorage", error);
        // Fallback: update state anyway to reflect the processed image in the UI at least for the session
        setProcessedTodayCount(prev => prev + 1);
    }
  }, []);


  const handleImagesSelected = async (files: FileList) => {
    const n = files.length;
    if (n > 0) {
      const newRepeatCount = Math.max(1, Math.ceil(40 / n));
      setRepeatCount(newRepeatCount);
    }
    
    const newImageFiles: ImageFile[] = await Promise.all(
      Array.from(files).map(async (file) => {
        const dataUrl = await fileToDataUrl(file);
        return {
          id: `${file.name}-${Date.now()}`,
          file,
          originalDataUrl: dataUrl,
          status: ImageStatus.QUEUED,
        };
      })
    );
    setImages((prevImages) => [...prevImages, ...newImageFiles]);
    if (isProcessing) {
      setTotalInBatch(prev => prev + newImageFiles.length);
    }
  };

  const startProcessing = useCallback(async () => {
    const hasPrompt = !!currentPrompt.trim();
    const hasIndividualPrompts = images.some(img => img.status === ImageStatus.QUEUED && !!img.prompt);
    const canRandomize = Object.values(randomizeSources).some(v => v);
    
    if (!hasPrompt && !hasIndividualPrompts && !(randomizeForEachEdit && canRandomize) && !autoTagBeforeProcessing) {
      alert('Please enter an editing prompt or configure and enable prompt randomization/auto-tagging for the queue.');
      return;
    }

    if (isProcessing) {
        alert('A batch is already processing.');
        return;
    }

    let queuedImages = images.filter(img => img.status === ImageStatus.QUEUED);
    if (queuedImages.length === 0) {
        alert('No images in queue to process.');
        return;
    }

    if (autoTagBeforeProcessing) {
        setStatusMessage('Auto-tagging queued images...');
        const tagPromises = queuedImages.map(
            async (imageToTag: ImageFile): Promise<{ id: string; prompt: string; error?: string }> => {
                if (imageToTag.prompt?.trim()) {
                    return { id: imageToTag.id, prompt: imageToTag.prompt, error: undefined };
                }
                try {
                    const base64Data = imageToTag.originalDataUrl.split(',')[1];
                    if (!base64Data) throw new Error('Invalid image data URL.');
                    const tags = await getTagsFromImage(base64Data, imageToTag.file.type, taggingSystemPrompt);
                    const cleanedTags = tags.replace(/\.$/, '').trim();
                    const allTags = cleanedTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                    const uniqueTags = [...new Set(allTags)];
                    return { id: imageToTag.id, prompt: uniqueTags.join(', '), error: undefined };
                } catch (error) {
                    console.error(`Failed to auto-tag image ${imageToTag.file.name}:`, error);
                    return { id: imageToTag.id, prompt: imageToTag.prompt || '', error: `Tagging failed: ${error instanceof Error ? error.message : 'Unknown'}` };
                }
            }
        );

        const results: { id: string; prompt: string; error?: string }[] = await Promise.all(tagPromises);
        const resultsMap = new Map(results.map(r => [r.id, { prompt: r.prompt, error: r.error }]));

        queuedImages = queuedImages.map(img => {
            if (resultsMap.has(img.id)) {
                const result = resultsMap.get(img.id)!;
                return { ...img, prompt: result.prompt, error: result.error || img.error };
            }
            return img;
        });
    }


    let allQueuedImages: ImageFile[];
    const shouldRandomizeOnProcess = randomizeForEachEdit && canRandomize;
    
    const activeSources: { name: keyof typeof randomizeSources, prompts: PromptSuggestion[] }[] = [];
    if (randomizeSources.angle) activeSources.push({ name: 'angle', prompts: promptSuggestions });
    if (randomizeSources.closeup) activeSources.push({ name: 'closeup', prompts: promptSuggestionsCloseUp });
    if (randomizeSources.pose) activeSources.push({ name: 'pose', prompts: promptSuggestionsPose });
    if (randomizeSources.expression) activeSources.push({ name: 'expression', prompts: promptSuggestionsExpression });
    if (randomizeSources.bodyParts) activeSources.push({ name: 'bodyParts', prompts: promptSuggestionsBodyParts });
    if (randomizeSources.fullBody) activeSources.push({ name: 'fullBody', prompts: promptSuggestionsFullBody });
    if (randomizeSources.textToVideo) activeSources.push({ name: 'textToVideo', prompts: promptSuggestionsTextToVideo });

    if (shouldRandomizeOnProcess) {
        if (repeatCount > 1) {
            allQueuedImages = queuedImages.flatMap(image => {
                const promptsForImage: string[] = [];
                
                if (activeSources.length > 0) {
                    const randomizedSelections: Partial<Record<keyof typeof randomizeSources, PromptSuggestion[]>> = {};
                    activeSources.forEach(source => {
                        let selections: PromptSuggestion[] = [];
                        while (selections.length < repeatCount) {
                            const shuffledPrompts = [...source.prompts].sort(() => 0.5 - Math.random());
                            selections.push(...shuffledPrompts);
                        }
                        randomizedSelections[source.name] = selections.slice(0, repeatCount);
                    });

                    for (let i = 0; i < repeatCount; i++) {
                        const promptParts = activeSources.map(source => {
                            const item = randomizedSelections[source.name]![i];
                            return useNaturalLanguage ? item.natural : item.value;
                        });

                        if (useNaturalLanguage) {
                            const basePrompt = currentPrompt.trim();
                            const imagePrompt = (image.prompt || '').trim();
                            const randomPrompt = promptParts.join('. ');
                            promptsForImage.push([basePrompt, imagePrompt, randomPrompt].filter(Boolean).join('. '));
                        } else {
                            const basePromptTags = currentPrompt.trim().split(',').map(t => t.trim()).filter(Boolean);
                            const imagePromptTags = (image.prompt || '').trim().split(',').map(t => t.trim()).filter(Boolean);
                            const randomTags = promptParts.join(',').split(',').map(t => t.trim()).filter(Boolean);
                            const allTags = new Set([...basePromptTags, ...imagePromptTags, ...randomTags]);
                            promptsForImage.push(Array.from(allTags).join(', '));
                        }
                    }
                } else {
                    for (let i = 0; i < repeatCount; i++) {
                       if (useNaturalLanguage) {
                            const basePrompt = currentPrompt.trim();
                            const imagePrompt = (image.prompt || '').trim();
                            promptsForImage.push([basePrompt, imagePrompt].filter(Boolean).join('. '));
                       } else {
                           const basePromptTags = currentPrompt.trim().split(',').map(t => t.trim()).filter(Boolean);
                           const imagePromptTags = (image.prompt || '').trim().split(',').map(t => t.trim()).filter(Boolean);
                           const allTags = new Set([...basePromptTags, ...imagePromptTags]);
                           promptsForImage.push(Array.from(allTags).join(', '));
                       }
                    }
                }
                
                return Array.from({ length: repeatCount }, (_, i) => ({
                    ...image,
                    id: `${image.id}-repeat-${i}-${Date.now()}-${Math.random()}`,
                    prompt: promptsForImage[i],
                }));
            });
        } else { // Handles repeatCount = 1 with randomization
            allQueuedImages = queuedImages.map(image => {
                let finalPrompt: string;

                if (useNaturalLanguage) {
                    const basePrompt = currentPrompt.trim();
                    const imagePrompt = (image.prompt || '').trim();
                    let randomPrompt = '';
                    if (activeSources.length > 0) {
                        const randomItems = activeSources.map(source => source.prompts[Math.floor(Math.random() * source.prompts.length)].natural);
                        randomPrompt = randomItems.join('. ');
                    }
                    finalPrompt = [basePrompt, imagePrompt, randomPrompt].filter(Boolean).join('. ');
                } else {
                    const basePromptTags = currentPrompt.trim().split(',').map(t => t.trim()).filter(Boolean);
                    const imagePromptTags = (image.prompt || '').trim().split(',').map(t => t.trim()).filter(Boolean);
                    let randomTags: string[] = [];
                    if (activeSources.length > 0) {
                        const randomPrompts = activeSources.map(source => source.prompts[Math.floor(Math.random() * source.prompts.length)].value);
                        randomTags = randomPrompts.join(',').split(',').map(t => t.trim()).filter(Boolean);
                    }
                    const allTags = new Set([...basePromptTags, ...imagePromptTags, ...randomTags]);
                    finalPrompt = Array.from(allTags).join(', ');
                }
                
                return { ...image, prompt: finalPrompt };
            });
        }
    } else {
        const allQueuedImagesWithPrompts = queuedImages.map(image => {
            let finalPrompt: string;
            if (useNaturalLanguage) {
                const basePrompt = currentPrompt.trim();
                const imagePrompt = (image.prompt || '').trim();
                finalPrompt = [basePrompt, imagePrompt].filter(Boolean).join('. ');
            } else {
                const basePromptTags = currentPrompt.trim().split(',').map(t => t.trim()).filter(Boolean);
                const imagePromptTags = (image.prompt || '').trim().split(',').map(t => t.trim()).filter(Boolean);
                const allTags = new Set([...basePromptTags, ...imagePromptTags]);
                finalPrompt = Array.from(allTags).join(', ');
            }
            return {
                ...image,
                prompt: finalPrompt,
            };
        });

        allQueuedImages = [...allQueuedImagesWithPrompts];
        if (repeatCount > 1) {
            const newCopies = allQueuedImagesWithPrompts.flatMap(image =>
                Array.from({ length: repeatCount - 1 }, (_, i) => ({
                    ...image,
                    id: `${image.id}-repeat-${i + 1}-${Date.now()}-${Math.random()}`,
                }))
            );
            allQueuedImages.push(...newCopies);
        }
    }
    
    setIsProcessing(true);
    setImages(prev => [
        ...prev.filter(img => img.status !== ImageStatus.QUEUED),
        ...allQueuedImages
    ]);
    
    setTotalInBatch(allQueuedImages.length);
    setStatusMessage('');
    if (hasPrompt && !promptHistory.includes(currentPrompt) && !pinnedPrompts.includes(currentPrompt)) {
      setPromptHistory(prev => [currentPrompt, ...prev.slice(0, 9)]);
    }

  }, [currentPrompt, images, isProcessing, promptHistory, pinnedPrompts, repeatCount, randomizeForEachEdit, randomizeSources, autoTagBeforeProcessing, taggingSystemPrompt, useNaturalLanguage]);

  useEffect(() => {
    if (!isProcessing || isCoolingDown) {
      return;
    }
    
    if (images.some(img => img.status === ImageStatus.PROCESSING)) {
      return;
    }

    const nextImage = images.find((img) => img.status === ImageStatus.QUEUED);

    if (!nextImage) {
      const imagesToAutoRetry = images.filter(img => img.status === ImageStatus.ERROR && !img.retried);
      
      if (imagesToAutoRetry.length > 0) {
        setStatusMessage(`Batch complete. Automatically retrying ${imagesToAutoRetry.length} failed image(s)...`);
        
        setImages(prevImages => 
          prevImages.map(img => {
            if (imagesToAutoRetry.some(retryImg => retryImg.id === img.id)) {
              return { ...img, status: ImageStatus.QUEUED, error: undefined, retried: true };
            }
            return img;
          })
        );
      } else {
        setIsProcessing(false);
        if (statusMessage.includes('Automatically retrying')) {
          setStatusMessage('');
        }
      }
      return;
    }

    if (statusMessage.includes('Automatically retrying')) {
        setStatusMessage('');
    }
    
    const hasProcessedImages = images.some(i => i.status === ImageStatus.COMPLETED || i.status === ImageStatus.ERROR);
    const delay = hasProcessedImages ? throttleDelay * 1000 : 0;

    const timerId = setTimeout(async () => {
      const imagePrompt = nextImage.prompt || '';

      setImages((prev) =>
        prev.map((img) =>
          img.id === nextImage.id
            ? { ...img, status: ImageStatus.PROCESSING, prompt: imagePrompt, error: undefined }
            : img
        )
      );

      try {
        const base64Data = nextImage.originalDataUrl.split(',')[1];
        if (!base64Data) throw new Error('Invalid image data URL.');

        const editedData = await editImage(
          base64Data,
          nextImage.file.type,
          imagePrompt
        );

        setImages((prev) =>
          prev.map((img) =>
            img.id === nextImage.id
              ? {
                  ...img,
                  status: ImageStatus.COMPLETED,
                  editedDataUrl: `data:${nextImage.file.type};base64,${editedData}`,
                }
              : img
          )
        );
        incrementProcessedTodayCount();
      } catch (error) {
        console.error('Error processing image:', error);

        if (error instanceof RateLimitError) {
          setStatusMessage('API rate limit hit. Pausing queue for 15 seconds...');
          setIsCoolingDown(true);
          setImages(prev => prev.map(img => 
              img.id === nextImage.id 
              ? { ...img, status: ImageStatus.QUEUED, error: 'Rate limited. Will retry.' } 
              : img
            )
          );
          setTimeout(() => {
            setStatusMessage('');
            setIsCoolingDown(false);
          }, 15000);
        } else {
          setImages((prev) =>
            prev.map((img) =>
              img.id === nextImage.id
                ? {
                    ...img,
                    status: ImageStatus.ERROR,
                    error: error instanceof Error ? error.message : String(error),
                  }
                : img
            )
          );
        }
      }
    }, delay);

    return () => clearTimeout(timerId);
    
  }, [isProcessing, images, currentPrompt, throttleDelay, isCoolingDown, statusMessage, incrementProcessedTodayCount]);
  
  const handleDownloadAll = async () => {
    const completedImages = images.filter(
      (img) => img.status === ImageStatus.COMPLETED && img.editedDataUrl
    );

    if (completedImages.length === 0) {
      alert('No completed images to download.');
      return;
    }

    setIsZipping(true);
    setZipProgress(0);
    try {
      const zip = new JSZip();
      const usedFilenames = new Set<string>();

      for (const image of completedImages) {
        if (!image.editedDataUrl) continue;
        
        const timestamp = Date.now();
        const originalName = image.file.name.replace(/\.[^/.]+$/, "");
        
        let downloadUrl = image.editedDataUrl;
        let extension = image.file.name.split('.').pop() || 'png';
        
        if (enableCompression) {
            try {
                downloadUrl = await compressImageToPNG(image.editedDataUrl);
                extension = 'png';
            } catch (error) {
                console.error(`Failed to compress image ${image.file.name}, adding original to zip.`, error);
            }
        }

        let finalFilename = `${timestamp}-edited-${originalName}.${extension}`;
        let counter = 1;
        
        while (usedFilenames.has(finalFilename)) {
          finalFilename = `${timestamp}-edited-${originalName}_${counter}.${extension}`;
          counter++;
        }
        
        usedFilenames.add(finalFilename);
        const base64Data = downloadUrl.split(',')[1];
        zip.file(finalFilename, base64Data, { base64: true });
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        setZipProgress(metadata.percent);
      });

      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `${zipFilename.trim() || 'nanobanana-edits'}-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

    } catch (error) {
      console.error('Error creating zip file:', error);
      alert('Failed to create zip file. See console for details.');
    } finally {
      setIsZipping(false);
      setZipProgress(0);
    }
  };

  const handleDownloadSingle = async (imageId: string, source: 'original' | 'edited' = 'edited') => {
    const image = images.find(img => img.id === imageId);
    if (!image) {
        console.error("Image not found for download.");
        return;
    }

    const urlToDownload = source === 'original' ? image.originalDataUrl : image.editedDataUrl;
    const suffix = source === 'original' ? 'original' : 'edited';
    
    if (!urlToDownload) {
        console.error(`Source URL for '${suffix}' version not available.`);
        return;
    }

    let downloadUrl = urlToDownload;
    let extension = image.file.type.split('/')[1] || 'png';

    if (enableCompression) {
        try {
            downloadUrl = await compressImageToPNG(urlToDownload);
            extension = 'png';
        } catch (error) {
            console.error("Failed to compress image:", error);
            alert(`Failed to compress image. Downloading ${suffix} version.`);
        }
    }

    const link = document.createElement('a');
    link.href = downloadUrl;

    const originalName = image.file.name.replace(/\.[^/.]+$/, "");
    link.download = `${originalName}-${suffix}.${extension}`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRetryFailed = () => {
    if (isProcessing) return;

    const failedToRetry = images.filter(img => img.status === ImageStatus.ERROR);
    if (failedToRetry.length === 0) return;

    setTotalInBatch(failedToRetry.length);
    setStatusMessage('');

    setImages(prevImages => 
        prevImages.map(img => 
            img.status === ImageStatus.ERROR 
            ? { ...img, status: ImageStatus.QUEUED, error: undefined, retried: undefined } 
            : img
        )
    );
    setIsProcessing(true);
  };

  const handleOpenEditModal = (imageId: string, source: 'original' | 'edited' = 'edited') => {
    const imageToEdit = images.find(img => img.id === imageId);
    setEditingImage(imageToEdit || null);
    setEditSource(source);
    setSingleProcessingError(null);
  };
  
  const handleCloseEditModal = () => {
    setEditingImage(null);
    setSingleProcessingError(null);
  };

  const handleProcessSingleImage = async (imageId: string, prompt: string, sourceDataUrl: string) => {
    if (!prompt.trim()) {
      alert('Please enter a prompt for the image.');
      return;
    }

    const imageToProcess = images.find(img => img.id === imageId);
    if (!imageToProcess) {
      setSingleProcessingError("Source image not found.");
      return;
    }
    
    setIsSingleProcessing(true);
    setSingleProcessingError(null);

    if (!promptHistory.includes(prompt) && !pinnedPrompts.includes(prompt)) {
      setPromptHistory(prev => [prompt, ...prev.slice(0, 9)]);
    }

    setImages(prev => prev.map(img => 
      img.id === imageId 
      ? { ...img, status: ImageStatus.PROCESSING, prompt: prompt, error: undefined } 
      : img
    ));
    
    try {
      const base64Data = sourceDataUrl.split(',')[1];
      if (!base64Data) throw new Error('Invalid source image data URL.');

      const editedData = await editImage(base64Data, imageToProcess.file.type, prompt);

      const editedDataUrl = `data:${imageToProcess.file.type};base64,${editedData}`;
      const newHistoryEntry: EditHistory = {
        dataUrl: editedDataUrl,
        prompt: prompt,
        timestamp: Date.now(),
      };

      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId
            ? {
                ...img,
                status: ImageStatus.COMPLETED,
                editedDataUrl: editedDataUrl,
                prompt: prompt, // Update top-level prompt to last used
                history: [...(img.history || []), newHistoryEntry],
              }
            : img
        )
      );

      incrementProcessedTodayCount();
      handleCloseEditModal();

    } catch (error) {
       const errorMessage = error instanceof Error ? error.message : String(error);
       setSingleProcessingError(errorMessage);
       setImages(prev => prev.map(img => 
        img.id === imageId 
        ? { ...img, status: ImageStatus.ERROR, error: errorMessage } 
        : img
      ));
    } finally {
      setIsSingleProcessing(false);
    }
  };

  const handleSaveImagePrompt = (imageId: string, newPrompt: string) => {
    setImages(prevImages => prevImages.map(img => {
      if (img.id === imageId) {
        return {
          ...img,
          prompt: newPrompt,
        };
      }
      return img;
    }));
  };

  const handleUseEditedAsOriginal = (imageId: string) => {
    if (isProcessing) {
      setTotalInBatch(prev => prev + 1);
    }

    setImages(prevImages => prevImages.map(img => {
      if (img.id === imageId && img.editedDataUrl) {
        return {
          ...img,
          originalDataUrl: img.editedDataUrl,
          editedDataUrl: undefined,
          status: ImageStatus.QUEUED,
          prompt: undefined,
          error: undefined,
          retried: undefined,
          history: undefined,
        };
      }
      return img;
    }));
  };

  const handleUseAllEditedAsOriginal = () => {
    const completedImages = images.filter(img => img.status === ImageStatus.COMPLETED && img.editedDataUrl);
    if (completedImages.length === 0) {
      alert('No completed images to use as new originals.');
      return;
    }

    if (isProcessing) {
      setTotalInBatch(prev => prev + completedImages.length);
    }
    
    setImages(prevImages => prevImages.map(img => {
      if (img.status === ImageStatus.COMPLETED && img.editedDataUrl) {
        return {
          ...img,
          originalDataUrl: img.editedDataUrl,
          editedDataUrl: undefined,
          status: ImageStatus.QUEUED,
          prompt: undefined,
          error: undefined,
          retried: undefined,
          history: undefined,
        };
      }
      return img;
    }));
  };

  const handleCancelProcessing = () => {
    if (!isProcessing) return;

    setIsProcessing(false);
    setIsCoolingDown(false);
    setStatusMessage('');

    setImages(prev => prev.map(img => 
        img.status === ImageStatus.PROCESSING 
        ? { ...img, status: ImageStatus.QUEUED }
        : img
    ));
  };

  const handleClearAll = () => {
    if (images.length === 0 || isProcessing) return;
    if (window.confirm(`Are you sure you want to remove all ${images.length} image(s)? This cannot be undone.`)) {
      setImages([]);
    }
  };

  const handleClearQueue = () => {
    const queuedCount = images.filter(img => img.status === ImageStatus.QUEUED).length;
    if (queuedCount === 0 || isProcessing) return;
    setImages(prevImages => prevImages.filter(img => img.status !== ImageStatus.QUEUED));
  };

  const handleSuggestionSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;
    if (!selectedValue) return;

    const allSuggestions = [
        ...promptSuggestionsEditing, ...promptSuggestions, ...promptSuggestionsCloseUp,
        ...promptSuggestionsPose, ...promptSuggestionsExpression, ...promptSuggestionsBodyParts,
        ...promptSuggestionsFullBody, ...promptSuggestionsTextToVideo
    ];
    const selectedSuggestion = allSuggestions.find(p => p.value === selectedValue);

    if (selectedSuggestion) {
        const newPrompt = useNaturalLanguage ? selectedSuggestion.natural : selectedSuggestion.value;
        
        if (combinePrompts && !useNaturalLanguage) {
            setCurrentPrompt(prevPrompt => {
                if (!prevPrompt.trim()) {
                    return newPrompt;
                }
                const existingTags = prevPrompt.split(',').map(tag => tag.trim()).filter(Boolean);
                const newTags = newPrompt.split(',').map(tag => tag.trim()).filter(Boolean);
                const combinedTags = new Set([...existingTags, ...newTags]);
                return Array.from(combinedTags).join(', ');
            });
        } else {
            setCurrentPrompt(newPrompt);
        }
    }
    e.target.value = '';
  };

  const handleRandomizeSourceChange = (source: keyof typeof randomizeSources) => {
    setRandomizeSources(prev => ({ ...prev, [source]: !prev[source] }));
  };

  const handleRandomizePrompts = () => {
    const getRandomItem = (arr: PromptSuggestion[]) => arr[Math.floor(Math.random() * arr.length)];
    
    const activeSources: PromptSuggestion[][] = [];
    if (randomizeSources.angle) activeSources.push(promptSuggestions);
    if (randomizeSources.closeup) activeSources.push(promptSuggestionsCloseUp);
    if (randomizeSources.pose) activeSources.push(promptSuggestionsPose);
    if (randomizeSources.expression) activeSources.push(promptSuggestionsExpression);
    if (randomizeSources.bodyParts) activeSources.push(promptSuggestionsBodyParts);
    if (randomizeSources.fullBody) activeSources.push(promptSuggestionsFullBody);
    if (randomizeSources.textToVideo) activeSources.push(promptSuggestionsTextToVideo);

    if (activeSources.length === 0) {
      alert("Please select at least one suggestion category to randomize from.");
      return;
    }

    setImages(prevImages => prevImages.map(img => {
      if (img.status === ImageStatus.QUEUED) {
        const randomPrompts = activeSources.map(source => {
            const item = getRandomItem(source);
            return useNaturalLanguage ? item.natural : item.value;
        });
        
        let finalPrompt: string;
        if (useNaturalLanguage) {
            finalPrompt = randomPrompts.join('. '); 
        } else {
            const basePromptTags = currentPrompt.trim().split(',').map(t => t.trim()).filter(Boolean);
            const randomTags = randomPrompts.join(',').split(',').map(t => t.trim()).filter(Boolean);
            const allTags = new Set([...basePromptTags, ...randomTags]);
            finalPrompt = Array.from(allTags).join(', ');
        }

        return { ...img, prompt: finalPrompt };
      }
      return img;
    }));
  };

  const handlePinPrompt = (promptToPin: string) => {
    setPinnedPrompts(prev => {
      if (prev.includes(promptToPin)) return prev;
      return [promptToPin, ...prev];
    });
  };

  const handleUnpinPrompt = (promptToUnpin: string) => {
    setPinnedPrompts(prev => prev.filter(p => p !== promptToUnpin));
  };

  const handleAutoTagImages = async () => {
    const queuedImages = images.filter(img => img.status === ImageStatus.QUEUED);
    if (queuedImages.length === 0) {
        alert('No images in the queue to tag.');
        return;
    }
    if (!taggingSystemPrompt.trim()) {
        alert('Please provide a system prompt for tagging.');
        return;
    }

    setIsTagging(true);

    const tagPromises = queuedImages.map(
      async (imageToTag: ImageFile): Promise<{ id: string; prompt: string; error?: string; }> => {
        try {
            const base64Data = imageToTag.originalDataUrl.split(',')[1];
            if (!base64Data) throw new Error('Invalid image data URL.');

            const tags = await getTagsFromImage(
                base64Data,
                imageToTag.file.type,
                taggingSystemPrompt
            );

            const cleanedTags = tags.replace(/\.$/, '').trim();
            const allTags = cleanedTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
            const uniqueTags = [...new Set(allTags)];
            return { id: imageToTag.id, prompt: uniqueTags.join(', '), error: undefined };
        } catch (error) {
            console.error(`Failed to tag image ${imageToTag.file.name}:`, error);
            return { id: imageToTag.id, prompt: '', error: `Tagging failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
        }
    });

    const results: { id: string; prompt: string; error?: string; }[] = await Promise.all(tagPromises);
    const resultsMap = new Map(results.map(r => [r.id, { prompt: r.prompt, error: r.error }]));

    setImages(prev =>
        prev.map(img => {
            if (resultsMap.has(img.id)) {
                const result = resultsMap.get(img.id)!;
                return { ...img, prompt: result.prompt, error: result.error || img.error };
            }
            return img;
        })
    );

    setIsTagging(false);
  };

  const handleTaggingPresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedKey = e.target.value;
    const selectedPreset = taggingPresets.find(p => p.key === selectedKey);
    if (selectedPreset) {
        setTaggingSystemPrompt(selectedPreset.prompt);
        setTaggingPresetKey(selectedKey);
    }
  };

  const handleSystemPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newPrompt = e.target.value;
      setTaggingSystemPrompt(newPrompt);

      const matchingPreset = taggingPresets.find(p => p.prompt === newPrompt);
      if (matchingPreset) {
          setTaggingPresetKey(matchingPreset.key);
      } else {
          setTaggingPresetKey('custom');
      }
  };

  const handleDeleteImage = (imageId: string) => {
    setImages(prevImages => prevImages.filter(img => img.id !== imageId));
  };


  const queuedCount = images.filter(img => img.status === ImageStatus.QUEUED).length;
  const processingCount = images.filter(img => img.status === ImageStatus.PROCESSING).length;
  const completedCount = images.filter(img => img.status === ImageStatus.COMPLETED).length;
  const failedCount = images.filter(img => img.status === ImageStatus.ERROR).length;
  const canRandomize = Object.values(randomizeSources).some(v => v);
  const processedInBatch = totalInBatch > 0 ? Math.max(0, totalInBatch - queuedCount - processingCount) : 0;
  const { containerClasses, numberClasses } = getCounterStyles(processedTodayCount);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <div className="inline-flex items-center space-x-3 mb-2">
            <SparklesIcon className="w-10 h-10 text-brand-purple"/>
            <h1 className="text-4xl sm:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-purple to-brand-blue">
              NanoBanana Batch Editor
            </h1>
          </div>
          <p className="text-lg text-gray-400">
            Batch edit your images with AI. Upload, describe your edit, and process the queue.
          </p>
          <div className={containerClasses}>
            IMAGES PROCESSED TODAY: <span className={numberClasses}>{processedTodayCount}</span>
          </div>
        </header>

        <main className="space-y-8">
          <div className="bg-gray-800/50 p-6 rounded-xl shadow-2xl border border-gray-700 space-y-6">
            <div>
              <label className="text-xl font-semibold text-gray-200 mb-2 block">1. Upload Your Images</label>
              <ImageUploader onImagesSelected={handleImagesSelected} isProcessing={isProcessing} />
            </div>
            <div>
              <label className="text-xl font-semibold text-gray-200 mb-2 block">2. Describe Your Edit</label>
               <div className="mb-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label htmlFor="prompt-select-editing" className="block text-sm font-medium text-gray-300 mb-2">
                        Editing & Enhancement
                    </label>
                    <select
                        id="prompt-select-editing"
                        value=""
                        onChange={handleSuggestionSelect}
                        className="w-full p-3 text-base bg-gray-900 border-2 border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors"
                        aria-label="Select a preset editing or enhancement prompt"
                    >
                        <option value="" disabled>-- Select a preset --</option>
                        {promptSuggestionsEditing.map((p) => (
                            <option key={p.label} value={p.value}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="prompt-select" className="block text-sm font-medium text-gray-300 mb-2">
                        Angle/View Suggestions
                    </label>
                    <select
                        id="prompt-select"
                        value=""
                        onChange={handleSuggestionSelect}
                        className="w-full p-3 text-base bg-gray-900 border-2 border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors"
                        aria-label="Select a preset pose or angle prompt"
                    >
                        <option value="" disabled>-- Select a preset --</option>
                        {promptSuggestions.map((p) => (
                            <option key={p.label} value={p.value}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="prompt-select-closeup" className="block text-sm font-medium text-gray-300 mb-2">
                        Close-up Suggestions
                    </label>
                    <select
                        id="prompt-select-closeup"
                        value=""
                        onChange={handleSuggestionSelect}
                        className="w-full p-3 text-base bg-gray-900 border-2 border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors"
                        aria-label="Select a preset close-up prompt"
                    >
                        <option value="" disabled>-- Select a preset --</option>
                        {promptSuggestionsCloseUp.map((p) => (
                            <option key={p.label} value={p.value}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                  </div>
                   <div>
                    <label htmlFor="prompt-select-pose" className="block text-sm font-medium text-gray-300 mb-2">
                        Pose Suggestions
                    </label>
                    <select
                        id="prompt-select-pose"
                        value=""
                        onChange={handleSuggestionSelect}
                        className="w-full p-3 text-base bg-gray-900 border-2 border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors"
                        aria-label="Select a preset pose prompt"
                    >
                        <option value="" disabled>-- Select a preset --</option>
                        {promptSuggestionsPose.map((p) => (
                            <option key={p.label} value={p.value}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="prompt-select-expression" className="block text-sm font-medium text-gray-300 mb-2">
                        Expression Suggestions
                    </label>
                    <select
                        id="prompt-select-expression"
                        value=""
                        onChange={handleSuggestionSelect}
                        className="w-full p-3 text-base bg-gray-900 border-2 border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors"
                        aria-label="Select a preset expression prompt"
                    >
                        <option value="" disabled>-- Select a preset --</option>
                        {promptSuggestionsExpression.map((p) => (
                            <option key={p.label} value={p.value}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="prompt-select-body-parts" className="block text-sm font-medium text-gray-300 mb-2">
                        Body Parts Suggestions
                    </label>
                    <select
                        id="prompt-select-body-parts"
                        value=""
                        onChange={handleSuggestionSelect}
                        className="w-full p-3 text-base bg-gray-900 border-2 border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors"
                        aria-label="Select a preset body parts prompt"
                    >
                        <option value="" disabled>-- Select a preset --</option>
                        {promptSuggestionsBodyParts.map((p) => (
                            <option key={p.label} value={p.value}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="prompt-select-full-body" className="block text-sm font-medium text-gray-300 mb-2">
                        Full Body Pose Suggestions
                    </label>
                    <select
                        id="prompt-select-full-body"
                        value=""
                        onChange={handleSuggestionSelect}
                        className="w-full p-3 text-base bg-gray-900 border-2 border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors"
                        aria-label="Select a preset full body pose prompt"
                    >
                        <option value="" disabled>-- Select a preset --</option>
                        {promptSuggestionsFullBody.map((p) => (
                            <option key={p.label} value={p.value}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="prompt-select-full-body" className="block text-sm font-medium text-gray-300 mb-2">
                        Text To Video Suggestions
                    </label>
                    <select
                        id="prompt-select-full-body"
                        value=""
                        onChange={handleSuggestionSelect}
                        className="w-full p-3 text-base bg-gray-900 border-2 border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-colors"
                        aria-label="Select a preset full body pose prompt"
                    >
                        <option value="" disabled>-- Select a preset --</option>
                        {promptSuggestionsTextToVideo.map((p) => (
                            <option key={p.label} value={p.value}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                  </div>
              </div>
              <div className="mb-4 flex items-center space-x-6">
                  <div className="flex items-center">
                    <input
                        type="checkbox"
                        id="combine-prompts"
                        checked={combinePrompts}
                        onChange={(e) => setCombinePrompts(e.target.checked)}
                        disabled={useNaturalLanguage}
                        className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-brand-blue focus:ring-brand-blue disabled:opacity-50"
                    />
                    <label htmlFor="combine-prompts" className={`ml-2 block text-sm ${useNaturalLanguage ? 'text-gray-500' : 'text-gray-300'}`}>
                        Combine suggestions (prevents duplicates)
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                        type="checkbox"
                        id="use-natural-language"
                        checked={useNaturalLanguage}
                        onChange={(e) => setUseNaturalLanguage(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-brand-purple focus:ring-brand-purple"
                    />
                    <label htmlFor="use-natural-language" className="ml-2 block text-sm text-gray-300">
                        Use Natural Language Prompts
                    </label>
                  </div>
              </div>
              <PromptInput
                prompt={currentPrompt}
                setPrompt={setCurrentPrompt}
                promptHistory={promptHistory}
                onProcess={startProcessing}
                isProcessing={isProcessing}
                pinnedPrompts={pinnedPrompts}
                onPinPrompt={handlePinPrompt}
                onUnpinPrompt={handleUnpinPrompt}
              />
            </div>
            <div>
              <button
                onClick={() => setIsTaggingSectionVisible(!isTaggingSectionVisible)}
                className="w-full flex justify-between items-center text-left p-1 rounded-md hover:bg-gray-700/50 transition-colors"
                aria-expanded={isTaggingSectionVisible}
                aria-controls="auto-tag-section"
              >
                <span className="text-xl font-semibold text-gray-200">2.5 Auto-tag Queued Images (Optional)</span>
                <ChevronDownIcon className={`w-6 h-6 text-gray-400 transition-transform ${isTaggingSectionVisible ? 'rotate-180' : ''}`} />
              </button>
              {isTaggingSectionVisible && (
                <div id="auto-tag-section" className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-4 mt-4 animate-fade-in">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <label htmlFor="tagging-system-prompt" className="block text-sm font-medium text-gray-300">
                        Tagging Instructions (System Prompt)
                    </label>
                    <select
                        id="tagging-preset-select"
                        value={taggingPresetKey}
                        onChange={handleTaggingPresetChange}
                        disabled={isTagging || isProcessing}
                        className="w-full sm:w-auto p-2 text-sm bg-gray-800 border-2 border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-purple focus:border-transparent transition-colors disabled:opacity-50"
                        aria-label="Select a tagging preset"
                    >
                        {taggingPresets.map(preset => (
                            <option key={preset.key} value={preset.key}>
                                {preset.label}
                            </option>
                        ))}
                        <option value="custom" disabled={taggingPresetKey !== 'custom'}>Custom</option>
                    </select>
                  </div>
                  <textarea
                      id="tagging-system-prompt"
                      value={taggingSystemPrompt}
                      onChange={handleSystemPromptChange}
                      disabled={isTagging || isProcessing}
                      rows={4}
                      placeholder="e.g., You are an expert image analyst..."
                      className="w-full p-3 text-base bg-gray-900 border-2 border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent transition-colors disabled:opacity-50"
                  />
                  <button
                      onClick={handleAutoTagImages}
                      disabled={isTagging || isProcessing || queuedCount === 0}
                      className="w-full flex items-center justify-center p-4 text-lg font-bold text-white bg-gradient-to-r from-brand-purple to-purple-700 rounded-lg shadow-lg hover:from-purple-600 hover:to-purple-800 transition-all duration-300 transform hover:scale-105 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed disabled:scale-100"
                  >
                      <TagIcon className="w-6 h-6 mr-2" />
                      {isTagging ? 'Tagging...' : `Generate Tags for ${queuedCount} Queued Image${queuedCount !== 1 ? 's' : ''}`}
                  </button>
                </div>
              )}
            </div>
             <div className="space-y-4">
              <label className="text-xl font-semibold text-gray-200 mb-0 block">3. Configure & Start Queue</label>
               <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-4">
                 <p className="text-sm font-medium text-gray-300">Randomize Prompts for Queued Images</p>
                 <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 items-center">
                    <div className="flex items-center">
                      <input type="checkbox" id="rand-angle" checked={randomizeSources.angle} onChange={() => handleRandomizeSourceChange('angle')} className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-brand-blue focus:ring-brand-blue" />
                      <label htmlFor="rand-angle" className="ml-2 block text-sm text-gray-300">Angle/View</label>
                    </div>
                    <div className="flex items-center">
                      <input type="checkbox" id="rand-closeup" checked={randomizeSources.closeup} onChange={() => handleRandomizeSourceChange('closeup')} className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-brand-blue focus:ring-brand-blue" />
                      <label htmlFor="rand-closeup" className="ml-2 block text-sm text-gray-300">Close-up</label>
                    </div>
                    <div className="flex items-center">
                      <input type="checkbox" id="rand-pose" checked={randomizeSources.pose} onChange={() => handleRandomizeSourceChange('pose')} className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-brand-blue focus:ring-brand-blue" />
                      <label htmlFor="rand-pose" className="ml-2 block text-sm text-gray-300">Pose</label>
                    </div>
                    <div className="flex items-center">
                      <input type="checkbox" id="rand-expression" checked={randomizeSources.expression} onChange={() => handleRandomizeSourceChange('expression')} className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-brand-blue focus:ring-brand-blue" />
                      <label htmlFor="rand-expression" className="ml-2 block text-sm text-gray-300">Expression</label>
                    </div>
                     <div className="flex items-center">
                      <input type="checkbox" id="rand-body" checked={randomizeSources.bodyParts} onChange={() => handleRandomizeSourceChange('bodyParts')} className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-brand-blue focus:ring-brand-blue" />
                      <label htmlFor="rand-body" className="ml-2 block text-sm text-gray-300">Body Parts</label>
                    </div>
                    <div className="flex items-center">
                      <input type="checkbox" id="rand-fullbody" checked={randomizeSources.fullBody} onChange={() => handleRandomizeSourceChange('fullBody')} className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-brand-blue focus:ring-brand-blue" />
                      <label htmlFor="rand-fullbody" className="ml-2 block text-sm text-gray-300">Full Body</label>
                    </div>
                    <div className="flex items-center">
                      <input type="checkbox" id="rand-fullbody" checked={randomizeSources.textToVideo} onChange={() => handleRandomizeSourceChange('textToVideo')} className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-brand-blue focus:ring-brand-blue" />
                      <label htmlFor="rand-fullbody" className="ml-2 block text-sm text-gray-300">Text To Video</label>
                    </div>
                    <button
                      onClick={handleRandomizePrompts}
                      disabled={isProcessing || queuedCount === 0 || !canRandomize}
                      className="flex items-center justify-center p-2 text-sm font-bold text-white bg-brand-purple rounded-lg shadow-lg hover:bg-purple-700 transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                      <ShuffleIcon className="w-5 h-5 mr-2"/>
                      Apply
                    </button>
                 </div>
                 {repeatCount > 1 && canRandomize && (
                  <div className="pt-4 mt-4 border-t border-gray-700/50 flex items-center">
                    <input
                      type="checkbox"
                      id="randomize-for-each"
                      checked={randomizeForEachEdit}
                      onChange={(e) => setRandomizeForEachEdit(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-brand-blue focus:ring-brand-blue"
                    />
                    <label htmlFor="randomize-for-each" className="ml-3 block text-sm text-gray-300">
                      Randomize prompt for each edit
                    </label>
                  </div>
                 )}
               </div>
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-4">
                 <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="auto-tag-before-processing"
                      checked={autoTagBeforeProcessing}
                      onChange={(e) => setAutoTagBeforeProcessing(e.target.checked)}
                      disabled={isProcessing}
                      className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-brand-blue focus:ring-brand-blue"
                    />
                    <label htmlFor="auto-tag-before-processing" className="ml-3 block text-sm text-gray-300">
                      Auto-tag Queued Images First
                    </label>
                  </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                 <div className="sm:col-span-1">
                    <label htmlFor="repeat-count" className="text-sm font-medium text-gray-300 mb-2 block">Edits per Image</label>
                    <input
                        id="repeat-count"
                        type="number"
                        value={repeatCount}
                        onChange={(e) => {
                           const newCount = Math.max(1, Number(e.target.value));
                           if (repeatCount === 1 && newCount > 1) {
                             setRandomizeForEachEdit(true);
                           }
                           setRepeatCount(newCount);
                        }}
                        min="1"
                        disabled={isProcessing}
                        className="w-full p-4 bg-gray-900 border-2 border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue disabled:opacity-50 text-center h-[64px] text-lg"
                        aria-label="Number of edits to perform for each image in the queue"
                    />
                 </div>
                 <div className="sm:col-span-1">
                  <label htmlFor="throttle-delay" className="text-sm font-medium text-gray-300 mb-2 block">Request Delay (sec)</label>
                  <input
                    id="throttle-delay"
                    type="number"
                    value={throttleDelay}
                    onChange={(e) => setThrottleDelay(Math.max(0, Number(e.target.value)))}
                    min="0"
                    step="0.5"
                    disabled={isProcessing}
                    className="w-full p-4 bg-gray-900 border-2 border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue disabled:opacity-50 text-center h-[64px] text-lg"
                    aria-label="Delay between requests in seconds"
                  />
                </div>
                <div className="sm:col-span-2 space-y-2">
                   {statusMessage && (
                    <div className="flex items-center justify-center text-center p-2 rounded-lg bg-yellow-900/50 text-yellow-300 text-sm">
                      <ClockIcon className="w-5 h-5 mr-2 animate-spin"/>
                      {statusMessage}
                    </div>
                  )}
                  {isProcessing ? (
                    <button
                      onClick={handleCancelProcessing}
                      className="w-full flex items-center justify-center p-4 text-lg font-bold text-white bg-gradient-to-r from-red-500 to-orange-500 rounded-lg shadow-lg hover:from-red-600 hover:to-orange-600 transition-all duration-300 transform hover:scale-105"
                      style={{minHeight: '64px'}}
                      aria-label="Cancel current processing batch"
                    >
                      <XCircleIcon className="w-6 h-6 mr-2" />
                      {`Processing... (${processedInBatch}/${totalInBatch})`}
                    </button>
                  ) : (
                    <button
                      onClick={startProcessing}
                      disabled={queuedCount === 0}
                      className="w-full flex items-center justify-center p-4 text-lg font-bold text-white bg-gradient-to-r from-green-500 to-teal-500 rounded-lg shadow-lg hover:from-green-600 hover:to-teal-600 transition-all duration-300 transform hover:scale-105 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed disabled:scale-100"
                      style={{minHeight: '64px'}}
                      aria-label={`Process ${queuedCount} queued images`}
                    >
                      <PlayIcon className="w-6 h-6 mr-2" />
                      {`Process ${queuedCount} Queued Image${queuedCount !== 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>
              </div>
              </div>
            </div>
          </div>
          
          <div className="pt-4">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4 flex-wrap">
              <h2 className="text-2xl font-bold">Your Image Queue</h2>
              <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-end">
                {queuedCount > 0 && (
                  <button
                    onClick={handleClearQueue}
                    disabled={isProcessing}
                    className="flex items-center justify-center px-4 py-2 text-sm font-bold text-white bg-orange-600 rounded-lg shadow-lg hover:bg-orange-700 transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    title="Remove all images from the queue"
                    aria-label={`Clear ${queuedCount} queued images`}
                  >
                    <XCircleIcon className="w-5 h-5 mr-2" />
                    {`Clear ${queuedCount} Queued`}
                  </button>
                )}
                 {completedCount > 0 && (
                  <button
                    onClick={handleUseAllEditedAsOriginal}
                    disabled={isProcessing}
                    className="flex items-center justify-center px-4 py-2 text-sm font-bold text-white bg-brand-purple rounded-lg shadow-lg hover:bg-purple-700 transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    title="Set all completed edited images as new originals and add them to the queue"
                    aria-label={`Use ${completedCount} edited images as new originals`}
                  >
                    <RequeueIcon className="w-5 h-5 mr-2" />
                    {`Re-queue ${completedCount} Edited`}
                  </button>
                )}
                {failedCount > 0 && (
                  <button
                    onClick={handleRetryFailed}
                    disabled={isProcessing}
                    className="flex items-center justify-center px-4 py-2 text-sm font-bold text-white bg-yellow-600 rounded-lg shadow-lg hover:bg-yellow-700 transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed"
                     aria-label={`Retry ${failedCount} failed images`}
                  >
                    <RetryIcon className="w-5 h-5 mr-2" />
                    {`Retry ${failedCount} Failed Image${failedCount !== 1 ? 's' : ''}`}
                  </button>
                )}
                {completedCount > 0 && (
                  <div className="flex items-center flex-wrap justify-end gap-2 p-2 rounded-lg bg-gray-800/50 border border-gray-700">
                    <input
                      type="text"
                      value={zipFilename}
                      onChange={(e) => setZipFilename(e.target.value)}
                      className="bg-gray-900 border-2 border-gray-600 rounded-md py-1.5 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-40"
                      placeholder="zip-filename"
                      aria-label="Download filename"
                    />
                    <button
                      onClick={handleDownloadAll}
                      disabled={isZipping || isProcessing}
                      className="relative flex items-center justify-center px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg shadow-lg hover:bg-indigo-700 transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed overflow-hidden"
                      aria-label={`Download ${completedCount} edited images`}
                    >
                      {isZipping && (
                        <div 
                          className="absolute top-0 left-0 h-full bg-indigo-500/80 transition-all duration-200"
                          style={{ width: `${zipProgress}%` }}
                        ></div>
                      )}
                      <span className="relative z-10 flex items-center">
                        <DownloadIcon className="w-5 h-5 mr-2" />
                        {isZipping ? `Zipping... ${Math.round(zipProgress)}%` : `Download ${completedCount} Edited`}
                      </span>
                    </button>
                     <div className="flex items-center w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 sm:pl-2 border-t sm:border-t-0 sm:border-l border-gray-700">
                        <input
                            type="checkbox"
                            id="enable-compression"
                            checked={enableCompression}
                            onChange={(e) => setEnableCompression(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-brand-blue focus:ring-brand-blue"
                        />
                        <label htmlFor="enable-compression" className="ml-2 block text-sm text-gray-300 whitespace-nowrap">
                            Lossless Compression (PNG)
                        </label>
                    </div>
                  </div>
                )}
                {images.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    disabled={isProcessing}
                    className="flex items-center justify-center px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg shadow-lg hover:bg-red-700 transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    title="Remove all images from the application"
                    aria-label="Clear all images"
                  >
                    <TrashIcon className="w-5 h-5 mr-2" />
                    Clear All
                  </button>
                )}
              </div>
            </div>
            <ImageList 
              images={images} 
              onEdit={handleOpenEditModal} 
              onUseAsOriginal={handleUseEditedAsOriginal}
              onImageClick={(url, alt) => setLightboxImage({ url, alt })}
              onDownload={handleDownloadSingle}
              onDelete={handleDeleteImage}
            />
          </div>
        </main>
        
        {editingImage && (
            <ImageEditModal
                image={editingImage}
                source={editSource}
                onClose={handleCloseEditModal}
                onProcess={handleProcessSingleImage}
                onSavePrompt={handleSaveImagePrompt}
                isProcessing={isSingleProcessing}
                globalPrompt={currentPrompt}
                error={singleProcessingError}
                taggingSystemPrompt={taggingSystemPrompt}
            />
        )}

        {lightboxImage && (
            <Lightbox 
                imageUrl={lightboxImage.url} 
                altText={lightboxImage.alt} 
                onClose={() => setLightboxImage(null)} 
            />
        )}
      </div>
    </div>
  );
};

export default App;
