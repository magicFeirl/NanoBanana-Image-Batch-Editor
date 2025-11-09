
import React from 'react';
import { ImageFile } from '../types';
import ImageCard from './ImageCard';

interface ImageListProps {
  images: ImageFile[];
  onEdit: (imageId: string, source: 'original' | 'edited') => void;
  onUseAsOriginal: (imageId: string) => void;
  onImageClick: (url: string, alt: string) => void;
  onDownload: (imageId: string, source: 'original' | 'edited') => void;
  onDelete: (imageId: string) => void;
  onShowOriginal: (imageId: string) => void;
}

const ImageList: React.FC<ImageListProps> = ({ images, onEdit, onUseAsOriginal, onImageClick, onDownload, onDelete, onShowOriginal }) => {
  if (images.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <h2 className="text-2xl font-semibold">Welcome to the NanoBanana Editor!</h2>
        <p className="mt-2">Upload some images to get started.</p>
      </div>
    );
  }

  const imageMap = React.useMemo(() => new Map(images.map(i => [i.id, i])), [images]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {images.map((image) => {
        const displayOriginalDataUrl = image.sourceImageId
          ? imageMap.get(image.sourceImageId)?.originalDataUrl ?? image.originalDataUrl
          : image.originalDataUrl;
        
        return (
          <ImageCard 
            key={image.id} 
            image={image}
            displayOriginalDataUrl={displayOriginalDataUrl}
            onEdit={onEdit} 
            onUseAsOriginal={onUseAsOriginal}
            onImageClick={onImageClick}
            onDownload={onDownload}
            onDelete={onDelete}
            onShowOriginal={onShowOriginal}
          />
        );
      })}
    </div>
  );
};

export default ImageList;
