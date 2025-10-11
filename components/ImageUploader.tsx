
import React from 'react';
import { UploadIcon } from './Icons';

interface ImageUploaderProps {
  onImagesSelected: (files: FileList) => void;
  isProcessing: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImagesSelected, isProcessing }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onImagesSelected(event.target.files);
      event.target.value = ''; // Reset file input
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <input
        type="file"
        multiple
        accept="image/png, image/jpeg, image/webp"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        disabled={isProcessing}
      />
      <button
        onClick={handleClick}
        disabled={isProcessing}
        className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-600 rounded-lg hover:border-brand-blue hover:bg-gray-800/50 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-gray-600"
      >
        <UploadIcon className="w-10 h-10 text-gray-500 mb-2" />
        <span className="text-lg font-semibold text-gray-300">Click to upload images</span>
        <span className="text-sm text-gray-500">PNG, JPG, or WEBP</span>
      </button>
    </div>
  );
};

export default ImageUploader;
