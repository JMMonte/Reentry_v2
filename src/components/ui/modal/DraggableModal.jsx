import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../button';
import { ChevronDown, ChevronUp, X, GripHorizontal } from 'lucide-react';

export function DraggableModal({ 
  title, 
  children, 
  defaultPosition = { x: 20, y: 80 },
  rightElement,
  leftElement,
  className = '',
  isOpen = true,
  onClose = () => {},
  defaultCollapsed = false,
  minHeight,
  maxHeight,
  resizable = false,
  defaultHeight = 'auto',
}) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [position, setPosition] = useState(defaultPosition);
  const [height, setHeight] = useState(defaultHeight);
  const modalRef = useRef(null);
  const contentRef = useRef(null);
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0 });
  const resizeRef = useRef({ isResizing: false, startY: 0, startHeight: 0 });

  // Update height based on content only for resizable modals
  useEffect(() => {
    if (resizable && !isCollapsed && contentRef.current && height === 'auto') {
      const contentHeight = contentRef.current.scrollHeight;
      const viewportHeight = window.innerHeight;
      const maxDefaultHeight = viewportHeight * 0.5;
      if (contentHeight < maxDefaultHeight) {
        setHeight(contentHeight);
      } else {
        setHeight(maxDefaultHeight);
      }
    }
  }, [isCollapsed, children, resizable, height]);

  const startDragging = (e) => {
    dragRef.current = {
      isDragging: true,
      startX: e.clientX - position.x,
      startY: e.clientY - position.y,
    };
  };

  const startResizing = (e) => {
    e.preventDefault();
    resizeRef.current = {
      isResizing: true,
      startY: e.clientY,
      startHeight: modalRef.current.offsetHeight,
    };
  };

  const onDrag = (e) => {
    if (dragRef.current.isDragging) {
      const newX = e.clientX - dragRef.current.startX;
      const newY = e.clientY - dragRef.current.startY;
      setPosition({ x: newX, y: newY });
    }
    if (resizeRef.current.isResizing) {
      const deltaY = e.clientY - resizeRef.current.startY;
      const newHeight = Math.max(
        minHeight || 0,
        Math.min(
          resizeRef.current.startHeight + deltaY,
          maxHeight || window.innerHeight * 0.9
        )
      );
      setHeight(newHeight);
    }
  };

  const stopDragging = () => {
    dragRef.current.isDragging = false;
    resizeRef.current.isResizing = false;
  };

  React.useEffect(() => {
    if (isOpen) {
      window.addEventListener('mousemove', onDrag);
      window.addEventListener('mouseup', stopDragging);
      return () => {
        window.removeEventListener('mousemove', onDrag);
        window.removeEventListener('mouseup', stopDragging);
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className={`fixed bg-background border rounded-lg shadow-lg ${className}`}
      style={{ 
        left: position.x,
        top: position.y,
        height: isCollapsed ? 'auto' : (resizable ? height : 'auto'),
        minHeight: isCollapsed ? 'auto' : minHeight,
        maxHeight: isCollapsed ? 'auto' : (resizable ? (maxHeight || window.innerHeight * 0.9) : 'none'),
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-2 bg-secondary/50 cursor-move select-none"
        onMouseDown={startDragging}
      >
        <div className="flex items-center gap-2">
          {leftElement}
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {rightElement}
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setIsCollapsed(!isCollapsed)}>
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <>
          <div 
            ref={contentRef} 
            className={`overflow-auto ${resizable ? 'pb-2' : ''}`}
            style={{ 
              height: resizable ? 'calc(100% - 48px)' : 'auto',
              padding: '8px'
            }}
          >
            {children}
          </div>
          {resizable && (
            <div
              className="absolute bottom-0 left-0 right-0 h-2 bg-secondary/50 cursor-ns-resize hover:bg-primary/50 flex items-center justify-center border-t"
              onMouseDown={startResizing}
            >
              <GripHorizontal className="h-3 w-3 text-muted-foreground" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
