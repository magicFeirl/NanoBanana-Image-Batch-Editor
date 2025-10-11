import React, { useEffect } from 'react';
import { XCircleIcon } from './Icons';

interface LightboxProps {
  imageUrl: string;
  altText: string;
  onClose: () => void;
}

const Lightbox: React.FC<LightboxProps> = ({ imageUrl, altText, onClose }) => {
  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
        <img src={imageUrl} alt={altText} className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
        <button
          onClick={onClose}
          className="absolute -top-4 -right-4 text-white bg-gray-800 rounded-full hover:bg-red-600 transition-colors"
          aria-label="Close lightbox"
        >
          <XCircleIcon className="w-10 h-10" />
        </button>
      </div>
    </div>
  );
};

export default Lightbox;
