import React from 'react';
import { ImageFile, ImageStatus } from '../types';
import { ClockIcon, CheckCircleIcon, ExclamationTriangleIcon, SparklesIcon, EditIcon, ReplaceIcon, DownloadIcon, TrashIcon } from './Icons';

interface ImageCardProps {
  image: ImageFile;
  onEdit: (imageId: string, source: 'original' | 'edited') => void;
  onUseAsOriginal: (imageId: string) => void;
  onImageClick: (url: string, alt: string) => void;
  onDownload: (imageId: string, source: 'original' | 'edited') => void;
  onDelete: (imageId: string) => void;
}

const StatusIndicator: React.FC<{ status: ImageStatus }> = ({ status }) => {
  switch (status) {
    case ImageStatus.QUEUED:
      return (
        <div className="flex items-center space-x-2 text-yellow-400">
          <ClockIcon className="w-5 h-5" />
          <span>Queued</span>
        </div>
      );
    case ImageStatus.PROCESSING:
      return (
        <div className="flex items-center space-x-2 text-brand-blue animate-pulse-fast">
          <SparklesIcon className="w-5 h-5" />
          <span>Processing...</span>
        </div>
      );
    case ImageStatus.COMPLETED:
      return (
        <div className="flex items-center space-x-2 text-green-400">
          <CheckCircleIcon className="w-5 h-5" />
          <span>Completed</span>
        </div>
      );
    case ImageStatus.ERROR:
      return (
        <div className="flex items-center space-x-2 text-red-400">
          <ExclamationTriangleIcon className="w-5 h-5" />
          <span>Error</span>
        </div>
      );
    default:
      return null;
  }
};

const ImageCard: React.FC<ImageCardProps> = ({ image, onEdit, onUseAsOriginal, onImageClick, onDownload, onDelete }) => {
  const getBorderColor = () => {
    switch (image.status) {
      case ImageStatus.QUEUED: return 'border-yellow-500/50';
      case ImageStatus.PROCESSING: return 'border-brand-blue/80 animate-pulse-fast';
      case ImageStatus.COMPLETED: return 'border-green-500/80';
      case ImageStatus.ERROR: return 'border-red-500/80';
      default: return 'border-gray-700';
    }
  };

  const handleEditOriginalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(image.id, 'original');
  };

  const handleEditEditedClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(image.id, 'edited');
  };

  const handleUseAsOriginalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUseAsOriginal(image.id);
  }

  const handleDownloadOriginalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDownload(image.id, 'original');
  };

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (image.editedDataUrl) {
      onDownload(image.id, 'edited');
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(image.id);
  };

  return (
    <div className={`bg-gray-800 rounded-lg overflow-hidden shadow-lg border-2 ${getBorderColor()} transition-all duration-300`}>
      <div className="p-4">
        <div className="flex justify-between items-center mb-2 gap-2">
          <p className="text-sm text-gray-400 truncate flex-grow" title={image.file.name}>{image.file.name}</p>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <StatusIndicator status={image.status} />
            <button
                onClick={handleDeleteClick}
                title="Delete this image"
                disabled={image.status === ImageStatus.PROCESSING}
                className="p-1 rounded-full text-gray-500 hover:text-red-500 hover:bg-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Delete image"
            >
                <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
        {image.prompt && <p className="text-xs text-brand-purple mb-3 italic truncate" title={image.prompt}>Prompt: "{image.prompt}"</p>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-700">
        <div className="relative group">
          <img 
            src={image.originalDataUrl} 
            alt={`Original - ${image.file.name}`} 
            className="w-full h-auto object-cover cursor-pointer" 
            onClick={() => onImageClick(image.originalDataUrl, `Original - ${image.file.name}`)}
          />
          <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">Original</div>
           <div className="absolute top-2 right-2 flex items-center space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
             <button onClick={handleDownloadOriginalClick} title="Download original image" className="p-1.5 rounded-full bg-black/50 text-white hover:bg-green-500">
                <DownloadIcon className="w-5 h-5" />
             </button>
            <button onClick={handleEditOriginalClick} title="Edit this image" className="p-1.5 rounded-full bg-black/50 text-white hover:bg-brand-blue">
              <EditIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="relative bg-gray-900 flex items-center justify-center min-h-[150px] group">
          {image.status === ImageStatus.COMPLETED && image.editedDataUrl ? (
            <>
              <img 
                src={image.editedDataUrl} 
                alt={`Edited - ${image.file.name}`} 
                className="w-full h-auto object-cover cursor-pointer" 
                onClick={() => onImageClick(image.editedDataUrl!, `Edited - ${image.file.name}`)}
              />
              <div className="absolute top-2 left-2 bg-brand-blue/80 text-white text-xs px-2 py-1 rounded">Edited</div>
              <div className="absolute top-2 right-2 flex items-center space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button onClick={handleDownloadClick} title="Download this image" className="p-1.5 rounded-full bg-black/50 text-white hover:bg-green-500">
                    <DownloadIcon className="w-5 h-5" />
                 </button>
                 <button onClick={handleUseAsOriginalClick} title="Use edited as new original" className="p-1.5 rounded-full bg-black/50 text-white hover:bg-brand-purple">
                    <ReplaceIcon className="w-5 h-5" />
                </button>
                <button onClick={handleEditEditedClick} title="Edit this image again" className="p-1.5 rounded-full bg-black/50 text-white hover:bg-brand-blue">
                    <EditIcon className="w-5 h-5" />
                </button>
              </div>
            </>
          ) : (
            <div className="text-center text-gray-500 p-4">
              {image.status === ImageStatus.QUEUED && "Waiting in queue..."}
              {image.status === ImageStatus.PROCESSING && "Magic in progress..."}
              {image.status === ImageStatus.ERROR && (
                <div className="text-red-400">
                  <p className="font-bold">Failed to process</p>
                  <p className="text-xs mt-1">{image.error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageCard;